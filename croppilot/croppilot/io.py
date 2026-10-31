"""Loaders + converters for public data formats, and canonical-CSV validation.

Canonical CSVs live in data/ (schemas documented in data/SCHEMAS.md). Converters accept:
  * DES APY  - the data.gov.in / GitHub-mirror CSV (State_Name, District_Name, Crop_Year, Season, Crop, Area, Production)
             - the official aps.dac.gov.in "Crop Production Statistics" Excel/CSV export (State, District, Crop, Year,
               Season, Area (Hectare), Production (Tonne), Yield (Tonne/Hectare)) - column names are matched loosely.
  * AGMARKNET - the iancovert mirror (headerless, 10 columns)
             - the official agmarknet.gov.in report export (District Name, Market Name, Commodity, Variety, Grade,
               Min/Max/Modal Price (Rs./Quintal), Price Date, optional Arrivals (Tonnes)).
"""
import re
from pathlib import Path
import pandas as pd

ACRE_PER_HA = 2.47105

from croppilot.config import CROPS, SEASONS, AGMARK_DISTRICT, STATE
# APY crop names (as DES writes them, from data/crops.csv) -> our crop ids
APY_CROPS = {c["apy_name"].strip().lower(): k for k, c in CROPS.items()}
# AGMARKNET commodity names (official export) -> crop ids
AGMARK_CROPS = {"wheat": "wheat", "maize": "maize", "arhar (tur/red gram)(whole)": "tur", "arhar(tur/red gram)(whole)": "tur",
                "green gram (moong)(whole)": "moong", "green gram(moong)(whole)": "moong",
                "black gram (urd beans)(whole)": "urad", "black gram(urd beans)(whole)": "urad",
                "soyabean": "soybean", "paddy(dhan)(common)": "paddy", "jowar(sorghum)": "jowar",
                "bengal gram(gram)(whole)": "gram", "groundnut": "groundnut", "sunflower": "sunflower", "ragi (finger millet)": "ragi",
                "bajra(pearl millet/cumbu)": "bajra", "safflower": "safflower"}

def _norm(s): return re.sub(r"[^a-z]", "", str(s).lower())

def _pick(df, *cands):
    """Find a column whose normalised name starts with any candidate (loose matching for official exports)."""
    cols = {_norm(c): c for c in df.columns}
    for cand in cands:                      # exact (normalised) match first
        if _norm(cand) in cols:
            return cols[_norm(cand)]
    for cand in cands:
        for n, c in cols.items():
            if n.startswith(_norm(cand)):
                return c
    raise KeyError(f"none of {cands} in columns {list(df.columns)}")

def _read_any(path):
    p = str(path).lower()
    if p.endswith((".xls", ".xlsx")):
        return pd.read_excel(path)
    return pd.read_csv(path, low_memory=False)

# ---------------- APY ----------------
def load_apy(path, state=STATE, source="DES APY") -> pd.DataFrame:
    """Return canonical yield rows: district, crop, crop_year, season, area_ha, production_t, yield_q_per_acre, source"""
    df = _read_any(path)
    df.columns = [str(c).strip() for c in df.columns]
    st, di = _pick(df, "State_Name", "State"), _pick(df, "District_Name", "District")
    yr, se, cr = _pick(df, "Crop_Year", "Year"), _pick(df, "Season"), _pick(df, "Crop")
    ar, pr = _pick(df, "Area"), _pick(df, "Production")
    out = pd.DataFrame({
        "state": df[st].astype(str).str.strip(), "district": df[di].astype(str).str.strip().str.upper(),
        # "2015-16" -> 2015 ; 1997 -> 1997  (crop_year = calendar year in which the rabi crop is SOWN)
        "crop_year": df[yr].astype(str).str.extract(r"(\d{4})")[0].astype(float),
        "season": df[se].astype(str).str.strip().str.title(),
        "crop_raw": df[cr].astype(str).str.strip().str.lower(),
        "area_ha": pd.to_numeric(df[ar], errors="coerce"), "production_t": pd.to_numeric(df[pr], errors="coerce")})
    out = out[(out.state.str.lower() == state.lower()) & out.season.isin(SEASONS) & out.crop_raw.isin(APY_CROPS)]
    out["district"] = out.district.str.replace(r"^\d+\.\s*", "", regex=True)   # official export prefixes "1. "
    out["crop"] = out.crop_raw.map(APY_CROPS)
    out = out.dropna(subset=["crop_year", "area_ha", "production_t"])
    out = out[(out.area_ha > 0) & (out.production_t > 0)]
    out["crop_year"] = out.crop_year.astype(int)
    out = out[out.apply(lambda r: r.season in CROPS[r.crop]["seasons"], axis=1)]
    fac = out.crop.map(lambda c: CROPS[c]["yield_factor"])                                   # rice -> paddy
    out["yield_q_per_acre"] = (out.production_t * fac * 10 / out.area_ha / ACRE_PER_HA).round(3)  # t/ha -> q/acre
    out["source"] = source
    return out[["district", "crop", "crop_year", "season", "area_ha", "production_t", "yield_q_per_acre", "source"]]

# ---------------- AGMARKNET ----------------
MIRROR_COLS = ["state", "district", "market", "variety", "group", "arrivals_t", "min_price", "max_price", "modal_price", "date"]

def load_agmarknet(path, crop=None, source="AGMARKNET") -> pd.DataFrame:
    """Return canonical DAILY rows: crop, district, market, date, min/max/modal price (Rs/q), arrivals_t"""
    head = pd.read_csv(path, nrows=1, header=None) if str(path).endswith(".csv") else None
    if head is not None and not any("price" in str(x).lower() for x in head.iloc[0]):
        df = pd.read_csv(path, header=None, names=MIRROR_COLS, low_memory=False)       # iancovert mirror
        df["commodity"] = crop
    else:
        raw = _read_any(path); raw.columns = [str(c).strip() for c in raw.columns]
        def opt(*c):
            try: return raw[_pick(raw, *c)]
            except KeyError: return None
        df = pd.DataFrame({"state": opt("State Name", "State"), "district": opt("District Name", "District"),
                           "market": raw[_pick(raw, "Market Name", "Market")],
                           "commodity": opt("Commodity") if opt("Commodity") is not None else crop,
                           "arrivals_t": opt("Arrivals"), "min_price": raw[_pick(raw, "Min Price", "Min_x0020_Price", "Min")],
                           "max_price": raw[_pick(raw, "Max Price", "Max_x0020_Price", "Max")],
                           "modal_price": raw[_pick(raw, "Modal Price", "Modal_x0020_Price", "Modal")],
                           "date": raw[_pick(raw, "Price Date", "Reported Date", "Arrival_Date", "Date")]})
    df["crop"] = df.commodity.astype(str).str.strip().str.lower().map(lambda c: AGMARK_CROPS.get(c, crop))
    for c in ["arrivals_t", "min_price", "max_price", "modal_price"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["date"] = pd.to_datetime(df.date, errors="coerce", dayfirst=True, format="mixed")
    df["district"] = df.district.astype(str).str.strip().str.upper().replace(AGMARK_DISTRICT)
    df["market"] = df.market.astype(str).str.strip()
    df = df.dropna(subset=["date", "modal_price", "crop"]).drop_duplicates()
    df = df[df.modal_price.between(300, 20000)]
    if df.date.dt.year.min() < 1990: df = df[df.date.dt.year >= 1990]           # drop mis-keyed entries
    df["source"] = source
    return df[["crop", "district", "market", "date", "min_price", "max_price", "modal_price", "arrivals_t", "source"]]

def daily_to_monthly(d: pd.DataFrame) -> pd.DataFrame:
    d = d.assign(year=d.date.dt.year, month=d.date.dt.month)
    return (d.groupby(["crop", "district", "market", "year", "month"])
             .agg(modal_price_rs_q=("modal_price", "median"), min_price_rs_q=("min_price", "min"),
                  max_price_rs_q=("max_price", "max"), arrivals_t=("arrivals_t", "sum"),
                  reporting_days=("date", "nunique"), source=("source", "first")).reset_index())

# ---------------- canonical CSV validation ----------------
SCHEMAS = {  # file: {column: (dtype, min, max)}  None = no bound
    "yields.csv": {"district": ("str",), "crop": ("str",), "season": ("str",), "crop_year": ("int", 1990, 2035), "area_ha": ("num", 0.01, 2e6),
                   "production_t": ("num", 0.01, 5e6), "yield_q_per_acre": ("num", 0.05, 40)},
    "weather_monthly.csv": {"district": ("str",), "year": ("int", 1990, 2035), "month": ("int", 1, 12),
                            "rain_mm_power": ("num", 0, 2000), "tmax_c": ("num", 10, 50), "tmin_c": ("num", -5, 40)},
    "prices_monthly.csv": {"crop": ("str",), "market": ("str",), "year": ("int", 1990, 2035), "month": ("int", 1, 12),
                           "modal_price_rs_q": ("num", 300, 20000)},
    "msp.csv": {"crop": ("str",), "crop_year": ("int", 1990, 2035), "msp_rs_q": ("num", 100, 20000)},
    "costs.csv": {"crop": ("str",), "cost_rs_per_q": ("num", 100, 20000)},
    "fields.csv": {"field_id": ("str",), "taluk": ("str",), "season": ("str",)},
    "taluks.csv": {"taluk": ("str",), "district": ("str",)},
    "districts.csv": {"district": ("str",), "lat": ("num", 11, 19), "lon": ("num", 73, 79)},
    "coverage.csv": {"district": ("str",), "season": ("str",), "crop": ("str",)},
    "crops.csv": {"crop": ("str",), "apy_name": ("str",), "ph_min": ("num", 3, 9), "ph_max": ("num", 5, 10)},
}
KEYS = {"yields.csv": ["district", "season", "crop", "crop_year"], "weather_monthly.csv": ["district", "year", "month"],
        "prices_monthly.csv": ["crop", "market", "year", "month"], "msp.csv": ["crop", "crop_year"],
        "costs.csv": ["crop"], "fields.csv": ["field_id"], "taluks.csv": ["district", "taluk"],
        "districts.csv": ["district"], "coverage.csv": ["district", "season", "crop"], "crops.csv": ["crop"]}

def validate_csv(path: Path) -> list:
    """Return list of (check, passed, detail) for one canonical CSV."""
    name, res = Path(path).name, []
    df = pd.read_csv(path)
    res.append((f"{name}: has rows", len(df) > 0, f"{len(df)} rows"))
    for col, spec in SCHEMAS[name].items():
        if col not in df:
            res.append((f"{name}: column '{col}' present", False, "missing")); continue
        na = int(df[col].isna().sum())
        res.append((f"{name}: '{col}' no missing", na == 0, f"{na} NaN"))
        if len(spec) == 3:
            bad = int((~df[col].dropna().between(spec[1], spec[2])).sum())
            res.append((f"{name}: '{col}' in [{spec[1]}, {spec[2]}]", bad == 0, f"{bad} out of range"))
    k = [c for c in KEYS[name] if c in df]
    d = int(df.duplicated(k).sum())
    res.append((f"{name}: unique {k}", d == 0, f"{d} duplicates"))
    return res
