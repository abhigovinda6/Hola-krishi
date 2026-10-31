// Groups the reasons crops were ruled out, for the "few/no feasible crops" banner. Pure, so it can be tested.
import { DATA } from "./data";

export interface BlockerGroup { kind: "ph_high" | "ph_low" | "water" | "rotation" | "data"; count: number; crops: string[]; detail: string }
type R = { crop: string; label: string; feasible: boolean; reasons: string[] };

export function summarizeBlockers(results: R[], ph: number): BlockerGroup[] {
  const g: Record<BlockerGroup["kind"], string[]> = { ph_high: [], ph_low: [], water: [], rotation: [], data: [] };
  for (const r of results.filter((x) => !x.feasible)) {
    const a = DATA.crops[r.crop]; const txt = r.reasons.join(" ");
    if (txt.startsWith("not enough data")) { g.data.push(r.label); continue; }
    if (/soil pH/.test(txt)) (ph > a.ph_max ? g.ph_high : g.ph_low).push(r.label);
    if (/irrigation/.test(txt)) g.water.push(r.label);
    if (/rotation/.test(txt)) g.rotation.push(r.label);
  }
  const rng = (xs: number[]) => { const lo = Math.min(...xs), hi = Math.max(...xs); return lo === hi ? `${lo}` : `${lo}–${hi}`; };
  const byLabel = (labels: string[]) => Object.values(DATA.crops).filter((c) => labels.includes(c.label));
  const out: BlockerGroup[] = [];
  if (g.ph_high.length) out.push({ kind: "ph_high", count: g.ph_high.length, crops: g.ph_high, detail: `Soil pH ${ph} is too alkaline for ${g.ph_high.length} crop${g.ph_high.length > 1 ? "s" : ""} (safe max ${rng(byLabel(g.ph_high).map((c) => c.ph_max))})` });
  if (g.ph_low.length) out.push({ kind: "ph_low", count: g.ph_low.length, crops: g.ph_low, detail: `Soil pH ${ph} is too acidic for ${g.ph_low.length} crop${g.ph_low.length > 1 ? "s" : ""} (safe min ${rng(byLabel(g.ph_low).map((c) => c.ph_min))})` });
  if (g.water.length) out.push({ kind: "water", count: g.water.length, crops: g.water, detail: `Not enough water for ${g.water.length} crop${g.water.length > 1 ? "s" : ""} rainfed on this soil` });
  if (g.rotation.length) out.push({ kind: "rotation", count: g.rotation.length, crops: g.rotation, detail: `Same as last season's crop (rotation rule): ${g.rotation.length}` });
  if (g.data.length) out.push({ kind: "data", count: g.data.length, crops: g.data, detail: `Too little district data to estimate: ${g.data.length}` });
  return out.sort((a, b) => b.count - a.count);
}

export function phAdvice(ph: number): "sodic" | "acid" | null {
  if (ph > 8.5) return "sodic"; if (ph < 5.5) return "acid"; return null;
}
