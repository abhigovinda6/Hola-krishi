"""Template explanations (default) + optional local LLM via Ollama (graceful fallback to templates)."""
import json, urllib.request

YM = {"model": "ML model (weather + last season)", "base_hist_mean": "district historical average",
      "base_last_season": "last reported season"}
PM = {"base_msp": "MSP", "base_hist_ratio_x_msp": "MSP x historical harvest-price/MSP ratio"}

def rs(x): return f"Rs {x:,.0f}"

def template(r, ctx):
    if not r["feasible"]:
        return f"{r['label']}: not offered - " + "; ".join(r["reasons"]) + "."
    y, p = r["yields"], r["prices"]
    return (f"#{r['rank']} {r['label']}: typical net {rs(r['net_typical'])}/acre (range {rs(r['net_worst'])} to "
            f"{rs(r['net_best'])}). Yield {y['bad']:.1f}/{y['typical']:.1f}/{y['good']:.1f} q/acre (bad/typical/good; "
            f"{ctx['district'].title()} district average, method: {YM[r['yield_method']]}, latest data {r['last_yield_year']}). "
            f"Price {rs(p['low'])}-{rs(p['high'])}/q (base {rs(p['base'])}; {PM[r['price_method']]}; MSP {rs(r['msp'])}). "
            f"Cost ~{rs(r['cost'])}/acre (CACP all-India cost/q x district yield - approximation)."
            + (" Legume: adds nitrogen for the next crop." if r["crop"] in ("tur", "moong", "urad", "gram", "groundnut", "soybean") else ""))

def llm_summary(results, ctx, model="llama3.2", host="http://localhost:11434", timeout=20):
    facts = "\n".join(template(r, ctx) for r in results)
    prompt = ("Explain to a farmer in 5 short sentences which crop looks best and why, using ONLY these facts. "
              f"Do not invent numbers. Say that prices and rain are uncertain.\n{facts}")
    try:
        req = urllib.request.Request(f"{host}/api/generate", data=json.dumps(dict(model=model, prompt=prompt, stream=False)).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())["response"].strip()
    except Exception:
        return None
