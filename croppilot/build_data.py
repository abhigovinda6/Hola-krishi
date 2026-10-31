"""Build the canonical CSVs in data/ from public sources (data/sources/raw) + your drop-ins in data/incoming/.

    python build_data.py

Drop-in folders (newer files override older rows with the same key):
    data/incoming/apy/*.csv|xlsx                      aps.dac.gov.in "Crop Production Statistics" exports / data.gov.in APY CSV
    data/incoming/agmarknet/<crop>/*.csv|xlsx         agmarknet.gov.in price/arrival exports (crop id from data/crops.csv)
    data/incoming/weather/power_<district>.csv        NASA POWER monthly point CSV for a new district
Adding a crop: add a row to data/crops.csv (+ MSP rows in data/sources/msp_all.csv + a cost row in costs_cacp.csv).
Adding a district: add a row to data/districts.csv (HQ lat/lon) and its NASA POWER file; taluks come from taluks.csv.
"""
import glob, os, sys
import numpy as np, pandas as pd
from croppilot.config import (DATA, CROPS, MIN_YIELD_SEASONS, MIN_MEAN_AREA_HA, MIN_PRICE_SEASONS, load_districts)
from croppilot.io import load_apy, load_agmarknet, daily_to_monthly, validate_csv

SRC, RAW, INC = DATA / "sources", DATA / "sources" / "raw", DATA / "incoming"
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

def build_yields(districts):
    parts = [load_apy(RAW / "apy_mirror_all.csv", source="DES APY via data.gov.in (GitHub mirror)")]
    parts.append(load_apy(SRC / "ext" / "apy_idp_karnataka.csv", source="DES APY via India Data Portal (ODC-By)"))
    parts.append(load_apy(SRC / "ext" / "apy_upag_karnataka.csv", source="DES/UPAG via India Data Portal (ODC-By)"))
    for f in sorted(glob.glob(str(INC / "apy" / "*"))):
        parts.append(load_apy(f, source=f"incoming:{os.path.basename(f)}")); print("  + APY", f)
    y = pd.concat(parts)
    y = y[y.district.isin(districts)]
    bad = (y.yield_q_per_acre < 0.1) | (y.yield_q_per_acre > 40)   # <10 kg or >4 t/acre: implausible (unit/typing errors); dropped, logged
    if bad.any():
        y[bad].to_csv(SRC / "dropped_implausible_yields.csv", index=False)
        print(f"  dropped {int(bad.sum())} implausible yield rows (<0.1 q/acre) -> data/sources/dropped_implausible_yields.csv")
    y = y[~bad]
    return y.drop_duplicates(["district", "season", "crop", "crop_year"], keep="last").sort_values(
        ["crop", "season", "district", "crop_year"])

def _power(path, district):
    txt = open(path).read().split("-END HEADER-\n")[1]
    df = pd.read_csv(pd.io.common.StringIO(txt)).replace(-999, np.nan)
    rows = []
    for _, r in df.iterrows():
        for i, (m, dd) in enumerate(zip(MONTHS, DAYS), 1):
            rows.append(dict(district=district, year=int(r.YEAR), month=i, param=r.PARAMETER,
                             value=r[m] * dd if r.PARAMETER == "PRECTOTCORR" else r[m]))
    return rows

def build_weather(districts):
    rows = []
    for d in districts:
        f = INC / "weather" / f"power_{d.lower().replace(' ', '_')}.csv"
        f = f if f.exists() else RAW / f"power_{d.lower().replace(' ', '_')}.csv"
        rows += _power(f, d)
    w = (pd.DataFrame(rows).pivot_table(index=["district", "year", "month"], columns="param", values="value").reset_index()
           .rename(columns={"PRECTOTCORR": "rain_mm_power", "T2M_MAX": "tmax_c", "T2M_MIN": "tmin_c"}).round(2))
    w.columns.name = None
    imd = SRC / "imd_rain_monthly_districts.csv"
    if imd.exists():
        w = w.merge(pd.read_csv(imd), on=["district", "year", "month"], how="left")
    return w

def build_prices():
    parts = []
    for crop, c in CROPS.items():
        if c["price_source"] != "market": continue
        f = RAW / f"agmarknet_{c['agmarknet_key']}_karnataka_raw.csv"
        if not c['agmarknet_key'] or not f.exists(): continue   # crop only in the Hugging Face dump
        d = pd.read_csv(f, low_memory=False).rename(columns={"arrivals_tonnes": "arrivals_t"})
        tmp = DATA / f".tmp_{crop}.csv"
        d[["state", "district", "market", "variety", "group", "arrivals_t", "min_price", "max_price", "modal_price", "date"]
          ].to_csv(tmp, index=False, header=False)
        parts.append(load_agmarknet(tmp, crop=crop, source="AGMARKNET via iancovert/Agmarknet mirror")); tmp.unlink()
    hf = load_agmarknet(SRC / "ext" / "agmarknet_hf_karnataka.csv.gz", source="AGMARKNET via Hugging Face Shiva1567867 dump")
    hf = hf[hf.date.dt.year <= 2024]                     # 2025 is a partial year in the dump
    parts.append(hf)
    for f in sorted(glob.glob(str(INC / "agmarknet" / "*" / "*"))):
        crop = os.path.basename(os.path.dirname(f))
        parts.append(load_agmarknet(f, crop=crop, source=f"incoming:{os.path.basename(f)}")); print("  + AGMARKNET", f)
    d = pd.concat(parts).drop_duplicates(["crop", "market", "date"], keep="last")
    d["district"] = d.groupby("market").district.transform(lambda s: s.mode().iloc[0])   # one district per market
    return daily_to_monthly(d)

def build_coverage(y, prices, msp, costs):
    """Decide which (district, season, crop) combos have enough data. Writes reasons for exclusions."""
    msp_keys = set(msp.crop)
    rows = []
    for (d, s, c), g in y.groupby(["district", "season", "crop"]):
        n, area = len(g), g.area_ha.mean()
        pr = prices[(prices.crop == c) & (prices.district == d)]
        n_price = pr.groupby("market").year.nunique().max() if len(pr) else 0
        msp_ok = CROPS[c]["msp_key"][s] in msp_keys
        reasons = []
        if n < MIN_YIELD_SEASONS: reasons.append(f"only {n} yield seasons (<{MIN_YIELD_SEASONS})")
        if area < MIN_MEAN_AREA_HA: reasons.append(f"mean area {area:.0f} ha (<{MIN_MEAN_AREA_HA})")
        if not msp_ok: reasons.append("no MSP series")
        if c not in set(costs.crop): reasons.append("no cost row")
        price_basis = ("market" if CROPS[c]["price_source"] == "market" and n_price >= MIN_PRICE_SEASONS
                       else "msp" if msp_ok else "none")
        rows.append(dict(district=d, season=s, crop=c, yield_seasons=n, first_year=int(g.crop_year.min()),
                         last_year=int(g.crop_year.max()), mean_area_ha=round(area), market_price_seasons=int(n_price),
                         price_basis=price_basis, included=not reasons, exclusion_reason="; ".join(reasons)))
    return pd.DataFrame(rows)

def main():
    print("building canonical CSVs ...")
    districts = list(load_districts().index)
    y = build_yields(districts)
    prices = build_prices()
    msp = pd.read_csv(SRC / "msp_all.csv"); costs = pd.read_csv(SRC / "costs_cacp.csv")
    out = {"yields.csv": y, "weather_monthly.csv": build_weather(districts), "prices_monthly.csv": prices,
           "msp.csv": msp, "costs.csv": costs, "coverage.csv": build_coverage(y, prices, msp, costs)}
    for n, df in out.items():
        df.to_csv(DATA / n, index=False); print(f"  wrote data/{n}: {len(df)} rows")
    if not (DATA / "taluks.csv").exists() or "--taluks" in sys.argv:
        import subprocess; subprocess.run([sys.executable, str(SRC / "build_taluks.py")], check=True)
    cov = out["coverage.csv"]
    print(f"  coverage: {int(cov.included.sum())} of {len(cov)} district-season-crop combos included")
    names = list(out) + ["fields.csv", "taluks.csv", "districts.csv", "crops.csv"]
    bad = [r for n in names for r in validate_csv(DATA / n) if not r[1]]
    for b in bad: print("  VALIDATION FAIL:", b)
    print("validation:", "OK" if not bad else f"{len(bad)} problems")
    return 0 if not bad else 1

if __name__ == "__main__":
    sys.exit(main())
