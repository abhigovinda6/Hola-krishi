import { describe, it, expect } from "vitest";
import { buildAlerts, sowingAlert, rainDeficitShare } from "@/lib/alerts";
import { buildPrompt, template } from "@/lib/explain";
import { evaluate } from "@/lib/engine";
import { onnxPredict } from "@/lib/onnx";
import { farmToQs, qsToFarm, farmToPayload, selList, EMPTY } from "@/lib/farm";

const D1 = { taluk: "Dharwad", season: "Kharif", area_acres: 3, soil_ph: 6.8, soil_type: "red", irrigation: "none", previous_crop: "maize" };

describe("sowing window alerts", () => {
  it("Kharif in May is upcoming; in July it's open/closing; Rabi after Nov rolls to next year", () => {
    expect(sowingAlert("Kharif", new Date(Date.UTC(2026, 4, 20))).title).toMatch(/opens in 12 days/);
    expect(sowingAlert("Kharif", new Date(Date.UTC(2026, 6, 25))).title).toMatch(/closes in 6 days/);
    expect(sowingAlert("Rabi", new Date(Date.UTC(2026, 11, 5))).id).toContain("2027");
    expect(sowingAlert("Rabi", new Date(Date.UTC(2026, 9, 22))).title).toMatch(/open/);
  });
});

describe("rule/data alerts", () => {
  it("rain share is a real fraction from NASA POWER history", () => {
    const r = rainDeficitShare("DHARWAD", "Kharif", 600); expect(r.n).toBeGreaterThan(20); expect(r.share).toBeGreaterThanOrEqual(0); expect(r.share).toBeLessThanOrEqual(1);
  });
  it("D1 produces sowing, MSP and CNP alerts; soil-test only when pH unknown; ids unique", async () => {
    const { results, ctx } = await evaluate(D1, onnxPredict);
    const a = buildAlerts(results, ctx, { today: new Date(Date.UTC(2026, 9, 22)), phKnown: true });
    const kinds = a.map((x) => x.kind);
    expect(kinds).toContain("sowing"); expect(kinds).toContain("msp"); expect(kinds).toContain("cnp"); expect(kinds).not.toContain("soil");
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    expect(buildAlerts(results, ctx, { phKnown: false }).some((x) => x.kind === "soil")).toBe(true);
    const msp = a.find((x) => x.kind === "msp")!; expect(msp.title).toMatch(/₹[\d,]+\/q/);
  });
  it("respects the user's crop selection", async () => {
    const { results, ctx } = await evaluate(D1, onnxPredict);
    const a = buildAlerts(results, ctx, { selected: ["groundnut"] });
    expect(a.find((x) => x.kind === "cnp")!.title).toMatch(/Groundnut/);
  });
});

describe("AI prompt is grounded", () => {
  it("contains every crop's labelled card figures and the language instruction", async () => {
    const { results, ctx } = await evaluate(D1, onnxPredict);
    const ok = results.filter((r) => r.feasible);
    const p = buildPrompt(ok, ctx, "kn", "Soybean");
    for (const r of ok) expect(p).toContain(`${r.label}: typical net profit Rs ${Math.round(r.net_typical!).toLocaleString("en-IN")} per acre`);
    expect(p).toMatch(/Kannada/); expect(p).toMatch(/invent any other number/i); expect(p).toMatch(/Soybean/);
  });
});

describe("client state survives refresh via URL", () => {
  it("round-trips through the query string", () => {
    const f = { ...EMPTY, d: "BIJAPUR", t: "Vijayapura", a: "4", s: "Rabi", ph: "8.1", soil: "deep_black", irr: "none", prev: "jowar", sel: "wheat,gram" };
    expect({ ...EMPTY, ...qsToFarm(new URLSearchParams(farmToQs(f))) }).toEqual(f);
  });
  it("payload: blank pH -> 7.0 with ph_known=false; selection sentinel", () => {
    const p = farmToPayload({ ...EMPTY, t: "Indi", s: "Kharif", a: "2", soil: "red", irr: "none" });
    expect(p.soil_ph).toBe(7); expect(p.ph_known).toBe(false); expect(p.selected).toBeUndefined();
    expect(selList({ ...EMPTY, sel: "-" })).toEqual([]); expect(selList({ ...EMPTY, sel: "tur,urad" })).toEqual(["tur", "urad"]);
  });
});
