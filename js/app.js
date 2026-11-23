(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DUR = reduceMotion ? 0 : 900;
  var svg = d3.select("#map");
  var info = document.getElementById("info");
  var legendEl = document.getElementById("legend");
  var lang = initialLang();
  var D = {};            // loaded data
  var V = {};            // derived values for text templates
  var scene = "world";
  var W = 0, H = 0;

  function initialLang() {
    var q = new URLSearchParams(location.search).get("lang");
    if (q === "ja" || q === "en") return q;
    try { var s = localStorage.getItem("snowsun-lang"); if (s === "ja" || s === "en") return s; } catch (e) {}
    return "en";
  }

  // ---------- formatting ----------
  function nf(v, digits) {
    if (v == null || isNaN(v)) return "–";
    return Number(v).toLocaleString(lang === "ja" ? "ja-JP" : "en-US", { maximumFractionDigits: digits || 0, minimumFractionDigits: digits || 0 });
  }
  function kt(t) { return nf(t / 1000); }        // tonnes -> thousand tonnes
  function mt(t) { return nf(t / 1e6, 1); }       // tonnes -> million tonnes
  function L(o, key) { return o[key + "_" + lang] != null ? o[key + "_" + lang] : o[key + "_en"]; }
  function T(key) {
    var s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || "";
    return s.replace(/\{(\w+)\}/g, function (_, k) { return V[k] != null ? V[k] : "{" + k + "}"; });
  }

  // ---------- load ----------
  Promise.all([
    d3.json("data/world.topo.json"),
    d3.json("data/japan.topo.json"),
    d3.json("data/fao_sugar.json"),
    d3.json("data/japan_sugar.json"),
    d3.json("data/supply.json")
  ]).then(function (r) {
    D.world = r[0]; D.japan = r[1]; D.fao = r[2]; D.jp = r[3]; D.supply = r[4];
    prepare();
    build();
    applyLang();
    setupScroll();
    var lastW = window.innerWidth, lastH = window.innerHeight;
    window.addEventListener("resize", debounce(function () {
      // mobile browsers resize the viewport when the address bar shows or hides; ignore small height-only changes
      if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 160) return;
      lastW = window.innerWidth; lastH = window.innerHeight;
      build(); svgText(); renderScene(scene, true);
    }, 200));
  }).catch(function (err) {
    console.error(err);
  });

  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  // ---------- data prep ----------
  function prepare() {
    var byCode = {};
    D.fao.countries.forEach(function (c) { byCode[c.m49] = c; });
    D.faoByCode = byCode;
    var countries = topojson.feature(D.world, D.world.objects.countries).features;
    countries.forEach(function (f) {
      var p = f.properties;
      var c = byCode[pad3(p.ISO_N3)] || byCode[pad3(p.ISO_N3_EH)];
      if (p.ADM0_A3 === "TWN") c = byCode["158"];
      p.fao = c || null;
      p.cat = !c ? "none" : (c.beet && c.cane) ? "both" : c.beet ? "beet" : "cane";
    });
    D.countries = countries;
    var producers = D.fao.countries;
    var both = producers.filter(function (c) { return c.beet && c.cane; });
    both.sort(function (a, b) { return Math.min(b.beet, b.cane) - Math.min(a.beet, a.cane); });
    D.both = both;
    var big = both.filter(function (c) { return c.beet >= 1e6 && c.cane >= 1e6; });
    var jp = byCode["392"];

    V.faoYear = D.fao.year;
    V.nProducers = producers.length;
    V.nBeet = producers.filter(function (c) { return c.beet; }).length;
    V.nCane = producers.filter(function (c) { return c.cane; }).length;
    V.nBoth = both.length;
    V.nBig = big.length;
    // latitude of each country's Natural Earth label point
    var latOf = {};
    countries.forEach(function (f) { if (f.properties.fao) latOf[f.properties.fao.m49] = Math.abs(+f.properties.LABEL_Y); });
    var beetOnly = producers.filter(function (c) { return c.beet && !c.cane && latOf[c.m49] != null; });
    var caneOnly = producers.filter(function (c) { return c.cane && !c.beet && latOf[c.m49] != null; });
    V.nBeetOnly = beetOnly.length; V.nCaneOnly = caneOnly.length;
    V.beetOnlyMinLat = nf(Math.floor(d3.min(beetOnly, function (c) { return latOf[c.m49]; })));
    V.caneOnlyMaxLat = nf(Math.ceil(d3.max(caneOnly, function (c) { return latOf[c.m49]; })));
    V.caneOnlyTropics = caneOnly.filter(function (c) { return latOf[c.m49] <= 23.44; }).length;
    V.worldBeet = nf(d3.sum(producers, function (c) { return c.beet || 0; }) / 1e6);
    V.worldCane = nf(d3.sum(producers, function (c) { return c.cane || 0; }) / 1e6);
    V.jpBeetFao = mt(jp.beet); V.jpCaneFao = mt(jp.cane);

    var jd = D.jp;
    V.beetYear = L(jd.beet, "year");
    V.beetArea = nf(jd.beet.area_ha);
    V.beetHarvest = mt(jd.beet.harvest_t);
    V.beetHarvestKt = kt(jd.beet.harvest_t);
    V.beetSugarKt = jd.beet.sugar_t != null ? kt(jd.beet.sugar_t) : "–";
    V.beetSugarYear = L(jd.beet, "sugar_year");
    V.nBeetFactories = jd.factories.filter(function (f) { return f.crop === "beet"; }).length;
    V.nBeetCompanies = d3.group(jd.factories.filter(function (f) { return f.crop === "beet"; }), function (f) { return f.company_en; }).size;
    V.nCaneFactories = jd.factories.filter(function (f) { return f.crop === "cane" && f.type === "centrifugal"; }).length;
    V.nBrownFactories = jd.factories.filter(function (f) { return f.crop === "cane" && f.type === "noncentrifugal"; }).length;
    var tok = jd.beet.regions.filter(function (r) { return r.n03 === "十勝総合振興局"; })[0];
    var okh = jd.beet.regions.filter(function (r) { return r.n03 === "オホーツク総合振興局"; })[0];
    var metric = jd.beet.region_metric;
    var regTotal = d3.sum(jd.beet.regions, function (r) { return r[metric] || 0; });
    V.tokShare = tok ? nf(100 * tok[metric] / jd.beet[metric]) : "–";
    V.okhShare = okh ? nf(100 * okh[metric] / jd.beet[metric]) : "–";
    V.tokOkhShare = tok && okh ? nf(100 * (tok[metric] + okh[metric]) / jd.beet[metric]) : "–";
    V.regionYear = L(jd.beet, "region_year");
    V.regionMetricLabel = T(metric === "area_ha" ? "metricArea" : "metricHarvest");
    V.beetSeasonSrc = L(jd.season, "beet_src");
    V.regTotal = regTotal;

    var ok = jd.cane.okinawa, kg = jd.cane.kagoshima;
    V.okYear = L(ok, "year"); V.kgYear = L(kg, "year");
    V.okCaneKt = kt(ok.cane_t); V.kgCaneKt = kt(kg.cane_t);
    V.caneTotalKt = kt(ok.cane_t + kg.cane_t);
    V.okSugarKt = ok.sugar_t != null ? kt(ok.sugar_t) : "–";
    V.kgSugarKt = kg.sugar_t != null ? kt(kg.sugar_t) : "–";
    V.caneSugarKt = ok.sugar_t != null && kg.sugar_t != null ? kt(ok.sugar_t + kg.sugar_t) : "–";
    var isl = jd.cane.islands.slice().sort(function (a, b) { return b.cane_t - a.cane_t; });
    V.topIsland = L(isl[0], "name"); V.topIslandKt = kt(isl[0].cane_t);
    V.nIslands = jd.cane.islands.length;

    // distance and latitudes
    var north = jd.anchors.north, south = jd.anchors.south;
    V.distKm = nf(Math.round(d3.geoDistance([north.lon, north.lat], [south.lon, south.lat]) * 6371 / 10) * 10);
    V.northName = L(north, "name"); V.southName = L(south, "name");
    V.northLat = nf(jd.beet_lat, 0); V.gapNorthLat = nf(north.lat, 1); V.gapSouthLat = nf(south.lat, 1);
    var cLats = jd.cane.islands.map(function (i) { return i.lat; });
    V.caneLatMin = nf(Math.floor(d3.min(cLats))); V.caneLatMax = nf(Math.ceil(d3.max(cLats)));

    var bal = D.supply.balance.years;
    var cur = bal.filter(function (y) { return y.key === D.jp.supply_key; })[0] || bal[bal.length - 1];
    D.cur = cur;
    V.supplyYear = L(cur, "label");
    V.selfPct = nf(cur.self_sufficiency_pct);
    V.totalKt = nf(cur.total_demand);
    V.domKt = nf(cur.domestic);
    V.impKt = nf(cur.imports);
    V.beetSupKt = nf(cur.beet);
    V.caneSupKt = nf(cur.cane);
    V.beetOfDom = nf(100 * cur.beet / cur.domestic);
    V.caneOfDom = nf(100 * cur.cane / cur.domestic);
    var act = bal.filter(function (y) { return y.status === "actual"; }).pop();
    V.actYear = L(act, "label"); V.actSelf = nf(act.self_sufficiency_pct);
    var imp = D.supply.raw_sugar_imports;
    V.impYear = L(imp, "year_label");
    V.ausShare = nf(imp.countries[0].share_pct, 1);
    V.thaShare = nf(imp.countries[1].share_pct, 1);
    V.grains = grainCounts(cur);
    V.gBeet = V.grains.beet; V.gCane = V.grains.cane;
    var w = D.fao.world;
    V.beetCaneShare = nf(Math.floor(1000 * (w.beet + w.cane) / (w.beet + w.cane + w.other_sugar_crops)) / 10, 1);
  }
  function pad3(s) { s = String(s || ""); return s === "-99" ? "" : ("000" + s).slice(-3); }

  function grainCounts(cur) {
    var t = cur.total_demand;
    var beet = Math.round(100 * cur.beet / t);
    var cane = Math.round(100 * cur.cane / t);
    var dom = cur.self_sufficiency_pct;
    var other = Math.max(0, dom - beet - cane);
    return { beet: beet, cane: cane, other: other, imp: 100 - beet - cane - other };
  }

  // ---------- build svg ----------
  var gWorld, gJapan, gJapanZoom, gSpoon, gSeason, projW, projJ, pathW, pathJ;

  function build() {
    var rect = svg.node().getBoundingClientRect();
    W = Math.max(300, rect.width); H = Math.max(300, rect.height);
    svg.attr("viewBox", "0 0 " + W + " " + H);
    svg.selectAll("g.layer, defs").remove();
    var defs = svg.append("defs");
    var f = defs.append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    f.append("feGaussianBlur").attr("stdDeviation", 6).attr("result", "b");
    var m = f.append("feMerge"); m.append("feMergeNode").attr("in", "b"); m.append("feMergeNode").attr("in", "SourceGraphic");

    buildWorld();
    buildJapan();
    buildSpoon(defs);
    buildSeason();
  }

  function mobile() { return W < 560; }

  function buildWorld() {
    gWorld = svg.append("g").attr("class", "layer world").style("opacity", 0);
    var pad = mobile() ? 8 : 24;
    projW = d3.geoEqualEarth().rotate([-10, 0]).fitExtent([[pad, pad + 40], [W - pad, H - pad - (mobile() ? 40 : 70)]], { type: "Sphere" });
    pathW = d3.geoPath(projW);
    gWorld.append("path").datum({ type: "Sphere" }).attr("class", "sphere").attr("d", pathW);
    gWorld.append("path").datum(d3.geoGraticule10()).attr("class", "graticule").attr("d", pathW);
    gWorld.append("g").selectAll("path").data(D.countries).join("path")
      .attr("class", function (d) { return "country " + d.properties.cat + (d.properties.ADM0_A3 === "JPN" ? " jp" : ""); })
      .attr("d", pathW)
      .on("click", function (ev, d) { if (d.properties.fao) showCountry(d); });
    [23.44, -23.44].forEach(function (lat) {
      var line = { type: "LineString", coordinates: d3.range(-180, 181, 2).map(function (x) { return [x, lat]; }) };
      gWorld.append("path").datum(line).attr("class", "tropic").attr("d", pathW);
      var p = projW([-168, lat]);
      gWorld.append("text").attr("class", "tropic-label").attr("x", p[0] + 4).attr("y", p[1] - 4)
        .attr("data-k", lat > 0 ? "cancer" : "capricorn");
    });
    // Japan pointer
    var jp = projW([139, 36]);
    gWorld.append("circle").attr("class", "jp-ring").attr("cx", jp[0]).attr("cy", jp[1]).attr("r", mobile() ? 12 : 18)
      .attr("fill", "none").attr("stroke", "#e8e6e1").attr("stroke-width", 1);
    gWorld.append("text").attr("class", "place-label").attr("x", jp[0] + (mobile() ? 14 : 22)).attr("y", jp[1] + 4).attr("data-k", "japan");
  }

  function buildJapan() {
    gJapan = svg.append("g").attr("class", "layer japan").style("opacity", 0);
    gJapanZoom = gJapan.append("g").attr("class", "zoom");
    var prefs = topojson.feature(D.japan, D.japan.objects.prefs);
    var hok = topojson.feature(D.japan, D.japan.objects.hokkaido);
    var isl = topojson.feature(D.japan, D.japan.objects.islands);
    var pad = mobile() ? 10 : 30;
    projJ = d3.geoConicConformal().parallels([30, 42]).rotate([-136, 0]).center([0, 35])
      .fitExtent([[pad, pad + 50], [W - pad, H - pad - (mobile() ? 30 : 60)]], {
        type: "MultiPoint", coordinates: [[122.9, 24.0], [146.0, 45.6], [122.9, 45.6], [146, 24]]
      });
    pathJ = d3.geoPath(projJ);
    var z = gJapanZoom;
    // latitude guide lines
    var lines = [{ lat: D.jp.beet_lat, cls: "n" }, { lat: D.jp.cane.lat_band[1], cls: "s" }, { lat: D.jp.cane.lat_band[0], cls: "s" }];
    lines.forEach(function (l) {
      var ln = { type: "LineString", coordinates: d3.range(118, 152, 1).map(function (x) { return [x, l.lat]; }) };
      z.append("path").datum(ln).attr("class", "lat-line " + l.cls).attr("d", pathJ).attr("vector-effect", "non-scaling-stroke");
    });
    z.append("g").selectAll("path").data(prefs.features).join("path").attr("class", "pref").attr("d", pathJ).attr("vector-effect", "non-scaling-stroke");

    // Hokkaido regions
    var regByN03 = {};
    D.jp.beet.regions.forEach(function (r) { regByN03[r.n03] = r; });
    var metric = D.jp.beet.region_metric;
    var maxR = d3.max(D.jp.beet.regions, function (r) { return r[metric]; });
    var beetScale = d3.scaleSqrt().domain([0, maxR]).range([0, 1]);
    var beetColor = function (v) { return v ? d3.interpolateRgb("#1d2733", "#bfe6fa")(0.15 + 0.85 * beetScale(v)) : "#1a2029"; };
    hok.features.forEach(function (f) { f.properties.r = regByN03[f.properties.name] || null; });
    var glowN = z.append("g").attr("filter", "url(#glow)").attr("class", "glow-layer");
    glowN.selectAll("path").data(hok.features.filter(function (f) { return f.properties.r && f.properties.r[metric] > 0; })).join("path")
      .attr("d", pathJ).attr("fill", function (d) { return beetColor(d.properties.r[metric]); }).attr("opacity", .55);
    z.append("g").selectAll("path").data(hok.features).join("path")
      .attr("class", "region").attr("d", pathJ).attr("vector-effect", "non-scaling-stroke")
      .attr("fill", function (d) { return beetColor(d.properties.r && d.properties.r[metric]); })
      .on("click", function (ev, d) { showRegion(d.properties); });

    // Southern islands
    var islById = {};
    D.jp.cane.islands.forEach(function (i) { islById[i.id] = i; });
    var maxI = d3.max(D.jp.cane.islands, function (i) { return i.cane_t; });
    var caneScale = d3.scaleSqrt().domain([0, maxI]).range([0, 1]);
    var caneColor = function (v) { return v ? d3.interpolateRgb("#33261b", "#ffd29a")(0.2 + 0.8 * caneScale(v)) : "#1f2129"; };
    isl.features.forEach(function (f) { f.properties.i = islById[f.properties.isl] || null; });
    var glowS = z.append("g").attr("filter", "url(#glow)").attr("class", "glow-layer");
    glowS.selectAll("path").data(isl.features.filter(function (f) { return f.properties.i; })).join("path")
      .attr("d", pathJ).attr("fill", function (d) { return caneColor(d.properties.i.cane_t); }).attr("stroke", function (d) { return caneColor(d.properties.i.cane_t); }).attr("stroke-width", 3).attr("opacity", .6);
    z.append("g").selectAll("path").data(isl.features).join("path")
      .attr("class", "island").attr("d", pathJ).attr("vector-effect", "non-scaling-stroke").attr("stroke-width", 1.2)
      .attr("stroke", function (d) { return d.properties.i ? caneColor(d.properties.i.cane_t) : "none"; })
      .attr("fill", function (d) { return d.properties.i ? caneColor(d.properties.i.cane_t) : "#20242c"; })
      .on("click", function (ev, d) { if (d.properties.i) showIsland(d.properties.i); });
    // invisible hit circles for small islands
    z.append("g").selectAll("circle").data(D.jp.cane.islands).join("circle")
      .attr("class", "hit island-hit").attr("cx", function (d) { return projJ([d.lon, d.lat])[0]; }).attr("cy", function (d) { return projJ([d.lon, d.lat])[1]; })
      .attr("r", 9).on("click", function (ev, d) { showIsland(d); });

    // distance line
    var a = D.jp.anchors.north, b = D.jp.anchors.south;
    z.append("path").datum({ type: "LineString", coordinates: [[a.lon, a.lat], [b.lon, b.lat]] })
      .attr("class", "dist-line").attr("d", pathJ).attr("vector-effect", "non-scaling-stroke");

    // factories
    z.append("g").attr("class", "factories").selectAll("circle").data(D.jp.factories).join("circle")
      .attr("class", function (d) { return "factory " + d.crop + (d.type === "noncentrifugal" ? " small" : ""); })
      .attr("cx", function (d) { return projJ([d.lon, d.lat])[0]; })
      .attr("cy", function (d) { return projJ([d.lon, d.lat])[1]; })
      .attr("data-r", function (d) { return d.type === "noncentrifugal" ? 2.5 : 4; })
      .attr("r", function (d) { return d.type === "noncentrifugal" ? 2.5 : 4; })
      .on("click", function (ev, d) { showFactory(d); });

    // labels
    var lab = gJapan.append("g").attr("class", "labels");
    lab.append("text").attr("class", "lat-label n-lat");
    lab.append("text").attr("class", "lat-label s-lat");
    lab.append("text").attr("class", "lat-label s-lat0");
    lab.append("text").attr("class", "dist-label");
    lab.append("text").attr("class", "place-label lab-hok");
    lab.append("text").attr("class", "place-label lab-south");
    lab.append("text").attr("class", "place-label dim lab-honshu");
    // zoomed-in labels: main beet subprefectures and main cane islands
    var zl = [];
    hok.features.forEach(function (f) {
      var r = f.properties.r;
      if (r && r.area_ha > 2000) { var c = d3.geoCentroid(f); zl.push({ kind: "n", lon: c[0], lat: c[1], obj: r, v: r.area_ha, unit: "ha" }); }
    });
    D.jp.cane.islands.forEach(function (i) { if (i.cane_t > 60000) zl.push({ kind: "s", lon: i.lon, lat: i.lat, obj: i, v: i.cane_t, unit: "t" }); });
    lab.selectAll("text.zl").data(zl).join("text").attr("class", function (d) { return "place-label zl zl-" + d.kind; }).style("opacity", 0);
    D.zoomK = 1; D.zoomT = [0, 0];
  }

  function zoomTo(bbox, animate) {
    // bbox: [[lon0,lat0],[lon1,lat1]] or null for whole Japan
    var k = 1, tx = 0, ty = 0;
    if (bbox) {
      var pts = [[bbox[0][0], bbox[0][1]], [bbox[1][0], bbox[1][1]], [bbox[0][0], bbox[1][1]], [bbox[1][0], bbox[0][1]]].map(projJ);
      var x0 = d3.min(pts, function (p) { return p[0]; }), x1 = d3.max(pts, function (p) { return p[0]; });
      var y0 = d3.min(pts, function (p) { return p[1]; }), y1 = d3.max(pts, function (p) { return p[1]; });
      var top = mobile() ? 50 : 60, bottom = mobile() ? 30 : 60, pad = mobile() ? 10 : 40;
      k = Math.min((W - 2 * pad) / (x1 - x0), (H - top - bottom) / (y1 - y0));
      tx = (W - k * (x0 + x1)) / 2; ty = top + ((H - top - bottom) - k * (y0 + y1 - 2 * 0)) / 2;
      ty = top + ((H - top - bottom) - k * (y1 - y0)) / 2 - k * y0;
    }
    D.zoomK = k; D.zoomT = [tx, ty];
    var t = gJapanZoom.transition().duration(animate ? DUR : 0);
    t.attr("transform", "translate(" + tx + "," + ty + ") scale(" + k + ")");
    var rk = Math.sqrt(k);
    gJapanZoom.selectAll("circle.factory").transition().duration(animate ? DUR : 0)
      .attr("r", function () { return +this.getAttribute("data-r") * (k > 1.5 ? rk : 0.75) / k; })
      .attr("stroke-width", 1.2 / k);
    gJapanZoom.selectAll("circle.island-hit").attr("r", 10 / k);
    gJapanZoom.selectAll("path.region").attr("stroke-width", 0.5);
    gJapanZoom.selectAll("g.glow-layer").attr("filter", k > 1.5 ? null : "url(#glow)");
    placeJapanLabels(animate);
  }

  function pj(lon, lat) {
    var p = projJ([lon, lat]);
    return [p[0] * D.zoomK + D.zoomT[0], p[1] * D.zoomK + D.zoomT[1]];
  }

  function placeJapanLabels(animate) {
    var lab = gJapan.select("g.labels");
    var a = D.jp.anchors.north, b = D.jp.anchors.south;
    var dur = animate ? DUR : 0;
    function setT(sel, xy, text, anchor) {
      sel.text(text).attr("text-anchor", anchor || "start").transition().duration(dur).attr("x", xy[0]).attr("y", xy[1]);
    }
    var xRight = W - (mobile() ? 6 : 16);
    var n = pj(150, D.jp.beet_lat), s1 = pj(150, D.jp.cane.lat_band[1]), s0 = pj(150, D.jp.cane.lat_band[0]);
    setT(lab.select(".n-lat"), [xRight, Math.min(n[1], H) - 4], fmtLat(D.jp.beet_lat), "end");
    setT(lab.select(".s-lat"), [xRight, s1[1] - 4], fmtLat(D.jp.cane.lat_band[1]), "end");
    var s0l = pj(118, D.jp.cane.lat_band[0]);
    setT(lab.select(".s-lat0"), [Math.max(8, s0l[0] + 4), Math.min(s0l[1], H) - 4], fmtLat(D.jp.cane.lat_band[0]), "start");
    var m0 = pj(a.lon, a.lat), m1 = pj(b.lon, b.lat);
    var mid = [(m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2];
    setT(lab.select(".dist-label"), [mid[0] + 8, mid[1]], T("distLabel"));
    var hk = pj(140.6, 44.6); setT(lab.select(".lab-hok"), [Math.max(hk[0], mobile() ? 120 : 0), hk[1]], T("labHok"), "end");
    var so = pj(123.2, 26.9); setT(lab.select(".lab-south"), [Math.max(6, so[0]), so[1]], T("labSouth"), "start");
    lab.selectAll("text.zl").each(function (d) {
      var p = pj(d.lon, d.lat), sel = d3.select(this);
      var right = d.kind === "s" && p[0] > W - 150;
      sel.attr("text-anchor", d.kind === "n" ? "middle" : right ? "end" : "start").text(null);
      sel.append("tspan").attr("x", 0).text(L(d.obj, "name"));
      sel.append("tspan").attr("x", 0).attr("dy", "1.2em").attr("class", "zl-v").text(nf(d.v) + " " + d.unit);
      var dx = d.kind === "n" ? 0 : right ? -10 : 10;
      sel.selectAll("tspan").attr("x", p[0] + dx);
      sel.attr("y", p[1] + (d.kind === "n" ? 26 : 4));
    });
    var ho = pj(141.0, 35.0); setT(lab.select(".lab-honshu"), [ho[0], ho[1]], T("labHonshu"), "middle");
  }
  function fmtLat(v) { return (lang === "ja" ? "北緯" + nf(v, 0) + "度" : nf(v, 0) + "°N"); }

  // spoon: unit chart of 100 grains inside a spoon bowl
  function buildSpoon(defs) {
    gSpoon = svg.append("g").attr("class", "layer spoon").style("opacity", 0);
    var g = V.grains;
    var s = Math.min(W / 720, H / 560);
    var cx = W / 2 - (mobile() ? 60 : 110) * s, cy = H * (mobile() ? 0.46 : 0.48) + (mobile() ? 28 : 0);
    var rx = 170 * s, ry = 120 * s;
    // keep the heading below the fixed top bar
    cy = Math.max(cy, ry + 12 * s + 24 + 30 + (mobile() ? 50 : 60));
    var root = gSpoon.append("g");
    // handle
    root.append("path").attr("class", "spoon-outline")
      .attr("d", "M" + (cx + rx * 0.985) + "," + (cy - ry * 0.12) + " C" + (cx + rx * 1.3) + "," + (cy - ry * 0.16) + " " + (cx + rx * 1.7) + "," + (cy - ry * 0.2) + " " + (cx + rx * 1.95) + "," + (cy - ry * 0.18) +
        " A" + (ry * 0.18) + "," + (ry * 0.18) + " 0 0 1 " + (cx + rx * 1.95) + "," + (cy + ry * 0.18) +
        " C" + (cx + rx * 1.7) + "," + (cy + ry * 0.2) + " " + (cx + rx * 1.3) + "," + (cy + ry * 0.16) + " " + (cx + rx * 0.985) + "," + (cy + ry * 0.12));
    root.append("ellipse").attr("class", "spoon-outline").attr("cx", cx).attr("cy", cy).attr("rx", rx).attr("ry", ry);
    // grain positions: hex grid inside ellipse, pick 100 closest to centre
    var cand = [], step = Math.min(rx, ry) * 0.17;
    for (var y = -ry; y <= ry; y += step * 0.87) {
      var row = Math.round((y + ry) / (step * 0.87));
      for (var x = -rx; x <= rx; x += step) {
        var xx = x + (row % 2 ? step / 2 : 0);
        var e = (xx * xx) / (rx * rx) + (y * y) / (ry * ry);
        if (e < 0.86) cand.push({ x: xx, y: y, e: e });
      }
    }
    cand.sort(function (a, b) { return a.e - b.e; });
    var pts = cand.slice(0, 100);
    // order: left-to-right sweep so groups form clear areas
    pts.sort(function (a, b) { return (a.x - b.x) || (a.y - b.y); });
    var cats = [];
    var k;
    for (k = 0; k < g.beet; k++) cats.push("beet");
    for (k = 0; k < g.cane; k++) cats.push("cane");
    for (k = 0; k < g.other; k++) cats.push("other");
    for (k = 0; k < g.imp; k++) cats.push("imp");
    var col = { beet: "var(--beet)", cane: "var(--cane)", other: "#d9b48a", imp: "#4a505b" };
    root.append("g").selectAll("circle").data(pts).join("circle")
      .attr("class", function (d, i) { return "grain g-" + cats[i]; })
      .attr("cx", function (d) { return cx + d.x; }).attr("cy", function (d) { return cy + d.y; })
      .attr("r", step * 0.38)
      .attr("fill", function (d, i) { return col[cats[i]]; });
    var lx = cx - rx, ly = cy + ry + 34 * s;
    var t = gSpoon.append("g").attr("class", "spoon-text");
    t.append("text").attr("class", "spoon-big sp-self").attr("x", cx - rx).attr("y", cy - ry - 12 * s - 24);
    t.append("text").attr("class", "spoon-sub sp-self-sub").attr("x", cx - rx).attr("y", cy - ry - 12 * s);
    var rows = [["beet", "spLegBeet"], ["cane", "spLegCane"], ["other", "spLegOther"], ["imp", "spLegImp"]];
    rows.forEach(function (r, i) {
      var yy = ly + i * 20;
      t.append("circle").attr("cx", lx + 6).attr("cy", yy - 4).attr("r", 5).attr("fill", col[r[0]]);
      t.append("text").attr("class", "spoon-label").attr("x", lx + 18).attr("y", yy).attr("data-k", r[1]);
    });
  }

  function buildSeason() {
    gSeason = svg.append("g").attr("class", "layer season").style("opacity", 0);
    var months = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
    var left = mobile() ? 16 : Math.max(60, W * 0.08), right = mobile() ? 12 : 40;
    var labelW = mobile() ? 0 : 150;
    var x0 = left + labelW, x1 = W - right;
    var cw = (x1 - x0) / 12;
    var top = H * 0.32;
    var rowH = mobile() ? 64 : 70;
    var g = gSeason;
    months.forEach(function (m, i) {
      g.append("line").attr("class", "season-grid").attr("x1", x0 + i * cw).attr("x2", x0 + i * cw).attr("y1", top - 24).attr("y2", top + rowH * 2 + 10);
      g.append("text").attr("class", "season-month").attr("x", x0 + (i + 0.5) * cw).attr("y", top - 32).attr("data-month", m);
    });
    g.append("line").attr("class", "season-grid").attr("x1", x1).attr("x2", x1).attr("y1", top - 24).attr("y2", top + rowH * 2 + 10);
    var S = D.jp.season;
    function bars(row, crop, list, op) {
      list.forEach(function (m) {
        var i = months.indexOf(m);
        g.append("rect").attr("class", "season-bar " + crop + (op ? " op" : ""))
          .attr("x", x0 + i * cw + 1).attr("width", cw - 2)
          .attr("y", top + row * rowH + (op ? 26 : 4)).attr("height", op ? 12 : 20).attr("rx", 2);
      });
    }
    bars(0, "beet", S.beet.harvest, false);
    bars(0, "beet", S.beet.processing, true);
    bars(1, "cane", S.cane.harvest, false);
    if (S.cane.processing) bars(1, "cane", S.cane.processing, true);
    var lx = mobile() ? x0 : left;
    var dy = mobile() ? -6 : 18;
    g.append("text").attr("class", "season-row se-beet").attr("x", lx).attr("y", top + dy + (mobile() ? 0 : 0));
    g.append("text").attr("class", "season-row se-cane").attr("x", lx).attr("y", top + rowH + dy);
    var ky = top + rowH * 2 + 40;
    g.append("rect").attr("x", x0).attr("y", ky - 11).attr("width", 18).attr("height", 12).attr("fill", "#e8e6e1").attr("rx", 2);
    g.append("text").attr("class", "season-row se-k1").attr("x", x0 + 24).attr("y", ky);
    g.append("rect").attr("x", x0).attr("y", ky + 10).attr("width", 18).attr("height", 8).attr("fill", "#e8e6e1").attr("opacity", .35).attr("rx", 2);
    g.append("text").attr("class", "season-row se-k2").attr("x", x0 + 24).attr("y", ky + 19);
    if (mobile()) {
      g.selectAll(".season-row.se-beet, .season-row.se-cane").attr("y", function () { return +this.getAttribute("y"); });
    }
  }

  // ---------- scenes ----------
  function renderScene(name, instant) {
    scene = name;
    var dur = instant ? 0 : DUR;
    var isWorld = name === "world" || name === "worldboth";
    var isJapan = name.indexOf("japan") === 0;
    gWorld.transition().duration(dur).style("opacity", isWorld ? 1 : 0).on("end", null);
    gWorld.style("pointer-events", isWorld ? "all" : "none");
    gJapan.transition().duration(dur).style("opacity", isJapan ? 1 : 0);
    gJapan.style("pointer-events", isJapan ? "all" : "none");
    gSpoon.transition().duration(dur).style("opacity", name.indexOf("spoon") === 0 ? 1 : 0);
    gSpoon.selectAll(".grain.g-imp").transition().duration(dur).style("opacity", name === "spoon-end" ? 0.2 : 1);
    gSeason.transition().duration(dur).style("opacity", name === "season" ? 1 : 0);
    gWorld.selectAll("path.country").transition().duration(dur)
      .style("opacity", function (d) { return name === "worldboth" && d.properties.cat !== "both" && d.properties.cat !== "none" ? 0.25 : 1; });
    if (isJapan) {
      if (name === "japan-north") zoomTo([[139.3, 41.3], [145.9, 45.6]], !instant);
      else if (name === "japan-south") zoomTo([[122.9, 24.0], [131.4, 31.0]], !instant);
      else zoomTo(null, !instant);
      var showLines = name === "japan";
      gJapan.selectAll("text.zl-n").transition().duration(dur).style("opacity", name === "japan-north" ? 1 : 0);
      gJapan.selectAll("text.zl-s").transition().duration(dur).style("opacity", name === "japan-south" ? 1 : 0);
      gJapan.selectAll(".lat-line, .dist-line").transition().duration(dur).style("opacity", showLines ? 1 : 0);
      gJapan.selectAll(".lat-label, .dist-label, .lab-honshu, .lab-hok, .lab-south").transition().duration(dur).style("opacity", showLines ? 1 : 0);
    }
    renderLegend(name);
    if (!isJapan && !isWorld) hideInfo();
  }

  function renderLegend(name) {
    var h = "";
    function sw(color, text) { return '<div class="row"><span class="sw" style="background:' + color + '"></span>' + text + "</div>"; }
    function dot(color, text, small) { return '<div class="row"><span class="dot" style="background:' + color + (small ? ";width:6px;height:6px" : "") + '"></span>' + text + "</div>"; }
    if (name === "world" || name === "worldboth") {
      h = sw("var(--beet-deep)", T("legBeetOnly")) + sw("var(--cane-deep)", T("legCaneOnly")) + sw("var(--both)", T("legBoth")) + sw("var(--land)", T("legNone")) +
        '<div class="row" style="color:var(--ink-3)">' + T("legWorldSrc") + "</div>";
    } else if (name.indexOf("japan") === 0) {
      h = sw("linear-gradient(90deg,#2a3b4a,#bfe6fa)", T("legBeetRegion")) + sw("linear-gradient(90deg,#4a3420,#ffd29a)", T("legCaneIsland")) +
        dot("#fff", T("legFactory")) + dot("#fff3e3", T("legBrown"), true) +
        '<div class="row" style="color:var(--ink-3)">' + T("legClick") + "</div>";
    }
    legendEl.innerHTML = h;
  }

  // ---------- info panel ----------
  function showInfo(html) {
    info.querySelector(".info-body").innerHTML = html;
    info.hidden = false;
  }
  function hideInfo() { info.hidden = true; }
  info.querySelector(".info-close").addEventListener("click", hideInfo);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideInfo(); });

  function rows(list) {
    return "<dl>" + list.filter(function (r) { return r[1] != null; }).map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("") + "</dl>";
  }
  function showCountry(d) {
    var c = d.properties.fao, p = d.properties;
    showInfo("<h3>" + (lang === "ja" ? (p.NAME_JA || p.NAME_EN) : p.NAME_EN) + "</h3><p class='sub'>FAOSTAT " + D.fao.year + "</p>" +
      rows([[T("iBeet"), c.beet ? mt(c.beet) + " " + T("uMt") : "–"], [T("iCane"), c.cane ? mt(c.cane) + " " + T("uMt") : "–"]]) +
      "<p class='src'>" + T("srcFao") + "</p>");
  }
  function showRegion(p) {
    var r = p.r, metric = D.jp.beet.region_metric;
    var name = r ? L(r, "name") : p.name;
    var body = r ? rows([
      [T("iArea"), r.area_ha != null ? nf(r.area_ha) + " ha" : null],
      [T("iHarvest"), r.harvest_t != null ? nf(r.harvest_t) + " t" : null],
      [T("iShare"), nf(100 * r[metric] / D.jp.beet[metric], 1) + "%"]
    ]) + "<p class='src'>" + L(D.jp.beet, "region_year") + " · " + L(D.jp.beet, "region_src") + "</p>" : "<p class='sub'>" + T("iNoData") + "</p>";
    showInfo("<h3>" + name + "</h3><p class='sub'>" + T("iBeetRegion") + "</p>" + body);
  }
  function showIsland(i) {
    var src = i.pref === "okinawa" ? D.jp.cane.okinawa : D.jp.cane.kagoshima;
    showInfo("<h3>" + L(i, "name") + "</h3><p class='sub'>" + T(i.pref === "okinawa" ? "iOkinawa" : "iKagoshima") + "</p>" +
      rows([
        [T("iCaneArea"), i.area_ha != null ? nf(i.area_ha) + " ha" : null],
        [T("iCaneT"), nf(i.cane_t) + " t"],
        [T("iSugarT"), i.sugar_t != null ? nf(i.sugar_t) + " t" : null]
      ]) + (i.note_en ? "<p class='sub'>" + L(i, "note") + "</p>" : "") +
      "<p class='src'>" + L(src, "src") + "</p>");
  }
  function showFactory(f) {
    var kind = f.crop === "beet" ? T("iBeetFactory") : f.type === "noncentrifugal" ? T("iBrownFactory") : T("iCaneFactory");
    showInfo("<h3>" + L(f, "name") + "</h3><p class='sub'>" + kind + "</p>" +
      rows([[T("iCompany"), L(f, "company")], [T("iPlace"), L(f, "place")]]) +
      (f.note_en ? "<p class='sub'>" + L(f, "note") + "</p>" : "") +
      "<p class='src'>" + T("iSrc") + ": " + L(f, "src") + "</p>");
  }

  // ---------- language ----------
  function applyLang() {
    prepare(); // names, years and number formats in the text depend on the language
    document.documentElement.lang = lang;
    document.title = T("title");
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = T(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) { el.innerHTML = T(el.getAttribute("data-i18n-html")); });
    document.querySelectorAll(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-lang") === lang ? "true" : "false"); });
    svgText();
    var bl = document.getElementById("both-list");
    bl.innerHTML = D.both.map(function (c) {
      var f = D.countries.filter(function (x) { return x.properties.fao === c; })[0];
      var nm = f ? (lang === "ja" ? f.properties.NAME_JA : f.properties.NAME_EN) : c.name;
      return "<li" + (c.m49 === "392" ? " class='jp'" : "") + ">" + nm + "</li>";
    }).join("");
    renderNotes();
    if (gJapan) placeJapanLabels(false);
    renderLegend(scene);
    hideInfo();
  }
  // text inside the SVG; called after every (re)build as well as on language change
  function svgText() {
    svg.select("title").text(T("mapTitle"));
    svg.selectAll("[data-k]").each(function () { this.textContent = T(this.getAttribute("data-k")); });
    var monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    svg.selectAll("[data-month]").each(function () { var m = +this.getAttribute("data-month"); this.textContent = lang === "ja" ? m + "月" : monthsEn[m - 1]; });
    svg.select(".sp-self").text(T("spSelf"));
    svg.select(".sp-self-sub").text(T("spSelfSub"));
    svg.select(".se-beet").text(T("seBeet"));
    svg.select(".se-cane").text(T("seCane"));
    svg.select(".se-k1").text(T("seK1"));
    svg.select(".se-k2").text(T("seK2"));
  }

  document.querySelectorAll(".lang button").forEach(function (b) {
    b.addEventListener("click", function () {
      lang = b.getAttribute("data-lang");
      try { localStorage.setItem("snowsun-lang", lang); } catch (e) {}
      var u = new URL(location.href); u.searchParams.set("lang", lang); history.replaceState(null, "", u);
      applyLang();
    });
  });

  function renderNotes() {
    var el = document.getElementById("notes-body");
    var src = D.jp.sources.map(function (s) {
      return "<li>" + L(s, "text") + (s.url ? ' <a href="' + s.url + '" rel="noopener">' + T("link") + "</a>" : "") + "</li>";
    });
    var notes = (D.jp["notes_" + lang] || D.jp.notes_en).map(function (n) { return "<li>" + n + "</li>"; });
    el.innerHTML = "<h3>" + T("notesYears") + "</h3><ul>" + notes.join("") + "</ul>" +
      "<h3>" + T("notesSrc") + "</h3><ul>" + src.join("") + "</ul>" +
      "<h3>" + T("notesCredit") + "</h3><p>" + T("credit") + "</p>";
  }

  // ---------- scroll ----------
  function setupScroll() {
    var steps = Array.prototype.slice.call(document.querySelectorAll(".step"));
    var current = null;
    function activate(el) {
      if (el === current) return;
      current = el;
      steps.forEach(function (s) { s.classList.toggle("active", s === el); });
      var sc = el.getAttribute("data-scene");
      if (sc !== scene || !gWorld.style("opacity") || gWorld.style("opacity") === "0" && sc.indexOf("world") === 0) renderScene(sc, false);
    }
    renderScene("japan", true);
    activate(steps[0]);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) activate(e.target); });
    }, { rootMargin: window.innerWidth <= 800 ? "-72% 0px -26% 0px" : "-45% 0px -45% 0px", threshold: 0 });
    steps.forEach(function (s) { io.observe(s); });
  }
})();
