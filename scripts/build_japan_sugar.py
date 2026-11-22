"""Build data/japan_sugar.json (the file the page reads) from the transcription
records in data/transcribed/.

Usage: python3 scripts/build_japan_sugar.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = os.path.join(ROOT, "data", "transcribed")
hok = json.load(open(os.path.join(T, "hokkaido.json"), encoding="utf-8"))
south = json.load(open(os.path.join(T, "south.json"), encoding="utf-8"))
supply = json.load(open(os.path.join(ROOT, "data", "supply.json"), encoding="utf-8"))
extra = json.load(open(os.path.join(T, "japan_extra.json"), encoding="utf-8"))

# ---- southern islands -------------------------------------------------------
ISLAND_META = {
    # name_ja in transcription -> (id, N03 municipality codes)
    "沖縄島（本島）": ("okinawa", ["47201", "47205", "47208", "47209", "47210", "47211", "47212", "47213", "47215",
                              "47301", "47302", "47303", "47306", "47308", "47311", "47313", "47314", "47324",
                              "47325", "47326", "47327", "47328", "47329", "47348", "47350", "47362"]),
    "伊江島": ("ie", ["47315"]),
    "伊平屋島": ("iheya", ["47359"]),
    "伊是名島": ("izena", ["47360"]),
    "粟国島": ("aguni", ["47355"]),
    "久米島": ("kume", ["47361"]),
    "南大東島": ("minamidaito", ["47357"]),
    "北大東島": ("kitadaito", ["47358"]),
    "宮古島": ("miyako", ["47214"]),
    "伊良部島": ("irabu", ["47214"]),
    "多良間島": ("tarama", ["47375"]),
    "石垣島": ("ishigaki", ["47207"]),
    "小浜島": ("kohama", ["47381"]),
    "西表島": ("iriomote", ["47381"]),
    "波照間島": ("hateruma", ["47381"]),
    "与那国島": ("yonaguni", ["47382"]),
    "種子島": ("tanegashima", ["46213", "46501", "46502"]),
    "奄美大島": ("amami", ["46222", "46523", "46524", "46525", "46527"]),
    "喜界島": ("kikai", ["46529"]),
    "徳之島": ("tokunoshima", ["46530", "46531", "46532"]),
    "沖永良部島": ("okinoerabu", ["46533", "46534"]),
    "与論島": ("yoron", ["46535"]),
}
NOTES_ISL = {
    "miyako": ("Sugar is counted by factory; the Gusukube factory on Miyako also crushed some cane from Irabu.",
               "産糖量は工場別の値。宮古島の城辺工場は伊良部島のさとうきびの一部も処理している。"),
    "irabu": ("Sugar is the Irabu factory's output only; part of Irabu's cane was crushed on Miyako.",
              "産糖量は伊良部工場の値のみ。伊良部島のさとうきびの一部は宮古島の工場で処理されている。"),
}

islands = []
for pref in ("okinawa", "kagoshima"):
    for i in south[pref]["islands"]:
        iid, munis = ISLAND_META[i["name_ja"]]
        e = {
            "id": iid, "pref": pref, "name_ja": i["name_ja"], "name_en": i["name_en"],
            "lat": i["lat"], "lon": i["lon"], "area_ha": i["area_ha"], "cane_t": i["cane_t"],
            "sugar_t": i.get("sugar_t"), "munis": munis,
        }
        if iid in NOTES_ISL:
            e["note_en"], e["note_ja"] = NOTES_ISL[iid]
        islands.append(e)


ok, kg = south["okinawa"], south["kagoshima"]
cane = {
    "okinawa": {
        "year_ja": "令和7/8年期", "year_en": "2025/26 season",
        "area_ha": ok["total"]["area_ha"], "cane_t": ok["total"]["cane_t"], "sugar_t": ok["total"]["sugar_t"],
        "src_ja": "沖縄県「令和7/8年期 さとうきび及び甘しゃ糖生産実績」（PDFから書き起こし）",
        "src_en": "Okinawa Prefecture, sugarcane and cane sugar production results 2025/26 (transcribed from PDF)",
    },
    "kagoshima": {
        "year_ja": "令和7年産", "year_en": "2025 crop",
        "area_ha": kg["total"]["area_ha"], "cane_t": kg["total"]["cane_t"], "sugar_t": kg["total"]["sugar_t"],
        "src_ja": "鹿児島県「令和7年産 さとうきび及び甘しゃ糖生産実績」表Ⅱ-1（PDFから書き起こし）",
        "src_en": "Kagoshima Prefecture, sugarcane and cane sugar production results, 2025 crop, table II-1 (transcribed from PDF)",
    },
    "lat_band": extra["cane_lat_band"],
    "islands": islands,
}

# ---- sugar beet --------------------------------------------------------------
ht = hok["hokkaido_totals"]
REGION_EN = {r["name_ja"]: r["name_en"] for r in hok["regions"]}
beet = {
    "year_ja": "令和7年産", "year_en": "the 2025 crop",
    "sugar_year_ja": "令和7年産の産糖量、白糖と原料糖の合計", "sugar_year_en": "2025 crop, white and raw sugar as produced",
    "region_year_ja": "令和7年産、作付面積", "region_year_en": "2025 crop, planted area",
    "region_src_ja": "北海道農政部「令和7年産 てん菜生産実績」（PDFから書き起こし）",
    "region_src_en": "Hokkaido Government, sugar beet production results 2025 (transcribed from PDF)",
    "region_metric": "area_ha",
    "area_ha": ht["area_ha"], "harvest_t": ht["harvest_t"], "sugar_t": ht["beet_sugar_t"],
    "regions": [{"n03": r["name_ja"], "name_ja": r["name_ja"].replace("総合振興局", "").replace("振興局", ""),
                 "name_en": r["name_en"], "area_ha": r["area_ha"], "harvest_t": r["harvest_t"]} for r in hok["regions"]],
}

# ---- factories --------------------------------------------------------------
PLACE_EN = {"河西郡芽室町": "Memuro", "網走郡美幌町": "Bihoro", "士別市": "Shibetsu", "斜里郡斜里町": "Shari",
            "上川郡清水町": "Shimizu", "北見市": "Kitami", "伊達市": "Date"}
BEET_EN = {"中斜里製糖工場": "Nakashari Sugar Factory", "清水製糖工場": "Shimizu Sugar Factory",
           "北見製糖所": "Kitami Sugar Factory", "道南製糖所": "Donan Sugar Factory"}
COMPANY_EN = {"株式会社ニッテン（旧 日本甜菜製糖株式会社）": "Nitten Co., Ltd. (formerly Nippon Beet Sugar)"}

SUFFIX_EN = {"伊仙": " (Isen)", "徳和瀬": " (Tokuwase)", "城辺": " (Gusukube)", "": ""}


def approx(prec):
    p = (prec or "").lower()
    return not (p.startswith("address-level") or p.startswith("番地"))

factories = []
for f in hok["factories"]:
    if f.get("is_operating_sugar_factory") is False:
        continue
    muni = f["municipality_ja"].split("（")[0]
    e = {
        "crop": "beet", "type": "centrifugal",
        "name_ja": f["name_ja"], "name_en": BEET_EN.get(f["name_ja"], f["name_en"]),
        "company_ja": f["company_ja"].replace("（旧 日本甜菜製糖株式会社）", "（旧 日本甜菜製糖）"),
        "company_en": COMPANY_EN.get(f["company_ja"], f["company_en"]),
        "place_ja": "北海道" + muni, "place_en": PLACE_EN.get(muni, muni) + ", Hokkaido",
        "lat": f["lat"], "lon": f["lon"],
        "src_ja": "株式会社ニッテン 事業所一覧" if "nitten" in f["source_url"] else "北海道農政部「北海道の畑作をめぐる情勢」",
        "src_en": "Nitten office list" if "nitten" in f["source_url"] else "Hokkaido Government, Upland farming in Hokkaido",
        "approx": approx(f.get("coord_precision")),
    }
    factories.append(e)

for f in south["factories"]:
    typ = "noncentrifugal" if f["sugar_type"].startswith("含") else "centrifugal"
    company_ja = f["company_ja"].split("（")[0]
    urls = f["source_url"] if isinstance(f["source_url"], list) else [f["source_url"]]
    ok_list = any("017/676" in u for u in urls)
    factories.append({
        "crop": "cane", "type": typ,
        "name_ja": f["name_ja"], "name_en": f["company_en"] + SUFFIX_EN.get(next((k for k in SUFFIX_EN if k in f["name_ja"]), ""), "") + ", " + f["island_en"],
        "company_ja": company_ja, "company_en": f["company_en"],
        "place_ja": f["island_ja"] + "（" + f["municipality_ja"] + "）", "place_en": f["island_en"],
        "lat": f["lat"], "lon": f["lon"],
        "src_ja": "沖縄県 製糖工場一覧、生産実績" if ok_list else ("沖縄県 生産実績" if "okinawa" in urls[0] else "鹿児島県 生産実績"),
        "src_en": "Okinawa Prefecture factory list and production report" if ok_list else ("Okinawa Prefecture production report" if "okinawa" in urls[0] else "Kagoshima Prefecture production report"),
        "approx": approx(f.get("coord_precision")),
    })
for f in factories:
    if f["approx"]:
        f["note_ja"], f["note_en"] = extra["factory_note_ja"], extra["factory_note_en"]

out = {
    "beet": beet,
    "cane": cane,
    "factories": factories,
    "anchors": extra["anchors"],
    "beet_lat": extra["beet_lat"],
    "season": extra["season"],
    "supply_key": extra["supply_key"],
    "sources": extra["sources"],
    "notes_en": extra["notes_en"],
    "notes_ja": extra["notes_ja"],
}
json.dump(out, open(os.path.join(ROOT, "data", "japan_sugar.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("factories", len(factories), "islands", len(islands))
