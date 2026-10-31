"""Validation report: (1) input schema, (2) data, (3) walk-forward model vs baselines, (4) recommendation sanity."""
import json, pandas as pd
from croppilot.config import DATA, MODELS
from croppilot.schema import validate_field
from croppilot.validation import check_data, check_recommendation
from croppilot.engine import CropPilot
pd.set_option("display.width", 250); pd.set_option("display.max_rows", 300)
fails = 0
def section(t): print("\n" + "=" * 100 + f"\n{t}\n" + "=" * 100)

section("1) INPUT VALIDATION")
fields = pd.read_csv(DATA / "fields.csv").to_dict("records")
for f in fields: validate_field(f); print("  OK  ", f["field_id"])
G = dict(taluk="Indi", season="Rabi", area_acres=2, soil_ph=7.5, soil_type="deep_black", irrigation="none")
for k, v in [("taluk", "Atlantis"), ("season", "Summer"), ("area_acres", 0), ("soil_ph", 12), ("soil_type", "sandy"),
             ("irrigation", "drip"), ("previous_crop", "wheatgrass")]:
    try: validate_field({**G, k: v}); print(f"  FAIL {k}={v} accepted"); fails += 1
    except ValueError as e: print(f"  OK   {k}={v!r} rejected")

section("2) DATA VALIDATION (canonical CSVs)")
d = check_data(); print(d[~d.passed].to_string(index=False) if (~d.passed).any() else f"  all {len(d)} checks passed")
fails += int((~d.passed).sum())
cov = pd.read_csv(DATA / "coverage.csv")
print(f"  coverage: {int(cov.included.sum())}/{len(cov)} district-season-crop combos pass the minimum-data threshold")

section("3) MODEL VALIDATION - fixed time holdout (from models/metrics.json, written by train.py)")
m = json.loads((MODELS / "metrics.json").read_text())
sp = m["split"]
print(f"split: yield train {sp['yield_train']} -> holdout {sp['yield_holdout']}; price train {sp['price_train']} -> holdout {sp['price_holdout']}")
print("rain source, hyper-parameters, methods and bands chosen by inner walk-forward on training years only:",
      m["rain_source"], m["yield_hparams"], m["price_hparams"])
hc = ["crop", "season", "n", "base_hist_mean_MAE", "base_last_season_MAE", "model_MAE", "model_MAPE%", "chosen_MAE", "best"]
print("YIELD HOLDOUT (q/acre)\n" + pd.DataFrame(m["holdout"]["yield"])[hc].to_string(index=False))
print(pd.DataFrame(m["holdout"]["yield_by_year"]).to_string(index=False))
hp = ["crop", "season", "n", "base_msp_MAE", "base_last_season_MAE", "base_hist_ratio_x_msp_MAE", "model_MAE", "model_MAPE%", "chosen_MAE", "best"]
print("PRICE HOLDOUT (Rs/q)\n" + pd.DataFrame(m["holdout"]["price"])[hp].to_string(index=False))
print(pd.DataFrame(m["holdout"]["price_by_year"]).to_string(index=False))
print("wins:", m["holdout"]["yield_wins"], m["holdout"]["price_wins"])
ok = sp["yield_train"][1] < sp["yield_holdout"][0] and sp["price_train"][1] < sp["price_holdout"][0] \
     and sp["yield_inner_folds"][1] <= sp["yield_train"][1] and sp["price_inner_folds"][1] <= sp["price_train"][1]
print("  OK  " if ok else "  FAIL", "train/holdout/inner folds do not overlap"); fails += 0 if ok else 1
section("3b) INNER WALK-FORWARD ON TRAINING YEARS (basis for method choice)")
cols = ["crop", "season", "n", "base_hist_mean_MAE", "base_last_season_MAE", "model_MAE", "model_MAPE%", "best"]
print("YIELD (q/acre)\n" + pd.DataFrame(m["metrics"]["yield"])[cols].to_string(index=False))
pc = ["crop", "season", "n", "base_msp_MAE", "base_last_season_MAE", "base_hist_ratio_x_msp_MAE", "model_MAE", "model_MAPE%", "best"]
print("\nHARVEST PRICE (Rs/q)\n" + pd.DataFrame(m["metrics"]["price"])[pc].to_string(index=False))
print("\nused at inference - price:", m["price_method_used"])

section("4) RECOMMENDATION SANITY")
cp = CropPilot()
import itertools
tal = pd.read_csv(DATA / "taluks.csv").groupby("district").first().reset_index()
n_chk = 0
for (_, t), season, soil, irr in itertools.product(tal.iterrows(), ["Kharif", "Rabi"], ["deep_black", "red"], ["none", "full"]):
    res, ctx = cp.evaluate(dict(taluk=t.taluk, season=season, area_acres=2, soil_ph=7.0, soil_type=soil, irrigation=irr))
    bad = [c for c in check_recommendation(res, ctx) if not c[1]]; n_chk += 1
    if bad: fails += len(bad); print("  FAIL", t.taluk, season, soil, irr, bad[:3])
print(f"  {n_chk} profiles (every district x season x 2 soils x 2 irrigation levels) checked")
section("RESULT: " + ("ALL CHECKS PASSED" if fails == 0 else f"{fails} CHECK(S) FAILED"))
raise SystemExit(1 if fails else 0)
