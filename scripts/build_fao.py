"""Extract sugar beet / sugar cane production by country from the FAOSTAT
bulk file "Production_Crops_Livestock_E_All_Data_(Normalized).csv".

Usage: python3 scripts/build_fao.py <path-to-csv> <year> > data/fao_sugar.json
"""
import csv, json, sys

path, year = sys.argv[1], sys.argv[2]
ITEMS = {"157": "beet", "156": "cane"}
EXCLUDE_AREA = {"351"}  # "China" aggregate; mainland (41) and Taiwan (214) are kept separately
rows = {}
with open(path, encoding="utf-8", newline="") as f:
    for r in csv.DictReader(f):
        if r["Item Code"] not in ITEMS or r["Element"] != "Production" or r["Year"] != year:
            continue
        if int(r["Area Code"]) >= 5000 or r["Area Code"] in EXCLUDE_AREA:
            continue
        v = float(r["Value"] or 0)
        if v <= 0:
            continue
        m49 = r["Area Code (M49)"].lstrip("'")
        e = rows.setdefault(m49, {"m49": m49, "name": r["Area"]})
        e[ITEMS[r["Item Code"]]] = round(v)
        e[ITEMS[r["Item Code"]] + "_flag"] = r["Flag"]
out = {
    "source": "FAO. FAOSTAT: Crops and livestock products (QCL), Production quantity, items 'Sugar beet' (0157) and 'Sugar cane' (0156).",
    "license": "CC BY 4.0",
    "year": int(year),
    "unit": "t",
    "countries": sorted(rows.values(), key=lambda e: e["m49"]),
}
json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))
