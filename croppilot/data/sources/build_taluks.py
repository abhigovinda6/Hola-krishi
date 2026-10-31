"""Build taluk -> APY district -> APMC market mapping.
Taluk list: Wikipedia "List of taluks of Karnataka" (wikitext via MediaWiki API, cites karnataka.gov.in).
District names are mapped to the PRE-2020 DES/APY district they belonged to (e.g. Vijayanagara -> BELLARY).
Market: an AGMARKNET market (from our price data) in the same APY district whose name matches the taluk
('name match'); otherwise the district market with the most price records ('district main market').
No geographic distance is computed - this is a documented approximation."""
import json, re, urllib.request, difflib
from pathlib import Path
import pandas as pd
H = Path(__file__).resolve().parent
MOD2APY = {"bagalkote": "BAGALKOT", "ballari": "BELLARY", "vijayanagara": "BELLARY", "belagavi": "BELGAUM",
           "bengaluru rural": "BANGALORE RURAL", "bengaluru urban": "BENGALURU URBAN", "bidar": "BIDAR",
           "vijayapura": "BIJAPUR", "chamarajanagar": "CHAMARAJANAGAR", "chamarajanagara": "CHAMARAJANAGAR",
           "chikkaballapura": "CHIKBALLAPUR", "chikkaballapur": "CHIKBALLAPUR", "chikkamagaluru": "CHIKMAGALUR", "chikkmagaluru": "CHIKMAGALUR", "koppala": "KOPPAL", "raichuru": "RAICHUR",
           "chitradurga": "CHITRADURGA", "dakshina kannada": "DAKSHIN KANNAD", "davanagere": "DAVANGERE",
           "dharwad": "DHARWAD", "gadag": "GADAG", "kalaburagi": "GULBARGA", "hassan": "HASSAN", "haveri": "HAVERI",
           "kodagu": "KODAGU", "kolar": "KOLAR", "koppal": "KOPPAL", "mandya": "MANDYA", "mysuru": "MYSORE",
           "raichur": "RAICHUR", "ramanagara": "RAMANAGARA", "bengaluru south": "RAMANAGARA", "shivamogga": "SHIMOGA",
           "tumakuru": "TUMKUR", "udupi": "UDUPI", "uttara kannada": "UTTAR KANNAD", "yadgir": "YADGIR", "yadagiri": "YADGIR"}

def fetch():
    url = "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_taluks_of_Karnataka&prop=wikitext&format=json"
    req = urllib.request.Request(url, headers={"User-Agent": "CropPilot-hackathon/1.0"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())["parse"]["wikitext"]["*"]

def parse(txt):
    rows, dist = [], None
    table = txt.split("{| class=\"wikitable sortable\"", 1)[1].split("|}", 1)[0]
    for line in table.split("\n"):
        links = re.findall(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", line)
        if not links: continue
        names = [(b or a).strip() for a, b in links]
        targets = [a.lower() for a, _ in links]
        i = 0
        if "district" in targets[0]:
            key = names[0].lower().replace(" district", "")
            dist = MOD2APY.get(key); i = 1
        for n in names[i:]:
            n = re.sub(r",.*", "", n).strip()
            if dist and n and n[0].isupper():
                rows.append((dist, n))
    return pd.DataFrame(rows, columns=["district", "taluk"]).drop_duplicates()

def main():
    t = parse(fetch())
    prices = pd.read_csv(H.parent / "prices_monthly.csv")
    main_mkt = prices.groupby(["district", "market"]).size().reset_index(name="n").sort_values("n").groupby("district").last().market
    out = []
    for r in t.itertuples():
        mk = prices[prices.district == r.district].market.unique()
        m = difflib.get_close_matches(r.taluk.lower(), [x.lower() for x in mk], n=1, cutoff=0.8)
        if m:
            market = next(x for x in mk if x.lower() == m[0]); how = "name match"
        elif r.district in main_mkt:
            market, how = main_mkt[r.district], "district main market"
        else:
            market, how = "", "no market data"
        out.append(dict(taluk=r.taluk, district=r.district, market=market, market_method=how,
                        source="Wikipedia: List of taluks of Karnataka (fetched 2026-10-22)"))
    df = pd.DataFrame(out).drop_duplicates(["district", "taluk"])
    df.to_csv(H.parent / "taluks.csv", index=False)
    print(len(df), "taluks;", df.district.nunique(), "districts;", df.market_method.value_counts().to_dict())

if __name__ == "__main__":
    main()
