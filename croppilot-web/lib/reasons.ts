// Turns the engine's technical rule strings into plain English / Kannada chips. Pure, so it can be tested.
import type { Lang } from "./i18n";

export type ReasonKind = "ph_low" | "ph_high" | "water" | "rotation" | "data" | "other";
export interface Reason { kind: ReasonKind; text: string }

export const SOIL_LABEL: Record<string, { en: string; kn: string }> = {
  deep_black: { en: "deep black soil", kn: "ಆಳವಾದ ಕಪ್ಪು ಮಣ್ಣು" }, medium_black: { en: "medium black soil", kn: "ಮಧ್ಯಮ ಕಪ್ಪು ಮಣ್ಣು" },
  shallow_black: { en: "shallow black soil", kn: "ತೆಳು ಕಪ್ಪು ಮಣ್ಣು" }, red: { en: "red / laterite soil", kn: "ಕೆಂಪು / ಜಂಬಿಟ್ಟಿಗೆ ಮಣ್ಣು" },
  any: { en: "any soil", kn: "ಯಾವುದೇ ಮಣ್ಣು" },
};
const soilList = (raw: string, lang: Lang) => {
  const keys = raw.split(",").map((s) => s.trim()).filter((s) => s && s !== "no soils");
  const names = keys.map((k) => SOIL_LABEL[k]?.[lang] ?? k.replace(/_/g, " "));
  return names.join(lang === "kn" ? ", " : " or ");
};
const dash = (x: string) => x.replace("-", "–");

export function formatReason(raw: string, lang: Lang = "en"): Reason {
  const kn = lang === "kn"; let m: RegExpMatchArray | null;
  if ((m = raw.match(/soil pH ([\d.]+) outside ([\d.]+)-([\d.]+)/))) {
    const [ph, lo, hi] = [Number(m[1]), m[2], m[3]]; const low = ph < Number(lo);
    return { kind: low ? "ph_low" : "ph_high", text: kn
      ? `ಮಣ್ಣಿನ pH ${m[1]} ಈ ಬೆಳೆಯ ವ್ಯಾಪ್ತಿಗಿಂತ (${dash(`${lo}-${hi}`)}) ${low ? "ಕಡಿಮೆ" : "ಹೆಚ್ಚು"}.`
      : `Soil pH ${m[1]} is ${low ? "below" : "above"} this crop's range (${dash(`${lo}-${hi}`)}).` };
  }
  if ((m = raw.match(/needs '(\w+)' irrigation here \(rainfed only on ([^)]*?)(?: with >= (\d+) mm Jun-Sep; normal here (\d+) mm)?\)/))) {
    const need = m[1], soils = soilList(m[2], lang); const rain = m[3] ? { min: m[3], normal: m[4] } : null;
    if (kn) {
      const base = need === "full" ? "ಪೂರ್ಣ ನೀರಾವರಿ ಬೇಕು." : "ಕನಿಷ್ಠ ರಕ್ಷಣಾತ್ಮಕ ನೀರಾವರಿ ಬೇಕು.";
      const tail = soils ? ` ಮಳೆಯಾಶ್ರಿತವಾಗಿ ${soils}ನಲ್ಲಿ ಮಾತ್ರ.` : " ಇಲ್ಲಿ ಈ ಮಣ್ಣಿನಲ್ಲಿ ಮಳೆಯಾಶ್ರಿತವಾಗಿ ಬೆಳೆಯಲಾಗದು.";
      return { kind: "water", text: base + tail + (rain ? ` (ಜೂನ್–ಸೆಪ್ಟೆಂಬರ್ ಮಳೆ ಕನಿಷ್ಠ ${rain.min} ಮಿಮೀ ಬೇಕು; ಇಲ್ಲಿ ಸಾಮಾನ್ಯ ${rain.normal} ಮಿಮೀ)` : "") };
    }
    const base = need === "full" ? "Needs full irrigation." : "Needs at least protective irrigation";
    let text = need === "full"
      ? (soils ? `${base} Rainfed only on ${soils}.` : `${base} It can't be grown rainfed on this soil here.`)
      : (soils ? `${base} (rainfed only on ${soils}).` : `${base}.`);
    if (rain) text += ` Needs ${rain.min} mm of Jun–Sep rain rainfed; normal here is ${rain.normal} mm.`;
    return { kind: "water", text };
  }
  if (/^rotation:/.test(raw)) return { kind: "rotation", text: kn ? "ಹಿಂದಿನ ಹಂಗಾಮಿನಲ್ಲಿ ಇದೇ ಬೆಳೆ. ಮತ್ತೆ ಬೆಳೆದರೆ ಕೀಟ ಮತ್ತು ರೋಗ ಹೆಚ್ಚುತ್ತದೆ." : "Grown last season. Repeating it builds up pests and disease." };
  if (/^not enough data/.test(raw)) return { kind: "data", text: kn ? "ಈ ಜಿಲ್ಲೆಯಲ್ಲಿ ಅಂದಾಜಿಗೆ ಸಾಕಷ್ಟು ಹಳೆಯ ದತ್ತಾಂಶ ಇಲ್ಲ." : "Not enough past data in this district to estimate it." };
  return { kind: "other", text: raw.replace(/_/g, " ") };
}
export const formatReasons = (raws: string[], lang: Lang = "en") => raws.map((r) => formatReason(r, lang));
