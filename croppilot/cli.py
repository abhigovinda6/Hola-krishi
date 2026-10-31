"""CLI demo on REAL data.
  python cli.py --all                       # sample fields in data/fields.csv
  python cli.py --field V1 [--llm]
  python cli.py --json '{"taluk":"Indi","season":"Rabi","area_acres":2,"soil_ph":7.8,"soil_type":"deep_black","irrigation":"none"}'
  python cli.py --coverage BIJAPUR          # which crops are offered in a district, and why others are not
"""
import argparse, json, sys, pandas as pd
from croppilot.config import DATA
from croppilot.schema import validate_field
from croppilot.engine import CropPilot
from croppilot.explain import template, llm_summary

def run(cp, field, use_llm):
    print("=" * 110)
    try:
        f = validate_field(field)
    except ValueError as e:
        print(f"ERROR: {e}"); return False
    results, ctx = cp.evaluate(f)
    print(f"{f['field_id']} ({f['farmer']}) | taluk {ctx['taluk']} -> district {ctx['district']} | market "
          f"{ctx['market'] or '(none)'} [{ctx['market_method']}] | {ctx['season']} | pH {f['soil_ph']} | {f['soil_type']} | "
          f"irrigation {f['irrigation']} | previous {f['previous_crop']}")
    print(f"Normal season rain (district, NASA POWER): {ctx['normal']['rain_main']:.0f} mm. REAL public data - yields are DISTRICT averages.\n")
    for r in results:
        print(" - " + template(r, ctx))
    ranked = [r for r in results if r["feasible"]]
    if ranked:
        b = ranked[0]
        g = pd.DataFrame({p: {y: round(b["grid"][f"{y}/{p}"]) for y in ("bad", "typical", "good")} for p in ("low", "base", "high")})
        print(f"\nNet Rs/acre for {b['label']} (rows = yield scenario, columns = price scenario):\n{g.to_string()}")
        print(f"Whole field ({f['area_acres']} acres), typical: Rs {b['net_typical'] * f['area_acres']:,.0f}")
        print(f"NEXT ACTION: continue to Polaris Crop Nutrition Plan (CNP) with '{b['crop']}'.")
    if use_llm:
        s = llm_summary(results, ctx); print("\nLLM summary:", s or "(Ollama not reachable - template explanations above)")
    return True

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--field"); ap.add_argument("--all", action="store_true"); ap.add_argument("--json")
    ap.add_argument("--coverage"); ap.add_argument("--llm", action="store_true")
    a = ap.parse_args()
    if a.coverage:
        c = pd.read_csv(DATA / "coverage.csv"); c = c[c.district == a.coverage.upper()]
        print(c[["season", "crop", "included", "yield_seasons", "mean_area_ha", "price_basis", "exclusion_reason"]].to_string(index=False))
        sys.exit(0)
    fields = [json.loads(a.json)] if a.json else pd.read_csv(DATA / "fields.csv").to_dict("records")
    if a.field: fields = [f for f in fields if f["field_id"] == a.field]
    if not fields: sys.exit(f"ERROR: field '{a.field}' not found")
    cp = CropPilot()
    sys.exit(0 if all([run(cp, f, a.llm) for f in fields]) else 2)
