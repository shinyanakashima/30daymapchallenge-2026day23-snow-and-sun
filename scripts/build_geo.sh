#!/bin/sh
# Build data/world.topo.json and data/japan.topo.json.
# Needs mapshaper (npm i -g mapshaper) and python3.
# $1 = folder holding the unzipped downloads:
#   ne50/ne_50m_admin_0_countries.shp            (Natural Earth 50m Admin 0)
#   a1/ne_10m_admin_1_states_provinces.shp       (Natural Earth 10m Admin 1)
#   n03/N03-20250101_01_subprefecture.shp        (N03 2025, Hokkaido, by subprefecture)
#   n03_46/N03-20250101_46.shp, n03_47/N03-20250101_47.shp  (N03 2025, Kagoshima, Okinawa)
set -e
SRC="$1"; OUT="$(dirname "$0")/../data"; TMP="$(mktemp -d)"

mapshaper "$SRC/ne50/ne_50m_admin_0_countries.shp" -filter-fields ADM0_A3,ISO_N3,ISO_N3_EH,NAME_EN,NAME_JA,LABEL_Y \
  -filter 'ADM0_A3!="ATA"' -simplify 20% keep-shapes -rename-layers countries \
  -o format=topojson quantization=1e5 "$OUT/world.topo.json"

mapshaper "$SRC/a1/ne_10m_admin_1_states_provinces.shp" -filter 'adm0_a3=="JPN"' -filter-fields name \
  -simplify 8% keep-shapes -o format=geojson "$TMP/prefs.geojson"
mapshaper "$SRC/n03/N03-20250101_01_subprefecture.shp" -dissolve2 N03_002 -rename-fields name=N03_002 \
  -simplify 1.2% keep-shapes -o format=geojson "$TMP/hokkaido.geojson"
mapshaper -i "$SRC/n03_46/N03-20250101_46.shp" "$SRC/n03_47/N03-20250101_47.shp" combine-files -merge-layers force \
  -filter 'N03_007!=""' -dissolve2 N03_007 -filter 'this.centroidY < 31' \
  -filter '["47000","46303","46304"].indexOf(N03_007)<0' -rename-fields code=N03_007 -filter-fields code \
  -explode -filter 'this.area > 200000' -simplify 4% keep-shapes -o format=geojson "$TMP/isl_exp.geojson"
python3 -I "$(dirname "$0")/assign_islands.py" "$TMP/isl_exp.geojson" "$OUT/japan_sugar.json" "$TMP/isl_tag.geojson"
mapshaper "$TMP/isl_tag.geojson" -filter '!!isl' -dissolve isl -o format=geojson "$TMP/islands.geojson"
mapshaper -i "$TMP/prefs.geojson" "$TMP/hokkaido.geojson" "$TMP/islands.geojson" combine-files \
  -rename-layers prefs,hokkaido,islands target='*' \
  -o format=topojson quantization=1e5 target='*' "$OUT/japan.topo.json"
rm -r "$TMP"
