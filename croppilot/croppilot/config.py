"""CropPilot (real-data, multi-location, multi-crop) - configuration.

Everything crop-specific lives in data/crops.csv (one row per crop = add a crop by adding a row).
Locations come from data/districts.csv (district HQ coordinates) and data/taluks.csv (taluk -> district -> market).

Agronomic thresholds in crops.csv are GENERAL guidance compiled from public sources (see the rule_sources column):
FAO Ecocrop (pH ranges), ICAR institutes (IIMR millets, IIPR pulses, IIOR oilseeds, IIWBR wheat, DGR groundnut,
IISR soybean), TNAU Agritech portal, UAS Dharwad / UAS Bangalore Packages of Practices. They are NOT field-validated
and should be reviewed by an agronomist.
"""
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA, MODELS = ROOT / "data", ROOT / "models"
STATE = "Karnataka"
SEASONS = ["Kharif", "Rabi"]
SOIL_TYPES = ["deep_black", "medium_black", "shallow_black", "red"]
IRRIGATION = ["none", "protective", "full"]          # protective = 1-2 irrigations in a dry spell
IRR_LEVEL = {"none": 0, "protective": 1, "full": 2}

# minimum-data thresholds for offering a (district, season, crop) combo
MIN_YIELD_SEASONS = 10          # seasons with area & production reported
MIN_MEAN_AREA_HA = 1000         # crop must be a real crop in that district
MIN_PRICE_SEASONS = 5           # seasons of market data at one market for a market-price model row

FARMGATE_DEDUCTION = 0.05       # assumption: APMC commission + handling
TRANSPORT_RS_PER_Q = 50         # assumption
CURRENT_CROP_YEAR = 2025        # Kharif 2025 / Rabi 2025-26 (latest MSP + cost available)
RICE_NOTE = "DES reports rice; converted to paddy with 67% outturn (yield_factor)."

# AGMARKNET district spellings -> DES/APY district names
AGMARK_DISTRICT = {"BANGALORE": "BENGALURU URBAN", "CHAMRAJNAGAR": "CHAMARAJANAGAR",
                   "KARWAR(UTTAR KANNAD)": "UTTAR KANNAD", "MADIKERI(KODAGU)": "KODAGU",
                   "MANGALORE(DAKSHIN KANNAD)": "DAKSHIN KANNAD",
                   "KALBURGI": "GULBARGA", "YADGIRI": "YADGIR"}

def _split(x):
    return [] if pd.isna(x) or str(x).strip() == "" else [s.strip() for s in str(x).split(";")]

def _months(x):
    return [tuple(int(v) for v in s.split("-")) for s in _split(x)]

def load_crops(path=None) -> dict:
    df = pd.read_csv(path or DATA / "crops.csv")
    out = {}
    for r in df.to_dict("records"):
        r["seasons"] = _split(r["seasons"])
        r["harvest"] = {"Kharif": _months(r.pop("harvest_kharif")), "Rabi": _months(r.pop("harvest_rabi"))}
        r["msp_key"] = {"Kharif": r.pop("msp_key_kharif"), "Rabi": r.pop("msp_key_rabi")}
        r["kharif_rainfed_soils"] = _split(r["kharif_rainfed_soils"])
        r["rabi_rainfed_soils"] = _split(r["rabi_rainfed_soils"])
        r["legume"], r["repeat_ok"] = bool(r["legume"]), bool(r["repeat_ok"])
        out[r["crop"]] = r
    return out

CROPS = load_crops()

def load_districts():
    return pd.read_csv(DATA / "districts.csv").set_index("district")

def district_label(d):
    return d.title()
