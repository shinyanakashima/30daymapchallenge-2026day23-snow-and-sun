"""Tag each exploded island polygon (N03 municipalities of Kagoshima's southern
islands and Okinawa) with the sugarcane island it belongs to.

Usage: python3 scripts/assign_islands.py <exploded.geojson> data/japan_sugar.json <out.geojson>
"""
import json, sys

geo = json.load(open(sys.argv[1], encoding="utf-8"))
jp = json.load(open(sys.argv[2], encoding="utf-8"))
islands = jp["cane"]["islands"]

def centroid(geom):
    xs, ys = [], []
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for poly in polys:
        for x, y in poly[0]:
            xs.append(x); ys.append(y)
    return sum(xs) / len(xs), sum(ys) / len(ys)

out = []
for f in geo["features"]:
    code = f["properties"]["code"]
    cands = [i for i in islands if code in i["munis"]]
    isl = None
    if len(cands) == 1:
        isl = cands[0]["id"]
    elif cands:
        cx, cy = centroid(f["geometry"])
        best = min(cands, key=lambda i: (i["lon"] - cx) ** 2 + (i["lat"] - cy) ** 2)
        if ((best["lon"] - cx) ** 2 + (best["lat"] - cy) ** 2) ** 0.5 < 0.07:
            isl = best["id"]
    f["properties"] = {"code": code, "isl": isl}
    out.append(f)
geo["features"] = out
json.dump(geo, open(sys.argv[3], "w", encoding="utf-8"), ensure_ascii=False)
