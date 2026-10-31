import { describe, it, expect } from "vitest";
import { summaryCrops } from "@/lib/selection";
import { farmToPayload, profileKey, EMPTY, type Farm } from "@/lib/farm";
import { evaluate } from "@/lib/engine";
import { onnxPredict } from "@/lib/onnx";

const F: Farm = { ...EMPTY, d: "BIJAPUR", t: "Vijayapura", a: "4", s: "Rabi", ph: "8.1", soil: "deep_black", irr: "none", prev: "jowar" };

describe("AI summary uses the same (effective) selection as the page", () => {
  it("v3: no selection is ever sent, so the summary covers the top-ranked crops shown on /results", () => {
    expect(farmToPayload({ ...F, sel: "-" }).selected).toBeUndefined();
    expect(farmToPayload({ ...F, sel: "wheat", selk: profileKey(F) }).selected).toBeUndefined();
  });
  it("server: no selection -> top 3 feasible crops shown on /results; infeasible ids ignored", async () => {
    const { results } = await evaluate(farmToPayload({ ...F, sel: "-" }), onnxPredict);
    const top = results.filter((r) => r.feasible).slice(0, 3).map((r) => r.crop);
    expect(summaryCrops(results, undefined).map((r) => r.crop)).toEqual(top);
    expect(top.length).toBeGreaterThan(0);
    expect(summaryCrops(results, ["jowar", top[1]]).map((r) => r.crop)).toEqual([top[1]]); // jowar blocked by rotation
    expect(summaryCrops(results, [])).toEqual([]);
  });
});
