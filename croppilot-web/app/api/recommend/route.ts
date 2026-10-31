import { NextResponse } from "next/server";
import { evaluate } from "@/lib/engine";
import { onnxPredict } from "@/lib/onnx";
import { template } from "@/lib/explain";
import { buildAlerts } from "@/lib/alerts";

export const runtime = "nodejs";

// Same answer for the same farm, so GET responses are cached at Vercel's edge for 10 minutes
// (repeat visits skip the function and its cold start). Short TTL because the sowing alert depends on today's date.
const CACHE = "public, max-age=0, s-maxage=600, stale-while-revalidate=600";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("p");
  let body: Record<string, unknown>;
  try { body = JSON.parse(p ?? ""); } catch { return NextResponse.json({ error: "Query parameter p must be JSON" }, { status: 400 }); }
  const res = await compute(body);
  if (res.status === 200) res.headers.set("Cache-Control", CACHE);
  return res;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  return compute(body);
}

async function compute(body: Record<string, unknown>) {
  try {
    const { results, ctx } = await evaluate(body, onnxPredict);
    const explanations = Object.fromEntries(results.map((r) => [r.crop, template(r, ctx)]));
    const alerts = buildAlerts(results, ctx, { phKnown: body.ph_known !== false, selected: Array.isArray(body.selected) ? (body.selected as string[]) : undefined });
    return NextResponse.json({ ctx, results, explanations, alerts, llm_available: Boolean(process.env.GROQ_API_KEY || process.env.CLOUDFLARE_API_TOKEN) });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Invalid field profile") ? 422 : 500 });
  }
}
