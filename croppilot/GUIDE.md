# CropPilot: beginner's guide (real data, multi-crop)

**Live demo:** https://croppilot-rabi.vercel.app. The current data years, holdout split, and how to run this folder are in the repository [README](../README.md). Some tables below are the earlier all-years walk-forward and are kept as history; the published check is the fixed holdout in `models/metrics.json`.

This guide assumes you have never trained a machine-learning model before. Each step has the command to run, what you should see, and the reason for doing it.

## 0. Words you'll meet
- **Kharif / Rabi:** the monsoon season (sown Jun–Jul, harvested Oct–Dec) and the winter season (sown Oct–Nov, harvested Feb–Apr).
- **APY:** Area, Production, Yield, the official crop statistics from DES. **Yield** = production ÷ area, which we convert to quintals per acre (1 q = 100 kg).
- **APMC / mandi / AGMARKNET:** regulated markets, and the government portal that publishes their daily prices. **Modal price** = the most common price of the day.
- **MSP:** Minimum Support Price, the price the government announces for each crop every season.
- **CACP A2+FL:** the cost estimate the government uses for MSP: paid-out costs plus the value of family labour.
- **Feature:** an input to a model, such as monsoon rainfall. **Target:** what the model predicts, here yield and price.
- **Gradient boosting:** a model built from many small decision trees, each one correcting the errors of the trees before it (scikit-learn `GradientBoostingRegressor`).
- **Baseline:** a simple rule the model has to beat, such as "same as the district's average" or "same as last season".
- **Fixed time holdout (current):** yield models train on crop years 1997-2016 and are scored once on 2017-2024; price on 2002-2019, scored on 2020-2024. Hyper-parameters, the rain source, each crop's method and the ranges are chosen by walk-forward *inside* the training years. hist_mean, last season and the harvest/MSP ratio only use years before the predicted year. The holdout models are the published proof; the live app then uses the same settings and methods refit on all years (yield 1997-2024, price 2002-2024). Results: `models/metrics.json` -> `holdout`; charts in `/workspace/screens/holdout_*.png`. The tables below are from the earlier all-years walk-forward and are kept for history.
- **Walk-forward validation:** to test year Y, the model is trained only on years before Y. It never sees the future, so the errors are honest.
- **MAE:** mean absolute error, the average size of a miss in the same units as the target (q/acre or Rs/q). Lower is better.

## 1. Set up (once)
```bash
cd croppilot
python -m venv .venv && source .venv/bin/activate      # an isolated Python environment
pip install -r requirements.txt
```

## 2. Build the data: `python build_data.py`
This script reads the raw public files (`data/sources/raw/`) and any official exports you've dropped into `data/incoming/`. It then cleans them, converts the units, and writes the canonical CSVs (described in `data/SCHEMAS.md`). Expected output:
```
yields.csv: 6684 rows ... weather_monthly.csv: 10080 ... prices_monthly.csv: 18932 ...
coverage: 285/469 district-season-crop combos included
validation: OK
```
Why coverage matters: a combination is offered only if it has at least 10 seasons of yields and at least 1,000 ha of average area. With less data than that, any number we showed would be a guess.

## 3. Train and backtest: `python train.py`
For each season the script builds these features: main-season rain, rain before the season, late-season max temperature, the year, last season's yield ratio, and the district's average yield.
- It trains **one pooled model** across all districts and crops (pooling gives the model enough rows to learn from).
- It tests that model walk-forward against the baselines for **each crop**.
- For each crop and season it keeps **whichever method actually won**.

### Yield results (q/acre, walk-forward, lower is better)
| Crop | Season | n | Hist. avg MAE | Last season MAE | Model MAE | Winner |
|---|---|---|---|---|---|---|
| bajra | Kharif | 70 | 0.95 | 0.83 | 0.91 | base_last_season |
| gram | Rabi | 131 | 0.61 | 0.73 | 0.62 | base_hist_mean |
| groundnut | Kharif | 161 | 0.77 | 0.82 | 0.79 | base_hist_mean |
| groundnut | Rabi | 80 | 0.81 | 0.9 | 0.84 | base_hist_mean |
| jowar | Kharif | 131 | 1.25 | 1.47 | 1.27 | base_hist_mean |
| jowar | Rabi | 108 | 1.05 | 0.85 | 0.79 | model |
| maize | Kharif | 161 | 2.32 | 2.77 | 2.47 | base_hist_mean |
| maize | Rabi | 84 | 1.95 | 1.86 | 1.68 | model |
| moong | Kharif | 120 | 0.37 | 0.44 | 0.39 | base_hist_mean |
| paddy | Kharif | 175 | 2.14 | 1.91 | 1.99 | base_last_season |
| ragi | Kharif | 105 | 1.19 | 1.16 | 1.14 | model |
| safflower | Rabi | 84 | 0.78 | 0.94 | 0.82 | base_hist_mean |
| soybean | Kharif | 42 | 1.03 | 1.27 | 1.02 | model |
| sunflower | Kharif | 119 | 0.55 | 0.61 | 0.54 | model |
| sunflower | Rabi | 91 | 0.54 | 0.45 | 0.5 | base_last_season |
| tur | Kharif | 147 | 0.7 | 0.74 | 0.68 | model |
| urad | Kharif | 48 | 0.5 | 0.58 | 0.54 | base_hist_mean |
| wheat | Rabi | 77 | 1.18 | 0.94 | 1.04 | base_last_season |
| ALL | ALL | 1934 | 1.1 | 1.14 | 1.07 | model |

**How to read this:** the model beats both baselines overall (1.07 vs 1.10 vs 1.14), but only for 6 of the 18 crop-seasons. For the other 12 the engine uses the simple baseline and says so in the explanation ("method: district historical average"). Reporting it this way is honest; claiming the model always wins would not be.

Rainfall: we tried both NASA POWER (satellite/reanalysis) and IMD gridded rainfall (via `imdlib`). NASA POWER gave a lower model MAE (1.07 vs 1.11), so we use NASA POWER.

### Price results (Rs/quintal at harvest, walk-forward)
| crop | season | n | base_msp_MAE | base_msp_MAPE% | base_last_season_MAE | base_last_season_MAPE% | base_hist_ratio_x_msp_MAE | base_hist_ratio_x_msp_MAPE% | model_MAE | model_MAPE% | best |
|---|---|---|---|---|---|---|---|---|---|---|---|
| maize | Kharif | 325 | 142.55 | 10.8 | 209.31 | 15.8 | 153.29 | 11.6 | 138.55 | 10.7 | model |
| maize | Rabi | 372 | 155.49 | 11.0 | 161.57 | 11.5 | 157.14 | 11.4 | 133.49 | 10.1 | model |
| moong | Kharif | 49 | 1144.66 | 17.8 | 1190.56 | 21.4 | 1181.27 | 21.9 | 1147.37 | 22.4 | base_msp |
| soybean | Kharif | 25 | 656.97 | 18.6 | 381.4 | 12.7 | 609.32 | 20.0 | 643.45 | 23.7 | base_last_season |
| tur | Kharif | 75 | 1576.16 | 23.2 | 2071.9 | 34.2 | 2095.44 | 44.4 | 1919.42 | 34.6 | base_msp |
| urad | Kharif | 22 | 2259.81 | 34.6 | 1679.53 | 29.9 | 2002.74 | 41.6 | 1381.35 | 28.3 | model |
| wheat | Rabi | 133 | 494.07 | 22.8 | 225.08 | 11.5 | 338.9 | 17.4 | 243.79 | 13.3 | base_last_season |
| ALL | ALL | 1001 | 409.91 | 14.5 | 417.86 | 15.5 | 427.26 | 16.1 | 373.39 | 13.9 | model |

The price model uses the price in the **sowing month**. Our market data ends in June 2017, so we don't have that price for today. For real recommendations the engine therefore uses MSP, or MSP × the historical harvest/MSP ratio, whichever had the lower error for that crop. It says which one it used.

## 4. Check everything: `python validate.py` and `pytest -q`
`validate.py` runs four checks:
1. data checks (schemas, ranges, duplicates, cross-file keys);
2. the backtest table;
3. 240 random fields, checking that the profits are sane and the scenarios are in order;
4. invalid inputs are rejected.

The last line should read `ALL CHECKS PASSED`. `pytest -q` should report `30 passed`.

## 5. Get recommendations
```bash
python cli.py --field V1                  # Vijayapura, Rabi
python cli.py --all --json                # machine-readable output
python cli.py --coverage DHARWAD          # what's offered in a district, and why
streamlit run app.py                      # the web app
```
Sample output (V1: Vijayapura, Rabi, pH 8.1, deep black soil, rainfed, previous crop jowar):
```

 - #1 Wheat: typical net Rs 9,603/acre (range Rs 2,757 to Rs 23,633). Yield 2.9/4.4/6.4 q/acre (bad/typical/good; Bijapur district average, method: last reported season, latest data 2014). Price Rs 2,603-Rs 4,618/q (base Rs 3,350; MSP x historical harvest-price/MSP ratio; MSP Rs 2,585). Cost ~Rs 4,152/acre (CACP all-India cost/q x district yield - approximation).
 - #2 Bengal gram (chickpea): typical net Rs 5,457/acre (range Rs -961 to Rs 20,537). Yield 1.5/2.5/3.6 q/acre (bad/typical/good; Bijapur district average, method: district historical average, latest data 2014). Price Rs 5,045-Rs 8,481/q (base Rs 5,875; MSP; MSP Rs 5,875). Cost ~Rs 8,147/acre (CACP all-India cost/q x district yield - approximation). Legume: adds nitrogen for the next crop.
 - #3 Sunflower: typical net Rs 5,114/acre (range Rs 315 to Rs 19,733). Yield 1.2/1.7/2.5 q/acre (bad/typical/good; Bijapur district average, method: last reported season, latest data 2014). Price Rs 6,631-Rs 11,146/q (base Rs 7,721; MSP; MSP Rs 7,721). Cost ~Rs 6,957/acre (CACP all-India cost/q x district yield - approximation).
 - #4 Safflower: typical net Rs 3,448/acre (range Rs -2,071 to Rs 16,485). Yield 1.0/1.8/2.7 q/acre (bad/typical/good; Bijapur district average, method: district historical average, latest data 2014). Price Rs 5,616-Rs 9,441/q (base Rs 6,540; MSP; MSP Rs 6,540). Cost ~Rs 7,603/acre (CACP all-India cost/q x district yield - approximation).
 - Maize: not offered - soil pH 8.1 outside 5.5-7.8; needs 'full' irrigation here (rainfed only on no soils).
 - Jowar (sorghum): not offered - rotation: jowar was the previous crop (pest/disease build-up).
 - Groundnut: not offered - soil pH 8.1 outside 6.0-7.8; needs 'full' irrigation here (rainfed only on no soils).

Net Rs/acre for Wheat (rows = yield scenario, columns = price scenario):
           low   base   high
bad       2757   4780   8216
typical   6488   9603  14896
good     11369  15913  23633
Whole field (4.0 acres), typical: Rs 38,413
NEXT ACTION: continue to Polaris Crop Nutrition Plan (CNP) with 'wheat'.
```

### How a recommendation is computed (`croppilot/engine.py`)
1. **Locate:** taluk → district (yields and weather) → APMC market (prices).
2. **Rules** (sources are listed in `data/crops.csv`, column `rule_sources`):
   - Was there enough data for this district, season and crop?
   - Is the soil pH within the crop's range?
   - For a rainfed field: is the soil suitable, and is normal rainfall high enough? For Rabi, is there enough irrigation?
   - Rotation: no repeating the same crop unless it tolerates that.
3. **Yield:** the point estimate comes from the winning method. Bad, typical and good years use the 10th, 50th and 90th percentiles of that method's past errors.
4. **Price:** the base price, with a low/high range taken from the past errors.
5. **Profit/acre** = yield × (price × 0.95 − Rs 50 transport) − cost. Cost = CACP cost per quintal × the district's average yield (an approximation).
6. **Rank** by 0.6 × typical profit + 0.4 × worst-case profit, plus a small bonus for legumes because they add nitrogen to the soil.
7. **Explain** with a template. Add `--llm` to use a local Ollama model; if Ollama isn't available, it falls back to the template.

## 6. Add newer data
See `data/SCHEMAS.md` → "Adding newer data". In short: export from APY or AGMARKNET → put the file in `data/incoming/...` → run `build_data.py`, `train.py`, `validate.py` and `pytest`.

## 7. Known gaps
- The 2026-10-23 refresh extended yields through 2024-25 (India Data Portal, ODC-By) and mandi prices through December 2024 for all 14 crops. See `data/sources/SOURCES.md`. The app still does not fetch this season's mandi price, so a recommendation uses MSP or MSP times the historical harvest-price ratio.
- Costs are all-India, not Karnataka. Yields are district averages, not your field.
- Cotton and sugarcane are excluded (their units don't match).
- `demo_synthetic/` is the older made-up demo. It is kept only for reference; its generator runs standalone.
