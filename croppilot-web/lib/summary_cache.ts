export type Summary = { source: "llm" | "template"; text: string; provider?: string; model?: string } | { error: string };
type S = Summary;
// One request per (farm, language, focus) per tab: going back to a page reuses the finished summary
// (or the request still in flight) instead of calling the LLM again. Errors are not cached.
const SUMMARIES = new Map<string, Promise<S>>();
export function fetchSummary(body: string): Promise<S> {
  let p = SUMMARIES.get(body);
  if (!p) {
    p = fetch("/api/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then(async (r) => { const j = await r.json(); return (r.ok ? j : { error: j.error }) as S; })
      .catch((e) => ({ error: String(e) }) as S)
      .then((v) => { if ("error" in v) SUMMARIES.delete(body); return v; });
    SUMMARIES.set(body, p);
  }
  return p;
}

