"""Streamlit UI (real data):  streamlit run app.py"""
import json, pandas as pd, streamlit as st
from croppilot.config import DATA, MODELS, CROPS, SOIL_TYPES, IRRIGATION
from croppilot.schema import validate_field
from croppilot.engine import CropPilot
from croppilot.explain import template, llm_summary

st.set_page_config(page_title="Polaris CropPilot", layout="wide")
st.title("Polaris CropPilot")
st.caption("Karnataka · Kharif & Rabi · REAL public data (DES APY 1997-2014, AGMARKNET 2008-2017, NASA POWER, MSP, "
           "CACP costs). Yields are DISTRICT averages. Estimates, not guarantees.")

@st.cache_resource
def engine(): return CropPilot()
cp = engine()
taluks = pd.read_csv(DATA / "taluks.csv").sort_values(["district", "taluk"])
fields = pd.read_csv(DATA / "fields.csv")

with st.sidebar:
    st.header("1. Your field")
    pick = st.selectbox("Sample profile", ["(custom)"] + list(fields.field_id))
    d = fields.set_index("field_id").loc[pick].to_dict() if pick != "(custom)" else {}
    dists = sorted(taluks.district.unique())
    d0 = taluks[taluks.taluk == d.get("taluk", "Vijayapura")].district.iloc[0]
    district = st.selectbox("District", dists, index=dists.index(d0), format_func=str.title)
    tl = list(taluks[taluks.district == district].taluk)
    taluk = st.selectbox("Taluk", tl, index=tl.index(d["taluk"]) if d.get("taluk") in tl else 0)
    season = st.radio("Season", ["Kharif", "Rabi"], index=["Kharif", "Rabi"].index(d.get("season", "Rabi")), horizontal=True)
    area = st.number_input("Area (acres)", value=float(d.get("area_acres", 2.0)), step=0.5)
    ph = st.number_input("Soil pH", value=float(d.get("soil_ph", 7.5)), step=0.1)
    soil = st.selectbox("Soil type", SOIL_TYPES, index=SOIL_TYPES.index(d.get("soil_type", "deep_black")),
                        format_func=lambda s: s.replace("_", " "))
    irr = st.selectbox("Irrigation", IRRIGATION, index=IRRIGATION.index(d.get("irrigation", "none")),
                       help="protective = 1-2 irrigations in a dry spell")
    prev_opts = ["fallow"] + list(CROPS) + ["cotton", "sugarcane", "other"]
    prev = st.selectbox("Previous crop", prev_opts, index=prev_opts.index(d.get("previous_crop", "fallow")) if isinstance(d.get("previous_crop"), str) else 0)
    use_llm = st.checkbox("Explain with local LLM (Ollama, optional)")

raw = dict(field_id=pick if pick != "(custom)" else "CUSTOM", taluk=taluk, season=season, area_acres=area,
           soil_ph=ph, soil_type=soil, irrigation=irr, previous_crop=prev)
try:
    field = validate_field(raw)
except ValueError as e:
    st.error(str(e)); st.stop()

results, ctx = cp.evaluate(field)
ranked = [r for r in results if r.get("rank")]
st.info(f"Taluk **{ctx['taluk']}** → district **{ctx['district'].title()}** (yields are district averages) · "
        f"prices: **{ctx['market'] or 'no local market data'}** APMC ({ctx['market_method']}) · {season} · "
        f"normal season rain {ctx['normal']['rain_main']:.0f} mm")
st.subheader("Ranked options")
if not ranked:
    st.warning("No crop passes the rules and data checks for this field. Talk to your RSK/KVK agronomist.")
else:
    st.dataframe(pd.DataFrame([{"rank": r["rank"], "crop": f"{r['label']} ({r['label_kn']})",
        "typical net Rs/acre": round(r["net_typical"]), "worst": round(r["net_worst"]), "best": round(r["net_best"]),
        "yield q/acre (typical)": round(r["yields"]["typical"], 2), "price base Rs/q": round(r["prices"]["base"]),
        "price basis": r["price_method"], "yield method": r["yield_method"], "cost Rs/acre": round(r["cost"])}
        for r in ranked]), hide_index=True)
    choice = st.selectbox("Scenario grid for", [r["label"] for r in ranked])
    r = next(x for x in ranked if x["label"] == choice)
    st.write("Net Rs/acre - rows: yield scenario, columns: price scenario (10th / 50th / 90th percentile of past errors)")
    st.dataframe(pd.DataFrame({p: {y: round(r["grid"][f"{y}/{p}"]) for y in ("bad", "typical", "good")}
                               for p in ("low", "base", "high")}))
    st.metric(f"Whole field ({area} acres), typical", f"Rs {r['net_typical'] * area:,.0f}")
st.subheader("Why")
for r in results:
    (st.info if r["feasible"] else st.caption)(template(r, ctx))
if use_llm:
    s = llm_summary(results, ctx); st.success(s) if s else st.warning("Ollama not reachable - templates shown.")
if ranked and st.button(f"Continue to Crop Nutrition Plan with {ranked[0]['label']}"):
    st.success("Handoff to CNP (stub): " + json.dumps(dict(taluk=ctx["taluk"], crop=ranked[0]["crop"], season=season)))
with st.expander("Model evaluation (walk-forward, real data)"):
    m = json.loads((MODELS / "metrics.json").read_text())
    st.write("Yield (q/acre)"); st.dataframe(pd.DataFrame(m["metrics"]["yield"]), hide_index=True)
    st.write("Harvest price (Rs/q)"); st.dataframe(pd.DataFrame(m["metrics"]["price"]), hide_index=True)
with st.expander("Data coverage for this district"):
    c = pd.read_csv(DATA / "coverage.csv"); st.dataframe(c[c.district == ctx["district"]], hide_index=True)
