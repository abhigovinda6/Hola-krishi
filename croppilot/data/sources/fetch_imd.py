"""Download IMD gridded rainfall for every district HQ in district_hq_coords.csv.
Download IMD 0.25deg gridded daily rainfall (Pai et al. 2014) via imdlib from imdpune.gov.in and
extract monthly rainfall for district HQ points (mean of 3x3 grid cells around the HQ). Deletes .grd after use."""
import os, shutil, pandas as pd, imdlib as imd
LOC = {r.district: (r.lat, r.lon) for r in pd.read_csv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "district_hq_coords.csv")).itertuples()}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "imd_rain_monthly_districts.csv")
out, tmp = [], "/tmp/imd_dl"
for y in range(1997, 2025):
    os.makedirs(tmp, exist_ok=True)
    imd.get_data("rain", y, y, fn_format="yearwise", file_dir=tmp)
    ds = imd.open_data("rain", y, y, fn_format="yearwise", file_dir=tmp).get_xarray().rain
    ds = ds.where(ds >= 0)
    for d, (la, lo) in LOC.items():
        box = ds.sel(lat=slice(la - 0.3, la + 0.3), lon=slice(lo - 0.3, lo + 0.3)).mean(["lat", "lon"])
        mon = box.resample(time="MS").sum(min_count=1)
        for t, v in zip(mon.time.values, mon.values):
            t = pd.Timestamp(t); out.append(dict(district=d, year=t.year, month=t.month, rain_mm_imd=round(float(v), 1)))
    shutil.rmtree(tmp); print("done", y, flush=True)
pd.DataFrame(out).to_csv(OUT, index=False)
