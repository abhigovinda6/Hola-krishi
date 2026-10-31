// AI summary endpoint: recomputes the numbers server-side, then asks the LLM to explain ONLY those numbers.
import { NextResponse } from "next/server";
import { evaluate } from "@/lib/engine";
import { onnxPredict } from "@/lib/onnx";
import { summaryCrops } from "@/lib/selection";
import { llmSummary, template, lastLlmError } from "@/lib/explain";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  try {
    const { results, ctx } = await evaluate(body, onnxPredict);
    const feasible = summaryCrops(results, body.selected);
    if (!feasible.length && results.some((r) => r.feasible))
      return NextResponse.json({ source: "template", text: body.lang === "kn" ? "ಸಾರಾಂಶಕ್ಕೆ ಯಾವುದೇ ಬೆಳೆ ಇಲ್ಲ. ಜಮೀನು ಅಥವಾ ಮಣ್ಣಿನ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ, ನಂತರ ಮತ್ತೆ ಹೋಲಿಸಿ." : "There are no crops to summarise yet. Check your farm and soil details, then open Compare again." });
    if (!feasible.length) return NextResponse.json({ source: "template", text: "No crop passes the rules for this field, so there is nothing to summarise." });
    const focus = typeof body.focus === "string" ? feasible.find((r) => r.crop === body.focus)?.label : undefined;
    const lang = body.lang === "kn" ? "kn" : "en";
    const llm = await llmSummary(feasible, ctx, lang, focus);
    if (llm) return NextResponse.json({ source: "llm", provider: llm.provider, model: llm.model, text: llm.text });
    return NextResponse.json({ source: "template", llm_error: lastLlmError || "no LLM key configured", text: feasible.slice(0, 3).map((r) => template(r, ctx)).join("\n") });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Invalid field profile") ? 422 : 500 });
  }
}
