// Server-side ONNX inference with onnxruntime-web (WebAssembly; no native binaries, fits Vercel's function size limit).
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Predict } from "./engine";

let session: Promise<import("onnxruntime-web").InferenceSession> | null = null;
let ortMod: typeof import("onnxruntime-web") | null = null;

async function getSession() {
  if (!session) {
    session = (async () => {
      const ort = await import("onnxruntime-web");
      ortMod = ort;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = path.join(process.cwd(), "node_modules/onnxruntime-web/dist") + path.sep;
      const bytes = await readFile(path.join(process.cwd(), "models/yield_model.onnx"));
      return ort.InferenceSession.create(new Uint8Array(bytes));
    })();
  }
  return session;
}

/** Predicts the log(yield / historical mean) ratio from the 8 yield features (same order as Python YIELD_FEATURES). */
export const onnxPredict: Predict = async (x) => {
  const s = await getSession();
  const t = new ortMod!.Tensor("float32", Float32Array.from(x), [1, x.length]);
  const out = await s.run({ [s.inputNames[0]]: t });
  return Number((out[s.outputNames[0]].data as Float32Array)[0]);
};

// Start loading the model as soon as the function boots (overlaps with request parsing on a cold start).
if (process.env.NEXT_PHASE !== "phase-production-build") getSession().catch(() => { session = null; });
