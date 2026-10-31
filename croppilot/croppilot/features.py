"""Feature building (shared by training, validation, engine and the ONNX/TypeScript port).

Season timeline for crop_year Y:
  Kharif: pre-monsoon Apr-May Y | main rain Jun-Sep Y | sowing Jun-Jul Y | late heat Sep-Oct Y | sale Aug Y - Feb Y+1
  Rabi:   prior monsoon Jun-Sep Y (stored soil moisture) | main rain Oct Y-Jan Y+1 | sowing Oct-Nov Y |
          late heat Feb-Mar Y+1 | sale Jan-May Y+1
Price features use only information available at SOWING (no leakage).
"""
import numpy as np, pandas as pd
from croppilot.config import CROPS, SEASONS

CROP_CODE = {c: i for i, c in enumerate(CROPS)}
SEASON_CODE = {s: i for i, s in enumerate(SEASONS)}
YIELD_FEATURES = ["crop_code", "season_code", "rain_main", "rain_prior", "tmax_late", "crop_year", "lag_ratio", "hist_mean"]
PRICE_FEATURES = ["crop_code", "season_code", "sow_ratio", "lag_harvest_ratio", "msp_growth"]
SOW_MONTHS = {"Kharif": [(0, 5), (0, 6)], "Rabi": [(0, 9), (0, 10)]}

def season_weather(weather: pd.DataFrame, rain_col="rain_mm_power") -> pd.DataFrame:
    """One row per (district, season, crop_year) with rain_main, rain_prior, tmax_late."""
    w = weather.set_index(["district", "year", "month"])
    out = []
    for d in weather.district.unique():
        wd = w.loc[d]
        years = sorted(wd.index.get_level_values(0).unique())
        def tot(y, months, col=rain_col):
            vals = [wd[col].get((y + o, m), np.nan) for o, m in months]
            return float(np.sum(vals)) if not np.any(np.isnan(vals)) else np.nan
        def mean(y, months):
            vals = [wd["tmax_c"].get((y + o, m), np.nan) for o, m in months]
            return float(np.mean(vals)) if not np.any(np.isnan(vals)) else np.nan
        for y in years:
            out.append(dict(district=d, season="Kharif", crop_year=y,
                            rain_main=tot(y, [(0, 6), (0, 7), (0, 8), (0, 9)]), rain_prior=tot(y, [(0, 4), (0, 5)]),
                            tmax_late=mean(y, [(0, 9), (0, 10)])))
            out.append(dict(district=d, season="Rabi", crop_year=y,
                            rain_main=tot(y, [(0, 10), (0, 11), (0, 12), (1, 1)]),
                            rain_prior=tot(y, [(0, 6), (0, 7), (0, 8), (0, 9)]),
                            tmax_late=mean(y, [(1, 2), (1, 3)])))
    return pd.DataFrame(out)

def yield_table(yields, sw, coverage=None):
    t = yields.merge(sw, on=["district", "season", "crop_year"], how="inner")
    if coverage is not None:
        inc = coverage[coverage.included][["district", "season", "crop"]]
        t = t.merge(inc, on=["district", "season", "crop"])
    t = t.sort_values(["district", "season", "crop", "crop_year"])
    g = t.groupby(["district", "season", "crop"]).yield_q_per_acre
    t["lag_yield"] = g.shift(1)
    # strictly-prior information only: mean and count of the seasons BEFORE this row's crop year
    t["prior_mean"] = g.transform(lambda s: s.shift(1).expanding().mean())
    t["prior_n"] = g.cumcount()
    t["crop_code"] = t.crop.map(CROP_CODE); t["season_code"] = t.season.map(SEASON_CODE)
    return t.dropna(subset=["rain_main", "rain_prior", "tmax_late"])

MIN_PRIOR_SEASONS = 3

def add_ratio_features(t, hist_mean=None):
    """hist_mean = mean yield of the seasons BEFORE the predicted year (expanding, no leakage; default = the
    row's prior_mean). Target and lag are expressed relative to it, so one pooled model serves all districts and
    crops. Rows with fewer than MIN_PRIOR_SEASONS prior seasons are dropped. At inference (crop year 2025) the
    engine uses the mean of all reported seasons, which is exactly the prior mean for that year."""
    t = t.copy()
    if hist_mean is None:
        t = t[t.prior_n >= MIN_PRIOR_SEASONS].copy(); t["hist_mean"] = t.prior_mean
    else:
        t["hist_mean"] = np.asarray(t.set_index(["district", "season", "crop"]).index.map(hist_mean), dtype=float)
    t["lag_ratio"] = (t.lag_yield / t.hist_mean).fillna(1.0)
    return t

def price_table(prices, msp, min_seasons=5):
    """One row per (crop, season, market, crop_year). Target: mean modal price over the harvest months."""
    m = msp.set_index(["crop", "crop_year"]).msp_rs_q
    p = prices.set_index(["crop", "market", "year", "month"]).modal_price_rs_q
    rows = []
    for (crop, mkt), g in prices.groupby(["crop", "market"]):
        dist = g.district.iloc[0]
        for season in CROPS[crop]["seasons"]:
            key, hm = CROPS[crop]["msp_key"][season], CROPS[crop]["harvest"][season]
            if not isinstance(key, str) or not hm: continue
            def avg(y, months):
                v = [p.get((crop, mkt, y + o, mo)) for o, mo in months]; v = [x for x in v if x is not None]
                return float(np.mean(v)) if v else np.nan
            for y in range(int(g.year.min()), int(g.year.max()) + 1):
                if (key, y) not in m or (key, y - 1) not in m: continue
                sow, last = avg(y, SOW_MONTHS[season]), avg(y - 1, hm)
                if np.isnan(sow) or np.isnan(last): continue
                rows.append(dict(crop=crop, season=season, market=mkt, district=dist, crop_year=y, msp=m[(key, y)],
                                 sow_price=sow, lag_harvest_price=last,
                                 sow_ratio=np.log(sow / m[(key, y)]), lag_harvest_ratio=np.log(last / m[(key, y - 1)]),
                                 msp_growth=np.log(m[(key, y)] / m[(key, y - 1)]),
                                 crop_code=CROP_CODE[crop], season_code=SEASON_CODE[season], harvest_price=avg(y, hm)))
    t = pd.DataFrame(rows)
    if t.empty: return t
    n = t.dropna(subset=["harvest_price"]).groupby(["crop", "season", "market"]).size()
    keep = set(n[n >= min_seasons].index)
    return t[[k in keep for k in zip(t.crop, t.season, t.market)]].reset_index(drop=True)
