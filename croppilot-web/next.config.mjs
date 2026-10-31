import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: root,
  webpack: (config) => { config.resolve.alias["@"] = root; return config; },
  // onnxruntime-web runs the model server-side (WebAssembly, no native binaries -> small Vercel function).
  serverExternalPackages: ["onnxruntime-web"],
  // v3: the crop-picking step was removed; old links go to the compare view (query string is kept).
  async redirects() { return [{ source: "/crops", destination: "/results", permanent: false }]; },
  outputFileTracingIncludes: {
    "/api/summary": [
      "./models/yield_model.onnx",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    ],
    "/api/recommend": [
      "./models/yield_model.onnx",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
      "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    ],
  },
};
export default nextConfig;
