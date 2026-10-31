"""Convert India Data Portal APY (DES, ODC-By) Karnataka rows to the data.gov.in mirror layout used by load_apy.
- District names -> pre-2018 DES names; Vijayanagara folded into BELLARY, Bengaluru South (renamed Ramanagara) -> RAMANAGARA
- Year '1997-1998' -> 1997 (sowing year, same convention as the mirror)
- Areas/production summed when two new districts map to one old district.
"""
import pandas as pd, sys
from pathlib import Path
S = Path(__file__).parent
MAP = {"Bagalkote":"BAGALKOT","Ballari":"BELLARY","Vijayanagara":"BELLARY","Belagavi":"BELGAUM","Bengaluru Rural":"BANGALORE RURAL",
 "Bengaluru South":"RAMANAGARA","Bengaluru Urban":"BENGALURU URBAN","Bidar":"BIDAR","Chamarajanagar":"CHAMARAJANAGAR",
 "Chikkaballapura":"CHIKBALLAPUR","Chikkamagaluru":"CHIKMAGALUR","Chitradurga":"CHITRADURGA","Dakshina Kannada":"DAKSHIN KANNAD",
 "Davanagere":"DAVANGERE","Dharwad":"DHARWAD","Gadag":"GADAG","Hassan":"HASSAN","Haveri":"HAVERI","Kalaburagi":"GULBARGA",
 "Kodagu":"KODAGU","Kolar":"KOLAR","Koppal":"KOPPAL","Mandya":"MANDYA","Mysuru":"MYSORE","Raichur":"RAICHUR",
 "Shivamogga":"SHIMOGA","Tumakuru":"TUMKUR","Udupi":"UDUPI","Uttara Kannada":"UTTAR KANNAD","Vijayapura":"BIJAPUR","Yadgir":"YADGIR"}
d = pd.read_csv(S/"idp_apy.csv", low_memory=False)
d = d[d.state_name=="Karnataka"].copy()
assert set(d.area_unit)=={"Hectare"} and set(d.production_unit)=={"Tonnes"}
d["District_Name"] = d.district_name.map(MAP); assert d.District_Name.notna().all()
d["Crop_Year"] = d.year.str[:4].astype(int)
d["Crop"] = d.crop_name.replace({"Moong(Green Gram)":"Moong(Green Gram)"})
g = (d.groupby(["District_Name","Crop_Year","season","Crop"], as_index=False)
       .agg(Area=("area", lambda s: s.sum(min_count=1)), Production=("production", lambda s: s.sum(min_count=1))))
g.insert(0,"State_Name","Karnataka"); g = g.rename(columns={"season":"Season"})
g.to_csv(S/"ext"/"apy_idp_karnataka.csv", index=False); print(len(g), g.Crop_Year.min(), g.Crop_Year.max())

# UPAG (same DES series, ha / tonnes; identical to APY on the 2013-2022 overlap) -> only years APY lacks (2023-24, 2024-25)
u = pd.read_csv(S/"idp_upag.csv"); u = u[u.state_name.str.contains("Karnataka")].copy()
u["Crop_Year"] = u.year.str[:4].astype(int); u = u[u.Crop_Year > g.Crop_Year.max()]
u["District_Name"] = u.district_name.map(MAP); assert u.District_Name.notna().all()
u["Crop"] = u.crop_name.replace({"Tur":"Arhar/Tur","Moong":"Moong(Green Gram)","Soybean":"Soyabean"})
h = (u.groupby(["District_Name","Crop_Year","season","Crop"], as_index=False)
       .agg(Area=("area", lambda s: s.sum(min_count=1)), Production=("production", lambda s: s.sum(min_count=1))))
h.insert(0,"State_Name","Karnataka"); h = h.rename(columns={"season":"Season"})
h.to_csv(S/"ext"/"apy_upag_karnataka.csv", index=False); print("upag", len(h), h.Crop_Year.min(), h.Crop_Year.max())
