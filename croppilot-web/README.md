# CropPilot Web (Next.js + ONNX)

**Live demo:** https://croppilot-rabi.vercel.app

This is the TypeScript version of the Python CropPilot, and the app behind that live demo. Pushing this repository does not change the live Vercel deployment. It uses the same real data and the same trained model.
- **Python is used offline only.** `croppilot/export_web.py` converts the trained yield model to ONNX (`models/yield_model.onnx`) and writes `data/engine.json`. It also copies the real CSVs into `data/csv/` and writes the parity test fixtures.
- **Server side.** `app/api/recommend/route.ts` checks the input with zod (`lib/schema.ts`), applies the rules and the profit and ranking maths (`lib/engine.ts`), and runs the model with onnxruntime-web (WebAssembly, `lib/onnx.ts`). onnxruntime-node was dropped because it is 548 MB with its CUDA libraries, far over Vercel's limit.
- **Explanations** come from templates (`lib/explain.ts`). Setting `GROQ_API_KEY`, or `CLOUDFLARE_ACCOUNT_ID` plus `CLOUDFLARE_API_TOKEN`, adds an optional AI summary.

```bash
npm install
npm test          # vitest: rules, validation, profit maths, summary guard, plus 64-profile Python parity (0.1% tolerance)
npm run build && npm start   # http://localhost:3000
```
API: `POST /api/recommend` with body `{"taluk":"Vijayapura","season":"Rabi","area_acres":4,"soil_ph":8.1,"soil_type":"deep_black","irrigation":"none","previous_crop":"jowar"}`.

Updating data: in the Python project run `build_data.py`, then `train.py`, then `export_web.py`. Then run `npm test` here and redeploy. See DEPLOY.md.
