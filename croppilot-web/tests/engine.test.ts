// Mirrors tests/test_real.py (rules, validation, profit math, ranking) on the bundled real data.
import { describe, it, expect } from "vitest";
import { evaluate, farmgate, feasibility, priceEstimate } from "@/lib/engine";
import { validateField } from "@/lib/schema";
import { onnxPredict } from "@/lib/onnx";
import { template } from "@/lib/explain";
import { DATA } from "@/lib/data";

const V1 = { taluk: "Vijayapura", season: "Rabi", area_acres: 4, soil_ph: 8.1, soil_type: "deep_black", irrigation: "none", previous_crop: "jowar" };

describe("input validation (zod)", () => {
  it("accepts a valid profile, case-insensitive taluk, fallow -> null", () => {
    const f = validateField({ ...V1, taluk: "vijayapura", previous_crop: "Fallow" });
    expect(f.taluk).toBe("Vijayapura"); expect(f.previous_crop).toBeNull();
  });
  it.each([["soil_ph", 12], ["soil_ph", 2], ["area_acres", 0], ["area_acres", 500], ["season", "Summer"], ["soil_type", "sand"], ["irrigation", "drip"], ["taluk", "Atlantis"], ["previous_crop", "banana"]])(
    "rejects bad %s=%s", (k, v) => { expect(() => validateField({ ...V1, [k]: v })).toThrow(/Invalid field profile/); });
});

describe("data bundle", () => {
  it("has 240 taluks, 14 crops and 298 included combos", () => {
    expect(DATA.taluks.length).toBe(240); expect(Object.keys(DATA.crops).length).toBe(14);
    expect(DATA.coverage.filter((c) => c.included).length).toBe(298);
  });
  it("every included combo has hist mean yield and an MSP for this year", () => {
    for (const c of DATA.coverage.filter((x) => x.included)) {
      expect(DATA.meta.hist_mean_yield[`${c.district}|${c.season}|${c.crop}`]).toBeGreaterThan(0);
      expect(DATA.msp[DATA.crops[c.crop].msp_key[c.season]!]).toBeGreaterThan(0);
    }
  });
});

describe("rules", () => {
  it("V1: pH 8.1 rules out maize & groundnut; rotation rules out jowar", () => {
    const { feas } = feasibility(validateField(V1), "BIJAPUR", "Rabi");
    expect(feas.maize.feasible).toBe(false); expect(feas.groundnut.feasible).toBe(false);
    expect(feas.jowar.reasons.join()).toMatch(/rotation/);
    expect(feas.wheat.feasible).toBe(true);
  });
  it("rainfed red soil in Rabi cannot grow wheat (needs protective irrigation)", () => {
    const { feas } = feasibility(validateField({ ...V1, soil_type: "red", previous_crop: "fallow" }), "BIJAPUR", "Rabi");
    expect(feas.wheat.feasible).toBe(false);
  });
});

describe("profit math & ranking", () => {
  it("farm-gate price = 95% of market minus Rs 50/q", () => { expect(farmgate(2000)).toBeCloseTo(1850); });
  it("price scenarios ordered low <= base <= high", () => {
    const { ps } = priceEstimate("wheat", "Rabi"); expect(ps.low).toBeLessThanOrEqual(ps.base); expect(ps.base).toBeLessThanOrEqual(ps.high);
  });
  it("V1 ranks sunflower first; grid ordered; ranks contiguous", async () => {
    const { results, ctx } = await evaluate(V1, onnxPredict);
    const ok = results.filter((r) => r.feasible);
    expect(ok[0].crop).toBe("sunflower"); expect(ctx.district).toBe("BIJAPUR");
    ok.forEach((r, i) => { expect(r.rank).toBe(i + 1); expect(r.net_worst!).toBeLessThanOrEqual(r.net_typical!); expect(r.net_typical!).toBeLessThanOrEqual(r.net_best!);
      expect(r.yields!.bad).toBeLessThanOrEqual(r.yields!.good); });
    expect(template(ok[0], ctx)).toMatch(/^#1 Sunflower: typical net Rs/);
  });
});
