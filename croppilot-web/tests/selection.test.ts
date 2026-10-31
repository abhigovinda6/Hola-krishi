import { describe, it, expect } from "vitest";
import { effectiveSelection, profileKey } from "@/lib/selection";
import { formatReason, formatReasons } from "@/lib/reasons";
import { EMPTY, type Farm } from "@/lib/farm";
import { summarizeBlockers } from "@/lib/blockers";

const F: Farm = { ...EMPTY, d: "BIJAPUR", t: "Vijayapura", a: "2", s: "Rabi", ph: "6", soil: "red", irr: "none", prev: "maize" };
const feas = ["gram", "jowar", "safflower"], rec = ["gram", "jowar", "safflower"];

describe("crop selection sync", () => {
  it("no selection yet -> top 3 feasible", () => expect(effectiveSelection(F, feas, rec)).toEqual(rec));
  it("stale selection from another farm/season (incl. infeasible wheat) is reset to the top 3", () => {
    const stale = { ...F, sel: "gram,jowar,wheat", selk: profileKey({ ...F, s: "Kharif" }) };
    expect(effectiveSelection(stale, feas, rec)).toEqual(rec);
  });
  it("selection without a key (pre-fix saved state) is treated as stale", () =>
    expect(effectiveSelection({ ...F, sel: "gram,jowar,wheat" }, feas, rec)).toEqual(rec));
  it("count == ticked: infeasible crops never count, even for the same farm", () => {
    const s = effectiveSelection({ ...F, sel: "gram,wheat", selk: profileKey(F) }, feas, rec);
    expect(s).toEqual(["gram"]); expect(s.every((c) => feas.includes(c))).toBe(true);
  });
  it("user choice for the same farm is kept, and explicit none stays none", () => {
    expect(effectiveSelection({ ...F, sel: "safflower", selk: profileKey(F) }, feas, rec)).toEqual(["safflower"]);
    expect(effectiveSelection({ ...F, sel: "-", selk: profileKey(F) }, feas, rec)).toEqual([]);
  });
  it("changing an input invalidates the key", () => expect(profileKey(F)).not.toBe(profileKey({ ...F, ph: "7" })));
});

describe("plain-language reasons", () => {
  it("full irrigation, no rainfed soil", () => expect(formatReason("needs 'full' irrigation here (rainfed only on no soils)").text)
    .toBe("Needs full irrigation. It can't be grown rainfed on this soil here."));
  it("protective irrigation, soil key mapped to a label", () => expect(formatReason("needs 'protective' irrigation here (rainfed only on deep_black)").text)
    .toBe("Needs at least protective irrigation (rainfed only on deep black soil)."));
  it("pH below range", () => { const r = formatReason("soil pH 6 outside 6.5-8.5"); expect(r.kind).toBe("ph_low"); expect(r.text).toBe("Soil pH 6 is below this crop's range (6.5–8.5)."); });
  it("pH above range", () => expect(formatReason("soil pH 9.2 outside 5.5-7.8").text).toBe("Soil pH 9.2 is above this crop's range (5.5–7.8)."));
  it("rotation is its own chip", () => {
    const rs = formatReasons(["needs 'full' irrigation here (rainfed only on no soils)", "rotation: maize was the previous crop (pest/disease build-up)"]);
    expect(rs.map((r) => r.kind)).toEqual(["water", "rotation"]);
    expect(rs[1].text).toBe("Grown last season. Repeating it builds up pests and disease.");
  });
  it("Kharif rain variant and Kannada have no raw keys", () => {
    const raw = "needs 'full' irrigation here (rainfed only on deep_black, medium_black with >= 600 mm Jun-Sep; normal here 520 mm)";
    for (const l of ["en", "kn"] as const) { const t = formatReason(raw, l).text; expect(t).not.toMatch(/_|'full'|deep_black/); }
    expect(formatReason("soil pH 6 outside 6.5-8.5", "kn").text).toMatch(/ಕಡಿಮೆ/);
  });
});

describe("empty banner grouping still works", () => {
  it("groups pH / water / rotation from engine reasons", () => {
    const g = summarizeBlockers([
      { crop: "maize", label: "Maize", feasible: false, reasons: ["needs 'full' irrigation here (rainfed only on no soils)", "rotation: maize was the previous crop (pest/disease build-up)"] },
      { crop: "sunflower", label: "Sunflower", feasible: false, reasons: ["soil pH 6 outside 6.5-8.5"] },
      { crop: "wheat", label: "Wheat", feasible: false, reasons: ["needs 'protective' irrigation here (rainfed only on deep_black)"] },
    ], 6);
    const k = Object.fromEntries(g.map((x) => [x.kind, x.count]));
    expect(k).toMatchObject({ water: 2, rotation: 1, ph_low: 1 });
  });
});
