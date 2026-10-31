// Pure helpers for the farm profile (shared by client state and tests).
export interface Farm { d: string; t: string; a: string; s: string; ph: string; soil: string; irr: string; prev: string; sel: string; selk: string }
export const EMPTY: Farm = { d: "", t: "", a: "", s: "", ph: "", soil: "", irr: "", prev: "fallow", sel: "", selk: "" };
export const FARM_KEYS = Object.keys(EMPTY) as (keyof Farm)[];

export function farmToQs(f: Farm) { const p = new URLSearchParams(); FARM_KEYS.forEach((k) => f[k] && p.set(k, f[k])); return p.toString(); }
export function qsToFarm(p: URLSearchParams): Partial<Farm> { const o: Partial<Farm> = {}; FARM_KEYS.forEach((k) => { const v = p.get(k); if (v !== null) o[k] = v; }); return o; }
export function farmToPayload(f: Farm) {
  return { taluk: f.t, season: f.s, area_acres: Number(f.a), soil_ph: f.ph === "" ? 7.0 : Number(f.ph), ph_known: f.ph !== "",
           soil_type: f.soil, irrigation: f.irr, previous_crop: f.prev || "fallow", selected: undefined as string[] | undefined }; // v3: always the top-ranked crops
}
/** Identifies the farm inputs a saved selection belongs to. */
export const profileKey = (f: Farm) => [f.t, f.s, f.soil, f.irr, f.ph, f.prev || "fallow", f.a].join("|");
/** The saved selection only if it belongs to these farm inputs; a stale or unset one -> undefined (= server uses the top picks). */
export const currentSelection = (f: Farm): string[] | undefined => (f.selk === profileKey(f) ? selList(f) ?? undefined : undefined);
/** null = not chosen yet (use recommended); [] = user chose none. */
export const selList = (f: Farm): string[] | null => (f.sel === "" ? null : f.sel === "-" ? [] : f.sel.split(","));
export const farmReady = (f: Farm) => Boolean(f.t && f.s && f.a && f.soil && f.irr);


/** Where "See my results" goes: always /results (v3 has no crop-picking step). */
export const welcomeTarget = (_f: Farm) => "/results"; // v3: no crop-picking step
/** A saved farm (from localStorage JSON) counts as "returning visitor" only if it is complete. */
export function savedFarm(raw: string | null): Farm | null {
  if (!raw) return null;
  try { const f = { ...EMPTY, ...JSON.parse(raw) } as Farm; return farmReady(f) ? f : null; } catch { return null; }
}
export const farmSummary = (f: Farm) => ({ place: [f.t, f.d].filter(Boolean).join(", "), season: f.s, acres: f.a, ph: f.ph });
