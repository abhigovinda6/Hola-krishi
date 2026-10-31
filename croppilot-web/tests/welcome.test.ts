import { describe, it, expect } from "vitest";
import { savedFarm, welcomeTarget, farmSummary, EMPTY } from "../lib/farm";
import { t } from "../lib/i18n";
const F = { ...EMPTY, d: "BIJAPUR", t: "Vijayapura", s: "Rabi", a: "4", ph: "8.1", soil: "deep_black", irr: "none", prev: "jowar" };
describe("welcome back", () => {
  it("first-time visitor: nothing saved", () => { expect(savedFarm(null)).toBeNull(); expect(savedFarm("")).toBeNull(); });
  it("incomplete or corrupt saved farm is ignored", () => { expect(savedFarm(JSON.stringify({ d: "BIJAPUR" }))).toBeNull(); expect(savedFarm("{bad")).toBeNull(); });
  it("complete saved farm is a returning visitor", () => { expect(savedFarm(JSON.stringify(F))?.t).toBe("Vijayapura"); });
  it("results target: always the compare view (v3)", () => {
    expect(welcomeTarget(F)).toBe("/results"); expect(welcomeTarget({ ...F, sel: "-" })).toBe("/results"); expect(welcomeTarget({ ...F, sel: "wheat" })).toBe("/results");
  });
  it("summary fields", () => { expect(farmSummary(F)).toEqual({ place: "Vijayapura, BIJAPUR", season: "Rabi", acres: "4", ph: "8.1" }); });
  it("Kannada strings exist", () => { for (const k of ["wb_title", "wb_results", "wb_edit", "wb_new", "wb_confirm"] as const) expect(t(k, "kn")).toMatch(/[\u0C80-\u0CFF]/); });
});
