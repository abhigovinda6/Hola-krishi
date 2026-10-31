// v3 compare view: turns engine results into the tile model. Pure (testable); uses ONLY numbers the engine computes.
import type { Lang } from "./i18n";
import { formatReasons, type Reason } from "./reasons";

export const TOP_N = 3;
export const MEDAL = ["🥇", "🥈", "🥉"];
export const W_TYPICAL = 0.6, W_WORST = 0.4, PULSE_BONUS = 1500; // must match lib/engine.ts rank()

type R = {
  crop: string; label: string; label_kn: string; feasible: boolean; reasons: string[]; rank?: number; score?: number;
  yields?: { bad: number; typical: number; good: number }; yield_method?: string; last_yield_year?: number;
  prices?: { low: number; base: number; high: number }; price_method?: string; msp?: number; cost?: number;
  net_typical?: number; net_worst?: number; net_best?: number;
};
type A = { id: string; kind: string; severity: string; title: string; body: string };

const L = {
  ym: { model: { en: "ML model (weather + past seasons)", kn: "ML ಮಾದರಿ (ಹವಾಮಾನ + ಹಿಂದಿನ ಹಂಗಾಮುಗಳು)" },
        base_hist_mean: { en: "district average of past seasons", kn: "ಹಿಂದಿನ ಹಂಗಾಮುಗಳ ಜಿಲ್ಲಾ ಸರಾಸರಿ" },
        base_last_season: { en: "last reported season", kn: "ಕೊನೆಯ ವರದಿಯಾದ ಹಂಗಾಮು" } } as Record<string, Record<Lang, string>>,
  pm: { base_msp: { en: "MSP 2025-26", kn: "MSP 2025-26" },
        base_hist_ratio_x_msp: { en: "MSP 2025-26 × past harvest-price/MSP ratio", kn: "MSP 2025-26 × ಹಿಂದಿನ ಕೊಯ್ಲು ಬೆಲೆ/MSP ಅನುಪಾತ" } } as Record<string, Record<Lang, string>>,
};
export const yieldMethodText = (m: string, l: Lang) => L.ym[m]?.[l] ?? m;
export const priceMethodText = (m: string, l: Lang) => L.pm[m]?.[l] ?? m;

export interface Tile {
  crop: string; name: string; alt: string; rank: number; medal: string; score: number; legume: boolean;
  note: string; yields: { bad: number; typical: number; good: number }; latestYear?: number;
  price: number; priceLow: number; priceHigh: number; priceSource: string; msp: number; cost: number;
  typical: number; worst: number; best: number;
  why: { typicalPart: number; worstPart: number; bonus: number; vsNext?: { name: string; gap: number } };
  chips: { kind: "warn" | "good" | "info"; text: string }[];
}

export function buildTiles(results: R[], alerts: A[], lang: Lang) {
  const kn = lang === "kn";
  const feas = results.filter((r) => r.feasible).sort((a, b) => a.rank! - b.rank!);
  const name = (r: R) => (kn ? r.label_kn : r.label);
  const tiles: Tile[] = feas.slice(0, TOP_N).map((r, i) => {
    const bonus = Math.round(r.score! - W_TYPICAL * r.net_typical! - W_WORST * r.net_worst!) || 0; // engine's pulse bonus (0 or 1500)
    const legume = bonus > 0;
    const chips: Tile["chips"] = [];
    for (const a of alerts) if (a.kind === "rain" && a.title.startsWith(r.label)) chips.push({ kind: "warn", text: kn ? "ಸಂಗ್ರಹಿತ ಮಣ್ಣಿನ ತೇವಾಂಶದ ಮೇಲೆ ಅವಲಂಬನೆ" : "Relies on stored soil moisture" });
    if (r.net_worst! < 0) chips.push({ kind: "warn", text: kn ? "ಕೆಟ್ಟ ವರ್ಷದಲ್ಲಿ ನಷ್ಟ ಸಾಧ್ಯ" : "Can lose money in a bad year" });
    if (legume) chips.push({ kind: "good", text: kn ? "ದ್ವಿದಳ: ಮುಂದಿನ ಬೆಳೆಗೆ ಸಾರಜನಕ" : "Pulse: leaves nitrogen for the next crop" });
    chips.push({ kind: "info", text: kn ? "pH, ನೀರು, ಮಣ್ಣು, ಬೆಳೆ ಸರದಿ ನಿಯಮಗಳು ಸರಿ" : "Passes pH, water, soil and rotation rules" });
    const next = feas[i + 1];
    return {
      crop: r.crop, name: name(r), alt: kn ? r.label : r.label_kn, rank: i + 1, medal: MEDAL[i], score: r.score!, legume,
      note: kn
        ? `ಇಳುವರಿ: ${yieldMethodText(r.yield_method!, lang)} (ಜಿಲ್ಲಾ ಮಟ್ಟ, ಇತ್ತೀಚಿನ ದತ್ತಾಂಶ ${r.last_yield_year}). ಬೆಲೆ: ${priceMethodText(r.price_method!, lang)}. ವೆಚ್ಚ: CACP ಅಂದಾಜು.`
        : `Yield from the ${yieldMethodText(r.yield_method!, lang)} (district level, latest data ${r.last_yield_year}). Price from ${priceMethodText(r.price_method!, lang)}. Cost is a CACP-based approximation.`,
      yields: r.yields!, latestYear: r.last_yield_year, price: r.prices!.base, priceLow: r.prices!.low, priceHigh: r.prices!.high,
      priceSource: priceMethodText(r.price_method!, lang), msp: r.msp!, cost: r.cost!,
      typical: r.net_typical!, worst: r.net_worst!, best: r.net_best!,
      why: { typicalPart: W_TYPICAL * r.net_typical!, worstPart: W_WORST * r.net_worst!, bonus,
             vsNext: next ? { name: name(next), gap: r.score! - next.score! } : undefined },
      chips,
    };
  });
  const others = feas.slice(TOP_N).map((r) => ({ crop: r.crop, name: name(r), rank: r.rank!, score: r.score!, typical: r.net_typical! }));
  const excluded = results.filter((r) => !r.feasible).map((r) => ({ crop: r.crop, name: name(r), reasons: formatReasons(r.reasons, lang) as Reason[] }));
  return { tiles, others, excluded };
}

/** Position (0–100%) of a value on the bad→good yield bar. */
export const barPos = (v: number, lo: number, hi: number) => (hi > lo ? Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100)) : 50);
