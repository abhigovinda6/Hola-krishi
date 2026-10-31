"""Data checks, model walk-forward reports and recommendation sanity checks."""
import pandas as pd
from croppilot.config import DATA, FARMGATE_DEDUCTION, TRANSPORT_RS_PER_Q
from croppilot.io import validate_csv
CANONICAL = ["yields.csv", "weather_monthly.csv", "prices_monthly.csv", "msp.csv", "costs.csv", "coverage.csv",
             "fields.csv", "taluks.csv", "districts.csv", "crops.csv"]

def check_data():
    rows = [r for n in CANONICAL for r in validate_csv(DATA / n)]
    # cross-file consistency
    t, d, c = pd.read_csv(DATA / "taluks.csv"), pd.read_csv(DATA / "districts.csv"), pd.read_csv(DATA / "crops.csv")
    cov, cost = pd.read_csv(DATA / "coverage.csv"), pd.read_csv(DATA / "costs.csv")
    rows.append(("taluks map to known districts", set(t.district) <= set(d.district), ""))
    rows.append(("every crop has a cost row", set(c.crop) <= set(cost.crop), str(set(c.crop) - set(cost.crop))))
    rows.append(("coverage has included combos", int(cov.included.sum()) > 0, f"{int(cov.included.sum())} included"))
    return pd.DataFrame(rows, columns=["check", "passed", "detail"])

def check_recommendation(results, ctx):
    out = []
    ranked = [r for r in results if "rank" in r]
    out.append(("no infeasible / no-data crop ranked", all(r["feasible"] and r["data_ok"] for r in ranked), ""))
    out.append(("ranks 1..n", [r["rank"] for r in ranked] == list(range(1, len(ranked) + 1)), ""))
    out.append(("sorted by score", all(a["score"] >= b["score"] for a, b in zip(ranked, ranked[1:])), ""))
    for r in ranked:
        p, y = r["prices"], r["yields"]
        out.append((f"{r['crop']}: price low<=base<=high", p["low"] <= p["base"] <= p["high"], f"{p}"))
        out.append((f"{r['crop']}: yield bad<=typical<=good", y["bad"] <= y["typical"] <= y["good"], f"{y}"))
        for s in ("bad", "typical", "good"):
            fg = p["base"] * (1 - FARMGATE_DEDUCTION) - TRANSPORT_RS_PER_Q
            out.append((f"{r['crop']}: arithmetic {s}/base", abs(y[s] * fg - r["cost"] - r["grid"][f"{s}/base"]) < 1e-6, ""))
            g = [r["grid"][f"{s}/{q}"] for q in ("low", "base", "high")]
            out.append((f"{r['crop']}: net {s} low<=base<=high", g[0] <= g[1] <= g[2], ""))
        out.append((f"{r['crop']}: worst<=typical<=best", r["net_worst"] <= r["net_typical"] <= r["net_best"], ""))
    return out
