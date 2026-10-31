"""Geocode district headquarters with OpenStreetMap Nominatim (public API, 1 request/second, identified UA)."""
import json, time, urllib.parse, urllib.request, csv
HQ = {"BAGALKOT": "Bagalkot", "BANGALORE RURAL": "Doddaballapura", "BELGAUM": "Belagavi", "BELLARY": "Ballari",
      "BENGALURU URBAN": "Bengaluru", "BIDAR": "Bidar", "BIJAPUR": "Vijayapura", "CHAMARAJANAGAR": "Chamarajanagar",
      "CHIKBALLAPUR": "Chikkaballapur", "CHIKMAGALUR": "Chikkamagaluru", "CHITRADURGA": "Chitradurga",
      "DAKSHIN KANNAD": "Mangaluru", "DAVANGERE": "Davanagere", "DHARWAD": "Dharwad", "GADAG": "Gadag",
      "GULBARGA": "Kalaburagi", "HASSAN": "Hassan", "HAVERI": "Haveri", "KODAGU": "Madikeri", "KOLAR": "Kolar",
      "KOPPAL": "Koppal", "MANDYA": "Mandya", "MYSORE": "Mysuru", "RAICHUR": "Raichur", "RAMANAGARA": "Ramanagara",
      "SHIMOGA": "Shivamogga", "TUMKUR": "Tumakuru", "UDUPI": "Udupi", "UTTAR KANNAD": "Karwar", "YADGIR": "Yadgir"}
rows = []
for d, town in HQ.items():
    q = urllib.parse.urlencode({"q": f"{town}, Karnataka, India", "format": "json", "limit": 1})
    req = urllib.request.Request(f"https://nominatim.openstreetmap.org/search?{q}", headers={"User-Agent": "CropPilot-hackathon/1.0 (research)"})
    r = json.loads(urllib.request.urlopen(req, timeout=30).read())
    rows.append(dict(district=d, hq_town=town, lat=round(float(r[0]["lat"]), 4), lon=round(float(r[0]["lon"]), 4), geocoder="OSM Nominatim"))
    print(rows[-1], flush=True); time.sleep(1.1)
with open("district_hq_coords.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)
