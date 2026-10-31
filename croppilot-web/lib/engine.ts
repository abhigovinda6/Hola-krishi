// CropPilot engine, ported line-for-line from croppilot/engine.py:
// (1) rules -> (2) yield & price estimates -> (3) profit grid -> (4) rank.
// The yield model is injected as `predict` so the engine stays pure and testable (ONNX on the server, mock in tests).
import { DATA, type Season, type Normal, type Irrigation } from "./data";
import { validateField, type Field } from "./schema";

export type Predict = (features: number[]) => Promise<number>;
const SCEN = ["bad", "typical", "good"] as const;
const PSCEN = ["low", "base", "high"] as const;

export interface CropResult {
  crop: string; label: string; label_kn: string; feasible: boolean; data_ok: boolean; reasons: string[];
  yields?: Record<(typeof SCEN)[number], number>; yield_method?: string;
  prices?: Record<(typeof PSCEN)[number], number>; price_method?: string; msp?: number; cost?: number;
  grid?: Record<string, number>; net_typical?: number; net_worst?: number; net_best?: number;
  last_yield_year?: number; price_basis?: string; score?: number; rank?: number;
}
export interface Context { taluk: string; district: string; market: string; market_method: string; season: Season; normal: Normal; field: Field }

export function locate(taluk: string) {
  const r = DATA.taluks.find((t) => t.taluk === taluk)!;
  return { district: r.district, market: r.market || "", method: r.market_method };
}

export function normalWeather(district: string, season: Season): Normal {
  return DATA.normals[`${district}|${season}`];
}

export function feasibility(f: Field, district: string, season: Season) {
  const normal = normalWeather(district, season);
  const cov = new Map(DATA.coverage.filter((c) => c.district === district && c.season === season).map((c) => [c.crop, c]));
  const out: Record<string, { feasible: boolean; data_ok: boolean; reasons: string[] }> = {};
  for (const [c, a] of Object.entries(DATA.crops)) {
    if (!a.seasons.includes(season)) continue;
    const reasons: string[] = []; let ok = true;
    const cv = cov.get(c);
    if (!cv || !cv.included) {
      const why = cv ? cv.exclusion_reason : "not grown in this district in DES data";
      out[c] = { feasible: false, data_ok: false, reasons: [`not enough data: ${why}`] }; continue;
    }
    if (!(a.ph_min <= f.soil_ph && f.soil_ph <= a.ph_max)) { ok = false; reasons.push(`soil pH ${f.soil_ph} outside ${a.ph_min}-${a.ph_max}`); }
    const irr = DATA.irr_level[f.irrigation as Irrigation];
    let soils: string[]; let rainfedOk: boolean; let need: string;
    if (season === "Kharif") {
      soils = a.kharif_rainfed_soils;
      rainfedOk = (soils.includes("any") || soils.includes(f.soil_type)) && a.kharif_min_rain_mm !== null && normal.rain_main >= a.kharif_min_rain_mm;
      need = "full";
    } else {
      soils = a.rabi_rainfed_soils; rainfedOk = soils.includes(f.soil_type);
      need = a.rabi_min_irrigation ?? "full";
    }
    if (!rainfedOk && irr < DATA.irr_level[need as Irrigation]) {
      ok = false;
      reasons.push(`needs '${need}' irrigation here (rainfed only on ${soils.join(", ") || "no soils"}` +
        (season === "Kharif" ? ` with >= ${(a.kharif_min_rain_mm ?? 0).toFixed(0)} mm Jun-Sep; normal here ${normal.rain_main.toFixed(0)} mm` : "") + ")");
    }
    if (f.previous_crop === c && !a.repeat_ok) { ok = false; reasons.push(`rotation: ${c} was the previous crop (pest/disease build-up)`); }
    out[c] = { feasible: ok, data_ok: true, reasons: reasons.length ? reasons : ["passes pH, water, soil and rotation rules"] };
  }
  return { feas: out, normal };
}

export function yieldFeatures(crop: string, season: Season, normal: Normal, hm: number, last: number): number[] {
  return [DATA.crop_code[crop], DATA.season_code[season], normal.rain_main, normal.rain_prior, normal.tmax_late,
          DATA.current_crop_year, last / hm, hm];
}

export async function yieldEstimate(district: string, season: Season, crop: string, normal: Normal, predict: Predict) {
  const k = `${district}|${season}|${crop}`, ck = `${crop}|${season}`;
  const method = DATA.meta.yield_method[ck] ?? "base_hist_mean";
  const hm = DATA.meta.hist_mean_yield[k], last = DATA.meta.last_yield[k];
  let point: number;
  if (method === "model") point = hm * Math.exp(await predict(yieldFeatures(crop, season, normal, hm, last)));
  else point = method === "base_hist_mean" ? hm : last;
  const b = DATA.meta.yield_band_log[ck] ?? [-0.3, 0, 0.3];
  const ys = { bad: point * Math.exp(b[0]), typical: point * Math.exp(b[1]), good: point * Math.exp(b[2]) };
  return { ys, method, point };
}

export function priceEstimate(crop: string, season: Season) {
  const key = DATA.crops[crop].msp_key[season]!;
  const msp = DATA.msp[key];
  const ck = `${crop}|${season}`;
  const method = DATA.meta.price_method_used[ck] ?? "base_msp";
  const point = method === "base_hist_ratio_x_msp" ? msp * Math.exp(DATA.meta.hist_harvest_to_msp_logratio[ck]) : msp;
  const band = DATA.meta.price_band_log[`${ck}|${method}`] ?? DATA.meta.price_band_log["ALL|base_msp"];
  // base = point estimate; low/high = 10th/90th percentile of held-out errors
  return { ps: { low: point * Math.exp(band[0]), base: point, high: point * Math.exp(band[2]) }, method, msp };
}

export const farmgate = (p: number) => p * (1 - DATA.farmgate_deduction) - DATA.transport_rs_per_q;

export async function evaluate(input: unknown, predict: Predict): Promise<{ results: CropResult[]; ctx: Context }> {
  const f = validateField(input);
  const { district, market, method: how } = locate(f.taluk);
  const season = f.season as Season;
  const { feas, normal } = feasibility(f, district, season);
  const res: CropResult[] = [];
  for (const [c, fe] of Object.entries(feas)) {
    const a = DATA.crops[c];
    const r: CropResult = { crop: c, label: a.label, label_kn: a.label_kn, ...fe };
    if (fe.feasible) {
      const { ys, method: ym } = await yieldEstimate(district, season, c, normal, predict);
      const { ps, method: pm, msp } = priceEstimate(c, season);
      const hm = DATA.meta.hist_mean_yield[`${district}|${season}|${c}`];
      const cost = DATA.costs[c] * hm; // Rs/acre (approximation: CACP all-India cost/q x district mean yield)
      const grid: Record<string, number> = {};
      for (const y of SCEN) for (const p of PSCEN) grid[`${y}/${p}`] = ys[y] * farmgate(ps[p]) - cost;
      const vals = Object.values(grid);
      Object.assign(r, { yields: ys, yield_method: ym, prices: ps, price_method: pm, msp, cost, grid,
        net_typical: grid["typical/base"], net_worst: Math.min(...vals), net_best: Math.max(...vals),
        last_yield_year: DATA.meta.last_yield_year[`${district}|${season}|${c}`],
        price_basis: DATA.coverage.find((x) => x.district === district && x.season === season && x.crop === c)?.price_basis ?? "" });
    }
    res.push(r);
  }
  const ok = res.filter((r) => r.feasible);
  for (const r of ok) r.score = 0.6 * r.net_typical! + 0.4 * r.net_worst! + (DATA.crops[r.crop].legume ? 1500 : 0);
  ok.sort((x, y) => y.score! - x.score!);
  ok.forEach((r, i) => (r.rank = i + 1));
  return { results: [...ok, ...res.filter((r) => !r.feasible)],
           ctx: { taluk: f.taluk, district, market, market_method: how, season, normal, field: f } };
}
