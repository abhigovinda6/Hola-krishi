import json, pandas as pd, pytest
from croppilot.config import DATA, MODELS, CROPS
from croppilot.schema import validate_field
from croppilot.io import load_apy, load_agmarknet, validate_csv
from croppilot.validation import check_data, check_recommendation
from croppilot.engine import CropPilot

GOOD = dict(taluk="Indi", season="Rabi", area_acres=2, soil_ph=7.5, soil_type="deep_black", irrigation="none")

@pytest.fixture(scope="module")
def cp(): return CropPilot()

# ---- (1) input ----
def test_good_input(): assert validate_field(GOOD)["taluk"] == "Indi"
def test_taluk_case_insensitive(): assert validate_field({**GOOD, "taluk": "indi"})["taluk"] == "Indi"
@pytest.mark.parametrize("k,v", [("taluk", "Atlantis"), ("season", "Summer"), ("area_acres", 0), ("area_acres", 500),
    ("soil_ph", 2), ("soil_ph", 11), ("soil_type", "sandy"), ("irrigation", "drip"), ("previous_crop", "wheatgrass")])
def test_bad_input(k, v):
    with pytest.raises(ValueError, match=k): validate_field({**GOOD, k: v})

# ---- (2) data ----
def test_canonical_csvs_valid():
    d = check_data(); assert d.passed.all(), d[~d.passed]
def test_yields_are_real_and_multi_district():
    y = pd.read_csv(DATA / "yields.csv")
    assert y.district.nunique() >= 25 and y.crop.nunique() >= 10 and set(y.season) == {"Kharif", "Rabi"}
def test_every_taluk_maps_to_district():
    t = pd.read_csv(DATA / "taluks.csv"); assert t.district.notna().all() and len(t) >= 200
def test_apy_official_format_converter(tmp_path):
    f = tmp_path / "apy.csv"
    pd.DataFrame({"State": ["Karnataka"] * 2, "District": ["1. BIJAPUR", "BIJAPUR"], "Crop": ["Wheat", "Gram"],
                  "Year": ["2015-16", "2016-17"], "Season": ["Rabi", "Rabi"], "Area (Hectare)": [50000, 90000],
                  "Production (Tonne)": [40000, 60000], "Yield (Tonne/Hectare)": [0.8, 0.67]}).to_csv(f, index=False)
    y = load_apy(f)
    assert list(y.crop) == ["wheat", "gram"] and list(y.crop_year) == [2015, 2016] and y.district.eq("BIJAPUR").all()
    assert abs(y.yield_q_per_acre.iloc[0] - 0.8 * 10 / 2.47105) < 0.01
def test_agmarknet_official_format_converter(tmp_path):
    f = tmp_path / "ag.csv"
    pd.DataFrame({"Sl no.": [1, 2], "District Name": ["Bijapur", "Bijapur"], "Market Name": ["Bijapur", "Bijapur"],
                  "Commodity": ["Wheat", "Wheat"], "Variety": ["Other", "Other"], "Grade": ["FAQ", "FAQ"],
                  "Min Price (Rs./Quintal)": [2400, 2450], "Max Price (Rs./Quintal)": [2800, 2900],
                  "Modal Price (Rs./Quintal)": [2600, 2650], "Price Date": ["15 Mar 2024", "16 Mar 2024"]}).to_csv(f, index=False)
    d = load_agmarknet(f, crop="wheat")
    assert len(d) == 2 and d.crop.eq("wheat").all() and d.modal_price.tolist() == [2600, 2650]

# ---- (3) models ----
def test_metrics_report_baselines_honestly():
    m = json.loads((MODELS / "metrics.json").read_text())
    for r in m["metrics"]["yield"]:
        assert {"base_hist_mean_MAE", "base_last_season_MAE", "model_MAE", "best"} <= set(r)
    # the engine must use the method that won the backtest for each crop-season
    for r in m["metrics"]["yield"]:
        if r["crop"] != "ALL": assert m["yield_method"][f"{r['crop']}|{r['season']}"] == r["best"]
def test_price_method_used_needs_no_live_data():
    m = json.loads((MODELS / "metrics.json").read_text())
    assert set(m["price_method_used"].values()) <= {"base_msp", "base_hist_ratio_x_msp"}

# ---- (4) recommendations ----
@pytest.mark.parametrize("fid", ["V1", "V2", "D1", "M1"])
def test_sample_fields_sane(cp, fid):
    f = pd.read_csv(DATA / "fields.csv").set_index("field_id").loc[fid].to_dict() | {"field_id": fid}
    res, ctx = cp.evaluate(f)
    bad = [c for c in check_recommendation(res, ctx) if not c[1]]; assert not bad, bad
def test_no_data_crop_never_ranked(cp):
    res, _ = cp.evaluate({**GOOD, "season": "Kharif", "irrigation": "full"})
    paddy = next(r for r in res if r["crop"] == "paddy")
    assert not paddy["feasible"] and "not enough data" in paddy["reasons"][0]
def test_rotation_blocks_repeat(cp):
    res, _ = cp.evaluate({**GOOD, "previous_crop": "jowar"})
    assert next(r for r in res if r["crop"] == "jowar")["feasible"] is False
def test_rabi_wheat_needs_irrigation_on_red_soil(cp):
    res, _ = cp.evaluate({**GOOD, "soil_type": "red"})
    assert next(r for r in res if r["crop"] == "wheat")["feasible"] is False
    res, _ = cp.evaluate({**GOOD, "soil_type": "red", "irrigation": "full"})
    assert next(r for r in res if r["crop"] == "wheat")["feasible"] is True
def test_only_season_crops_listed(cp):
    res, _ = cp.evaluate(GOOD)
    assert all("Rabi" in CROPS[r["crop"]]["seasons"] for r in res)

# ---- (5) fixed time holdout / leakage ----
def test_holdout_split_is_disjoint():
    m = json.loads((MODELS / "metrics.json").read_text()); s = m["split"]
    assert s["yield_train"] == [1997, 2016] and s["yield_holdout"] == [2017, 2024]
    assert s["price_train"] == [2002, 2019] and s["price_holdout"] == [2020, 2024]
    assert s["yield_inner_folds"][1] <= 2016 and s["price_inner_folds"][1] <= 2019
    assert m["holdout"]["yield_wins"]["groups"] == 18 and m["holdout"]["price_wins"]["groups"] == 18

def test_price_hist_ratio_is_strictly_prior():
    from croppilot import holdout as H
    from croppilot.modeling import load
    p = H.price_rows(load()); r = p.iloc[len(p) // 2]
    q = p[(p.crop == r.crop) & (p.season == r.season) & (p.crop_year < r.crop_year)]
    assert abs(r.prior_r - q.logr.mean()) < 1e-9

def test_hist_mean_is_strictly_prior():
    from croppilot.features import yield_table, season_weather, add_ratio_features
    from croppilot.modeling import load
    d = load(); t0 = yield_table(d["yields"], season_weather(d["weather_monthly"]), d["coverage"])
    t = add_ratio_features(t0)
    k = t.iloc[len(t) // 3]
    ser = t0[(t0.district == k.district) & (t0.season == k.season) & (t0.crop == k.crop)]
    assert abs(k.hist_mean - ser[ser.crop_year < k.crop_year].yield_q_per_acre.mean()) < 1e-9
    assert (t.prior_n >= 3).all()

def test_live_model_refit_on_all_years():
    m = json.loads((MODELS / "metrics.json").read_text()); lm = m["live_model"]
    assert lm["yield_data_years"] == [1997, 2024] and lm["yield_fit_years"][1] == 2024 and lm["price_fit_years"] == [2002, 2024]
    assert (MODELS / "yield_model_holdout_1997_2016.joblib").exists() and (MODELS / "price_model_holdout_2002_2019.joblib").exists()
