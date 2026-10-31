# Hola Krishi (Polaris CropPilot)

**Live demo: [https://croppilot-rabi.vercel.app](https://croppilot-rabi.vercel.app)**

That URL is the live demo of the current web app (v3). This repository is the open-source code and data behind it. Pushing here does not change the live Vercel deployment.

Hola Krishi is a crop season planner for farmers in Karnataka. You enter a taluk, the season (Kharif or Rabi), soil pH, soil type, irrigation, and the previous crop. The app then:

1. **Filters with rules.** It keeps only crops that have enough local data and that fit the field: soil pH, rainfed soil and rainfall or irrigation, and crop rotation.
2. **Estimates yield and price.** Yield is a district figure. For each crop the app uses whichever method did best in training: a pooled gradient-boosting model, the district historical average, or last season. Price for a recommendation is the Minimum Support Price, or MSP times the historical harvest-price ratio, because the app does not fetch this season's mandi prices live.
3. **Computes profit.** Per acre, profit is yield times the farm-gate price, minus cost. The farm-gate price is the estimated price after a 5% deduction and Rs 50 per quintal for transport. Cost is the CACP all-India cost per quintal times that district's average yield.
4. **Ranks the crops.** Rank is 60% typical-year profit plus 40% worst-case profit, with a small bonus for legumes.

An optional **AI summary** rephrases only those computed numbers. A number guard rejects a summary that quotes any other figure, or that names the wrong yield method, and the app shows a template explanation instead. The interface is in **English and Kannada**.

These are estimates, not guarantees. Yields are district averages, costs are all-India, and a farmer's own field will differ. Check with a Raitha Samparka Kendra or KVK before sowing.

## Layout

| Path | What it is |
|---|---|
| `croppilot/` | Python training code, engine, Streamlit UI, tests, cleaned CSVs, and saved models |
| `croppilot-web/` | Next.js app (the live demo). The yield model runs server-side as ONNX (WebAssembly) |
| `DATA.md` | Third-party data licences |
| `CONTRIBUTING.md` | How to set up and where a first change can land |

`croppilot/export_web.py` writes the ONNX model, `engine.json`, and CSVs into `croppilot-web/`. The folder names match that script.

## Python setup

Needs Python 3.10 or newer. From a fresh clone:

```bash
cd croppilot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
python validate.py
python cli.py --all
streamlit run app.py
```

Streamlit serves a local UI at http://localhost:8501. The checked-in CSVs and models are enough for the tests, the CLI, and Streamlit.

`build_data.py` and `train.py` rebuild those files from raw downloads (`data/sources/raw` and `data/sources/ext`). Those downloads are not in this repository. Run the rebuild only when you have them, then `python export_web.py` to refresh the web app.

`imdlib`, `skl2onnx`, and `playwright` in `requirements.txt` are optional. They are for an IMD rainfall download, the ONNX export, and screenshots. The tests do not need them.

## Web setup

Needs Node.js 20 or newer.

```bash
cd croppilot-web
npm install
npm test
npm run dev
```

The dev server is http://localhost:3000. `npm run build && npm start` runs the production build locally.

The app works with no environment variables: explanations come from templates. For the optional AI summary, put one of these in `croppilot-web/.env.local` (that file is gitignored; do not commit it):

- `GROQ_API_KEY` (optional `GROQ_MODEL`)
- or `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (optional `CLOUDFLARE_MODEL`)

If the key is missing or the provider fails, the page falls back to the template.

## Tests

- Python, from `croppilot/` with the virtualenv active: `pytest -q` (30 tests on this tree). `python validate.py` repeats the data checks and prints a backtest table.
- Web, from `croppilot-web/`: `npm test` (vitest; 131 tests on this tree). The suite covers the rules, profit maths, the summary number guard, and parity with the Python engine.

## Data sources

Nothing in the tables is synthetic except the unused demo under `croppilot/demo_synthetic/`. Details, mirrors, and caveats are in [`croppilot/data/sources/SOURCES.md`](croppilot/data/sources/SOURCES.md).

| Data | Source | Years |
|---|---|---|
| Area, production, yield (APY) | DES, via India Data Portal. Licence: **ODC-By**. Attribute "DES, MoA&FW via India Data Portal". | 1997–2024 |
| Mandi prices | AGMARKNET (public dumps of the government series) | 2002–2024 |
| Minimum Support Price | RBI, CACP, DES, and PIB tables | through 2025–26 |
| Costs | CACP A2+FL cost per quintal, all-India | the cost year bundled in `data/costs.csv` |
| Weather | NASA POWER (rain and temperature). IMD gridded rainfall was compared and was slightly worse, so it is not the series the model uses. | 1997–2024 |

Coverage is 30 districts on pre-2018 boundaries, 240 taluks, and 14 crops. A district–season–crop is offered only when it has at least 10 yield seasons and at least 1,000 ha average area.

## Holdout validation

Hyper-parameters, the rain source, each crop's yield method, and the error bands were chosen inside the training years. The holdout years were scored once.

| | Train | Test (held out) |
|---|---|---|
| Yield | 1997–2016 | 2017–2024 |
| Price | 2002–2019 | 2020–2024 |

On the price holdout, the price model is about **30% better than MSP** (mean absolute error about Rs 520 per quintal, versus about Rs 747 for MSP alone). The live app does not have this season's sowing-time mandi price, so the recommendation still uses the MSP-based method that won in the training years.

The models shipped in the app are **refit on all years** with those same settings: yield on 1997–2024 and price on 2002–2024. The holdout models are kept beside them (`yield_model_holdout_1997_2016.joblib`, `price_model_holdout_2002_2019.joblib`) as the published check. For yield, each crop uses the **best method** for that crop and season (the model, the district average, or last season), chosen on the training years. Numbers are in `croppilot/models/metrics.json` under `holdout` and `live_model`.

## Licence

Code is [MIT](LICENSE), copyright Abhishek Govindarajulu.

The datasets keep their own terms. APY via India Data Portal is ODC-By. The AGMARKNET Hugging Face dump is tagged MIT and the underlying prices are government open data. MSP, CACP, NASA POWER, and the other sources are summarized in [DATA.md](DATA.md).
