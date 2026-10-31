"""Compare the LIVE yield model (refit on all years) with the holdout model (fit 1997-2016): how much would
2025 live predictions differ, and would the demo-farm ranking change?      python refit_compare.py"""
import joblib, numpy as np, pandas as pd, json
from croppilot.config import MODELS
from croppilot.engine import CropPilot
DEMO = dict(taluk="Vijayapura", season="Rabi", area_acres=4, soil_ph=8.1, soil_type="deep_black", irrigation="none", previous_crop="jowar")
def rank(cp): return [(r["crop"], round(r["net_typical"])) for r in cp.evaluate(DEMO)[0] if "rank" in r]
cp = CropPilot(); prod = cp.yield_model if hasattr(cp, "yield_model") else None
base_rank = rank(cp)
attr = next(a for a, v in vars(cp).items() if hasattr(v, "predict"))
X = []
for k, hm in cp.meta["hist_mean_yield"].items():
    d, s, c = k.split("|"); X.append(k)
pts_prod, pts_all = {}, {}
allm = joblib.load(MODELS / "yield_model_holdout_1997_2016.joblib")
res_prod = {}; ks = [k for k in cp.meta["hist_mean_yield"]]
import itertools
tal = cp.taluks.groupby("district").first().reset_index()
diffs = []
for _, t in tal.iterrows():
    for s in ["Kharif", "Rabi"]:
        f = dict(taluk=t.taluk, season=s, area_acres=2, soil_ph=7.0, soil_type="deep_black", irrigation="full")
        a = {r["crop"]: r for r in cp.evaluate(f)[0] if r.get("yields")}
        orig = getattr(cp, attr); setattr(cp, attr, allm)
        b = {r["crop"]: r for r in cp.evaluate(f)[0] if r.get("yields")}; setattr(cp, attr, orig)
        for c in a:
            # raw model prediction difference (independent of which method the crop uses)
            pass
        diffs += [abs(b[c]["yields"]["typical"] / a[c]["yields"]["typical"] - 1) for c in a if a[c]["yield_method"] == "model"]
setattr(cp, attr, allm); all_rank = rank(cp)
out = dict(model_attr=attr, yield_model_crops_mean_abs_pct_diff=round(100 * float(np.mean(diffs)), 2),
           yield_model_crops_max_abs_pct_diff=round(100 * float(np.max(diffs)), 2), n=len(diffs),
           demo_rank_live_all_years=base_rank, demo_rank_holdout_model=all_rank)
print(json.dumps(out, indent=1))
m = json.loads((MODELS / "metrics.json").read_text()); m["refit_all_years"].update({k: v for k, v in out.items() if k != "model_attr"})
(MODELS / "metrics.json").write_text(json.dumps(m, indent=1, default=float))
