// Grounding for the AI summary: the LLM sees only labelled figures exactly as the cards display them,
// and its output is rejected (template fallback) if it quotes any other number or a wrong yield-method word.
import type { CropResult } from "./engine";

/** Same wording as the /results cards. */
export const YIELD_METHOD: Record<string, string> = { model: "ML model", base_hist_mean: "district average", base_last_season: "last season" };
const METHOD_RX: Record<string, RegExp> = {
  model: /\b(ml|machine[- ]learning)\s+model\b|\bmodel\b/i,
  base_hist_mean: /district(\s+historical)?\s+average|district\s+avg/i,
  base_last_season: /last\s+(reported\s+)?season|previous\s+season/i,
};
const fmt = (x: number) => Math.round(x).toLocaleString("en-IN");

export interface CropFacts { label: string; typical: string; worst: string; best: string; yield: string; price: string; method: string; methodKey: string }
export function cropFacts(r: CropResult): CropFacts {
  return { label: r.label, typical: fmt(r.net_typical!), worst: fmt(r.net_worst!), best: fmt(r.net_best!),
    yield: r.yields!.typical.toFixed(1), price: fmt(r.prices!.base), method: YIELD_METHOD[r.yield_method!] ?? r.yield_method!, methodKey: r.yield_method! };
}
export function factLines(rs: CropResult[]): string {
  return rs.map((r, i) => { const f = cropFacts(r);
    return `#${i + 1} ${f.label}: typical net profit Rs ${f.typical} per acre; worst case Rs ${f.worst} per acre; best case Rs ${f.best} per acre; ` +
      `typical yield ${f.yield} q/acre; base price Rs ${f.price} per quintal; yield method: ${f.method}.`; }).join("\n");
}

const num = (s: string) => Number(s.replace(/,/g, ""));
export function allowedNumbers(rs: CropResult[]): Set<number> {
  const s = new Set<number>();
  rs.forEach((r, i) => { const f = cropFacts(r); s.add(i + 1);
    for (const v of [f.typical, f.worst, f.best, f.yield, f.price]) { s.add(num(v)); s.add(Math.abs(num(v))); } });
  return s;
}
/** Numbers in text (Indian/Western commas, decimals, ASCII or Unicode minus). */
export function numbersIn(text: string): number[] {
  return [...text.replace(/[\u2212\u2013]/g, "-").matchAll(/(?<![\w.])-?\d[\d,]*(?:\.\d+)?/g)].map((m) => num(m[0].replace(/,$/, "")));
}

/** Returns null if the text is safe, else a short reason. */
export function checkSummary(text: string, rs: CropResult[]): string | null {
  const ok = allowedNumbers(rs);
  const bad = numbersIn(text).filter((n) => !ok.has(n));
  if (bad.length) return `number not in allowed set: ${bad.slice(0, 3).join(", ")}`;
  const crops = rs.map(cropFacts);
  let prev: CropFacts[] = [];
  for (const sent of text.split(/(?<=[.!?])\s+|\n+/)) {
    const here = crops.filter((c) => new RegExp(`\\b${c.label.split(" (")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sent));
    const named = here.length ? here : prev; // "Its yield..." refers to the crop in the previous sentence
    if (here.length) prev = here;
    for (const [key, rx] of Object.entries(METHOD_RX)) {
      if (!rx.test(sent)) continue;
      // a method word is only allowed when it is the method of a crop named in the same sentence (or of every crop if none is named)
      const owners = named.length ? named : crops;
      if (!owners.some((c) => c.methodKey === key)) return `wrong method word "${YIELD_METHOD[key]}"`;
      if (!named.length && !crops.every((c) => c.methodKey === key)) return `method word "${YIELD_METHOD[key]}" without a crop`;
    }
  }
  return null;
}
