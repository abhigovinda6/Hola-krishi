import { describe, it, expect } from "vitest";
import { evaluate } from "@/lib/engine";
import { onnxPredict } from "@/lib/onnx";
import { buildAlerts } from "@/lib/alerts";
import { farmToPayload, welcomeTarget, EMPTY, type Farm } from "@/lib/farm";
import { buildTiles, barPos, TOP_N } from "@/lib/tiles";
import { DATA } from "@/lib/data";

const F: Farm = { ...EMPTY, d: "BIJAPUR", t: "Vijayapura", a: "4", s: "Rabi", ph: "8.1", soil: "deep_black", irr: "none", prev: "jowar" };
const load = async () => { const { results, ctx } = await evaluate(farmToPayload(F), onnxPredict); return { results, alerts: buildAlerts(results, ctx) }; };

describe("v3 compare view (no crop-picking step)", () => {
  it("farm goes straight to compare; payload never carries a selection", () => {
    expect(welcomeTarget(F)).toBe("/results"); expect(welcomeTarget({ ...F, sel: "wheat" })).toBe("/results");
    expect(farmToPayload({ ...F, sel: "wheat", selk: "x" }).selected).toBeUndefined();
  });
  it("top 3 tiles = top 3 ranked feasible crops, figures exactly from the engine", async () => {
    const { results, alerts } = await load(); const { tiles } = buildTiles(results, alerts, "en");
    const feas = results.filter((r) => r.feasible);
    expect(tiles.map((x) => x.crop)).toEqual(feas.slice(0, TOP_N).map((r) => r.crop));
    tiles.forEach((x, i) => { const r = feas[i];
      expect([x.rank, x.medal]).toEqual([i + 1, ["🥇", "🥈", "🥉"][i]]);
      expect([x.typical, x.worst, x.best, x.score, x.price]).toEqual([r.net_typical, r.net_worst, r.net_best, r.score, r.prices!.base]);
      expect(x.yields).toEqual(r.yields);
      expect(x.why.typicalPart + x.why.worstPart + x.why.bonus).toBeCloseTo(r.score!, 0);
      expect(x.why.bonus).toBe(DATA.crops[r.crop].legume ? 1500 : 0);
    });
    expect(tiles[0].crop).toBe("sunflower");
    expect(tiles[0].note).toMatch(/last reported season/); expect(tiles[0].priceSource).toBe("MSP 2025-26");
    expect(tiles[0].chips.some((c) => /stored soil moisture/.test(c.text))).toBe(true);
    expect(tiles[0].chips.some((c) => /lose money/.test(c.text))).toBe(tiles[0].worst < 0);
  });
  it("everything else is listed: lower-ranked with score, excluded with reasons", async () => {
    const { results, alerts } = await load(); const { tiles, others, excluded } = buildTiles(results, alerts, "en");
    expect(tiles.length + others.length + excluded.length).toBe(results.length);
    expect(others.map((o) => o.crop)).toContain("safflower");
    const jowar = excluded.find((e) => e.crop === "jowar")!; expect(jowar.reasons[0].kind).toBe("rotation");
    expect(excluded.every((e) => e.reasons.length > 0)).toBe(true);
  });
  it("Kannada tiles and no invented metrics", async () => {
    const { results, alerts } = await load(); const { tiles } = buildTiles(results, alerts, "kn");
    expect(tiles[0].name).toBe(results.find((r) => r.crop === "sunflower")!.label_kn);
    expect(tiles[0].note).toMatch(/[\u0C80-\u0CFF]/);
    expect(Object.keys(tiles[0])).not.toEqual(expect.arrayContaining(["poorYieldChance"]));
    expect(JSON.stringify(tiles)).not.toMatch(/soil health|nutrient/i);
  });
  it("yield bar position", () => { expect(barPos(3.2, 1.8, 5.7)).toBeCloseTo(35.9, 1); expect(barPos(9, 1, 2)).toBe(100); expect(barPos(1, 1, 1)).toBe(50); });
});
