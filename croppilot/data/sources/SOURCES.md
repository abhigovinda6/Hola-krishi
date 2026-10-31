# Data sources (all REAL, public; fetched 2026-10-22 IST, extended 2026-10-23 IST)

Nothing here is invented. Where an official site couldn't be reached from the build machine, I used a public mirror of the same official dataset and flagged it below. No login, captcha or block was bypassed.

| Data | Source / URL | Coverage | Units | Caveats |
|---|---|---|---|---|
| District crop area & production (original, superseded) | DES "District-wise, season-wise crop production statistics" (data.gov.in catalog `district-wise-season-wise-crop-production-statistics-0`), from the GitHub mirror `raw.githubusercontent.com/dibyendubiswas1998/Crop-Production-Analysis/main/DATA/crop_production.csv` (sha256 5b2637…d520) | 30 Karnataka districts (pre-2018 boundaries), 1997-98 to 2014-15, Kharif & Rabi, 14 crops | ha, tonnes → q/acre | Mirror, not the official download. Rice is converted to paddy at a 67% outturn. 14 rows with yield < 0.1 q/acre were dropped as implausible (listed in `dropped_implausible_yields.csv`). **No data after 2014-15.** |
| District crop area & production (**primary since 2026-10-23**) | India Data Portal (ISB / Bharti Institute) "Area, Production, Yield (APY)" resource `crop-wise-area-production-yield.csv` (ckandev.indiadataportal.com, package `area-production-yield-apy`, resource f980409d…), extracted by IDP from aps.dac.gov.in. **Licence: Open Data Commons Attribution (ODC-By)** – attribute "DES, MoA&FW via India Data Portal". Plus IDP resource `cropwise-area-production-yield-upag.csv` (DES/UPAG) used **only for 2023-24 and 2024-25**. Converted by `convert_idp_apy.py` → `ext/apy_idp_karnataka.csv`, `ext/apy_upag_karnataka.csv` | 30 districts (pre-2018 boundaries), crop years 1997-98 to 2024-25 (28 seasons), Kharif & Rabi, all 14 crops | ha, tonnes → q/acre | On 1997-2014 the IDP values match the old GitHub mirror exactly (6,684/6,684 rows, ratio 1.0000), and UPAG matches IDP APY exactly on the 2013-2022 overlap (6,881 rows), so there is no double counting: one row per district×season×crop×year, later source wins on identical values. New districts folded back: Vijayanagara → BELLARY (area & production summed), Bengaluru South → RAMANAGARA, Kalaburagi → GULBARGA, etc. Rows with yield <0.1 or >40 q/acre dropped (logged). IDP notes 2020-21/2021-22 were partially updated at source. |
| Mandi prices (**extended 2026-10-23**) | Hugging Face dataset `Shiva1567867/AGMARK_Commodity_Pricing_Variety_Wise_Daily_Market_Prices_Data_Commodity_2022_2025` (yearly CSV dumps of agmarknet.gov.in daily prices; repo tagged **MIT**; underlying data is Government of India AGMARKNET open data). Karnataka rows, our 14 commodities, via `convert_hf_agmarknet.py` → `ext/agmarknet_hf_karnataka.csv.gz` | Karnataka APMCs, Jan 2002 – Dec 2024 for all 14 crops (2001 has a handful of rows; 2025 partial and excluded), daily → monthly median modal | Rs/quintal | Third-party redistribution, not the official download; no arrivals column. Overlapping 2008-2017 days with the iancovert mirror are de-duplicated on crop×market×date (market names match for 95%+ of markets). Modal price outside Rs 300-20,000 dropped. All 14 crops now have market price history (previously 6). |
| Mandi prices & arrivals (2008-2017, original) | AGMARKNET via the public mirror `github.com/iancovert/Agmarknet` (Wheat, Maize, Arhar, Green Gram, Black Gram, Soyabean; 2008 to Jun 2017) | Karnataka APMCs, daily to monthly | Rs/quintal; tonnes | Mirror. Mixed varieties. Arrivals are incomplete. Rows with modal price outside Rs 300-20,000 and duplicate rows were dropped. **No data after June 2017.** No jowar, ragi, paddy, groundnut, sunflower, gram or safflower prices in the mirror, so those crops are priced from MSP. |
| Rainfall & temperature (primary) | NASA POWER monthly point API `power.larc.nasa.gov/api/temporal/monthly/point` (PRECTOTCORR, T2M_MAX, T2M_MIN; community=AG) at each district HQ | 1997-2024 | mm, °C | **Satellite/reanalysis (MERRA-2), not gauge data.** One grid cell per district HQ. |
| Rainfall (comparison) | IMD 0.25° gridded daily rainfall (Pai et al. 2014), downloaded with `imdlib` from imdpune.gov.in. `fetch_imd.py` takes the mean of the 3×3 block of 0.25° cells around each HQ | 1997-2024 | mm | Correlation of seasonal totals with NASA POWER: Kharif 0.81, Rabi 0.84. The yield model was **slightly worse** with IMD (walk-forward MAE 1.11 vs 1.07 q/acre), so NASA POWER is used. Both are kept in `weather_monthly.csv`. |
| District HQ coordinates | OpenStreetMap Nominatim (`geocode_districts.py`) | 30 districts | degrees | The HQ point stands in for the whole district. |
| Taluk list | Wikipedia "List of taluks of Karnataka" (MediaWiki API; the page cites karnataka.gov.in) via `build_taluks.py` | 240 taluks in 30 districts | – | Taluks of newer districts are mapped to their pre-2018 DES parent district (e.g. Vijayanagara → Bellary). The market is a name match to an AGMARKNET market in the same district, otherwise the district's main market. No distance calculation is done. |
| MSP | RBI Handbook of Statistics Table 23 (foodgrains, 2026 edition) and Table 26 (non-foodgrains); CACP MSP page (jowar, ragi, bajra 2010-11 onward; oilseeds 2022-23 onward); DES MSP statement (Jan 2025); PIB PRID 2177219 | crop years 1997-98 to 2025-26 | Rs/quintal | Copied by hand from the published tables into `msp_all.csv`. Soybean 2012-13 is missing because the source shows "-". |
| Cost of cultivation | CACP projected A2+FL cost per quintal, all-India: PIB PRID 2131983 (Kharif MS 2025-26), PIB PRID 2177219 (Rabi MS 2026-27) → `costs_cacp.csv`. Historical wheat costs are in `cost_of_production_wheat_all_india.csv` (RAS article Table 5) | 2025-26 | Rs/quintal | **All-India, not Karnataka.** The per-acre cost is approximated as cost/q × district mean yield. Jowar uses the hybrid cost (CACP doesn't compile a Maldandi cost). Rabi maize, groundnut and sunflower use the Kharif cost. |

## Excluded
- **Crops:**
  - Cotton: DES reports lint bales but mandis quote kapas.
  - Sugarcane: whole-year crop priced by FRP.
  - Horticulture crops.
  - Rabi groundnut in most districts: too few seasons.
- **District/season/crop combos:** see `../coverage.csv`. 184 of 469 combos fail the threshold of ≥10 yield seasons and ≥1,000 ha mean area.

## Official sites (re-tried 2026-10-22 from the build machine)
| Site | Result |
|---|---|
| data.gov.in | 000 (no response) or 503 |
| api.data.gov.in | 000 |
| aps.dac.gov.in | 000 |
| agmarknet.gov.in | 403 |
| krama.karnataka.gov.in | 000 |
| cacp.da.gov.in | 403 |
| desagri.gov.in | 000 |
| ksndmc.org | 200, but historical data needs an OTP |
| upag.gov.in | 200, but its API needs a login |
| imdpune.gov.in (via imdlib) | **worked** |

Newer data can be added manually; see `../SCHEMAS.md`.

## Third-party data licences

The MIT licence at the repository root covers this project's code. It does not relicense the datasets. Republish the cleaned tables in `data/` only with the attribution below. A short copy of this note is also in the repository `DATA.md`.

| Dataset | Terms recorded for this project | Attribution |
|---|---|---|
| Area, Production, Yield (APY) via India Data Portal, crop years 1997–98 to 2024–25, including the UPAG resource used only for 2023–24 and 2024–25 | **Open Data Commons Attribution (ODC-By)** | "DES, MoA&FW via India Data Portal" |
| AGMARKNET daily prices, 2002–2024, from the Hugging Face dump `Shiva1567867/AGMARK_Commodity_Pricing_Variety_Wise_Daily_Market_Prices_Data_Commodity_2022_2025` | That repository is tagged **MIT**. The underlying series is Government of India AGMARKNET open data. | AGMARKNET, and the mirror if you redistribute the dump |
| AGMARKNET 2008–June 2017 mirror (`github.com/iancovert/Agmarknet`) | Public mirror of government market data. This repo does not record a separate licence for the mirror. | AGMARKNET |
| MSP (RBI Handbook, CACP, DES, PIB) and CACP A2+FL costs | Figures copied from published Government of India tables. This repo does not record a separate licence. | Name the table or PIB release in the table above |
| NASA POWER monthly weather, 1997–2024 (the rain and temperature series the model uses) | NASA POWER (MERRA-2) point data | NASA POWER |
| IMD 0.25° gridded rainfall, 1997–2024 | Comparison series only (Pai et al. 2014). Not used by the live yield model. | IMD |
| District headquarters | OpenStreetMap Nominatim geocodes | Follow OpenStreetMap's licence for those coordinates |
| Taluk list | Wikipedia "List of taluks of Karnataka" (the page cites karnataka.gov.in) | Follow Wikipedia's licence for that page |
