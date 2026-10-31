import { describe, it, expect } from "vitest";
import { evaluate } from "@/lib/engine";
import { onnxPredict } from "@/lib/onnx";
import { summarizeBlockers, phAdvice } from "@/lib/blockers";

const base = { taluk: "Vijayapura", season: "Kharif", area_acres: 4, soil_type: "deep_black", irrigation: "none", previous_crop: "fallow" };

describe("blocker banner logic", () => {
  it("BIJAPUR Kharif pH 9.2: no feasible crop, alkaline pH is the top grouped reason with counts and safe-max range", async () => {
    const { results } = await evaluate({ ...base, soil_ph: 9.2 }, onnxPredict);
    expect(results.filter((r) => r.feasible).length).toBe(0);
    const g = summarizeBlockers(results, 9.2);
    expect(g[0].kind).toBe("ph_high"); expect(g[0].count).toBeGreaterThan(1);
    expect(g[0].detail).toMatch(/^Soil pH 9.2 is too alkaline for \d+ crops \(safe max [\d.–]+\)$/);
    expect(g.reduce((s, x) => s + (x.kind === "data" ? x.count : 0), 0)).toBeGreaterThanOrEqual(0);
  });
  it("very low pH groups as acidic with safe min", async () => {
    const { results } = await evaluate({ ...base, soil_ph: 4.2 }, onnxPredict);
    const g = summarizeBlockers(results, 4.2);
    expect(g.find((x) => x.kind === "ph_low")!.detail).toMatch(/too acidic .* \(safe min/);
  });
  it("feasible crops are never listed as blocked", async () => {
    const { results } = await evaluate({ ...base, soil_ph: 7.5 }, onnxPredict);
    const blocked = summarizeBlockers(results, 7.5).flatMap((g) => g.crops);
    for (const r of results.filter((x) => x.feasible)) expect(blocked).not.toContain(r.label);
  });
  it("pH advice thresholds", () => {
    expect(phAdvice(9.2)).toBe("sodic"); expect(phAdvice(8.5)).toBeNull(); expect(phAdvice(5.0)).toBe("acid"); expect(phAdvice(6.5)).toBeNull();
  });
});
