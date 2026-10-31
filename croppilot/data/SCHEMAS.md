# Canonical CSV schemas (data/)

`python build_data.py` rebuilds these files from `data/sources/raw/` and any drop-ins under `data/incoming/`, then validates them. The app loads only these files. You don't need to edit code to add new data.

| File | One row per | Columns (units) |
|---|---|---|
| crops.csv | crop (**config row**) | crop id, label, label_kn, apy_name (exact DES crop name), seasons (`Kharif;Rabi`), price_source (`market`/`msp`), agmarknet_key, msp_key_kharif/msp_key_rabi (key into msp.csv), cost_key, yield_factor (e.g. rice→paddy 1.4925), ph_min, ph_max, legume (0/1), repeat_ok (0/1), kharif_rainfed_soils (`any` or `deep_black;red;...`), kharif_min_rain_mm, rabi_rainfed_soils, rabi_min_irrigation (`none`/`protective`/`full`), harvest_kharif / harvest_rabi (`offset-month;...`, e.g. `1-2;1-3` = Feb and Mar of the next year), rule_sources |
| districts.csv | district (DES spelling) | district, hq_town, lat, lon (decimal degrees), geocoder |
| taluks.csv | taluk | taluk, district (DES name), market (AGMARKNET market used for prices), market_method (`name match` / `district main market` / `no market data`), source |
| yields.csv | district × season × crop × crop_year | area_ha (hectares), production_t (tonnes), yield_q_per_acre (quintals/acre), source. crop_year is the calendar year of sowing (DES "2015-16" → 2015). |
| weather_monthly.csv | district × year × month | rain_mm_power (mm, NASA POWER MERRA-2), tmax_c, tmin_c (°C), rain_mm_imd (mm, IMD 0.25° gridded, optional) |
| prices_monthly.csv | crop × market × year × month | district, modal_price_rs_q (median of daily modal prices, Rs/quintal), min_price_rs_q, max_price_rs_q, arrivals_t (tonnes), reporting_days, source |
| msp.csv | msp key × crop_year | msp_rs_q (Rs/quintal), source |
| costs.csv | crop | cost_rs_per_q (CACP A2+FL, all-India, Rs/quintal), cost_basis, reference_season, source, caveat |
| coverage.csv | district × season × crop | yield_seasons, first_year, last_year, mean_area_ha, market_price_seasons, price_basis, included (bool), exclusion_reason |
| fields.csv | sample field | field_id, farmer, taluk, season, area_acres, soil_ph, soil_type, irrigation, previous_crop |

## Adding newer data (the main gaps are yields after 2014-15 and prices after June 2017)
1. **Yields.** Go to aps.dac.gov.in → APY → "Crop Production Statistics", choose Karnataka, the districts, the crops and the years, then export to Excel. Save the file to `data/incoming/apy/` as .xlsx or .csv. The converter recognises both the official export and the data.gov.in format.
2. **Prices.** Go to agmarknet.gov.in → Price & Arrivals → Date-wise. Choose the commodity, Karnataka, and a month, then export. Save the file to `data/incoming/agmarknet/<crop>/` (for example `data/incoming/agmarknet/wheat/2024_03.xlsx`).
3. Run `python build_data.py && python train.py && python validate.py && pytest -q`.
4. **New crop.** Add a row to `crops.csv`, add its MSP rows to `data/sources/msp_all.csv`, add a cost row to `data/sources/costs_cacp.csv`, then rebuild.
5. **New district.** Add a row to `districts.csv` and put its NASA POWER monthly CSV at `data/incoming/weather/power_<district>.csv`. The download URL is in SOURCES.md. Then add its taluks to `taluks.csv`, or rerun `python build_data.py --taluks`.


## models/metrics.json (train.py)
- `split`: yield_train [1997, 2016], yield_holdout [2017, 2024], price_train [2002, 2019], price_holdout [2020, 2024], inner fold ranges.
- `yield_hparams`, `price_hparams`, `tuning`: grid search by inner walk-forward on training years.
- `metrics.yield|price`: inner walk-forward (training years) per crop-season; `best` = method used by the engine.
- `holdout.yield|price`: one-time holdout MAE / MAPE% per crop-season + ALL, for model, each baseline and `chosen` (what the app uses).
- `holdout.*_by_year`, `holdout.*_wins` (crop-seasons where the model beats the baselines), `refit_all_years` (comparison only).
