// Template explanations (default) + OPTIONAL LLM summary (Groq or Cloudflare Workers AI), grounded ONLY in computed numbers.
import type { CropResult, Context } from "./engine";
import { factLines, checkSummary } from "./summary_guard";

const YM: Record<string, string> = { model: "ML model (weather + last season)", base_hist_mean: "district historical average", base_last_season: "last reported season" };
const PM: Record<string, string> = { base_msp: "MSP", base_hist_ratio_x_msp: "MSP x historical harvest-price/MSP ratio" };
const LEGUMES = ["tur", "moong", "urad", "gram", "groundnut", "soybean"];
export const rs = (x: number) => `Rs ${Math.round(x).toLocaleString("en-IN")}`;
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function template(r: CropResult, ctx: Context): string {
  if (!r.feasible) return `${r.label}: not offered - ${r.reasons.join("; ")}.`;
  const y = r.yields!, p = r.prices!;
  return `#${r.rank} ${r.label}: typical net ${rs(r.net_typical!)}/acre (range ${rs(r.net_worst!)} to ${rs(r.net_best!)}). ` +
    `Yield ${y.bad.toFixed(1)}/${y.typical.toFixed(1)}/${y.good.toFixed(1)} q/acre (bad/typical/good; ${title(ctx.district)} district average, ` +
    `method: ${YM[r.yield_method!]}, latest data ${r.last_yield_year}). Price ${rs(p.low)}-${rs(p.high)}/q (base ${rs(p.base)}; ` +
    `${PM[r.price_method!]}; MSP ${rs(r.msp!)}). Cost ~${rs(r.cost!)}/acre (CACP all-India cost/q x district yield - approximation).` +
    (LEGUMES.includes(r.crop) ? " Legume: adds nitrogen for the next crop." : "");
}

export type Lang = "en" | "kn";
export function buildPrompt(results: CropResult[], _ctx: Context, lang: Lang, focus?: string): string {
  const task = focus ? `Explain to a farmer in 4 short sentences whether ${focus} is a good choice for this field and why, compared with the alternatives.`
                     : "Explain to a farmer in 4 short sentences which crop looks best and why.";
  return `${task}\nRULES: Quote ONLY the labelled figures below, copied exactly as written (same rounding, Rs, q/acre). ` +
    `Do not calculate, round, add, compare as percentages or invent any other number, year or count. ` +
    `"Typical yield" is the only yield figure; there is no other yield. When you name a yield method, use exactly the method given for that crop. ` +
    `Say once that rain and prices are uncertain, so these are estimates. ` +
    (lang === "kn" ? "Write the answer in simple Kannada (ಕನ್ನಡ), keeping numbers in Western digits exactly as below." : "Write in simple English.") +
    ` Plain text, no markdown.\nFIGURES:\n${factLines(results)}`;
}

const GROQ_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]; // tried in order after GROQ_MODEL

/** Returns an LLM summary if GROQ_API_KEY or CLOUDFLARE_ACCOUNT_ID+CLOUDFLARE_API_TOKEN is set; otherwise null (caller uses templates). */
export let lastLlmError = ""; // non-secret diagnostic (HTTP status / error code only)
/** LLM summary that passed the server-side number/method check, else null (caller shows the template). */
export async function llmSummary(results: CropResult[], ctx: Context, lang: Lang = "en", focus?: string, raw = rawLlmSummary) {
  const out = await raw(results, ctx, lang, focus);
  if (!out) return null;
  const why = checkSummary(out.text, results);
  if (why) { lastLlmError = `summary rejected: ${why}`; return null; }
  return out;
}
export async function rawLlmSummary(results: CropResult[], ctx: Context, lang: Lang = "en", focus?: string): Promise<{ text: string; provider: string; model: string } | null> {
  lastLlmError = "";
  const prompt = buildPrompt(results, ctx, lang, focus);
  try {
    if (process.env.GROQ_API_KEY) {
      const models = [process.env.GROQ_MODEL, ...GROQ_MODELS].filter(Boolean) as string[];
      for (const model of models) {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 900 }),
        });
        if (r.ok) { const j = await r.json(); const t = String(j.choices?.[0]?.message?.content ?? "").trim(); if (t) return { text: t, provider: "Groq", model }; }
        else { lastLlmError = `groq ${model}: HTTP ${r.status}`; if (r.status === 401 || r.status === 429) break; } // bad key / rate limit: don't hammer other models
      }
    } else if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
      const model = process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-3.1-8b-instruct";
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`, {
        method: "POST", signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });
      if (r.ok) { const j = await r.json(); return { text: String(j.result.response).trim(), provider: "Cloudflare Workers AI", model }; }
    }
  } catch (e) { lastLlmError = `request failed: ${(e as Error).name}`; /* fall through to templates */ }
  return null;
}
