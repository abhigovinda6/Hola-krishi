// PARITY: the TypeScript engine (+ ONNX model) must reproduce the Python engine's outputs on 64 profiles.
import { describe, it, expect } from "vitest";
import fixtures from "./parity_fixtures.json";
import { evaluate } from "@/lib/engine";
import { onnxPredict } from "@/lib/onnx";

const REL = 1e-3; // float32 ONNX vs float64 sklearn -> allow 0.1% relative difference
const close = (a: number, b: number) => Math.abs(a - b) <= REL * Math.max(1, Math.abs(b));

describe("TS vs Python parity", () => {
  it.each((fixtures as any[]).map((f) => [f.input.field_id, f]))("%s", async (_id, fx: any) => {
    const { results, ctx } = await evaluate(fx.input, onnxPredict);
    expect(ctx.district).toBe(fx.district);
    expect(results.map((r) => r.crop)).toEqual(fx.results.map((r: any) => r.crop));
    results.forEach((r, i) => {
      const p = fx.results[i];
      expect(r.feasible).toBe(p.feasible); expect(r.rank ?? null).toBe(p.rank);
      if (p.feasible) {
        expect(r.yield_method).toBe(p.yield_method);
        for (const k of ["bad", "typical", "good"]) expect(close(r.yields![k as "bad"], p.yields[k])).toBe(true);
        expect(close(r.prices!.base, p.price_base)).toBe(true);
        expect(close(r.net_typical!, p.net_typical)).toBe(true);
        expect(close(r.net_worst!, p.net_worst)).toBe(true);
      }
    });
  });
});
