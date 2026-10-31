// Rule-based alerts generated from REAL data (NASA POWER climatology, MSP table, engine results).
// Pure function -> unit-testable; the server attaches the alerts to every /api/recommend response.
import { DATA, type Season } from "./data";
import type { CropResult, Context } from "./engine";

export type Severity = "info" | "warn" | "action";
export interface Alert { id: string; kind: "sowing" | "rain" | "msp" | "soil" | "cnp"; severity: Severity; title: string; body: string; href?: string }

// General Karnataka sowing windows (UAS Dharwad / UAS Bengaluru packages of practices): month numbers, inclusive.
export const SOWING: Record<Season, { open: [number, number]; close: [number, number]; label: string }> = {
  Kharif: { open: [6, 1], close: [7, 31], label: "1 June – 31 July" },
  Rabi: { open: [10, 1], close: [11, 30], label: "1 October – 30 November" },
};

const day = (y: number, [m, d]: [number, number]) => new Date(Date.UTC(y, m - 1, d));
const DAY = 86400000;

export function sowingAlert(season: Season, today: Date): Alert {
  const w = SOWING[season]; const y = today.getUTCFullYear();
  let open = day(y, w.open), close = day(y, w.close);
  if (today > close) { open = day(y + 1, w.open); close = day(y + 1, w.close); }
  const toOpen = Math.ceil((open.getTime() - today.getTime()) / DAY), toClose = Math.ceil((close.getTime() - today.getTime()) / DAY);
  const id = `sowing-${season}-${open.getUTCFullYear()}`;
  if (toOpen > 0) return { id: `${id}-upcoming`, kind: "sowing", severity: toOpen <= 21 ? "action" : "info", title: `${season} sowing window opens in ${toOpen} days`, body: `Typical ${season} sowing in Karnataka: ${w.label}. Line up seed and inputs before it opens.` };
  return { id: `${id}-open`, kind: "sowing", severity: toClose <= 14 ? "warn" : "action", title: toClose <= 14 ? `${season} sowing window closes in ${toClose} days` : `${season} sowing window is open`, body: `Typical window: ${w.label}. Late sowing usually lowers yield.` };
}

/** Share of past seasons (NASA POWER) whose main-season rain fell below the crop's rainfed minimum. */
export function rainDeficitShare(district: string, season: Season, minMm: number) {
  const h = DATA.rain_hist[`${district}|${season}`] ?? [];
  return { share: h.length ? h.filter((r) => r < minMm).length / h.length : 0, n: h.length };
}

export function buildAlerts(results: CropResult[], ctx: Context, opts: { today?: Date; phKnown?: boolean; selected?: string[] } = {}): Alert[] {
  const today = opts.today ?? new Date();
  const out: Alert[] = [sowingAlert(ctx.season, today)];
  const ranked = results.filter((r) => r.feasible && (!opts.selected || opts.selected.includes(r.crop)));
  const [y0, y1] = DATA.rain_years;
  for (const r of ranked.slice(0, 3)) {
    const a = DATA.crops[r.crop];
    if (ctx.season === "Kharif" && a.kharif_min_rain_mm && ctx.field.irrigation === "none") {
      const { share, n } = rainDeficitShare(ctx.district, ctx.season, a.kharif_min_rain_mm);
      if (share >= 0.2) out.push({ id: `rain-${ctx.district}-${r.crop}`, kind: "rain", severity: share >= 0.4 ? "warn" : "info",
        title: `Rainfall risk for ${r.label}`, body: `In ${Math.round(share * n)} of ${n} seasons (${y0}–${y1}, NASA POWER) ${ctx.district} got less than the ${a.kharif_min_rain_mm} mm Jun–Sep that rainfed ${r.label.toLowerCase()} needs. Plan protective irrigation or a shorter-duration variety.`, href: `/crop/${r.crop}` });
    }
    if (ctx.season === "Rabi" && ctx.field.irrigation === "none" && ctx.normal.rain_main < 120) {
      out.push({ id: `rain-rabi-${ctx.district}-${r.crop}`, kind: "rain", severity: "info", title: `${r.label} will rely on stored soil moisture`,
        body: `Normal Oct–Jan rain in ${ctx.district} is only ${Math.round(ctx.normal.rain_main)} mm (NASA POWER). Sow soon after the monsoon while the profile is moist.`, href: `/crop/${r.crop}` });
    }
    const key = a.msp_key[ctx.season];
    if (key && DATA.msp[key]) {
      const prev = DATA.msp_prev[key]; const ch = prev ? ((DATA.msp[key] - prev) / prev) * 100 : null;
      out.push({ id: `msp-${key}-${DATA.current_crop_year}`, kind: "msp", severity: "info", title: `MSP ${DATA.current_crop_year}-${String(DATA.current_crop_year + 1).slice(2)} for ${r.label}: ₹${DATA.msp[key].toLocaleString("en-IN")}/q`,
        body: ch !== null ? `${ch >= 0 ? "Up" : "Down"} ${Math.abs(ch).toFixed(1)}% on last year (₹${prev.toLocaleString("en-IN")}). Our price estimate uses ${r.price_method === "base_msp" ? "MSP" : "MSP × the historical harvest/MSP ratio"}.` : "Our price estimate is anchored to MSP.", href: `/crop/${r.crop}` });
    }
  }
  if (opts.phKnown === false) out.push({ id: `soil-test-${ctx.taluk}`, kind: "soil", severity: "action", title: "Get a soil test", body: "You haven't entered a measured pH, so we assumed 7.0. A Soil Health Card test at your Raitha Samparka Kendra makes the crop rules reliable.", href: "/soil" });
  if (ranked[0]) out.push({ id: `cnp-${ctx.taluk}-${ctx.season}-${ranked[0].crop}`, kind: "cnp", severity: "action", title: `Next: Crop Nutrition Plan for ${ranked[0].label}`, body: "Continue to the Polaris Crop Nutrition Plan for fertiliser doses and timing.", href: `/crop/${ranked[0].crop}` });
  return out;
}
