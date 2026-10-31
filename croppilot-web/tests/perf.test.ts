import { describe, it, expect, vi, afterEach } from "vitest";
import { GET, POST } from "@/app/api/recommend/route";
import { fetchSummary } from "@/lib/summary_cache";

const body = { taluk: "Vijayapura", season: "Rabi", area_acres: 4, soil_ph: 8.1, ph_known: true, soil_type: "deep_black", irrigation: "none", previous_crop: "jowar" };

describe("speed fixes keep answers identical", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("GET /api/recommend returns exactly the POST answer, with an edge cache header", async () => {
    const g = await GET(new Request(`http://x/api/recommend?p=${encodeURIComponent(JSON.stringify(body))}`));
    const p = await POST(new Request("http://x/api/recommend", { method: "POST", body: JSON.stringify(body) }));
    expect(g.status).toBe(200);
    expect(g.headers.get("cache-control")).toMatch(/s-maxage=600/);
    expect(await g.json()).toEqual(await p.json());
  });
  it("bad input is not cached", async () => {
    const g = await GET(new Request("http://x/api/recommend?p=notjson"));
    expect(g.status).toBe(400); expect(g.headers.get("cache-control") ?? "").not.toMatch(/s-maxage/);
    const g2 = await GET(new Request(`http://x/api/recommend?p=${encodeURIComponent(JSON.stringify({ ...body, taluk: "Nowhere" }))}`));
    expect(g2.status).toBeGreaterThanOrEqual(400); expect(g2.headers.get("cache-control") ?? "").not.toMatch(/s-maxage/);
  });
  it("AI summary: one request per farm+language, errors retried", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { n++; return new Response(JSON.stringify({ source: "llm", text: "ok" }), { status: 200 }); }));
    const k = JSON.stringify({ a: 1, lang: "en" });
    const [a, b] = await Promise.all([fetchSummary(k), fetchSummary(k)]); await fetchSummary(k);
    expect(n).toBe(1); expect(a).toEqual(b);
    await fetchSummary(JSON.stringify({ a: 1, lang: "kn" })); expect(n).toBe(2);
    vi.stubGlobal("fetch", vi.fn(async () => { n++; return new Response(JSON.stringify({ error: "x" }), { status: 500 }); }));
    const e = JSON.stringify({ a: 2 }); await fetchSummary(e); await fetchSummary(e); expect(n).toBe(4);
  });
});
