import { describe, it, expect } from "vitest";
import { evaluate } from "@/lib/engine";
import { onnxPredict } from "@/lib/onnx";
import { summaryCrops } from "@/lib/selection";
import { farmToPayload, EMPTY, type Farm } from "@/lib/farm";
import { checkSummary, factLines, cropFacts, numbersIn } from "@/lib/summary_guard";
import { buildPrompt, llmSummary } from "@/lib/explain";

const F: Farm = { ...EMPTY, d: "BIJAPUR", t: "Vijayapura", a: "4", s: "Rabi", ph: "8.1", soil: "deep_black", irr: "none", prev: "jowar" };
const load = async () => { const { results, ctx } = await evaluate(farmToPayload(F), onnxPredict); return { rs: summaryCrops(results, undefined), ctx }; };

describe("AI summary grounding", () => {
  it("prompt carries only labelled card figures", async () => {
    const { rs, ctx } = await load(); const f = cropFacts(rs[0]);
    const p = buildPrompt(rs, ctx, "en");
    expect(p).toContain(`typical net profit Rs ${f.typical} per acre`);
    expect(p).toContain(`typical yield ${f.yield} q/acre`);
    expect(p).toContain(`yield method: ${f.method}`);
    expect(p).not.toMatch(/bad\/typical\/good|\d+\.\d\/\d+\.\d/); // no bad/good yield values
    expect(factLines(rs).split("\n")).toHaveLength(rs.length);
  });
  it("accepts a summary that quotes exactly the card figures", async () => {
    const { rs } = await load(); const [a, b] = rs.map(cropFacts);
    const t = `${a.label} looks best: typical net profit Rs ${a.typical} per acre (worst Rs ${a.worst}, best Rs ${a.best}). ` +
      `Its typical yield is ${a.yield} q/acre using the ${a.method} method, at a base price of Rs ${a.price} per quintal. ${b.label} gives Rs ${b.typical}. Rain and prices are uncertain.`;
    expect(checkSummary(t, rs)).toBeNull();
  });
  it("rejects a wrong yield (good-year 5.7 quoted as typical) and wrong prices", async () => {
    const { rs } = await load(); const a = cropFacts(rs[0]);
    expect(checkSummary(`${a.label} typical yield is ${(rs[0].yields!.good).toFixed(1)} q/acre.`, rs)).toMatch(/number/);
    expect(checkSummary(`Wheat price can reach Rs 4,532.`, rs)).toMatch(/4532/);
    expect(checkSummary(`Profit is up 12% on wheat.`, rs)).toMatch(/number/);
  });
  it("rejects a method word that is not the crop's method", async () => {
    const { rs } = await load(); const sun = rs.find((r) => r.crop === "sunflower")!;
    expect(sun.yield_method).toBe("base_last_season");
    expect(checkSummary(`Sunflower yield is based on the district average.`, rs)).toMatch(/method/);
    expect(checkSummary(`Sunflower yield uses the last season.`, rs)).toBeNull();
    const gram = rs.find((r) => r.crop === "gram")!;
    expect(checkSummary(`${gram.label.split(" (")[0]} uses the ML model.`, rs)).toMatch(/method/);
  });
  it("llmSummary falls back (null) when the check fails, passes good text through", async () => {
    const { rs, ctx } = await load(); const a = cropFacts(rs[0]);
    const bad = async () => ({ text: "Sunflower yields 5.7 q/acre.", provider: "x", model: "y" });
    const good = async () => ({ text: `${a.label} earns Rs ${a.typical} per acre.`, provider: "x", model: "y" });
    expect(await llmSummary(rs, ctx, "en", undefined, bad)).toBeNull();
    expect((await llmSummary(rs, ctx, "en", undefined, good))?.text).toContain(a.typical);
  });
  it("number extraction handles commas, minus and decimals", () => {
    expect(numbersIn("Rs -260 to Rs 32,477, yield 3.2 and ₹1,645.")).toEqual([-260, 32477, 3.2, 1645]);
    expect(numbersIn("loss of Rs \u2212260")).toEqual([-260]);
  });
});
