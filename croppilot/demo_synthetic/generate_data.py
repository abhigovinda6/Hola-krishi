"""Generate clearly-labelled SYNTHETIC data for the CropPilot MVP.
Nothing here is real data. Shapes/magnitudes are loosely realistic for Kharif in Karnataka."""
# HOW THIS FILE WORKS (beginner notes)
#   Simulates 15 Kharif seasons with cause and effect: rain deficit -> lower yield (softened by irrigation),
#   bad soil pH -> lower yield, big harvest -> lower price, costs rise ~6%/year. Random noise is added so
#   the problem isn't trivially predictable. Seed 42 = identical data every run.

import numpy as np, pandas as pd
from pathlib import Path
# OPTIONAL LEGACY DEMO: standalone synthetic generator (not used by the real-data pipeline).
DATA = Path(__file__).resolve().parent / "data"
NORMAL_RAIN_MM = 620
HARVEST_MONTH = {"paddy": 11, "maize": 10, "cotton": 12, "tur": 1, "groundnut": 10}
CROPS = {c: {} for c in HARVEST_MONTH}

rng = np.random.default_rng(42)
YEARS = list(range(2010, 2025))                      # 15 Kharif seasons
TALUKS = {  # name: (soil_ph, organic_carbon %, irrigated share, rain multiplier)
    "Davangere": (7.2, 0.55, 0.45, 1.00), "Harihara": (6.8, 0.62, 0.60, 1.05),
    "Channagiri": (6.3, 0.70, 0.30, 1.15), "Jagalur": (7.8, 0.40, 0.15, 0.80),
    "Honnali": (6.6, 0.65, 0.50, 1.10), "Chitradurga": (7.5, 0.45, 0.20, 0.85)}
BASE_YIELD = {"paddy": 22.0, "maize": 24.0, "cotton": 8.5, "tur": 4.5, "groundnut": 6.5}  # q/acre
RAIN_SENS = {"paddy": 0.9, "maize": 0.6, "cotton": 0.5, "tur": 0.3, "groundnut": 0.55}
OPT_PH = {"paddy": 6.3, "maize": 6.6, "cotton": 7.3, "tur": 7.0, "groundnut": 6.6}
BASE_PRICE = {"paddy": 1500, "maize": 1150, "cotton": 4200, "tur": 3800, "groundnut": 3900}  # Rs/q, 2010
BASE_COST = {"paddy": 21000, "maize": 15000, "cotton": 22000, "tur": 11000, "groundnut": 16000}  # Rs/acre, 2010

# 1) rainfall (Jun-Sep) per year per taluk
year_rain = {y: NORMAL_RAIN_MM * rng.lognormal(0, 0.22) for y in YEARS}
rain_rows = [dict(year=y, taluk=t, kharif_rain_mm=round(year_rain[y] * p[3] * rng.normal(1, 0.06), 1))
             for y in YEARS for t, p in TALUKS.items()]
rain = pd.DataFrame(rain_rows)

# 2) yields
yrows = []
for _, r in rain.iterrows():
    ph, oc, irr, _ = TALUKS[r.taluk]
    for c in CROPS:
        dev = r.kharif_rain_mm / NORMAL_RAIN_MM - 1
        # water stress damped by irrigation; very wet hurts (except paddy)
        stress = RAIN_SENS[c] * (1 - irr * 0.8) * min(dev, 0)
        excess = -0.35 * max(dev - 0.3, 0) if c != "paddy" else 0.1 * max(dev, 0)
        ph_pen = -0.08 * (ph - OPT_PH[c]) ** 2
        oc_eff = 0.5 * (oc - 0.55)
        trend = 0.012 * (r.year - 2010)
        y = BASE_YIELD[c] * (1 + stress + excess + ph_pen + oc_eff + trend) * rng.normal(1, 0.07)
        yrows.append(dict(year=r.year, taluk=r.taluk, crop=c, kharif_rain_mm=r.kharif_rain_mm,
                          soil_ph=ph, organic_carbon=oc, irrigated_share=irr,
                          yield_q_per_acre=round(max(y, 0.5), 2)))
yields = pd.DataFrame(yrows)

# 3) monthly mandi prices + arrivals (Jan 2010 - Dec 2025), cobweb-ish supply response
prows = []
for c in CROPS:
    hm = HARVEST_MONTH[c]
    log_shock = 0.0
    prod_idx_prev = 1.0
    for y in range(2010, 2026):
        rain_y = year_rain.get(y, NORMAL_RAIN_MM)
        prod_idx = (1 + RAIN_SENS[c] * 0.5 * (rain_y / NORMAL_RAIN_MM - 1)) * rng.normal(1, 0.05)
        for m in range(1, 13):
            months_from_harvest = (m - hm) % 12
            arrivals_season = np.exp(-months_from_harvest / 2.0) + 0.15
            # crop year: months before harvest belong to previous crop's supply
            supply = prod_idx if months_from_harvest < 8 else prod_idx_prev
            log_shock = 0.75 * log_shock + rng.normal(0, 0.035)
            infl = 1.055 ** (y - 2010 + (m - 1) / 12)
            seas = -0.07 * np.cos(2 * np.pi * months_from_harvest / 12)   # low at harvest
            price = BASE_PRICE[c] * infl * np.exp(seas - 0.45 * (supply - 1) + log_shock)
            arrivals = 1000 * supply * arrivals_season * rng.normal(1, 0.08)
            prows.append(dict(crop=c, year=y, month=m, modal_price_rs_q=round(price),
                              arrivals_tonnes=round(arrivals)))
        prod_idx_prev = prod_idx
prices = pd.DataFrame(prows)

# 4) cultivation cost per acre per year (paid-out costs incl. hired labour)
costs = pd.DataFrame([dict(year=y, crop=c,
                           cost_rs_per_acre=round(BASE_COST[c] * 1.06 ** (y - 2010) * rng.normal(1, 0.03)))
                      for y in range(2010, 2026) for c in CROPS])

# 5) sample field profiles
fields = pd.DataFrame([
    dict(field_id="F1", farmer="Ramesh", taluk="Harihara", area_acres=3.0, soil_ph=6.8,
         organic_carbon=0.62, irrigation="canal", previous_crop="paddy"),
    dict(field_id="F2", farmer="Lakshmi", taluk="Jagalur", area_acres=5.0, soil_ph=7.9,
         organic_carbon=0.38, irrigation="none", previous_crop="cotton"),
    dict(field_id="F3", farmer="Suresh", taluk="Channagiri", area_acres=2.0, soil_ph=6.1,
         organic_carbon=0.72, irrigation="borewell", previous_crop="maize"),
])

if __name__ == "__main__":
    DATA.mkdir(exist_ok=True)
    for name, df in [("rainfall", rain), ("yields", yields), ("mandi_prices", prices),
                     ("costs", costs), ("field_profiles", fields)]:
        df.to_csv(DATA / f"{name}.csv", index=False)
        print(f"wrote data/{name}.csv  ({len(df)} rows)")
    (DATA / "README_SYNTHETIC.txt").write_text(
        "ALL FILES IN THIS FOLDER ARE SYNTHETIC, generated by generate_data.py (seed 42).\n"
        "They are NOT real IMD, AGMARKNET or cost-of-cultivation data. Replace with real data before any real use.\n")
