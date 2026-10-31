"""CropPilot engine: (1) rules -> (2) yield & price estimates -> (3) profit grid -> (4) rank.

Location: the user picks a TALUK. Yields are DISTRICT averages (DES APY is district-level); prices come from the
taluk's mapped APMC market (data/taluks.csv). Only (district, season, crop) combos that pass the minimum-data
threshold in data/coverage.csv are offered.
"""
import json
import joblib, numpy as np, pandas as pd
from croppilot.config import (DATA, MODELS, CROPS, IRR_LEVEL, FARMGATE_DEDUCTION, TRANSPORT_RS_PER_Q,
                              CURRENT_CROP_YEAR)
from croppilot.schema import validate_field
from croppilot.features import season_weather, CROP_CODE, SEASON_CODE, YIELD_FEATURES

SCEN = ["bad", "typical", "good"]           # band quantiles 10 / 50 / 90 of held-out errors

class CropPilot:
    def __init__(self):
        self.meta = json.loads((MODELS / "metrics.json").read_text())
        self.yield_model = joblib.load(MODELS / "yield_model.joblib")
        self.cov = pd.read_csv(DATA / "coverage.csv")
        self.taluks = pd.read_csv(DATA / "taluks.csv")
        self.msp = pd.read_csv(DATA / "msp.csv").set_index(["crop", "crop_year"]).msp_rs_q
        self.costs = pd.read_csv(DATA / "costs.csv").set_index("crop")
        w = pd.read_csv(DATA / "weather_monthly.csv")
        self.sw = season_weather(w, self.meta["rain_source"])

    # ---------- location ----------
    def locate(self, taluk):
        r = self.taluks[self.taluks.taluk == taluk].iloc[0]
        return r.district, (r.market if isinstance(r.market, str) else ""), r.market_method

    def normal_weather(self, district, season):
        g = self.sw[(self.sw.district == district) & (self.sw.season == season)]
        return g[["rain_main", "rain_prior", "tmax_late"]].median().to_dict()

    # ---------- (1) rules ----------
    def feasibility(self, f, district, season):
        normal = self.normal_weather(district, season)
        cov = self.cov[(self.cov.district == district) & (self.cov.season == season)].set_index("crop")
        out = {}
        for c, a in CROPS.items():
            if season not in a["seasons"]:
                continue
            reasons, ok = [], True
            if c not in cov.index or not bool(cov.loc[c, "included"]):
                why = cov.loc[c, "exclusion_reason"] if c in cov.index else "not grown in this district in DES data"
                out[c] = dict(feasible=False, data_ok=False, reasons=[f"not enough data: {why}"]); continue
            if not a["ph_min"] <= f["soil_ph"] <= a["ph_max"]:
                ok = False; reasons.append(f"soil pH {f['soil_ph']} outside {a['ph_min']}-{a['ph_max']}")
            irr = IRR_LEVEL[f["irrigation"]]
            if season == "Kharif":
                soils = a["kharif_rainfed_soils"]
                rainfed_ok = (("any" in soils or f["soil_type"] in soils)
                              and normal["rain_main"] >= (a["kharif_min_rain_mm"] or 0))
                need = "full"
            else:
                soils = a["rabi_rainfed_soils"]; rainfed_ok = f["soil_type"] in soils
                need = a["rabi_min_irrigation"] if isinstance(a["rabi_min_irrigation"], str) else "full"
            if not rainfed_ok and irr < IRR_LEVEL[need]:
                ok = False
                reasons.append(f"needs '{need}' irrigation here (rainfed only on {', '.join(soils) or 'no soils'}"
                               + (f" with >= {a['kharif_min_rain_mm']:.0f} mm Jun-Sep; normal here {normal['rain_main']:.0f} mm"
                                  if season == "Kharif" else "") + ")")
            if f.get("previous_crop") == c and not a["repeat_ok"]:
                ok = False; reasons.append(f"rotation: {c} was the previous crop (pest/disease build-up)")
            out[c] = dict(feasible=ok, data_ok=True, reasons=reasons or ["passes pH, water, soil and rotation rules"])
        return out, normal

    # ---------- (2) estimates ----------
    def yield_estimate(self, district, season, crop, normal):
        k = f"{district}|{season}|{crop}"; ck = f"{crop}|{season}"
        method = self.meta["yield_method"].get(ck, "base_hist_mean")
        hm, last = self.meta["hist_mean_yield"][k], self.meta["last_yield"][k]
        if method == "model":
            X = pd.DataFrame([dict(crop_code=CROP_CODE[crop], season_code=SEASON_CODE[season], **normal,
                                   crop_year=CURRENT_CROP_YEAR, lag_ratio=last / hm, hist_mean=hm)])[YIELD_FEATURES]
            point = hm * float(np.exp(self.yield_model.predict(X)[0]))
        else:
            point = hm if method == "base_hist_mean" else last
        b = self.meta["yield_band_log"].get(ck, [-0.3, 0, 0.3])
        return {s: point * float(np.exp(b[i])) for i, s in enumerate(SCEN)}, method, point

    def price_estimate(self, crop, season):
        key = CROPS[crop]["msp_key"][season]
        msp = float(self.msp[(key, CURRENT_CROP_YEAR)])
        ck = f"{crop}|{season}"
        method = self.meta["price_method_used"].get(ck, "base_msp")
        if method == "base_hist_ratio_x_msp":
            point = msp * float(np.exp(self.meta["hist_harvest_to_msp_logratio"][ck]))
        else:
            point = msp
        band = self.meta["price_band_log"].get(f"{ck}|{method}") or self.meta["price_band_log"]["ALL|base_msp"]
        prices = {s: point * float(np.exp(band[i])) for i, s in enumerate(["low", "base", "high"])}
        prices["base"] = point   # base = point estimate; low/high = 10th/90th pct of held-out errors
        return prices, method, msp

    @staticmethod
    def farmgate(p):
        return p * (1 - FARMGATE_DEDUCTION) - TRANSPORT_RS_PER_Q

    # ---------- (3)+(4) ----------
    def evaluate(self, field):
        f = validate_field(field)
        district, market, how = self.locate(f["taluk"])
        season = f["season"]
        feas, normal = self.feasibility(f, district, season)
        res = []
        for c, fe in feas.items():
            r = dict(crop=c, label=CROPS[c]["label"], label_kn=CROPS[c]["label_kn"], **fe)
            if fe["feasible"]:
                ys, ym, ypoint = self.yield_estimate(district, season, c, normal)
                ps, pm, msp = self.price_estimate(c, season)
                hm = self.meta["hist_mean_yield"][f"{district}|{season}|{c}"]
                cost = float(self.costs.loc[c, "cost_rs_per_q"]) * hm        # Rs/acre (approximation, see docs)
                grid = {f"{y}/{p}": ys[y] * self.farmgate(ps[p]) - cost for y in SCEN for p in ("low", "base", "high")}
                r.update(yields=ys, yield_method=ym, prices=ps, price_method=pm, msp=msp, cost=cost, grid=grid,
                         net_typical=grid["typical/base"], net_worst=min(grid.values()), net_best=max(grid.values()),
                         last_yield_year=self.meta["last_yield_year"][f"{district}|{season}|{c}"],
                         price_basis=self.cov[(self.cov.district == district) & (self.cov.season == season)
                                              & (self.cov.crop == c)].price_basis.iloc[0])
            res.append(r)
        ok = [r for r in res if r["feasible"]]
        for r in ok:
            r["score"] = 0.6 * r["net_typical"] + 0.4 * r["net_worst"] + (1500 if CROPS[r["crop"]]["legume"] else 0)
        ok.sort(key=lambda r: r["score"], reverse=True)
        for i, r in enumerate(ok, 1): r["rank"] = i
        ctx = dict(taluk=f["taluk"], district=district, market=market, market_method=how, season=season,
                   normal=normal, field=f)
        return ok + [r for r in res if not r["feasible"]], ctx
