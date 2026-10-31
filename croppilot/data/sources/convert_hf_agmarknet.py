"""Karnataka rows of the Hugging Face AGMARKNET daily dump (Shiva1567867/AGMARK_Commodity_Pricing_..., MIT-tagged
redistribution of agmarknet.gov.in data) -> one CSV with official-export column names, our 14 crops only, deduplicated.
Input: /workspace/hfprices/ka_*.csv (grep 'Karnataka' of each yearly file; some files have a leading index column)."""
import glob, pandas as pd
from pathlib import Path
COLS = ["State","District","Market","Commodity","Variety","Grade","Arrival_Date","Min_Price","Max_Price","Modal_Price","Commodity_Code"]
KEEP = {"Wheat","Maize","Arhar (Tur/Red Gram)(Whole)","Green Gram (Moong)(Whole)","Black Gram (Urd Beans)(Whole)","Soyabean",
        "Paddy(Dhan)(Common)","Jowar(Sorghum)","Bengal Gram(Gram)(Whole)","Groundnut","Sunflower","Ragi (Finger Millet)",
        "Bajra(Pearl Millet/Cumbu)","Safflower"}
parts = []
for f in sorted(glob.glob("/workspace/hfprices/ka_*.csv")):
    d = pd.read_csv(f, header=None, low_memory=False, dtype=str)
    i = 1 if str(d.iloc[0, 0]).strip() != "Karnataka" else 0
    d = d.iloc[:, i:i + 11]
    d.columns = COLS; d = d[(d.State.str.strip() == "Karnataka") & d.Commodity.str.strip().isin(KEEP)]
    parts.append(d); print(f, len(d))
d = pd.concat(parts, ignore_index=True)
for c in ["Min_Price","Max_Price","Modal_Price"]: d[c] = pd.to_numeric(d[c], errors="coerce")
iso = d.Arrival_Date.str.contains("-", na=False)
d["Arrival_Date"] = pd.concat([pd.to_datetime(d.Arrival_Date[iso], format="%Y-%m-%d", errors="coerce"),
                               pd.to_datetime(d.Arrival_Date[~iso], format="%d/%m/%Y", errors="coerce")])
d = d.dropna(subset=["Arrival_Date","Modal_Price"]).drop_duplicates(["District","Market","Commodity","Variety","Grade","Arrival_Date"])
d["Arrival_Date"] = d.Arrival_Date.dt.strftime("%d/%m/%Y")
out = Path(__file__).parent / "ext" / "agmarknet_hf_karnataka.csv.gz"
d.drop(columns=["Commodity_Code"]).to_csv(out, index=False); print(out, len(d))
y = pd.to_datetime(d.Arrival_Date, dayfirst=True).dt.year
print(pd.crosstab(d.Commodity, y).to_string())
print(sorted(d.District.str.upper().unique()))
