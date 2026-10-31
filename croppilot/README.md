# Polaris CropPilot: real-data crop recommender for Karnataka (Kharif & Rabi)

**Live demo:** https://croppilot-rabi.vercel.app (the Next.js app in `../croppilot-web`).

The cleaned CSVs and trained models in this folder are already built. Install the requirements and run the tests, CLI, or Streamlit app below. `build_data.py` and `train.py` need raw downloads that are not in this repository (`data/sources/raw` and `data/sources/ext`); use them only when you are refreshing data. See `data/sources/SOURCES.md` and the repository [README](../README.md).

You enter your **taluk, season, soil pH, soil type, irrigation and previous crop**. CropPilot then gives you:
- the crops that are agronomically feasible for that field, ranked;
- for each crop, a **bad / typical / good-year profit per acre**, a plain-language reason, and the next action (the Crop Nutrition Plan).

Everything runs locally and is open source: pandas, scikit-learn, Streamlit, and optionally Ollama.

> **Honesty notes**
> - All data is real and public (see `data/sources/SOURCES.md`).
> - Yields are **district averages** (DES APY via India Data Portal, 1997–2024). Your own field will differ.
> - The app does not fetch this season's mandi price, so today's prices are estimated from **MSP** (or from MSP × the historical harvest-price/MSP ratio). The price tables run from 2002 through 2024.
> - Costs are **CACP all-India** estimates.
> - These are estimates, not guarantees. Check with your RSK or KVK.

## Quick start
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -q                # data checks, holdout split, sample fields
python validate.py       # data checks, backtest table, sanity profiles, input checks
python cli.py --all      # 4 sample fields
python cli.py --coverage BIJAPUR
streamlit run app.py     # local UI at http://localhost:8501
```

Refreshing data (only after the raw files in `data/sources/SOURCES.md` are present):

```bash
python build_data.py     # raw + incoming CSVs -> data/*.csv, then validated
python train.py          # fixed holdout: train yield 1997-2016 / price 2002-2019, choices by inner walk-forward, score holdout once
python refit_compare.py  # live all-years model vs the holdout model
python export_web.py     # writes ONNX, engine.json, and CSVs into ../croppilot-web
```

## Coverage
- 30 districts (pre-2018 boundaries) and 240 taluks.
- 14 crops: paddy, maize, jowar, ragi, bajra, tur, moong, urad, groundnut, soybean, sunflower, gram, wheat, safflower.
- **285 of 469 district × season × crop combinations** pass the threshold (≥10 yield seasons and ≥1,000 ha mean area). `data/coverage.csv` lists every combination and gives the reason for each exclusion.

## Layout
| Path | What it does |
|---|---|
| `croppilot/config.py` | Paths, thresholds, and crop config (from `data/crops.csv`) |
| `croppilot/io.py` | Converters for official APY and AGMARKNET exports, plus CSV schema validation |
| `croppilot/features.py` | Season weather windows, yield and price feature tables |
| `croppilot/modeling.py` | Baselines and metrics |
| `croppilot/holdout.py` | Fixed time split, inner walk-forward tuning, leakage-free features |
| `croppilot/engine.py` | Rules, then yield, price, profit scenarios and ranking |
| `croppilot/explain.py` | Template explanation, plus an optional local LLM (Ollama) |
| `croppilot/schema.py` | Pydantic input validation |
| `data/SCHEMAS.md` | Every CSV column and unit, and **how to add new data** |
| `demo_synthetic/` | The old synthetic demo (optional, standalone, not used) |

See **GUIDE.md** for a beginner step-by-step walkthrough.
