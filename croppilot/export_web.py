"""OFFLINE export for the TypeScript/Next.js app (run after train.py).

Writes into ../croppilot-web/:
  models/yield_model.onnx      - the trained GradientBoosting yield model (skl2onnx)
  data/engine.json             - everything the TS engine needs (crop rules, taluks, coverage, normals, MSP, costs, meta)
  data/csv/*.csv               - the real canonical CSVs (bundled for transparency / re-export)
  tests/parity_fixtures.json   - Python predictions on sample + random profiles, for the TS parity test
"""
import json, shutil, math, random
from pathlib import Path
import numpy as np, joblib
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
import onnxruntime as ort
from croppilot.config import DATA, MODELS, CROPS, IRR_LEVEL, SOIL_TYPES, FARMGATE_DEDUCTION, TRANSPORT_RS_PER_Q, CURRENT_CROP_YEAR
from croppilot.features import CROP_CODE, SEASON_CODE, YIELD_FEATURES
from croppilot.engine import CropPilot
import pandas as pd

WEB = Path(__file__).resolve().parent.parent / "croppilot-web"

def clean(x):
    if isinstance(x, float) and math.isnan(x): return None
    if isinstance(x, dict): return {k: clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)): return [clean(v) for v in x]
    if isinstance(x, (np.integer,)): return int(x)
    if isinstance(x, (np.floating,)): return None if np.isnan(x) else float(x)
    if isinstance(x, np.bool_): return bool(x)
    return x

def main():
    cp = CropPilot()
    # 1) ONNX (double-check against sklearn)
    m = joblib.load(MODELS / "yield_model.joblib")
    onx = convert_sklearn(m, initial_types=[("X", FloatTensorType([None, len(YIELD_FEATURES)]))], target_opset=17)
    (WEB / "models/yield_model.onnx").write_bytes(onx.SerializeToString())
    X = np.random.default_rng(0).normal(size=(50, 8)).astype(np.float32) + np.array([5, 0, 500, 50, 31, 2010, 1, 5], np.float32)
    s = ort.InferenceSession(str(WEB / "models/yield_model.onnx"))
    d = np.abs(s.run(None, {"X": X})[0].ravel() - m.predict(pd.DataFrame(X, columns=YIELD_FEATURES)))
    print(f"ONNX vs sklearn max abs diff (log-ratio): {d.max():.2e}")
    # 2) engine.json
    normals = {}
    for (dist, sea), g in cp.sw.groupby(["district", "season"]):
        normals[f"{dist}|{sea}"] = g[["rain_main", "rain_prior", "tmax_late"]].median().to_dict()
    rain_hist = {f"{d}|{se}": [round(float(v), 1) for v in g.sort_values("crop_year").rain_main.dropna()]
                 for (d, se), g in cp.sw.groupby(["district", "season"])}
    msp_prev = {k: float(v) for (k, y), v in cp.msp.items() if y == CURRENT_CROP_YEAR - 1}
    msp = {k: float(v) for (k, y), v in cp.msp.items() if y == CURRENT_CROP_YEAR}
    meta = {k: cp.meta[k] for k in ["rain_source", "yield_method", "yield_band_log", "price_method_used", "price_band_log",
                                    "hist_harvest_to_msp_logratio", "hist_mean_yield", "last_yield", "last_yield_year"]}
    eng = dict(
        generated_by="export_web.py", current_crop_year=CURRENT_CROP_YEAR,
        farmgate_deduction=FARMGATE_DEDUCTION, transport_rs_per_q=TRANSPORT_RS_PER_Q,
        irr_level=IRR_LEVEL, soil_types=SOIL_TYPES, yield_features=YIELD_FEATURES, crop_code=CROP_CODE, season_code=SEASON_CODE,
        crops={c: {k: a[k] for k in ["label", "label_kn", "seasons", "ph_min", "ph_max", "legume", "repeat_ok",
                                     "kharif_rainfed_soils", "kharif_min_rain_mm", "rabi_rainfed_soils", "rabi_min_irrigation",
                                     "msp_key", "rule_sources"]} for c, a in CROPS.items()},
        taluks=cp.taluks.fillna("").to_dict("records"),
        coverage=cp.cov[["district", "season", "crop", "included", "exclusion_reason", "price_basis", "yield_seasons"]].fillna("").to_dict("records"),
        normals=normals, rain_hist=rain_hist, rain_years=[int(cp.sw.crop_year.min()), int(cp.sw.crop_year.max())], msp_prev=msp_prev, msp=msp, costs={c: float(v) for c, v in cp.costs.cost_rs_per_q.items()}, meta=meta,
        metrics=cp.meta["metrics"], split=cp.meta["split"], holdout=cp.meta["holdout"],
        refit_all_years=cp.meta.get("refit_all_years", {}), live_model=cp.meta["live_model"])
    (WEB / "data/engine.json").write_text(json.dumps(clean(eng), ensure_ascii=False))
    for f in ["crops", "taluks", "districts", "coverage", "yields", "prices_monthly", "weather_monthly", "msp", "costs", "fields"]:
        shutil.copy(DATA / f"{f}.csv", WEB / f"data/csv/{f}.csv")
    shutil.copy(DATA / "sources/SOURCES.md", WEB / "data/csv/SOURCES.md")
    # 3) parity fixtures
    random.seed(1)
    fields = pd.read_csv(DATA / "fields.csv").to_dict("records")
    tal = cp.taluks.taluk.tolist()
    for i in range(60):
        fields.append(dict(field_id=f"R{i}", taluk=random.choice(tal), season=random.choice(["Kharif", "Rabi"]),
                           area_acres=round(random.uniform(0.5, 10), 1), soil_ph=round(random.uniform(5.5, 8.6), 1),
                           soil_type=random.choice(SOIL_TYPES), irrigation=random.choice(list(IRR_LEVEL)),
                           previous_crop=random.choice(list(CROPS) + ["fallow", "cotton"])))
    fx = []
    for f in fields:
        f = {k: (None if isinstance(v, float) and math.isnan(v) else v) for k, v in f.items()}
        res, ctx = cp.evaluate(f)
        fx.append(dict(input=f, district=ctx["district"], results=[dict(crop=r["crop"], feasible=r["feasible"], rank=r.get("rank"),
                   net_typical=r.get("net_typical"), net_worst=r.get("net_worst"), yields=r.get("yields"),
                   yield_method=r.get("yield_method"), price_base=(r.get("prices") or {}).get("base")) for r in res]))
    (WEB / "tests/parity_fixtures.json").write_text(json.dumps(clean(fx), indent=0))
    print(f"wrote engine.json, yield_model.onnx, {len(fx)} parity fixtures")

if __name__ == "__main__":
    main()
