/* Estimation simulator (v2): reads the precomputed results in data/simulator/ (manifest.json with a
   compact summary of every combination, and one runs/<key>.json per simulation, fetched when first
   needed and kept) and draws, as inline SVG, the estimate against the truth per layer, where the error
   comes from, a scatter of the departures, and the cumulative trend when the disturbances are added
   one by one. Plain script, no libraries. Nothing is computed here beyond picking entries, means,
   departures and the station's correlation, and formatting them. */
(function () {
  "use strict";

  var BASE = "data/simulator/";
  var C = {
    truth: "#17191c", radar: "#d62728", station: "#9a9a9a", grid: "#ece9e1", axis: "#cdc9be", muted: "#6e747b", ink2: "#3c4249",
    air: "#15688f", pos: "#2f7d3a", neg: "#a8433b"
  };
  var KEYS = ["atm", "sinking", "shrinking", "thermal", "crossrange", "noise", "points", "layers"];
  var TOGGLES = ["sinking", "shrinking", "thermal", "crossrange"];
  /* the fixed order of the cumulative trend, and one colour per disturbance shared by both bar charts */
  var STEPS = ["noise", "sinking", "shrinking", "thermal", "crossrange"];
  var DIST = {
    noise: { label: "Noise", long: "radar noise", color: "#7d6bb0" },
    sinking: { label: "Sinking", long: "sinking", color: "#8a6a45" },
    shrinking: { label: "Shrinking", long: "shrinking", color: "#c58a2c" },
    thermal: { label: "Thermal", long: "thermal dilation", color: "#d2603a" },
    crossrange: { label: "Cross-range", long: "the cross-range error", color: "#2f8c86" }
  };
  var ATM_NAME = { simulated: "KNMI-built air", radiosonde: "the balloon soundings of 2025", cabauw: "the Cabauw tower air of 2025" };
  var LAYERS_NAME = { "20": "20 m layers", "40": "40 m layers", "2": "two layers", "1": "one layer" };
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  var form = document.getElementById("sim-controls");
  var statusEl = document.getElementById("sim-status");
  var out = document.getElementById("sim-out");
  var scSel = document.getElementById("sim-sc-layer");
  if (!form || !out) return;

  var manifest = null, state = {}, runs = {}, last = null, token = 0, scLayer = 0;

  /* ------------------------------------------------------------ small helpers */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ok(v) { return v !== null && v !== undefined && !isNaN(v); }
  function num(v, d) { return ok(v) ? (+v).toFixed(d === undefined ? 1 : d).replace("-", "−") : "n/a"; }
  function signed(v, d) { return ok(v) ? (v > 0 ? "+" : "") + num(v, d) : "n/a"; }
  function thousands(v) { v = Math.round(+v); return v >= 10000 ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") : String(v); }
  function fmtDate(iso) { var p = iso.split("-"); return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function day(iso) { var p = iso.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function mean(a) { var s = 0, n = 0; a.forEach(function (v) { if (ok(v)) { s += v; n++; } }); return n ? s / n : NaN; }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0); }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ticks(d0, d1, count) {
    var span = d1 - d0 || 1, step = Math.pow(10, Math.floor(Math.log10(span / count))), err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var t = [];
    for (var v = Math.ceil(d0 / step - 1e-9) * step; v <= d1 + 1e-9; v += step) t.push(+v.toFixed(10));
    return t;
  }
  function tickLabel(v) { var s = Math.abs(v) >= 10 || v === Math.round(v) ? v.toFixed(0) : v.toFixed(1); return s.replace("-", "−"); }
  function layerLabel(e, k) { return Math.round(e[k]) + "–" + Math.round(e[k + 1]) + " m"; }
  function width(el) { return Math.max(240, Math.floor(el.clientWidth || 600)); }
  function svg(w, h, body, label) {
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"' +
      (label ? ' role="img" aria-label="' + esc(label) + '"' : ' aria-hidden="true"') + ">" + body + "</svg>";
  }
  function text(x, y, s, o) {
    o = o || {};
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + (o.size || 11) + '" fill="' + (o.fill || C.muted) + '"' +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : "") + (o.base ? ' dominant-baseline="' + o.base + '"' : "") +
      (o.rot ? ' transform="rotate(' + o.rot + " " + x.toFixed(1) + " " + y.toFixed(1) + ')"' : "") +
      (o.weight ? ' font-weight="' + o.weight + '"' : "") + ">" + (o.raw ? s : esc(s)) + "</text>";
  }
  function tspan(s, fill, weight) { return '<tspan fill="' + fill + '"' + (weight ? ' font-weight="' + weight + '"' : "") + ">" + esc(s) + "</tspan>"; }
  function line(x1, y1, x2, y2, stroke, w, extra) {
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + stroke + '" stroke-width="' + (w || 1) + '"' + (extra || "") + "/>";
  }
  function rect(x, y, w, h, fill, extra) {
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(0, w).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" fill="' + fill + '"' + (extra || "") + "/>";
  }
  function path(pts) { var d = ""; pts.forEach(function (p) { if (p) d += (d ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }); return d; }
  function skillColor(v) { return v > 0 ? C.pos : C.neg; }

  /* ------------------------------------------------------------ state and the manifest */
  function runKey(s) { return s.atm + "_s" + s.sinking + s.shrinking + s.thermal + s.crossrange + "_n" + s.noise + "_p" + s.points; }
  function summ(s) { var v = manifest.summary && manifest.summary[runKey(s) + "|" + s.layers]; return v && !v.error && v.rmse ? v : null; }
  function variant(s, over) { var t = {}; KEYS.forEach(function (k) { t[k] = String(s[k]); }); for (var k in over) t[k] = String(over[k]); return t; }
  function airOnly(s) { return variant(s, { sinking: 0, shrinking: 0, thermal: 0, crossrange: 0, noise: 0 }); }
  function selected(s) { return STEPS.filter(function (k) { return k === "noise" ? s.noise !== "0" : s[k] === "1"; }); }
  function distName(k, s, cap) { var n = k === "noise" ? s.noise + " mm noise" : DIST[k].long; return cap ? n.charAt(0).toUpperCase() + n.slice(1) : n; }
  function listWords(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
  function colSkill(sm) { return sm ? 1 - Math.pow(sm.column_rmse / sm.column_station_rmse, 2) : NaN; }

  function fromForm() {
    var s = {};
    ["atm", "noise", "points", "layers"].forEach(function (k) {
      var r = form.querySelector('input[name="' + k + '"]:checked');
      s[k] = r ? r.value : String(manifest.defaults[k]);
    });
    TOGGLES.forEach(function (k) { s[k] = form.elements[k].checked ? "1" : "0"; });
    return s;
  }
  function toForm(s) {
    ["atm", "noise", "points", "layers"].forEach(function (k) {
      form.querySelectorAll('input[name="' + k + '"]').forEach(function (r) { r.checked = r.value === String(s[k]); });
    });
    TOGGLES.forEach(function (k) { form.elements[k].checked = String(s[k]) === "1"; });
  }
  function valid(k, v) { return manifest.controls[k] && manifest.controls[k].map(String).indexOf(String(v)) >= 0; }
  function initialState() {
    var q = new URLSearchParams(location.search), s = {};
    KEYS.forEach(function (k) { var v = q.get(k); s[k] = v !== null && valid(k, v) ? v : String(manifest.defaults[k]); });
    return s;
  }
  function writeUrl(s) {
    try {
      var q = new URLSearchParams(location.search), def = true;
      KEYS.forEach(function (k) { if (String(s[k]) !== String(manifest.defaults[k])) def = false; });
      KEYS.forEach(function (k) { if (def) q.delete(k); else q.set(k, s[k]); });
      var qs = q.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    } catch (e) { /* file:// or sandboxed: not important */ }
  }

  /* ------------------------------------------------------------ loading */
  function getJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + " (" + r.status + ")");
      return r.json();
    });
  }
  function getRun(key) {
    if (!runs[key]) {
      var p = manifest.runs && manifest.runs[key];
      runs[key] = p ? getJson(BASE + p) : Promise.reject({ missing: true, message: key });
      runs[key].catch(function () { delete runs[key]; }); /* allow a retry on the next change */
    }
    return runs[key];
  }
  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "sim-status" + (kind ? " " + kind : "");
    statusEl.hidden = !msg;
  }

  function update() {
    var prevLayers = state.layers;
    state = fromForm();
    if (state.layers !== prevLayers) scLayer = 0;
    writeUrl(state);
    var key = runKey(state), my = ++token;
    var slow = setTimeout(function () { if (my === token) { setStatus("Loading the results for this combination…"); out.classList.add("busy"); } }, 120);
    getRun(key).then(function (run) {
      if (my !== token) return;
      clearTimeout(slow); out.classList.remove("busy");
      var entry = run.results && run.results[state.layers];
      if (!entry) throw new Error("no result for " + state.layers + " in " + key);
      last = { run: run, entry: entry, state: state };
      render();
    }).catch(function (err) {
      if (my !== token) return;
      clearTimeout(slow); out.classList.remove("busy");
      out.hidden = true; last = null;
      setStatus(err && err.missing ? "This combination (" + err.message + ") is not in the published results yet. Try another setting, or press “Reset to realistic”."
        : "The results for this combination could not be loaded (" + (err && err.message) + "). Try another setting, or reload the page.", "error");
    });
  }

  /* ------------------------------------------------------------ rendering */
  function render() {
    if (!last) return;
    var e = last.entry, s = last.state;
    if (e.error) {
      out.hidden = true;
      setStatus("The estimation could not run for this combination: " + e.error + ". Thinner layers need more radar points; try thicker layers, more points or less noise.", "error");
      return;
    }
    setStatus("");
    out.hidden = false;
    var sm = summ(s) || { rmse: e.rmse, station_rmse: e.station_rmse, skill: e.skill, column_rmse: ok(e.column_rmse) ? e.column_rmse : NaN, column_station_rmse: ok(e.column_station_rmse) ? e.column_station_rmse : NaN, edges: e.edges };
    document.getElementById("sim-verdict").textContent = verdict(e, s, sm);
    renderStats(e, s, sm);
    fillLayerPick(e);
    renderAttr(document.getElementById("sim-attr"), s);
    renderScatter(document.getElementById("sim-sc"), e);
    renderSeries(document.getElementById("sim-ts"), e, last.run);
    renderCum(document.getElementById("sim-cum"), s);
    renderDecide(document.getElementById("sim-decide"), e, s, sm);
  }

  function wins(e) { var w = []; for (var k = 0; k < e.rmse.length; k++) if (e.skill[k] > 0) w.push(k); return w; }

  function verdict(e, s, sm) {
    var sel = selected(s), nl = e.rmse.length, w = wins(e);
    var what = sel.length ? "with " + listWords(sel.map(function (k) { return distName(k, s); })) : "with nothing switched on";
    var head = "On " + ATM_NAME[s.atm] + " " + what + ", the radar's " + (nl > 1 ? "column " : "") + "error is " + num(sm.column_rmse, 1) +
      " N against " + num(sm.column_station_rmse, 1) + " N for the weather station alone";
    if (nl === 1) return head + (w.length ? ": the radar adds something." : ": the station alone does better.");
    return head + "; per layer the radar beats the station in " + (w.length === nl ? "all " + nl : w.length ? w.length + " of " + nl : "none of the " + nl) + ".";
  }

  function stat(v, unit, k, ic, cls) {
    var i = ic && window.VRS_ICON ? '<span class="s-ic">' + window.VRS_ICON(ic) + "</span>" : "";
    return '<div class="stat' + (cls ? " " + cls : "") + '">' + i + '<span class="v">' + v + (unit ? ' <span class="u">' + unit + "</span>" : "") + '</span><span class="k">' + k + "</span></div>";
  }
  function renderStats(e, s, sm) {
    var nl = e.rmse.length, w = wins(e), cs = colSkill(sm);
    var html = stat(num(sm.column_rmse, 2), "N", "radar estimate, rms error" + (nl > 1 ? " of the column mean" : ""), "radar", "s-radar") +
      stat(num(sm.column_station_rmse, 2), "N", "weather station alone, rms error", "thermo", "s-station") +
      stat('<span style="color:' + skillColor(cs) + '">' + signed(cs, 2) + "</span>", "", "skill vs the station" + (nl > 1 ? "; beats it in " + w.length + " of " + nl + " layers" : ""), "target", "s-skill") +
      stat(ok(e.points_used) ? thousands(e.points_used) : "n/a", "points", "used, of " + thousands(s.points) + (ok(e.buildings) ? ", on " + e.buildings + " buildings" : ""), "grid");
    document.getElementById("sim-stats").innerHTML = html;
  }

  /* ---- 1. estimate against the truth over time: one panel per layer, highest on top, shared time axis */
  function timeTicks(d0, d1, w) {
    var a = new Date(d0 * 864e5), b = new Date(d1 * 864e5), t = [];
    if (d1 - d0 > 700) {
      var step = w < 520 ? 2 : 1;
      for (var y = a.getUTCFullYear() + 1; y <= b.getUTCFullYear(); y += step) t.push({ d: Date.UTC(y, 0, 1) / 864e5, s: w < 520 ? "’" + String(y).slice(2) : String(y) });
      return { ticks: t, title: "" };
    }
    var mstep = w < 420 ? 3 : w < 700 ? 2 : 1, m = a.getUTCMonth() + (a.getUTCDate() > 1 ? 1 : 0), yr = a.getUTCFullYear();
    for (;;) {
      var d = Date.UTC(yr + Math.floor(m / 12), m % 12, 1) / 864e5;
      if (d > d1) break;
      if ((m % 12) % mstep === 0) t.push({ d: d, s: MONTHS[m % 12].slice(0, 3) });
      m++;
    }
    var y0 = a.getUTCFullYear(), y1 = b.getUTCFullYear();
    return { ticks: t, title: y0 === y1 ? String(y0) : y0 + "–" + y1 };
  }
  function renderSeries(el, e, run) {
    var w = width(el), nl = e.series.length;
    var tx = run.epochs.map(day), d0 = tx[0], d1 = tx[tx.length - 1], pad = (d1 - d0) * 0.012;
    var m = { l: 46, r: 10 }, narrow = w < 520, head = narrow ? 30 : 19, gap = 9, bottom = 34;
    /* fill the height of the two cards beside it when the layout puts them there */
    var card = el.closest(".app-card"), side = document.querySelector(".sim-attr-card"), sc = document.querySelector(".sim-sc-card");
    var ph = nl === 1 ? 290 : nl === 2 ? 210 : nl <= 4 ? 150 : 104;
    if (card && side && sc && side.offsetLeft > card.offsetLeft + 40) {
      var target = sc.offsetTop + sc.offsetHeight - card.offsetTop - (el.offsetTop - card.offsetTop) - 14;
      ph = clamp((target - bottom) / nl - head - gap, 58, 300);
    }
    var xs = lin(d0 - pad, d1 + pad, m.l, w - m.r), tt = timeTicks(d0, d1, w);
    var H = nl * (head + ph + gap) + bottom, body = "", y = 0, r = tx.length > 300 ? 1.4 : narrow ? 1.7 : 2.1;
    for (var i = nl - 1; i >= 0; i--) {
      var sr = e.series[i], k = sr.layer !== undefined ? sr.layer : i;
      var vals = sr.truth.concat(sr.est, sr.station || []).filter(ok);
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), p = (hi - lo) * 0.05 || 1;
      var top = y + head, bot = top + ph, ys = lin(lo - p, hi + p, bot, top);
      var label = sr.label ? sr.label.replace(/(\d)-(\d)/, "$1–$2") : layerLabel(e.edges, k);
      var stats = tspan("radar ", C.muted) + tspan(num(e.rmse[k], 2) + " N", C.radar, 600) + tspan("  ·  station ", C.muted) + tspan(num(e.station_rmse[k], 2) + " N", C.ink2, 600) +
        tspan("  ·  skill ", C.muted) + tspan(signed(e.skill[k], 2), skillColor(e.skill[k]), 650);
      if (narrow) {
        body += text(m.l - 40, y + 11, label, { fill: C.truth, weight: 650, size: 12 });
        body += text(m.l - 40, y + 25, stats, { size: 11, raw: 1 });
      } else {
        body += text(m.l, y + 12, tspan(label, C.truth, 650) + tspan("    ", C.muted) + stats, { size: 11.5, raw: 1 });
      }
      body += rect(m.l, top, w - m.l - m.r, ph, "#fcfbf8");
      ticks(lo - p, hi + p, ph < 90 ? 2 : 3).forEach(function (v) {
        var yy = ys(v); body += line(m.l, yy, w - m.r, yy, C.grid) + text(m.l - 6, yy, tickLabel(v), { anchor: "end", base: "middle", size: 10 });
      });
      tt.ticks.forEach(function (t) { var xx = xs(t.d); body += line(xx, top, xx, bot, C.grid); });
      body += line(m.l, bot, w - m.r, bot, C.axis) + line(m.l, top, m.l, bot, C.axis);
      if (sr.station) body += '<path d="' + path(sr.station.map(function (v, j) { return ok(v) ? [xs(tx[j]), ys(v)] : null; })) + '" fill="none" stroke="' + C.station + '" stroke-width="1" stroke-opacity=".9" stroke-linejoin="round"/>';
      body += '<path d="' + path(sr.truth.map(function (v, j) { return ok(v) ? [xs(tx[j]), ys(v)] : null; })) + '" fill="none" stroke="' + C.truth + '" stroke-width="1.15" stroke-linejoin="round"/>';
      var dots = "";
      sr.est.forEach(function (v, j) { if (ok(v)) dots += '<circle cx="' + xs(tx[j]).toFixed(1) + '" cy="' + ys(v).toFixed(1) + '" r="' + r + '"/>'; });
      body += '<g fill="' + C.radar + '" fill-opacity=".75">' + dots + "</g>";
      y = bot + gap;
    }
    var axisY = y - gap;
    tt.ticks.forEach(function (t) { body += text(xs(t.d), axisY + 15, t.s, { anchor: "middle", size: 10.5 }); });
    if (tt.title) body += text(w - m.r, axisY + 30, tt.title, { anchor: "end", size: 10.5, fill: C.ink2 });
    if (!narrow) body += text(12, (axisY) / 2, "N (N-units)", { anchor: "middle", fill: C.ink2, size: 11, rot: -90, base: "middle" });
    el.innerHTML = svg(w, H, body, "Per layer, highest first: the true layer mean, the radar estimate and the weather station alone on each of " + tx.length + " passes. Radar rms error " +
      e.rmse.map(function (v) { return num(v, 2); }).join(", ") + " N; station " + e.station_rmse.map(function (v) { return num(v, 2); }).join(", ") + " N, lowest layer first.");
  }

  /* ---- 2. attribution: column error for air only, each disturbance alone, and everything selected */
  function renderAttr(el, s) {
    var air = airOnly(s), rows = [];
    rows.push({ label: "Air only", sm: summ(air), color: C.air, base: true });
    STEPS.forEach(function (k) {
      var on = k === "noise" ? s.noise !== "0" : s[k] === "1", over = {};
      if (k === "noise") over.noise = on ? s.noise : String(manifest.defaults.noise); else over[k] = 1;
      rows.push({ label: k === "noise" ? "Noise " + over.noise + " mm" : DIST[k].label, sm: summ(variant(air, over)), color: DIST[k].color, off: !on });
    });
    rows.push({ label: "All selected", sm: summ(s), color: C.radar, total: true });
    var airV = rows[0].sm ? rows[0].sm.column_rmse : 0, st = summ(s) || rows[0].sm;
    var stV = st ? st.column_station_rmse : NaN;
    var w = width(el), narrow = w < 420, rowH = narrow ? 27 : 31, m = { l: narrow ? 86 : 100, r: 44, t: 24, b: 30 };
    var H = m.t + rows.length * rowH + 8 + m.b;
    var vmax = Math.max.apply(null, rows.map(function (r) { return r.sm ? r.sm.column_rmse : 0; }).concat([ok(stV) ? stV : 0])) * 1.05;
    var xt = ticks(0, vmax, narrow ? 4 : 6), xmax = Math.max(vmax, xt[xt.length - 1]), xs = lin(0, xmax, m.l, w - m.r);
    var body = "", plotB = H - m.b;
    xt.forEach(function (v) { var x = xs(v); body += line(x, m.t - 6, x, plotB, C.grid) + text(x, plotB + 14, tickLabel(v), { anchor: "middle", size: 10 }); });
    body += text((m.l + w - m.r) / 2, H - 4, "error of the column mean, rms over the passes (N)", { anchor: "middle", size: 10.5, fill: C.ink2 });
    rows.forEach(function (r, i) {
      var y = m.t + i * rowH + (r.total ? 8 : 0), bh = rowH - 11, cy = y + bh / 2;
      if (r.total) body += line(8, y - 5, w - 6, y - 5, "#e4e1d9");
      body += text(m.l - 8, cy, r.label, { anchor: "end", base: "middle", size: narrow ? 10.5 : 11.5, fill: r.off ? "#9aa0a6" : C.truth, weight: r.total || r.base ? 650 : 500 });
      if (!r.sm) { body += text(m.l + 4, cy, "not computed", { base: "middle", size: 10.5 }); return; }
      var v = r.sm.column_rmse, op = r.off ? ' fill-opacity=".28"' : "";
      body += rect(m.l, y, xs(v) - m.l, bh, r.color, op + ' rx="2"');
      /* the part the air alone already gives, lighter: what sticks out is the disturbance's share */
      if (!r.base && !r.total && airV) body += rect(m.l, y, Math.min(xs(airV), xs(v)) - m.l, bh, "#ffffff", ' fill-opacity="' + (r.off ? ".35" : ".55") + '"');
      var lab = num(v, 2) + (r.off ? " off" : "");
      body += text(xs(v) + 5, cy, lab, { base: "middle", size: 10.5, fill: r.off ? "#9aa0a6" : C.ink2, weight: r.total ? 650 : 500 });
    });
    if (ok(stV)) {
      var sx = xs(stV);
      body += line(sx, m.t - 8, sx, plotB, "#7a7f86", 1.3, ' stroke-dasharray="4 3"');
      var right = sx > w - m.r - 60;
      body += text(right ? sx - 4 : sx + 4, m.t - 11, "station alone " + num(stV, 2), { anchor: right ? "end" : "start", size: 10.5, fill: C.ink2 });
    }
    el.innerHTML = svg(w, H, body, "Column error: " + rows.map(function (r) { return r.label + " " + (r.sm ? num(r.sm.column_rmse, 2) : "n/a") + " N"; }).join("; ") + "; station alone " + num(stV, 2) + " N.");
    var sub = document.getElementById("sim-attr-sub");
    if (sub) sub.innerHTML = "Each disturbance on its own on top of the air (with no noise unless it is the noise), " + esc(ATM_NAME[s.atm].replace(/^the /, "")) + ", " +
      thousands(s.points) + " points, " + LAYERS_NAME[s.layers] + ". The pale start of each bar is what the air alone gives; faded bars are switched off.";
  }

  /* ---- 3. scatter of departures: estimate against truth, one dot per pass, for one layer */
  function fillLayerPick(e) {
    var nl = e.series.length, h = "";
    if (scLayer >= nl) scLayer = 0;
    for (var k = nl - 1; k >= 0; k--) h += '<option value="' + k + '"' + (k === scLayer ? " selected" : "") + ">" + esc(layerLabel(e.edges, k)) + (k === 0 ? " (lowest)" : "") + "</option>";
    scSel.innerHTML = h;
    scSel.disabled = nl < 2;
  }
  function anomalies(a) { var m = mean(a); return a.map(function (v) { return ok(v) ? v - m : null; }); }
  function corr(x, y) {
    var px = [], py = [];
    x.forEach(function (v, i) { if (ok(v) && ok(y[i])) { px.push(v); py.push(y[i]); } });
    var mx = mean(px), my = mean(py), sxy = 0, sxx = 0, syy = 0;
    px.forEach(function (v, i) { sxy += (v - mx) * (py[i] - my); sxx += (v - mx) * (v - mx); syy += (py[i] - my) * (py[i] - my); });
    return sxy / Math.sqrt(sxx * syy);
  }
  function renderScatter(el, e) {
    var k = scLayer, sr = e.series[k], f = (e.fit || [])[k] || null;
    var ta = anomalies(sr.truth), ea = anomalies(sr.est), sa = sr.station ? anomalies(sr.station) : null;
    var lim = 0;
    ta.concat(ea, sa || []).forEach(function (v) { if (ok(v)) lim = Math.max(lim, Math.abs(v)); });
    lim = ticks(0, lim * 1.06, 3).pop() >= lim * 1.06 ? ticks(0, lim * 1.06, 3).pop() : lim * 1.06;
    var w = width(el), m = { l: 46, r: 12, t: 10, b: 40 };
    var side = Math.min(w - m.l - m.r, 340), H = side + m.t + m.b, x0 = m.l + Math.max(0, (w - m.l - m.r - side) / 2);
    var xs = lin(-lim, lim, x0, x0 + side), ys = lin(-lim, lim, m.t + side, m.t), tk = ticks(-lim, lim, side < 260 ? 4 : 6);
    var body = rect(x0, m.t, side, side, "#fcfbf8");
    tk.forEach(function (v) {
      body += line(xs(v), m.t, xs(v), m.t + side, v === 0 ? "#dcd8ce" : C.grid) + line(x0, ys(v), x0 + side, ys(v), v === 0 ? "#dcd8ce" : C.grid);
      body += text(xs(v), m.t + side + 14, tickLabel(v), { anchor: "middle", size: 10 }) + text(x0 - 6, ys(v), tickLabel(v), { anchor: "end", base: "middle", size: 10 });
    });
    body += '<rect x="' + x0 + '" y="' + m.t + '" width="' + side + '" height="' + side + '" fill="none" stroke="' + C.axis + '"/>';
    body += text(x0 + side / 2, H - 6, "true departure (N)", { anchor: "middle", size: 11, fill: C.ink2 });
    body += text(x0 - 34, m.t + side / 2, "estimated departure (N)", { anchor: "middle", size: 11, fill: C.ink2, rot: -90, base: "middle" });
    var clip = "sc-clip-" + k;
    body += '<defs><clipPath id="' + clip + '"><rect x="' + x0 + '" y="' + m.t + '" width="' + side + '" height="' + side + '"/></clipPath></defs><g clip-path="url(#' + clip + ')">';
    var r = ta.length > 300 ? 1.7 : 2.3, d = "";
    if (sa) { sa.forEach(function (v, i) { if (ok(v) && ok(ta[i])) d += '<circle cx="' + xs(ta[i]).toFixed(1) + '" cy="' + ys(v).toFixed(1) + '" r="' + (r * 0.85) + '"/>'; }); body += '<g fill="' + C.station + '" fill-opacity=".45">' + d + "</g>"; }
    d = "";
    ea.forEach(function (v, i) { if (ok(v) && ok(ta[i])) d += '<circle cx="' + xs(ta[i]).toFixed(1) + '" cy="' + ys(v).toFixed(1) + '" r="' + r + '"/>'; });
    body += '<g fill="' + C.radar + '" fill-opacity=".6">' + d + "</g>";
    body += line(xs(-lim), ys(-lim), xs(lim), ys(lim), C.truth, 1.2, ' stroke-dasharray="5 4"');
    if (f) body += line(xs(-lim), ys(f.slope * -lim + f.intercept), xs(lim), ys(f.slope * lim + f.intercept), C.radar, 2);
    body += "</g>";
    var label = layerLabel(e.edges, k);
    el.innerHTML = svg(w, H, body, "Layer " + label + ": estimated against true departure from the mean, one dot per pass" + (f ? "; fitted slope " + num(f.slope, 2) + ", r " + num(f.r, 2) : "") + ".");
    var rs = sa ? corr(ta, sa) : NaN;
    document.getElementById("sim-sc-legend").innerHTML =
      '<li><i class="dt"></i><span>radar' + (f ? ": slope <b>" + num(f.slope, 2) + "</b>, r <b>" + num(f.r, 2) + "</b>" : "") + ", rms error <b>" + num(e.rmse[k], 2) + " N</b></span></li>" +
      (sa ? '<li><i class="dt grey"></i><span>station: r <b>' + num(rs, 2) + "</b>, rms error <b>" + num(e.station_rmse[k], 2) + " N</b></span></li>" : "") +
      '<li><i class="ln red"></i>fitted line</li><li><i class="ln dash"></i>1 : 1, perfect</li>';
  }

  /* ---- 4. cumulative trend: from air only, add the selected disturbances in a fixed order */
  function cumSteps(s) {
    var cur = airOnly(s), st = [{ key: "air", label: "Air only", sm: summ(cur), color: C.air }];
    selected(s).forEach(function (k) {
      cur = variant(cur, k === "noise" ? { noise: s.noise } : (function () { var o = {}; o[k] = 1; return o; })());
      st.push({ key: k, label: k === "noise" ? "Noise " + s.noise + " mm" : DIST[k].label, sm: summ(cur), color: DIST[k].color });
    });
    return st;
  }
  function renderCum(el, s) {
    var steps = cumSteps(s), w = width(el);
    var bars = steps.concat([{ key: "all", label: "All selected", sm: summ(s), color: C.radar, total: true }]);
    var st = summ(s), stV = st ? st.column_station_rmse : NaN;
    var rot = (w - 50) / bars.length < 62;
    var m = { l: 40, r: 10, t: 22, b: rot ? 62 : 34 }, H = rot ? 290 : 270;
    var vals = bars.map(function (b) { return b.sm ? b.sm.column_rmse : 0; }).concat([ok(stV) ? stV : 0]);
    var vmax = Math.max.apply(null, vals) * 1.1, yt = ticks(0, vmax, 5), ymax = Math.max(vmax, yt[yt.length - 1]);
    var ys = lin(0, ymax, H - m.b, m.t), slot = (w - m.l - m.r) / bars.length, bw = Math.min(64, slot * 0.62);
    var body = "";
    yt.forEach(function (v) { body += line(m.l, ys(v), w - m.r, ys(v), C.grid) + text(m.l - 6, ys(v), tickLabel(v), { anchor: "end", base: "middle", size: 10 }); });
    body += line(m.l, ys(0), w - m.r, ys(0), C.axis);
    body += text(11, (m.t + H - m.b) / 2, "column error (N)", { anchor: "middle", size: 11, fill: C.ink2, rot: -90, base: "middle" });
    var prev = null;
    bars.forEach(function (b, i) {
      var cx = m.l + slot * (i + 0.5), x = cx - bw / 2;
      var strong = b.total || i === 0, lo = { size: rot ? 10.5 : 11, fill: strong ? C.truth : C.ink2, weight: strong ? 650 : 500 };
      if (rot) { lo.anchor = "end"; lo.rot = -38; body += text(cx + 4, H - m.b + 12, b.label, lo); }
      else { lo.anchor = "middle"; body += text(cx, H - m.b + 15, b.label, lo); }
      if (!b.sm) { body += text(cx, ys(0) - 8, "n/a", { anchor: "middle", size: 10 }); prev = null; return; }
      var v = b.sm.column_rmse;
      if (i === 0 || b.total) {
        body += rect(x, ys(v), bw, ys(0) - ys(v), b.color, ' rx="2"');
        body += text(cx, ys(v) - 6, num(v, 2), { anchor: "middle", size: 10.5, fill: C.truth, weight: 650 });
      } else if (prev !== null) {
        var up = v >= prev, y0 = ys(Math.max(v, prev)), y1 = ys(Math.min(v, prev));
        body += rect(x, y0, bw, Math.max(1.5, y1 - y0), b.color, up ? ' rx="2"' : ' rx="2" fill-opacity=".35" stroke="' + b.color + '" stroke-dasharray="3 2"');
        body += text(cx, y0 - 6, signed(v - prev, 2), { anchor: "middle", size: 10.5, fill: up ? C.ink2 : C.pos, weight: 600 });
      }
      if (prev !== null && !b.total) {
        var pcx = m.l + slot * (i - 0.5);
        body += line(pcx + bw / 2, ys(prev), x, ys(prev), "#8b9096", 1, ' stroke-dasharray="2 2"');
      }
      if (!b.total) prev = v;
    });
    if (ok(stV)) {
      body += line(m.l, ys(stV), w - m.r, ys(stV), "#7a7f86", 1.3, ' stroke-dasharray="4 3"');
      body += text(w - m.r - 2, ys(stV) - 5, "station alone " + num(stV, 2), { anchor: "end", size: 10.5, fill: C.ink2 });
    }
    el.innerHTML = svg(w, H, body, "Column error after each step: " + bars.map(function (b) { return b.label + " " + (b.sm ? num(b.sm.column_rmse, 2) : "n/a") + " N"; }).join(", ") + ".");
    var sub = document.getElementById("sim-cum-sub");
    var off = STEPS.filter(function (k) { return selected(s).indexOf(k) < 0; });
    if (sub) sub.textContent = "Start from the air alone and switch on the selected disturbances in a fixed order (noise, sinking, shrinking, thermal, cross-range); each bar is the change in the column error." +
      (off.length && off.length < STEPS.length ? " Skipped, because they are off: " + listWords(off.map(function (k) { return k === "noise" ? "noise" : DIST[k].long.replace(/^the /, ""); })) + "." : "") +
      (off.length === STEPS.length ? " Nothing is switched on, so there is nothing to add." : "");
  }

  /* ---- 5. what this means: plain-language reading of the numbers above */
  function renderDecide(el, e, s, sm) {
    var items = [], nl = e.rmse.length, sel = selected(s), air = summ(airOnly(s));
    /* largest contributor: the biggest rise in the cumulative order, checked against each one alone */
    if (sel.length && air) {
      var steps = cumSteps(s), best = null;
      for (var i = 1; i < steps.length; i++) {
        if (!steps[i].sm || !steps[i - 1].sm) continue;
        var dlt = steps[i].sm.column_rmse - steps[i - 1].sm.column_rmse;
        if (!best || dlt > best.d) best = { k: steps[i].key, d: dlt };
      }
      var alone = sel.map(function (k) { var o = {}; o[k] = k === "noise" ? s.noise : 1; var v = summ(variant(airOnly(s), o)); return { k: k, v: v ? v.column_rmse : NaN }; })
        .sort(function (a, b) { return b.v - a.v; });
      if (best) {
        var same = alone[0].k === best.k;
        items.push("<b>Largest contributor: " + esc(distName(best.k, s)) + ".</b> In the order above it adds " + signed(best.d, 2) + " N to the column error; " +
          (same ? "on its own it raises the air-only " + num(air.column_rmse, 2) + " N to " + num(alone[0].v, 2) + " N."
            : "on its own, though, " + esc(distName(alone[0].k, s)) + " does the most harm (" + num(air.column_rmse, 2) + " to " + num(alone[0].v, 2) + " N): the order matters because errors add up in squares."));
      }
    } else if (air) {
      items.push("<b>Nothing is switched on.</b> What is left, " + num(air.column_rmse, 2) + " N, is the estimation's own error on clean data with this air.");
    }
    /* radar against the station, per layer and for the column */
    var w = wins(e), cs = colSkill(sm);
    var wl = w.map(function (k) { return layerLabel(e.edges, k); }), ll = [];
    for (var k = 0; k < nl; k++) if (w.indexOf(k) < 0) ll.push(layerLabel(e.edges, k));
    var colTxt = (nl > 1 ? "For the column mean" : "In its single layer") + " the radar's error is " + num(sm.column_rmse, 2) + " N against " + num(sm.column_station_rmse, 2) + " N (skill " + signed(cs, 2) + ").";
    if (nl === 1) items.push("<b>" + (cs > 0 ? "The radar beats the station." : "The station alone does better.") + "</b> " + colTxt);
    else if (!w.length) items.push("<b>The station alone does better in every layer.</b> " + colTxt);
    else if (w.length === nl) items.push("<b>The radar beats the station in every layer.</b> " + colTxt);
    else items.push("<b>Use the radar for " + esc(listWords(wl)) + "</b>; for " + esc(listWords(ll)) + " the station alone does better. " + colTxt);
    /* points */
    var otherP = s.points === "12000" ? "3000" : "12000", po = summ(variant(s, { points: otherP }));
    if (po) {
      var pct = signed((po.column_rmse - sm.column_rmse) / sm.column_rmse * 100, 0) + "%";
      items.push("<b>Points.</b> With " + thousands(otherP) + " points instead of " + thousands(s.points) + " the column error would be " + num(po.column_rmse, 2) +
        " N instead of " + num(sm.column_rmse, 2) + " N (" + pct + ").");
    }
    /* layer choice: the column error is comparable across the four setups, the skill per layer is not */
    var lay = (manifest.controls.layers || []).map(String).map(function (L) {
      var v = summ(variant(s, { layers: L }));
      return v ? { L: L, c: v.column_rmse, w: v.skill.filter(function (x) { return x > 0; }).length, n: v.skill.length } : { L: L, c: NaN };
    });
    var okL = lay.filter(function (x) { return ok(x.c); });
    if (okL.length > 1) {
      var bestL = okL.slice().sort(function (a, b) { return a.c - b.c; })[0];
      items.push("<b>Layer choice.</b> " + lay.map(function (x) {
        var t = LAYERS_NAME[x.L] + " " + (ok(x.c) ? num(x.c, 2) + " N" + (x.n > 1 ? " (" + x.w + " of " + x.n + " beat the station)" : x.w ? " (beats the station)" : "") : "failed");
        return x.L === s.layers ? "<b>" + t + "</b> (selected)" : t;
      }).join(", ") + ". Smallest column error: " + LAYERS_NAME[bestL.L] + "; thinner layers show more of the profile but each has fewer points.");
    }
    el.innerHTML = items.map(function (t) { return "<li>" + t + "</li>"; }).join("");
  }

  /* ------------------------------------------------------------ start */
  function fillScene() {
    var at = manifest.atmospheres || {};
    document.querySelectorAll("[data-atm-sub]").forEach(function (n) {
      var a = at[n.getAttribute("data-atm-sub")];
      if (a && a.passes) n.textContent = a.passes + " passes";
      if (a && a.label) n.closest("label").title = a.label + (a.first && a.last ? ", " + fmtDate(a.first) + " to " + fmtDate(a.last) : "") + (a.note ? ". " + a.note : "");
    });
    var d = manifest.defaults || {}, rb = document.getElementById("sim-reset");
    if (rb) rb.title = "Realistic: " + (at[d.atm] && at[d.atm].label || d.atm) + ", " + TOGGLES.filter(function (k) { return d[k] == 1; }).map(function (k) { return DIST[k].label.toLowerCase(); }).join(", ") +
      ", " + d.noise + " mm noise, " + thousands(d.points) + " points, " + LAYERS_NAME[String(d.layers)] + ".";
    var asof = document.getElementById("sim-asof");
    if (asof && manifest.generated) asof.textContent = "Synthetic data only, no real radar point is used. Results generated on " + fmtDate(manifest.generated) +
      (manifest.code && manifest.code.virtual_radiosonde ? " with the team's code at " + String(manifest.code.virtual_radiosonde).slice(0, 7) : "") + ".";
  }
  function fail(msg) {
    form.querySelectorAll("input, button").forEach(function (i) { i.disabled = true; });
    form.classList.add("off");
    out.hidden = true;
    setStatus(msg, "error");
  }

  getJson(BASE + "manifest.json").then(function (m) {
    if (!m || !m.controls || !m.defaults || !m.runs || !m.summary) throw new Error("manifest.json is incomplete or still the old version");
    manifest = m;
    /* only offer values the manifest has */
    form.querySelectorAll('input[type="radio"]').forEach(function (r) {
      if (!valid(r.name, r.value)) { r.disabled = true; r.closest("label").hidden = true; }
    });
    TOGGLES.forEach(function (k) { if (!valid(k, 1)) { form.elements[k].disabled = true; form.elements[k].closest("label").hidden = true; } });
    fillScene();
    toForm(initialState());
    form.addEventListener("change", update);
    scSel.addEventListener("change", function () { scLayer = +scSel.value; if (last) renderScatter(document.getElementById("sim-sc"), last.entry); });
    document.getElementById("sim-reset").addEventListener("click", function () { toForm(manifest.defaults); update(); });
    var t = null;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(render, 150); });
    update();
  }).catch(function (err) {
    fail("The simulator results are not on the site yet, or could not be read (" + err.message + "). The page needs data/simulator/manifest.json and its run files; everything else on this page still applies.");
  });

  /* screen readers do not read the tooltip text from CSS: give the info marks a name */
  form.querySelectorAll(".t.i").forEach(function (t) { t.setAttribute("aria-label", t.getAttribute("data-tip")); t.setAttribute("role", "note"); });
})();
