# Contributing to Hola Krishi

Thanks for helping. Hola Krishi (Polaris CropPilot) is a crop season planner for Karnataka. The live demo is https://croppilot-rabi.vercel.app. Pushing to this repository does not change that deployment.

## Setup

Python engine and tests (from `croppilot/`):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```

Web app and tests (from `croppilot-web/`, Node 20+):

```bash
npm install
npm test
npm run dev
```

The cleaned CSVs and trained models are already in the repo. You do not need to retrain to run the app or the tests.

## Good first issues

Small, self-contained changes are welcome. Look for the `good first issue` label, or start here:

- **Copy.** English and Kannada strings are in `croppilot-web/lib/i18n.ts`. Crop names in Kannada come from `label_kn` in `croppilot/data/crops.csv`.
- **Docs.** Tighten a sentence in `README.md`, `croppilot/GUIDE.md`, or `croppilot/data/sources/SOURCES.md` when it disagrees with `croppilot/models/metrics.json`.
- **Tests.** Add a vitest case next to the ones in `croppilot-web/tests/`, or a pytest case in `croppilot/tests/test_real.py`, for a rule that is already implemented (soil pH, irrigation, rotation, or the summary number guard).
- **Data notes.** If a source caveat is missing, add it to `SOURCES.md` and `DATA.md`. Do not replace a number without citing the public source.

Please open an issue before a large change to the ranking formula, the model, or the bundled data.

## Pull requests

1. Branch from `master`.
2. Run `pytest -q` if you touched `croppilot/`, and `npm test` if you touched `croppilot-web/`.
3. Do not commit `.env` files, API keys, `node_modules`, `.next`, or virtualenvs.
4. Describe what you checked. Estimates shown to farmers should stay traceable to the public data and the code that computes them.

## Secrets

Never put a Groq key, Cloudflare token, or any other credential in the repo. The web app runs without them and uses template explanations. Optional AI summaries read `GROQ_API_KEY` or `CLOUDFLARE_ACCOUNT_ID` plus `CLOUDFLARE_API_TOKEN` from the environment only.
