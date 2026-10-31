# Deploying CropPilot Web to Vercel (beginner steps)

The public live demo is already at https://croppilot-rabi.vercel.app. These steps are for a **separate** Vercel project. Pushing to `abhigovinda6/Hola-krishi` does not change that deployment.

## 1. Check that it works locally
```bash
npm install
npm test        # vitest; a fresh clone of this tree reports 131 passed
npm run build   # should end with the route table: "/" and "/api/recommend"
npm start       # open http://localhost:3000, click a sample plot, and check that results appear
```

## 2. Put it on GitHub
1. Create a new **empty** repository at https://github.com/new, for example `croppilot-web`.
2. In this folder, run:
```bash
git init && git add . && git commit -m "CropPilot web"
git branch -M main
git remote add origin https://github.com/<you>/croppilot-web.git
git push -u origin main
```
`.gitignore` already excludes `node_modules`, `.next` and any `.env` files, so you won't push secrets or build output.

## 3. Import it into Vercel
1. Go to https://vercel.com/new and choose **Import Git Repository**, then pick your repo.
2. Framework preset: **Next.js**, which is detected automatically. Leave the build command (`next build`) and the output settings as they are.
3. Click **Deploy**. After about a minute you get a URL like `https://croppilot-web.vercel.app`.
4. Every later `git push` to `main` redeploys automatically.

Alternative without GitHub: `npm i -g vercel`, then `vercel` (preview) and `vercel --prod` (production).

## 4. Environment variables (optional)
The app works with **no** variables: explanations come from templates. To add an AI summary, go to Vercel → Project → Settings → Environment Variables and set **one** of these:
| Variable | Meaning |
|---|---|
| `GROQ_API_KEY` (optional `GROQ_MODEL`, default `llama-3.1-8b-instant`) | Groq's free tier at https://console.groq.com |
| `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (optional `CLOUDFLARE_MODEL`) | Cloudflare Workers AI |
Then redeploy. If a key is wrong, or the provider is down, the app quietly falls back to templates.

## 5. Troubleshooting
- **The function is too large:** make sure `onnxruntime-node` is not in package.json. This app uses `onnxruntime-web`.
- **The model can't be found at runtime:** `next.config.mjs` → `outputFileTracingIncludes` must list `models/yield_model.onnx` and the onnxruntime `.wasm` and `.mjs` files.
- **The build fails with "TypeScript 7 is not supported":** keep `typescript@5`, which is already pinned in package.json.
