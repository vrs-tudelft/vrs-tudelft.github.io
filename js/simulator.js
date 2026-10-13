/* Estimation simulator (v2): reads the precomputed results in data/simulator/ (manifest.json with a
   compact summary of every combination, and one runs/<key>.json per simulation, fetched when first
   needed and kept) and draws, as inline SVG, Jaap's step-by-step figure (05_results/
   26_long_term_temperature/cabauw_ideal.py): (a) the error per pass with parts of the chain switched
   off and the predicted drift, (b) the error per layer step by step against the station alone, (c) the
   standard estimate against the truth; then which disturbance costs what, and the cumulative trend
   when the disturbances are added one by one. Plain script, no libraries. Nothing is computed here beyond picking entries, means,
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
  /* Jaap's steps: the same estimation chain with parts switched off */
  var STAGES = [
    { key: "layers", label: "layer inversion only (no deformation fit)", short: "layers only", color: "#b9cbe3", w: 1.3 },
    { key: "shrink", label: "+ shrinking term", short: "+ shrinking", color: "#6f95c8", w: 1.3 },
    { key: "std", label: "+ thermal term = standard", short: "standard", color: "#1f5fa8", w: 1.9 }
  ];
  var PRED = "#d1662b";
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  var form = document.getElementById("sim-controls");
  var statusEl = document.getElementById("sim-status");
  var out = document.getElementById("sim-out");
  var scSel = document.getElementById("sim-sc-layer");
  if (!form || !out) return;

  var manifest = null, state = {}, runs = {}, last = null, token = 0, scLayer = -1;
  var shown = { layers: true, shrink: true, std: true, pred: true };

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
  /* a polyline; with times t, a gap of more than gapDays between passes starts a new segment
     (the Cabauw tower has no data from May to July) */
  function path(pts, t, gapDays) {
    var d = "", prev = null;
    pts.forEach(function (p, i) {
      if (!p) return;
      var jump = t && prev !== null && (t[i] - t[prev]) > gapDays;
      d += (d && !jump ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
      prev = i;
    });
    return d;
  }
  function skillColor(v) { return v > 0 ? C.pos : C.neg; }
  /* the chart's height: its card's free space on a tall desktop (CSS flex), else the CSS height */
  function height(el, fallback) { var h = Math.floor(el.clientHeight || 0); return h > 80 ? h : fallback; }
  function plain(html) { var d = document.createElement("div"); d.innerHTML = html; return d.textContent; }
  /* the explanation behind an (i) mark */
  function setTip(id, html) { var t = document.getElementById(id); if (t) { t.setAttribute("data-tip", plain(html)); t.setAttribute("aria-label", plain(html)); } }
  function ft(html) { return ' data-ftip="' + esc(html) + '"'; }

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
    if (state.layers !== prevLayers) scLayer = -1;
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
    renderView();
  }
  /* the views behind the tabs: only the visible one is drawn (a hidden chart has no size) */
  var VIEWS = ["steps", "dist", "decide", "how"], view = "steps";
  try { var v0 = localStorage.getItem("vrs-sim-view"); if (VIEWS.indexOf(v0) >= 0) view = v0; } catch (err) { /* storage blocked */ }
  if (VIEWS.indexOf(location.hash.slice(1)) >= 0) view = location.hash.slice(1);
  function showTabs() {
    document.querySelectorAll(".sim-tabs [data-tab]").forEach(function (b) { var on = b.getAttribute("data-tab") === view; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
    VIEWS.forEach(function (k) { document.getElementById("view-" + k).hidden = k !== view; });
  }
  function renderView() {
    showTabs();
    if (!last || last.entry.error) return;
    var e = last.entry, s = last.state, sm = summ(s) || { column_rmse: e.column_rmse, column_station_rmse: e.column_station_rmse };
    if (view === "steps") {
      renderPass(document.getElementById("sim-pass"), e, last.run, s);
      renderLay(document.getElementById("sim-lay"), e);
      renderScatter(document.getElementById("sim-sc"), e);
    } else if (view === "dist") {
      renderAttr(document.getElementById("sim-attr"), s);
      renderCum(document.getElementById("sim-cum"), s);
    } else if (view === "decide") {
      renderDecide(document.getElementById("sim-decide"), e, s, sm);
    }
  }
  function setView(v, focus) {
    view = v;
    try { localStorage.setItem("vrs-sim-view", v); } catch (err) { /* storage blocked */ }
    try { history.replaceState(null, "", location.pathname + location.search + (v === "steps" ? "" : "#" + v)); } catch (err) { /* file:// */ }
    renderView();
    if (focus) document.getElementById("tab-" + v).focus();
  }

  /* one floating tooltip for every chart element with data-ftip, and the crosshair of (a) */
  var tipEl = document.getElementById("sim-floattip");
  function placeTip(html, cx, cy) {
    tipEl.innerHTML = html; tipEl.hidden = false;
    var r = tipEl.getBoundingClientRect(), x = cx + 14, y = cy + 14;
    if (x + r.width > window.innerWidth - 8) x = cx - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = cy - r.height - 14;
    tipEl.style.left = Math.max(8, x) + "px"; tipEl.style.top = Math.max(8, y) + "px";
  }
  function hideTip() { tipEl.hidden = true; var c = document.querySelector("#sim-pass .sim-cross"); if (c) c.setAttribute("visibility", "hidden"); }
  out.addEventListener("mousemove", function (ev) {
    var pass = ev.target.closest && ev.target.closest("#sim-pass");
    if (pass && pass._pick) {
      var box = pass.getBoundingClientRect(), hit = pass._pick(ev.clientX - box.left), cr = pass.querySelector(".sim-cross");
      if (hit) {
        if (cr) { cr.setAttribute("x1", hit.x); cr.setAttribute("x2", hit.x); cr.setAttribute("visibility", "visible"); }
        placeTip(hit.html, ev.clientX, ev.clientY); return;
      }
    }
    var t = ev.target.closest && ev.target.closest("[data-ftip]");
    if (t) placeTip(t.getAttribute("data-ftip"), ev.clientX, ev.clientY); else hideTip();
  });
  out.addEventListener("mouseleave", hideTip);
  out.addEventListener("scroll", hideTip, true);

  function wins(e) { var w = []; for (var k = 0; k < e.rmse.length; k++) if (e.skill[k] > 0) w.push(k); return w; }

  function verdict(e, s, sm) {
    var nl = e.rmse.length, k = wins(e).length, col = sm.column_rmse < sm.column_station_rmse;
    if (nl === 1) return col ? "The radar beats the weather station alone." : "The weather station alone does better than the radar.";
    var lay = k === nl ? "all " + nl + " layers" : k + " of " + nl + " layers";
    if (col) return k ? "The radar beats the weather station on the column, and in " + lay + "." : "The radar beats the weather station on the column, but in none of the " + nl + " layers.";
    return k ? "The weather station beats the radar on the column, but the radar wins in " + lay + "." : "The weather station alone beats the radar on the column and in every layer.";
  }

  function stat(v, unit, k, ic, cls) {
    var i = ic && window.VRS_ICON ? '<span class="s-ic">' + window.VRS_ICON(ic) + "</span>" : "";
    return '<div class="stat' + (cls ? " " + cls : "") + '">' + i + '<span class="v">' + v + (unit ? ' <span class="u">' + unit + "</span>" : "") + '</span><span class="k">' + k + "</span></div>";
  }
  function renderStats(e, s, sm) {
    var nl = e.rmse.length, w = wins(e), cs = colSkill(sm);
    var html = stat(num(sm.column_rmse, 2), "N", "radar, rms error" + (nl > 1 ? " of the column" : ""), "radar", "s-radar") +
      stat(num(sm.column_station_rmse, 2), "N", "weather station alone", "thermo", "s-station") +
      stat('<span style="color:' + skillColor(cs) + '">' + signed(cs, 2) + "</span>", "", "skill" + (nl > 1 ? ", beats the station in " + w.length + "/" + nl + " layers" : " vs the station"), "target", "s-skill") +
      stat(ok(e.points_used) ? thousands(e.points_used) : "n/a", "points", "used of " + thousands(s.points) + (ok(e.buildings) ? ", " + e.buildings + " buildings" : ""), "grid");
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
  function rmsMean(a) { var t = 0, n = 0; (a || []).forEach(function (v) { if (ok(v)) { t += v * v; n++; } }); return n ? Math.sqrt(t / n) : NaN; }
  function noSteps(el, what) {
    el.innerHTML = '<p class="sim-sub" style="padding:14px">' + esc(what) + " is not in the published results for this combination yet.</p>";
  }

  /* ---- (a) error per pass, step by step: mean of the layers of (estimate anomaly - truth anomaly) */
  function passLegend(st) {
    var el = document.getElementById("sim-pass-legend"), h = "";
    STAGES.forEach(function (g) {
      h += '<li class="tg" role="button" tabindex="0" data-k="' + g.key + '" aria-pressed="' + shown[g.key] + '"' + ft("<b>" + esc(g.label) + "</b><br>rms of this line " + num(rmsMean(st.pass_error[g.key]), 2) + " N. Click to hide or show.") +
        '><i class="ln c" style="border-top-color:' + g.color + '"></i>' + esc(g.short) + ' <b style="color:' + C.ink2 + '">' + num(rmsMean(st.pass_error[g.key]), 2) + "</b></li>";
    });
    h += '<li class="tg" role="button" tabindex="0" data-k="pred" aria-pressed="' + shown.pred + '"' + ft("<b>Predicted error</b><br>The straight-line drift of the air that the ground correction misses (truth anomaly minus the station's, mean of the layers), sign flipped: the trend terms of the deformation fit take that drift for building motion and remove it. " +
      signed(st.drift_N_per_month, 2) + " N per month.") + '><i class="ln pred"></i>predicted drift ' + signed(st.drift_N_per_month, 2) + " N/month</li>";
    el.innerHTML = h;
  }
  function renderPass(el, e, run, s) {
    var st = e.steps;
    if (!st) { noSteps(el, "The step-by-step breakdown"); document.getElementById("sim-pass-legend").innerHTML = ""; el._pick = null; return; }
    passLegend(st);
    var tx = run.epochs.map(day), GAP = s.atm === "simulated" ? 75 : 30, d0 = tx[0], d1 = tx[tx.length - 1], pad = (d1 - d0) * 0.012;
    var w = width(el), narrow = w < 520, m = { l: narrow ? 34 : 44, r: 10, t: 8, b: 22 }, H = height(el, 250);
    var series = STAGES.filter(function (g) { return shown[g.key]; }).map(function (g) { return { v: st.pass_error[g.key], color: g.color, w: g.w, name: g.short }; });
    if (shown.pred) series.push({ v: st.predicted, color: PRED, w: 2, dash: true, name: "predicted" });
    var vals = [0];
    series.forEach(function (x) { x.v.forEach(function (v) { if (ok(v)) vals.push(v); }); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), p = (hi - lo) * 0.06 || 0.5;
    var xs = lin(d0 - pad, d1 + pad, m.l, w - m.r), ys = lin(lo - p, hi + p, H - m.b, m.t), tt = timeTicks(d0, d1, w);
    var body = rect(m.l, m.t, w - m.l - m.r, H - m.t - m.b, "#fcfbf8");
    ticks(lo - p, hi + p, H < 200 ? 3 : narrow ? 4 : 5).forEach(function (v) { body += line(m.l, ys(v), w - m.r, ys(v), C.grid) + text(m.l - 5, ys(v), tickLabel(v), { anchor: "end", base: "middle", size: 10 }); });
    tt.ticks.forEach(function (t) { var x = xs(t.d); body += line(x, m.t, x, H - m.b, C.grid) + text(x, H - m.b + 14, t.s, { anchor: "middle", size: 10 }); });
    if (tt.title) body += text(w - m.r, H - m.b + 14, tt.title, { anchor: "end", size: 10, fill: C.ink2 });
    body += line(m.l, ys(0), w - m.r, ys(0), "#17191c", 0.8);
    body += line(m.l, H - m.b, w - m.r, H - m.b, C.axis) + line(m.l, m.t, m.l, H - m.b, C.axis);
    series.forEach(function (x) {
      body += '<path d="' + path(x.v.map(function (v, j) { return ok(v) ? [xs(tx[j]), ys(v)] : null; }), tx, GAP) + '" fill="none" stroke="' + x.color + '" stroke-width="' + x.w + '"' +
        (x.dash ? ' stroke-dasharray="6 4"' : "") + ' stroke-linejoin="round"/>';
    });
    body += '<line class="sim-cross" x1="0" y1="' + m.t + '" x2="0" y2="' + (H - m.b) + '" stroke="#17191c" stroke-width="1" stroke-dasharray="2 2" visibility="hidden"/>';
    if (!narrow) body += text(10, (m.t + H - m.b) / 2, "estimate − truth (N)", { anchor: "middle", fill: C.ink2, size: 10.5, rot: -90, base: "middle" });
    el.innerHTML = svg(w, H, body, "Error per pass, mean of the layers, on " + tx.length + " passes. rms: " + STAGES.map(function (g) { return g.short + " " + num(rmsMean(st.pass_error[g.key]), 2) + " N"; }).join(", ") +
      "; predicted drift " + signed(st.drift_N_per_month, 2) + " N per month.");
    /* hover: the nearest pass, every line shown */
    el._pick = function (px) {
      if (px < m.l || px > w - m.r) return null;
      var d = d0 - pad + (px - m.l) / (w - m.l - m.r) * (d1 - d0 + 2 * pad), j = 0;
      for (var i = 1; i < tx.length; i++) if (Math.abs(tx[i] - d) < Math.abs(tx[j] - d)) j = i;
      var h = "<b>" + fmtDate(run.epochs[j]) + "</b>";
      series.forEach(function (x) { h += '<br><i class="sw" style="background:' + x.color + '"></i>' + esc(x.name) + " " + signed(x.v[j], 2) + " N"; });
      return { html: h, x: xs(tx[j]) };
    };
    setTip("sim-pass-sub", "The same estimation run three times with parts switched off: only each point's own offset removed (layer inversion only), then the building motion fitted (+ shrinking), then also the thermal term (standard). Each line is the estimated N anomaly minus the true one, averaged over the layers. Click a legend entry to hide it; the axis follows what is shown." +
      (ok(st.corr_error_predicted) ? " The standard error follows the predicted drift with r = " + num(st.corr_error_predicted, 2) + "." : ""));
  }

  /* ---- (b) error per layer, step by step, with the station alone for scale; highest layer on top */
  function renderLay(el, e) {
    var st = e.steps, leg = document.getElementById("sim-lay-legend");
    if (!st) { noSteps(el, "The per-layer breakdown"); leg.innerHTML = ""; return; }
    leg.innerHTML = STAGES.map(function (g) { return '<li><i class="sw" style="background:' + g.color + '"></i>' + esc(g.short) + "</li>"; }).join("") +
      '<li><i class="tick"></i>station alone</li>';
    var nl = e.edges.length - 1, w = width(el), narrow = w < 420, H = height(el, Math.max(200, nl * 46 + 40));
    var m = { l: narrow ? 62 : 68, r: 34, t: 6, b: 30 }, rowH = (H - m.t - m.b) / nl;
    var bh = Math.max(3, Math.min(18, rowH * 0.8 / STAGES.length));
    var vals = [0];
    STAGES.forEach(function (g) { st.rms[g.key].forEach(function (v) { if (ok(v)) vals.push(v); }); });
    st.rms.ground.forEach(function (v) { if (ok(v)) vals.push(v); });
    var vmax = Math.max.apply(null, vals) * 1.08, xt = ticks(0, vmax, narrow ? 4 : 5), xmax = Math.max(vmax, xt[xt.length - 1]), xs = lin(0, xmax, m.l, w - m.r);
    var body = "", plotB = H - m.b;
    xt.forEach(function (v) { var x = xs(v); body += line(x, m.t, x, plotB, C.grid) + text(x, plotB + 13, tickLabel(v), { anchor: "middle", size: 10 }); });
    body += line(m.l, m.t, m.l, plotB, C.axis);
    body += text((m.l + w - m.r) / 2, H - 3, "rms error of the anomaly (N)", { anchor: "middle", size: 10, fill: C.ink2 });
    for (var r = 0; r < nl; r++) {
      var k = nl - 1 - r, y0 = m.t + r * rowH + (rowH - STAGES.length * bh) / 2, lab = layerLabel(e.edges, k);
      body += text(m.l - 6, y0 + STAGES.length * bh / 2, lab, { anchor: "end", base: "middle", size: narrow ? 9.5 : 10.5, fill: C.truth });
      var tip = "<b>" + lab + "</b>";
      STAGES.forEach(function (g) { tip += '<br><i class="sw" style="background:' + g.color + '"></i>' + esc(g.short) + " " + num(st.rms[g.key][k], 2) + " N"; });
      tip += "<br>station alone " + num(st.rms.ground[k], 2) + " N";
      body += '<rect x="' + m.l + '" y="' + (m.t + r * rowH).toFixed(1) + '" width="' + (w - m.r - m.l) + '" height="' + rowH.toFixed(1) + '" fill="transparent"' + ft(tip) + "/>";
      STAGES.forEach(function (g, i) {
        var v = st.rms[g.key][k], y = y0 + i * bh;
        if (!ok(v)) return;
        body += rect(m.l, y + 0.5, xs(v) - m.l, bh - 1, g.color, ' pointer-events="none"');
        if (bh >= 12) body += text(xs(v) + 3, y + bh / 2 + 0.5, num(v, 2), { base: "middle", size: 9.5, fill: "#333" });
      });
      var gv = st.rms.ground[k];
      if (ok(gv)) body += line(xs(gv), y0 - 3, xs(gv), y0 + STAGES.length * bh + 3, "#17191c", 2.2, ' pointer-events="none"');
    }
    el.innerHTML = svg(w, H, body, "rms error per layer, lowest first. " + STAGES.map(function (g) { return g.short + ": " + st.rms[g.key].map(function (v) { return num(v, 2); }).join(", "); }).join("; ") +
      "; station alone: " + st.rms.ground.map(function (v) { return num(v, 2); }).join(", ") + " N.");
    setTip("sim-lay-sub", "Per layer, the rms over the passes of the N anomaly error, for the three steps of (a). The black mark is the weather station alone: its N anomaly carried to every layer. Bars left of the mark: the radar beats the station in that layer. Hover a layer for the numbers.");
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
    var w = width(el), narrow = w < 420, m = { l: narrow ? 84 : 92, r: 40, t: 18, b: 26 }, H = height(el, 270);
    var rowH = (H - m.t - m.b - 6) / rows.length;
    var vmax = Math.max.apply(null, rows.map(function (r) { return r.sm ? r.sm.column_rmse : 0; }).concat([ok(stV) ? stV : 0])) * 1.05;
    var xt = ticks(0, vmax, narrow ? 4 : 5), xmax = Math.max(vmax, xt[xt.length - 1]), xs = lin(0, xmax, m.l, w - m.r);
    var body = "", plotB = H - m.b;
    xt.forEach(function (v) { var x = xs(v); body += line(x, m.t - 4, x, plotB, C.grid) + text(x, plotB + 13, tickLabel(v), { anchor: "middle", size: 10 }); });
    body += text((m.l + w - m.r) / 2, H - 2, "column error, rms over the passes (N)", { anchor: "middle", size: 10, fill: C.ink2 });
    rows.forEach(function (r, i) {
      var y = m.t + i * rowH + (r.total ? 6 : 0), bh = Math.min(20, rowH * 0.66), cy = y + rowH / 2, yb = cy - bh / 2;
      if (r.total) body += line(6, y - 2, w - 6, y - 2, "#e4e1d9");
      body += text(m.l - 7, cy, r.label, { anchor: "end", base: "middle", size: narrow ? 10 : 10.5, fill: r.off ? "#9aa0a6" : C.truth, weight: r.total || r.base ? 650 : 500 });
      if (!r.sm) { body += text(m.l + 4, cy, "not computed", { base: "middle", size: 10 }); return; }
      var v = r.sm.column_rmse, op = r.off ? ' fill-opacity=".28"' : "";
      var tip = "<b>" + esc(r.label) + "</b>" + (r.off ? " (switched off)" : "") + "<br>column error " + num(v, 2) + " N" +
        (!r.base && !r.total && airV ? "<br>" + signed(v - airV, 2) + " N on top of the air alone" : "") + (ok(stV) ? "<br>station alone " + num(stV, 2) + " N" : "");
      body += rect(m.l, yb, xs(v) - m.l, bh, r.color, op + ' rx="2"' + ft(tip));
      if (!r.base && !r.total && airV) body += rect(m.l, yb, Math.min(xs(airV), xs(v)) - m.l, bh, "#ffffff", ' pointer-events="none" fill-opacity="' + (r.off ? ".35" : ".55") + '"');
      body += text(xs(v) + 4, cy, num(v, 2) + (r.off ? " off" : ""), { base: "middle", size: 10, fill: r.off ? "#9aa0a6" : C.ink2, weight: r.total ? 650 : 500 });
    });
    if (ok(stV)) {
      var sx = xs(stV);
      body += line(sx, m.t - 6, sx, plotB, "#7a7f86", 1.3, ' stroke-dasharray="4 3"');
      var right = sx > w - m.r - 60;
      body += text(right ? sx - 4 : sx + 4, m.t - 8, "station alone " + num(stV, 2), { anchor: right ? "end" : "start", size: 10, fill: C.ink2 });
    }
    el.innerHTML = svg(w, H, body, "Column error: " + rows.map(function (r) { return r.label + " " + (r.sm ? num(r.sm.column_rmse, 2) : "n/a") + " N"; }).join("; ") + "; station alone " + num(stV, 2) + " N.");
    setTip("sim-attr-sub", "Each disturbance switched on by itself on top of the air (with no noise unless it is the noise), " + ATM_NAME[s.atm].replace(/^the /, "") + ", " +
      thousands(s.points) + " points, " + LAYERS_NAME[s.layers] + ". The pale start of each bar is what the air alone gives; faded bars are switched off in your selection. Column error: the error of the thickness-weighted mean of all layers, rms over the passes.");
  }

  /* ---- (c) standard estimate against the truth: N anomalies, every layer and pass, or one layer */
  function fillLayerPick(e) {
    var nl = e.edges.length - 1, h = '<option value="-1"' + (scLayer < 0 ? " selected" : "") + ">All layers</option>";
    if (scLayer >= nl) scLayer = -1;
    for (var k = nl - 1; k >= 0; k--) h += '<option value="' + k + '"' + (k === scLayer ? " selected" : "") + ">" + esc(layerLabel(e.edges, k)) + (k === 0 ? " (lowest)" : "") + "</option>";
    scSel.innerHTML = h;
    scSel.disabled = nl < 2;
  }
  function range(a) { var v = a.filter(ok); return v.length ? [Math.min.apply(null, v), Math.max.apply(null, v)] : [NaN, NaN]; }
  function renderScatter(el, e) {
    var st = e.steps, leg = document.getElementById("sim-sc-legend"), ep = last ? last.run.epochs : [];
    if (!st) { noSteps(el, "The scatter"); leg.innerHTML = ""; return; }
    var nl = st.truth_anomaly.length, ks = scLayer < 0 ? [] : [scLayer];
    if (scLayer < 0) for (var q = 0; q < nl; q++) ks.push(q);
    var P = [];
    ks.forEach(function (k) { st.truth_anomaly[k].forEach(function (v, i) { var y = st.est_anomaly[k][i]; if (ok(v) && ok(y)) P.push([v, y, k, i]); }); });
    var lim = 0;
    P.forEach(function (p) { lim = Math.max(lim, Math.abs(p[0]), Math.abs(p[1])); });
    lim = lim * 1.06 || 1;
    var rr = scLayer >= 0 ? [st.rms.std[scLayer], st.rms.std[scLayer]] : range(st.rms.std);
    var ss = scLayer >= 0 ? [st.slope[scLayer], st.slope[scLayer]] : range(st.slope);
    function span(a) { return a[0] === a[1] ? num(a[0], 2) : num(a[0], 2) + "–" + num(a[1], 2); }
    leg.innerHTML = "<li>rms error <b>" + span(rr) + " N</b></li><li>slope <b>" + span(ss) + "</b></li>" +
      (scLayer >= 0 && ok(st.r[scLayer]) ? "<li>r <b>" + num(st.r[scLayer], 2) + "</b></li>" : "") + '<li><i class="ln dash"></i>1 : 1</li>';
    var w = width(el), H = height(el, 320), m = { l: 40, r: 8, t: 6, b: 32 };
    var side = Math.max(120, Math.min(w - m.l - m.r, H - m.t - m.b)), x0 = m.l + Math.max(0, (w - m.l - m.r - side) / 2);
    H = side + m.t + m.b;
    var xs = lin(-lim, lim, x0, x0 + side), ys = lin(-lim, lim, m.t + side, m.t), tk = ticks(-lim, lim, side < 260 ? 4 : 6);
    var body = rect(x0, m.t, side, side, "#fcfbf8");
    tk.forEach(function (v) {
      body += line(xs(v), m.t, xs(v), m.t + side, v === 0 ? "#dcd8ce" : C.grid) + line(x0, ys(v), x0 + side, ys(v), v === 0 ? "#dcd8ce" : C.grid);
      body += text(xs(v), m.t + side + 13, tickLabel(v), { anchor: "middle", size: 10 }) + text(x0 - 5, ys(v), tickLabel(v), { anchor: "end", base: "middle", size: 10 });
    });
    body += '<rect x="' + x0 + '" y="' + m.t + '" width="' + side + '" height="' + side + '" fill="none" stroke="' + C.axis + '"/>';
    body += text(x0 + side / 2, H - 3, "truth N anomaly (N)", { anchor: "middle", size: 10.5, fill: C.ink2 });
    body += text(x0 - 30, m.t + side / 2, "estimated (N)", { anchor: "middle", size: 10.5, fill: C.ink2, rot: -90, base: "middle" });
    body += '<defs><clipPath id="sc-clip"><rect x="' + x0 + '" y="' + m.t + '" width="' + side + '" height="' + side + '"/></clipPath></defs><g clip-path="url(#sc-clip)">';
    var r = P.length > 600 ? 1.6 : P.length > 250 ? 2 : 2.5, d = "";
    P.forEach(function (p) {
      d += '<circle cx="' + xs(p[0]).toFixed(1) + '" cy="' + ys(p[1]).toFixed(1) + '" r="' + r + '"' +
        ft("<b>" + (ep[p[3]] ? fmtDate(ep[p[3]]) : "pass " + (p[3] + 1)) + "</b>, " + layerLabel(e.edges, p[2]) + "<br>truth " + signed(p[0], 1) + " N, estimate " + signed(p[1], 1) + " N<br>error " + signed(p[1] - p[0], 1) + " N") + "/>";
    });
    body += '<g fill="#1f5fa8" fill-opacity=".55">' + d + "</g>";
    body += line(xs(-lim), ys(-lim), xs(lim), ys(lim), C.truth, 1, ' stroke-dasharray="5 4" pointer-events="none"');
    var sl = scLayer >= 0 ? st.slope[scLayer] : null;
    if (ok(sl)) body += line(xs(-lim), ys(sl * -lim), xs(lim), ys(sl * lim), "#1f5fa8", 2, ' pointer-events="none"');
    body += "</g>";
    var sl = scLayer >= 0 ? st.slope[scLayer] : null;
    if (ok(sl)) body += line(xs(-lim), ys(sl * -lim), xs(lim), ys(sl * lim), "#1f5fa8", 2, ' pointer-events="none"');
    body += "</g>";
    el.innerHTML = svg(w, H, body, "Standard estimate against the truth, N anomaly, " + (scLayer < 0 ? "all layers" : layerLabel(e.edges, scLayer)) + ": rms error " + span(rr) + " N, slope " + span(ss) + ".");
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
    var m = { l: 40, r: 10, t: 18, b: rot ? 56 : 24 }, H = height(el, rot ? 290 : 270);
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
        body += rect(x, ys(v), bw, ys(0) - ys(v), b.color, ' rx="2"' + ft("<b>" + esc(b.label) + "</b><br>column error " + num(v, 2) + " N" + (ok(stV) ? "<br>station alone " + num(stV, 2) + " N" : "")));
        body += text(cx, ys(v) - 6, num(v, 2), { anchor: "middle", size: 10.5, fill: C.truth, weight: 650 });
      } else if (prev !== null) {
        var up = v >= prev, y0 = ys(Math.max(v, prev)), y1 = ys(Math.min(v, prev));
        body += rect(x, y0, bw, Math.max(1.5, y1 - y0), b.color, (up ? ' rx="2"' : ' rx="2" fill-opacity=".35" stroke="' + b.color + '" stroke-dasharray="3 2"') +
          ft("<b>+ " + esc(b.label) + "</b><br>column error " + num(prev, 2) + " → " + num(v, 2) + " N (" + signed(v - prev, 2) + ")"));
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
    var off = STEPS.filter(function (k) { return selected(s).indexOf(k) < 0; });
    setTip("sim-cum-sub", "Start from the air alone and switch on the selected disturbances in a fixed order (noise, sinking, shrinking, thermal, cross-range); each bar is the change in the column error." +
      (off.length && off.length < STEPS.length ? " Skipped, because they are off: " + listWords(off.map(function (k) { return k === "noise" ? "noise" : DIST[k].long.replace(/^the /, ""); })) + "." : "") +
      (off.length === STEPS.length ? " Nothing is switched on, so there is nothing to add." : "") + " Hover a bar for its numbers.");
  }

  /* ---- 5. what this means: plain-language reading of the numbers above */
  function renderDecide(el, e, s, sm) {
    var items = [], nl = e.rmse.length, sel = selected(s), air = summ(airOnly(s));
    /* Jaap's steps: what each part of the chain does, column of the per-layer rms errors */
    if (e.steps) {
      var R = e.steps.rms, mL = mean(R.layers), mS = mean(R.shrink), mD = mean(R.std), mG = mean(R.ground);
      var gain = mD < mL ? "the deformation fit brings the error down from " + num(mL, 2) + " N (layer inversion only) to " + num(mD, 2) + " N"
        : (mD > mL * 1.1 ? "the deformation fit makes it worse here" : "the deformation fit changes little here") + ": " + num(mL, 2) + " N with the layer inversion only, " + num(mD, 2) + " N with the standard chain";
      var th = mS - mD;
      items.push("<b>Step by step</b> (mean over the layers): " + gain + "; the thermal term " + (th > 0.05 ? "takes off " + num(th, 2) + " N of that" : th < -0.05 ? "adds " + num(-th, 2) + " N" : "changes little") +
        ". The station alone is off by " + num(mG, 2) + " N, so the radar's anomaly " + (mD < mG ? "<b>beats</b>" : "<b>does not beat</b>") + " it." +
        (ok(e.steps.corr_error_predicted) && Math.abs(e.steps.corr_error_predicted) >= 0.5 ? " What is left follows the predicted drift (r " + num(e.steps.corr_error_predicted, 2) + ", " + signed(e.steps.drift_N_per_month, 2) +
          " N per month): the trend terms take the slow drift of the air the ground correction misses as building motion." : ""));
    }
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
    var tabs = document.querySelector(".sim-tabs");
    tabs.addEventListener("click", function (ev) { var b = ev.target.closest("[data-tab]"); if (b) setView(b.getAttribute("data-tab")); });
    tabs.addEventListener("keydown", function (ev) {
      var i = VIEWS.indexOf(view), d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
      if (d) { ev.preventDefault(); setView(VIEWS[(i + d + VIEWS.length) % VIEWS.length], true); }
    });
    showTabs();
    var pl = document.getElementById("sim-pass-legend");
    function flip(ev) {
      var li = ev.target.closest && ev.target.closest("li.tg");
      if (!li || (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ")) return;
      ev.preventDefault();
      var k = li.getAttribute("data-k");
      shown[k] = !shown[k];
      if (last && !last.entry.error) renderPass(document.getElementById("sim-pass"), last.entry, last.run, last.state);
    }
    pl.addEventListener("click", flip);
    pl.addEventListener("keydown", flip);
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
