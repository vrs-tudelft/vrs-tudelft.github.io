/* Estimation simulator (v2): reads the precomputed results in data/simulator/ (manifest.json with a
   compact summary of every combination, and one runs/<key>.json per simulation, fetched when first
   needed and kept) and draws, as inline SVG, Jaap's step-by-step figure (05_results/
   26_long_term_temperature/cabauw_ideal.py): (a) the error per pass with parts of the chain switched
   off and the predicted drift, (b) the error per layer step by step against the station alone, (c) the
   standard estimate against the truth; then which disturbance costs what, and the cumulative trend
   when the disturbances are added one by one. Observed-data links route to Findings, where KNMI 344
   is explicitly a proxy rather than vertical truth. Plain script, no libraries. Nothing is computed here beyond picking entries, means,
   departures and the station's correlation, and formatting them. */
(function () {
  "use strict";
  // Observed evidence has one home; old real-mode links retain their fit choices.
  if(new URLSearchParams(location.search).get('atm')==='real'){
    var legacyQuery=new URLSearchParams(location.search);legacyQuery.delete('atm');
    location.replace('results.html?'+legacyQuery.toString()+'#signal');return;
  }


  var BASE = "data/simulator/";
  var C = {
    truth: "#17191c", radar: "#d62728", station: "#9a9a9a", grid: "#ece9e1", axis: "#cdc9be", muted: "#6e747b", ink2: "#3c4249",
    air: "#15688f", pos: "#2f7d3a", neg: "#a8433b"
  };
  var KEYS = ["atm", "sinking", "shrinking", "thermal", "crossrange", "noise", "points", "layers", "motion"];
  var RADIOS = ["atm", "noise", "points", "layers", "motion"];
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
  var LAYERS_NAME = { "20": "20 m layers", "40": "40 m layers", "2": "two layers", "1": "one layer",
    n500: "layers of at least 500 points", n1000: "layers of at least 1000 points",
    cab: "layers centred on the Cabauw sensors" };
  var MOTION_NAME = { building: "motion per building", scatterer: "motion per scatterer" };
  /* Jaap's steps: the same estimation chain with parts switched off */
  var STAGES = [
    { key: "layers", label: "layer inversion only (no deformation fit)", short: "No motion fit", color: "#b9cbe3", w: 1.3 },
    { key: "shrink", label: "+ motion fit (sinking and shrinking per building, or each point's own trend)", short: "Motion fitted", color: "#6f95c8", w: 1.3 },
    { key: "std", label: "+ thermal term = standard", short: "Motion + thermal", color: "#1f5fa8", w: 1.9 }
  ];
  var PRED = "#d1662b";
  /* the words that change between the simulation and the real data */
  var W_SIM = { truth: "truth", truthAnom: "truth N anomaly", base: "station alone", baseLong: "the weather station alone: its N anomaly carried to every layer" };
  var W_REAL = { truth: "KNMI 344", truthAnom: "KNMI 344 N anomaly", base: "constant air", baseLong: "the constant air: predicting no change, an error as large as the station's own swings" };
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  var form = document.getElementById("sim-controls");
  var statusEl = document.getElementById("sim-status");
  var out = document.getElementById("sim-out");
  var scSel = document.getElementById("sim-sc-layer");
  if (!form || !out) return;

  var manifest = null, state = {}, runs = {}, last = null, token = 0, scLayer = -1;
  var realP = null, realDoc = null, realScLayer = -1, simAsof = "";
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
  var shortHelp={
    'sim-pass-sub':'Error against the known air input, averaged over the layers on each pass. Compare no motion fit, fitted sinking/shrinking, and the full fit including thermal expansion. Click a legend item to isolate a curve.',
    'sim-lay-sub':'RMS error in each height layer. Smaller bars are better. The black mark is the station-only baseline. Column averaging can hide a poor thin layer.',
    'sim-sc-sub':'One dot per layer and pass: recovered air change against the known input. The dashed line is exact agreement. These are simulated radar data, not measured city validation.',
    'sim-attr-sub':'Each source switched on separately, compared with air only. Bars show column RMS error; they are not additive error budgets.',
    'sim-cum-sub':'Selected sources added in the displayed order. Each step changes the column RMS error. Changing their order can change the apparent contribution.',
    'sim-abs-sub':'Compare the known air spread with the fitted components. Air absorbed by motion is missing from the radar-only estimate. This diagnostic uses known air alone; the prior protects the station-predicted part, without independently validating urban air.',
    'pte-N-sub':'N is the radar estimate. P and T use surface information and profile assumptions; vapour pressure is derived from N, P and T. Errors compare with the known input. Joined layer means do not add vertical observations.',
    'pte-P-sub':'Pressure is propagated from the surface boundary with hydrostatic balance. The radar does not independently measure it. This plot scores that assumption against the known input.',
    'pte-T-sub':'Temperature follows the selected profile assumption or fitted profile constraint. It is not independently recovered from N. Errors propagate into the derived vapour pressure.',
    'pte-e-sub':'Vapour pressure is derived from N with the selected P and T assumptions. Its reported uncertainty is conditional and does not include all P/T uncertainty. It is not an independent humidity measurement.'
  };
  function setTip(id, html) { var t=document.getElementById(id),help=shortHelp[id]||plain(html);if(t){t.setAttribute('data-tip',help);if(!t.hasAttribute('aria-label'))t.setAttribute('aria-label','About '+(id.includes('pte-')?'weather inference':'this comparison'));} }
  function helpButton(id,label,help) { return '<button id="'+id+'" class="t i tip-trigger" type="button" aria-label="About '+esc(label)+'" data-tip="'+esc(help)+'"><span class="info" aria-hidden="true">i</span></button>'; }

  function ft(html) { return ' data-ftip="' + esc(html) + '"'; }

  /* ------------------------------------------------------------ state and the manifest */
  function runKey(s) { return s.atm + "_s" + s.sinking + s.shrinking + s.thermal + s.crossrange + "_n" + s.noise + "_p" + s.points + "_m" + String(s.motion || "building").charAt(0); }
  function summ(s) { var v = manifest.summary && manifest.summary[runKey(s) + "|" + s.layers]; return v && !v.error && v.rmse ? v : null; }
  function variant(s, over) { var t = {}; KEYS.forEach(function (k) { t[k] = String(s[k]); }); for (var k in over) t[k] = String(over[k]); return t; }
  function airOnly(s) { return variant(s, { sinking: 0, shrinking: 0, thermal: 0, crossrange: 0, noise: 0 }); }
  function selected(s) { return STEPS.filter(function (k) { return k === "noise" ? s.noise !== "0" : s[k] === "1"; }); }
  function distName(k, s, cap) { var n = k === "noise" ? s.noise + " mm noise" : DIST[k].long; return cap ? n.charAt(0).toUpperCase() + n.slice(1) : n; }
  function listWords(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
  function colSkill(sm) { return sm ? 1 - Math.pow(sm.column_rmse / sm.column_station_rmse, 2) : NaN; }

  function fromForm() {
    var s = {};
    RADIOS.forEach(function (k) {
      var r = form.querySelector('input[name="' + k + '"]:checked');
      s[k] = r ? r.value : String(manifest.defaults[k]);
    });
    TOGGLES.forEach(function (k) { s[k] = form.elements[k].checked ? "1" : "0"; });
    return s;
  }
  function toForm(s) {
    RADIOS.forEach(function (k) {
      form.querySelectorAll('input[name="' + k + '"]').forEach(function (r) { r.checked = r.value === String(s[k]); });
    });
    TOGGLES.forEach(function (k) { form.elements[k].checked = String(s[k]) === "1"; });
  }
  function valid(k, v) {
    if (k === "atm" && v === "real") return true;          /* the real data: data/simulator/real.json */
    return manifest.controls[k] && manifest.controls[k].map(String).indexOf(String(v)) >= 0;
  }
  function isReal() { return state.atm === "real"; }
  /* the layer setups an atmosphere has (the Cabauw-centred layers only for the Cabauw tower air) */
  function layersFor(atm) {
    var by = manifest.layers_of || {};
    return (by[atm] || by.simulated || manifest.controls.layers).map(String);
  }
  /* disable the setups the chosen air does not have; fall back to the default when the choice is one */
  function syncLayers() {
    var atm = (form.querySelector('input[name="atm"]:checked') || {}).value || String(manifest.defaults.atm), ok = layersFor(atm);
    form.querySelectorAll('input[name="layers"]').forEach(function (r) {
      if (!valid("layers", r.value)) return;
      var on = ok.indexOf(r.value) >= 0;
      r.disabled = !on; r.closest("label").hidden = !on;
      if (!on && r.checked) {
        r.checked = false;
        var d = form.querySelector('input[name="layers"][value="' + manifest.defaults.layers + '"]');
        if (d) d.checked = true;
      }
    });
  }
  function initialState() {
    var q = new URLSearchParams(location.search), s = {};
    KEYS.forEach(function (k) { var v = q.get(k); s[k] = v !== null && valid(k, v) ? v : String(manifest.defaults[k]); });
    if (location.hash === "#real") {                                        /* links to the former Real data tab */
      if (q.get("atm") === null) s.atm = "real";
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* file:// */ }
    }
    return s;
  }
  function writeUrl(s) {
    try {
      var q = new URLSearchParams(location.search), def = true;
      KEYS.forEach(function (k) { if (String(s[k]) !== String(manifest.defaults[k])) def = false; });
      KEYS.forEach(function (k) { if (def) q.delete(k); else q.set(k, s[k]); });
      if (realPrior() === "none") q.delete("prior"); else q.set("prior", realPrior());
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

  /* a simulated atmosphere fetches its run; the real data come from real.json */
  var simMsg = "";
  function update() {
    var prevLayers = state.layers;
    syncLayers();
    state = fromForm();
    if (state.layers !== prevLayers) { scLayer = -1; realScLayer = -1; }
    writeUrl(state);
    if (isReal()) { token++; out.classList.remove("busy"); renderView(); return; }
    var key = runKey(state), my = ++token;
    var slow = setTimeout(function () { if (my === token) { setStatus("Loading the results for this combination…"); out.classList.add("busy"); } }, 120);
    getRun(key).then(function (run) {
      if (my !== token) return;
      clearTimeout(slow); out.classList.remove("busy");
      var entry = run.results && run.results[state.layers];
      if (!entry) throw new Error("no result for " + state.layers + " in " + key);
      last = { run: run, entry: entry, state: state };
      simMsg = entry.error ? "The estimation could not run for this combination: " + entry.error + ". Thinner layers need more radar points; try thicker layers, more points or less noise." : "";
      renderView();
    }).catch(function (err) {
      if (my !== token) return;
      clearTimeout(slow); out.classList.remove("busy");
      last = null;
      simMsg = err && err.missing ? "This combination (" + err.message + ") is not in the published results yet. Try another setting, or press “Reset experiment”."
        : "The results for this combination could not be loaded (" + (err && err.message) + "). Try another setting, or reload the page.";
      renderView();
    });
  }

  /* ------------------------------------------------------------ rendering */
  /* the views behind the tabs: only the visible one is drawn (a hidden chart has no size) */
  var VIEWS = ["steps", "dist", "pte"], view = "steps";
  try { var v0 = localStorage.getItem("vrs-sim-view"); if (VIEWS.indexOf(v0) >= 0) view = v0; } catch (err) { /* storage blocked */ }
  if (VIEWS.indexOf(location.hash.slice(1)) >= 0) view = location.hash.slice(1);
  function showTabs() {
    document.querySelectorAll(".sim-tabs [data-tab]").forEach(function (b) { var on = b.getAttribute("data-tab") === view; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
    /* with the real data, "Step by step" shows the real data's own cards */
    VIEWS.forEach(function (k) { document.getElementById("view-" + k).hidden = k !== view || (k === "steps" && isReal()); });

  }
  /* a message instead of the numbers and the charts; the tabs stay, so another view can be picked */
  function failed(msg) { out.classList.toggle("failed", !!msg); setStatus(msg, msg ? "error" : ""); }
  function render() { renderView(); }
  function renderView() {
    out.hidden = false;
    if(isReal()&&(view==='dist'||view==='decide'))view='steps';
    showTabs();
    realMode(isReal());
    if (isReal()) { renderReal(); return; }
    failed(simMsg);
    if (!last || simMsg) return;
    var e = last.entry, s = last.state;
    var sm = summ(s) || { rmse: e.rmse, station_rmse: e.station_rmse, skill: e.skill, column_rmse: ok(e.column_rmse) ? e.column_rmse : NaN, column_station_rmse: ok(e.column_station_rmse) ? e.column_station_rmse : NaN, edges: e.edges };
    renderStats(e, s, sm);
    if (view === "steps") {
      scLayer = fillLayerPick(e, scSel, scLayer);
      renderPass(document.getElementById("sim-pass"), e, last.run.epochs, s.atm === "simulated" ? 75 : 30, W_SIM);
      renderLay(document.getElementById("sim-lay"), e, W_SIM);
      renderScatter(document.getElementById("sim-sc"), e, last.run.epochs, scLayer, W_SIM);
    } else if (view === "pte") {
      renderPte(e);
    } else if (view === "dist") {
      renderAttr(document.getElementById("sim-attr"), s);
      renderCum(document.getElementById("sim-cum"), s);
      renderAbsorbed(s);
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
  function hideTip() { tipEl.hidden = true; out.querySelectorAll(".sim-cross").forEach(function (c) { c.setAttribute("visibility", "hidden"); }); }
  out.addEventListener("mousemove", function (ev) {
    var scope=ev.target.closest('dialog')||document.body;if(tipEl.parentNode!==scope)scope.appendChild(tipEl);
    var pass = ev.target.closest && ev.target.closest("[data-pick]");
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
    var n=e.rmse.length,k=wins(e).length;
    return k+' of '+n+' layers beat station extrapolation. '+
      (sm.column_rmse<sm.column_station_rmse?'The column mean also improves.':'The column mean does not improve.');
  }

  function stat(v, unit, k, ic, cls) {
    var i = ic && window.VRS_ICON ? '<span class="s-ic">' + window.VRS_ICON(ic) + "</span>" : "";
    return '<div class="stat' + (cls ? " " + cls : "") + '">' + i + '<span class="v">' + v + (unit ? ' <span class="u">' + unit + "</span>" : "") + '</span><span class="k">' + k + "</span></div>";
  }
  function renderStats(e, s, sm) {
    var worst=Math.max.apply(null,e.rmse);
    document.getElementById('sim-stats').innerHTML=
      stat(num(sm.column_rmse,2),'N','column RMS error '+helpButton('sim-outcome-help','experiment performance',verdict(e,s,sm)+' Errors are against the known air input. Success under these matched assumptions is not field validation.'),'radar','s-radar')+
      stat(num(worst,2),'N','worst layer RMS error','layers','s-worst')+
      stat(num(sm.column_station_rmse,2),'N','station-only column baseline','thermo','s-station');
    setTip('experiment-context','Simulated radar · '+ATM_NAME[s.atm]+' · ground-air prior · '+
      (MOTION_NAME[s.motion]||s.motion)+' · '+thousands(e.points_used)+' used points. Simulation and estimation share model assumptions; this is not urban field validation.');
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
  function passLegend(st, id) {
    var el = document.getElementById(id), h = "";
    STAGES.forEach(function (g) {
      h += '<li class="tg" role="button" tabindex="0" data-k="' + g.key + '" aria-pressed="' + shown[g.key] + '"' + ft("<b>" + esc(g.label) + "</b><br>rms of this line " + num(rmsMean(st.pass_error[g.key]), 2) + " N. Click to hide or show.") +
        '><i class="ln c" style="border-top-color:' + g.color + '"></i>' + esc(g.short) + ' <b style="color:' + C.ink2 + '">' + num(rmsMean(st.pass_error[g.key]), 2) + "</b></li>";
    });
    if (st.predicted) h += '<li class="tg" role="button" tabindex="0" data-k="pred" aria-pressed="' + shown.pred + '"' + ft("<b>Predicted error</b><br>The straight-line drift of the air that the ground correction misses (truth anomaly minus the station's, mean of the layers), sign flipped: the trend terms of the deformation fit take that drift for building motion and remove it. " +
      signed(st.drift_N_per_month, 2) + " N per month.") + '><i class="ln pred"></i>predicted drift ' + signed(st.drift_N_per_month, 2) + " N/month</li>";
    el.innerHTML = h;
  }
  /* epochs: the pass dates; GAP: days without a pass that break a line; W: W_SIM or W_REAL */
  function renderPass(el, e, epochs, GAP, W) {
    var st = e.steps;
    if (!st) { noSteps(el, "The step-by-step breakdown"); document.getElementById(el.id + "-legend").innerHTML = ""; el._pick = null; return; }
    passLegend(st, el.id + "-legend");
    var tx = epochs.map(day), d0 = tx[0], d1 = tx[tx.length - 1], pad = (d1 - d0) * 0.012;
    var w = width(el), narrow = w < 520, m = { l: narrow ? 34 : 44, r: 10, t: 8, b: 22 }, H = height(el, 250);
    var series = STAGES.filter(function (g) { return shown[g.key]; }).map(function (g) { return { v: st.pass_error[g.key], color: g.color, w: g.w, name: g.short }; });
    if (shown.pred && st.predicted) series.push({ v: st.predicted, color: PRED, w: 2, dash: true, name: "predicted" });
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
    if (!narrow) body += text(10, (m.t + H - m.b) / 2, "estimate − " + W.truth + " (N)", { anchor: "middle", fill: C.ink2, size: 10.5, rot: -90, base: "middle" });
    el.innerHTML = svg(w, H, body, "Error per pass, mean of the layers, on " + tx.length + " passes. rms: " + STAGES.map(function (g) { return g.short + " " + num(rmsMean(st.pass_error[g.key]), 2) + " N"; }).join(", ") +
      (st.predicted ? "; predicted drift " + signed(st.drift_N_per_month, 2) + " N per month." : "."));
    /* hover: the nearest pass, every line shown */
    el._pick = function (px) {
      if (px < m.l || px > w - m.r) return null;
      var d = d0 - pad + (px - m.l) / (w - m.l - m.r) * (d1 - d0 + 2 * pad), j = 0;
      for (var i = 1; i < tx.length; i++) if (Math.abs(tx[i] - d) < Math.abs(tx[j] - d)) j = i;
      var h = "<b>" + fmtDate(epochs[j]) + "</b>";
      series.forEach(function (x) { h += '<br><i class="sw" style="background:' + x.color + '"></i>' + esc(x.name) + " " + signed(x.v[j], 2) + " N"; });
      return { html: h, x: xs(tx[j]) };
    };
    setTip(el.id + "-sub", "The same estimation run three times with parts switched off: only each point's own offset removed (layer inversion only), then the building motion fitted (+ motion: " + (state.motion === "scatterer" ? "each point's own linear and quadratic term in time" : "sinking and shrinking per building") + "), then also the thermal term (standard). Each line is the estimated N anomaly minus " +
      (W === W_REAL ? "the KNMI 344 station's (its 06 UTC refractivity carried up with −55 N/km, so the same anomaly in every layer)" : "the true one") + ", averaged over the layers. Click a legend entry to hide it; the axis follows what is shown." +
      (ok(st.corr_error_predicted) ? " The standard error follows the predicted drift with r = " + num(st.corr_error_predicted, 2) + "." : ""));
  }

  /* ---- (b) error per layer, step by step, with the station alone for scale; highest layer on top */
  function renderLay(el, e, W) {
    var st = e.steps, leg = document.getElementById(el.id + "-legend");
    if (!st) { noSteps(el, "The per-layer breakdown"); leg.innerHTML = ""; return; }
    leg.innerHTML = STAGES.map(function (g) { return '<li><i class="sw" style="background:' + g.color + '"></i>' + esc(g.short) + "</li>"; }).join("") +
      '<li><i class="tick"></i>' + W.base + "</li>";
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
      var nk = layerN(e, W === W_REAL);
      tip += "<br>" + W.base + " " + num(st.rms.ground[k], 2) + " N" + (nk && ok(nk[k]) ? "<br>" + thousands(nk[k]) + " radar points" : "");
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
      "; " + W.base + ": " + st.rms.ground.map(function (v) { return num(v, 2); }).join(", ") + " N.");
    setTip(el.id + "-sub", "Per layer, the rms over the passes of the N anomaly error, for the three steps of (a). The black mark is " + W.baseLong + ". Bars left of the mark: the radar beats it in that layer. Hover a layer for the numbers.");
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
      thousands(s.points) + " points, " + MOTION_NAME[s.motion] + ", " + LAYERS_NAME[s.layers] + ". The pale start of each bar is what the air alone gives; faded bars are switched off in your selection. Column error: the error of the thickness-weighted mean of all layers, rms over the passes.");
  }

  /* ---- (c) standard estimate against the truth: N anomalies, every layer and pass, or one layer */
  /* fills a layer picker; returns the picked layer, -1 (all) when it no longer exists */
  function fillLayerPick(e, sel, cur) {
    var nl = e.edges.length - 1;
    if (cur >= nl) cur = -1;
    var h = '<option value="-1"' + (cur < 0 ? " selected" : "") + ">All layers</option>";
    for (var k = nl - 1; k >= 0; k--) h += '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + esc(layerLabel(e.edges, k)) + (k === 0 ? " (lowest)" : "") + "</option>";
    sel.innerHTML = h;
    sel.disabled = nl < 2;
    return cur;
  }
  function range(a) { var v = a.filter(ok); return v.length ? [Math.min.apply(null, v), Math.max.apply(null, v)] : [NaN, NaN]; }
  function renderScatter(el, e, ep, scLayer, W) {
    var st = e.steps, leg = document.getElementById(el.id + "-legend");
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
    /* r: the chosen layer's, or with all layers the r over every dot together (and the layers' range) */
    var rShow = scLayer >= 0 ? st.r[scLayer] : pcorr(P.map(function (p) { return p[0]; }), P.map(function (p) { return p[1]; }));
    var rRange = scLayer < 0 ? range(st.r) : null;
    leg.innerHTML = "<li>r <b>" + num(rShow, 2) + "</b>" + (rRange && ok(rRange[0]) ? " (per layer " + span(rRange) + ")" : "") + "</li>" +
      "<li>rms error <b>" + span(rr) + " N</b></li><li>slope <b>" + span(ss) + "</b></li>" + '<li><i class="ln dash"></i>1 : 1</li>';
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
    body += text(x0 + side / 2, H - 3, W.truthAnom + " (N)", { anchor: "middle", size: 10.5, fill: C.ink2 });
    body += text(x0 - 30, m.t + side / 2, "estimated (N)", { anchor: "middle", size: 10.5, fill: C.ink2, rot: -90, base: "middle" });
    body += '<defs><clipPath id="' + el.id + '-clip"><rect x="' + x0 + '" y="' + m.t + '" width="' + side + '" height="' + side + '"/></clipPath></defs><g clip-path="url(#' + el.id + '-clip)">';
    var r = P.length > 600 ? 1.6 : P.length > 250 ? 2 : 2.5, d = "";
    P.forEach(function (p) {
      d += '<circle cx="' + xs(p[0]).toFixed(1) + '" cy="' + ys(p[1]).toFixed(1) + '" r="' + r + '"' +
        ft("<b>" + (ep[p[3]] ? fmtDate(ep[p[3]]) : "pass " + (p[3] + 1)) + "</b>, " + layerLabel(e.edges, p[2]) + "<br>" + W.truth + " " + signed(p[0], 1) + " N, estimate " + signed(p[1], 1) + " N<br>error " + signed(p[1] - p[0], 1) + " N") + "/>";
    });
    body += '<g fill="#1f5fa8" fill-opacity=".55">' + d + "</g>";
    body += line(xs(-lim), ys(-lim), xs(lim), ys(lim), C.truth, 1, ' stroke-dasharray="5 4" pointer-events="none"');
    if (ok(rShow)) body += '<text x="' + (x0 + 8) + '" y="' + (m.t + 20) + '" font-size="15" font-weight="700" fill="' + C.truth + '" stroke="#fcfbf8" stroke-width="4" paint-order="stroke" pointer-events="none">r = ' + num(rShow, 2) + "</text>";
    var sl = scLayer >= 0 ? st.slope[scLayer] : null;
    if (ok(sl)) body += line(xs(-lim), ys(sl * -lim), xs(lim), ys(sl * lim), "#1f5fa8", 2, ' pointer-events="none"');
    body += "</g>";
    el.innerHTML = svg(w, H, body, "Standard estimate against the " + W.truth + ", N anomaly, " + (scLayer < 0 ? "all layers" : layerLabel(e.edges, scLayer)) + ": rms error " + span(rr) + " N, slope " + span(ss) + ".");
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

  /* ---- N, P, T, e (the estimation notebook's section C5): error per layer, or one pass's profiles */
  var PTE = {
    N: { unit: "N", name: "refractivity", d: 1 },
    P: { unit: "hPa", name: "pressure", d: 2 },
    T: { unit: "K", name: "temperature", d: 2 },
    e: { unit: "hPa", name: "water-vapour pressure", d: 2 },
    Nte: { unit: "N", name: "T and e lumped (N − 77.6 P/T0)", d: 1 }
  };
  var MOTHER = "#7d6bb0";
  var QS = ["N", "P", "T", "e"];
  var PTE_C = { spread: "#cfd6de", est: "#1f5fa8", station: "#7a7f86", truth: "#17191c" };
  /* e in the estimation's own (level-only) calibration; the run files also hold the notebook's
     per-pass shift to the ground ("shift"), which the page does not show */
  var pteShow = "errors", pteCal = "level", pteIdx = 0, pteCur = null, atmP = {}, atmReady = {};
  function pteScore(pt, q) { return q === "e" ? pt.e[pteCal] : pt[q]; }
  var pteLump = false, pteMother = false;
  /* the two-point temperature profile (ground + a station 27.5 m higher, shape from the Cabauw mast):
     data/simulator/two_point/<atm>_p<points>.json and real.json, written by the team's
     04_python/estimation/site_two_point.py. Without those files the switch stays hidden. e from the
     radar's N is computed here for every profile (the three-term formula solved for e).
     The shape: a logarithmic departure from the 6.5 K/km line through both points (that line itself
     when the upper station is on it). The switch: lin, log, or compare (both). */
  var pteT = "lin", tpP = {}, tpDoc = {};
  var SHAPE = { log: { color: "#d9822b", name: "two-point log" } };
  function shapesOf(mode) { return mode === "lin" ? [] : ["log"]; }
  function tpKey() { return isReal() ? "real" : state.atm + "_p" + state.points; }
  function tpData() { var d = tpDoc[tpKey()]; return d || null; }
  function tpMode() { return tpData() ? pteT : "lin"; }
  function loadTp(after) {
    var key = tpKey();
    if (key in tpDoc) return true;
    if (!tpP[key]) {
      tpP[key] = getJson(BASE + "two_point/" + key + ".json").then(function (d) { tpDoc[key] = d; }, function () { tpDoc[key] = null; });
      tpP[key].then(after);
    }
    return false;
  }
  function eFrom(N, P, T) {
    return N.map(function (n, k) {
      var t = T[k], p = P[k];
      return ok(n) && ok(t) && ok(p) ? (n - 77.6 * p / t) / ((72.0 - 77.6) / t + 3.75e5 / (t * t)) : NaN;
    });
  }
  /* the two-point values of pass j for the selected layers: T, P, e (from the radar's N), station e */
  function tpLayers(e, real, shape) {
    var d = tpData();
    if (!d) return null;
    var S = d.shapes[shape];
    return real ? S.results[state.motion + "|" + realPrior() + "|" + state.layers] : S.layers[state.layers];
  }
  function tpUpper(j) {
    var d = tpData();
    return d && ok(d.T_upper[j]) ? { T: d.T_upper[j], e: d.e_upper[j], z: d.z_upper } : null;
  }
  function tpPass(e, j, real, shape) {
    var d = tpData(), L = tpLayers(e, real, shape);
    if (!L) return null;
    var N = real ? e.pte.pass.N[j] : col(e.series, "est", j);
    return { T: L.T[j], P: L.P[j], e: eFrom(N, L.P[j], L.T[j]), station_e: L.e_station[j], fineT: d.shapes[shape].T_fine[j] };
  }
  /* scores of the two-point profile per layer, as site_simulator.pte: simulation against the true layer
     means (rmse, bias, spread; e also the station alone's rmse); real data: r of the radar's e with
     KNMI 344's e carried up, both through the two-point T */
  function tpScores(e, real, shape) {
    var L = tpLayers(e, real, shape), nl = e.edges.length - 1, np = L.T.length, truth = real ? null : tpData().truth[state.layers];
    var eRad = [];
    for (var j = 0; j < np; j++) eRad.push(eFrom(real ? e.pte.pass.N[j] : col(e.series, "est", j), L.P[j], L.T[j]));
    function colK(A, k) { return A.map(function (r) { return r[k]; }); }
    function sc(A, T, k) {
      var s = 0, b = 0, n = 0;
      for (var i = 0; i < A.length; i++) { var d = A[i][k] - T[i][k]; if (ok(d)) { s += d * d; b += d; n++; } }
      return n ? [Math.sqrt(s / n), b / n] : [NaN, NaN];
    }
    function sd(A, k) { var a = colK(A, k).filter(ok), mu = mean(a); return Math.sqrt(mean(a.map(function (v) { return (v - mu) * (v - mu); }))); }
    if (real) {
      var r = [];
      for (var k = 0; k < nl; k++) r.push(pcorr(colK(eRad, k), colK(L.e_station, k)));
      return { e: { r: r } };
    }
    var out = {};
    [["T", L.T], ["P", L.P], ["e", eRad]].forEach(function (x) {
      var q = x[0], o = { rmse: [], bias: [], spread: [] };
      for (var k = 0; k < nl; k++) {
        var v = sc(x[1], truth[q], k);
        o.rmse.push(v[0]); o.bias.push(v[1]); o.spread.push(sd(truth[q], k));
        if (q === "e") (o.station_rmse = o.station_rmse || []).push(sc(L.e_station, truth.e, k)[0]);
      }
      out[q] = o;
    });
    return out;
  }
  /* any pass by date; on the real data the passes with the upper station marked */
  var dateKey = "";
  function fillDatePick(epochs, tpd) {
    var sel = document.getElementById("pte-date"), wrap = document.getElementById("pte-date-pick");
    wrap.style.display = "";
    var key = epochs.length + "|" + epochs[0] + "|" + (tpd ? tpd.T_upper.filter(ok).length : 0);
    if (key !== dateKey) {
      dateKey = key;
      var h = '<option value="">pick a date…</option>';
      epochs.forEach(function (d, j) {
        var star = tpd && isReal() && ok(tpd.T_upper[j]);
        h += '<option value="' + d + '">' + (star ? "★ " : "") + d + "</option>";
      });
      sel.innerHTML = h;
    }
    sel.value = pteShow.indexOf("date:") === 0 ? pteShow.slice(5) : "";
  }
  /* legend entries for the measured points and, in the N card, the mother */
  function extraLegend(ps, q) {
    var h = "", seen = {};
    (ps.meas || []).forEach(function (m) {
      if (!m[q] || seen[m.src]) return;
      seen[m.src] = 1;
      h += '<li><i class="pt' + (/sounding/i.test(m.src) ? " dia" : "") + '"' + (m.color ? ' style="border-color:' + m.color + '"' : "") + "></i>" + esc(m.src) +
        (/mast|roof|station/i.test(m.src) ? " (measured)" : " (reported level)") + "</li>";
    });
    (ps.lines || []).forEach(function (l) { if (l.q === q) h += l.dash ? '<li><i class="ln dash" style="border-top-color:' + l.color + '"></i>' + esc(l.label) + "</li>" : li(l.color, l.label, "line"); });
    (ps.alts || []).forEach(function (a) {
      if (!a.est[q]) return;
      h += li(a.color, "estimate, " + a.name, "line") + (q === "e" ? '<li><i class="ln dash" style="border-top-color:' + a.color + '"></i>station alone, ' + esc(a.name) + "</li>" : "");
    });
    if (q === "N" && ps.mother && pteMother) {
      h += '<li><i class="ln c" style="border-top-color:' + MOTHER + '"></i>mother ' + fmtDate(ps.mother.date) + "</li>" +
        '<li><i class="ln c" style="border-top-color:' + MOTHER + ';border-top-style:dotted"></i>mother: estimate</li>';
    }
    return h;
  }
  function pcorr(a, b) {
    var x = [], y = [];
    for (var i = 0; i < a.length; i++) if (ok(a[i]) && ok(b[i])) { x.push(+a[i]); y.push(+b[i]); }
    if (x.length < 3) return NaN;
    var mx = mean(x), my = mean(y), sxy = 0, sxx = 0, syy = 0;
    for (var j = 0; j < x.length; j++) { sxy += (x[j] - mx) * (y[j] - my); sxx += (x[j] - mx) * (x[j] - mx); syy += (y[j] - my) * (y[j] - my); }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
  }
  /* the simulated air per atmosphere and point count (data/simulator/atm/), fetched when a pass is shown */
  function getAtm(s) {
    var key = s.atm + "|" + s.points, p = manifest.profiles && manifest.profiles[key];
    if (!atmP[key]) {
      atmP[key] = p ? getJson(BASE + p) : Promise.reject(new Error("no profiles for " + key));
      atmP[key].catch(function () { delete atmP[key]; });
    }
    return atmP[key];
  }
  /* the pass to show: its index in the run's passes */
  function passIndex(pt, epochs) {
    if (pteShow === "random") return Math.min(pteIdx, epochs.length - 1);
    if (pteShow.indexOf("date:") === 0) return epochs.indexOf(pteShow.slice(5));
    var j = -1;
    pt.passes.forEach(function (x) { if (x.label === pteShow) j = epochs.indexOf(x.date); });
    return j;
  }
  function col(series, key, j) { return series.map(function (s) { return s[key][j]; }); }
  /* one pass as the profile charts read it; real: from real.json (no truth above the street) */
  /* T and e lumped: N minus its pressure part at a fixed reference temperature, N − 77.6 P / T0. Given P
     (known from the ground to about 0.1 hPa) this is all the radar's N says about T and e together: the
     dry term's T dependence and the whole wet term, with no assumption about the temperature aloft. */
  var T0 = 288.15;
  function nte(N, P) {
    if (Array.isArray(N)) return N.map(function (v, i) { return nte(v, Array.isArray(P) ? P[i] : P); });
    return ok(N) && ok(P) ? N - 77.6 * P / T0 : NaN;
  }
  function interpZ(z, zs, vs) {
    for (var i = 1; i < zs.length; i++) if (z <= zs[i]) return vs[i - 1] + (vs[i] - vs[i - 1]) * (z - zs[i - 1]) / (zs[i] - zs[i - 1]);
    return vs[vs.length - 1];
  }
  /* layer means of a profile given on 5 m levels */
  function layerMeans(zs, vs, edges) {
    var out = [];
    for (var k = 0; k < edges.length - 1; k++) {
      var s = 0, n = 0;
      for (var z = edges[k]; z <= edges[k + 1] + 1e-9; z += 1) { s += interpZ(z, zs, vs); n++; }
      out.push(n ? s / n : NaN);
    }
    return out;
  }
  function withNte(ps) {
    ps.est.Nte = nte(ps.est.N, ps.est.P);
    ps.station.Nte = nte(ps.station.N, ps.est.P);
    ps.ground.Nte = nte(ps.ground.N, ps.ground.P);
    if (ps.truth) ps.truth.Nte = nte(ps.truth.N, ps.truth.P);
    var pz = ps.truth ? ps.truth.P : ps.model && ps.model.P;
    (ps.meas || []).forEach(function (m) {
      if (!m.N) return;
      m.Nte = nte(m.N, m.P || (pz ? m.z.map(function (z) { return interpZ(z, ps.z, pz); }) : null));
    });
    return ps;
  }
  /* the pass with the selected temperature profile: one shape puts the two-point values in place of the
     6.5 K/km ones, "compare" keeps those and adds the two-point log as ps.alts */
  function passOf(e, j, real, atm) {
    var ps = passBase(e, j, real, atm), mode = tpMode();
    if (!tpData()) return ps;
    /* the upper station, in every mode */
    var up = tpUpper(j);
    if (up) ps.meas.push({ src: real ? "Sanders roof (RAMN), 29 m" : "Upper station (true T, e)", z: [up.z], T: [up.T], e: [up.e], color: "#b5591a" });
    var sh = shapesOf(mode);
    if (mode === "log") {                       /* it replaces the 6.5 K/km values */
      var t2 = tpPass(e, j, real, sh[0]);
      ps.est.T = t2.T; ps.est.P = t2.P; ps.est.e = { level: t2.e }; ps.station.e = t2.station_e;
      if (real) delete ps.model.T;              /* the 6.5 K/km line is not the model any more */
      ps.lines = [{ q: "T", z: tpData().z_fine, v: t2.fineT, color: SHAPE[sh[0]].color, label: "T(z), " + SHAPE[sh[0]].name }];
    } else if (mode === "compare") {            /* 6.5 K/km in blue, two-point log in orange */
      ps.alts = []; ps.lines = [];
      sh.forEach(function (k) {
        var t = tpPass(e, j, real, k);
        ps.alts.push({ name: SHAPE[k].name, color: SHAPE[k].color, est: { T: t.T, P: t.P, e: t.e }, station: { e: t.station_e } });
        ps.lines.push({ q: "T", z: tpData().z_fine, v: t.fineT, color: SHAPE[k].color, label: "T(z), " + SHAPE[k].name });
      });
      /* real: the grey line is already KNMI 344 at 6.5 K/km; simulation: draw that line too */
      if (!real) ps.lines.push({ q: "T", v: ps.z.map(function (z) { return ps.ground.T - 0.0065 * (z - 3.2); }), color: PTE_C.est, label: "T(z), 6.5 K/km", dash: true });
    }
    return ps;
  }
  function passBase(e, j, real, atm) {
    var label = pteShow === "random" ? "random" : pteShow;
    if (real) {
      var pp = e.pte.pass, pr = realDoc.profiles, g = pr.ground;
      return withNte({ label: label, date: realDoc.epochs[j], z: pr.z, model: { P: pr.P[j], T: pr.T[j] },
        est: { N: pp.N[j], P: pp.P[j], T: pp.T[j], e: { level: pp.e[j] } }, station: { N: pp.N_station[j], e: pp.e_station[j] },
        sigma_e: { level: pp.sigma_e[j] }, ground: { N: g.N[j], P: g.P[j], T: g.T[j], e: g.e[j] },
        meas: (pr.meas && pr.meas[j]) || [],
        mother: { date: realDoc.epochs[0], est: pp.N[0], line: pp.N_station[0] } });
    }
    var lay = atm.layers[state.layers], g2 = atm.ground, m = atm.meas && atm.meas[j];
    return withNte({ label: label, date: atm.epochs[j], z: atm.z,
      truth: { N: atm.truth.N[j], P: atm.truth.P[j], T: atm.truth.T[j], e: atm.truth.e[j] },
      est: { N: col(e.series, "est", j), P: lay.P[j], T: lay.T[j], e: { level: e.pte.e_pass[j] } },
      station: { N: lay.N_station[j], e: lay.e_station[j] }, ground: { N: g2.N[j], P: g2.P[j], T: g2.T[j], e: g2.e[j] },
      meas: m ? [m] : [],
      mother: { date: atm.epochs[0], est: col(e.series, "est", 0), line: atm.truth.N[0] } });
  }
  /* error per layer: grouped bars per layer, highest on top, between x0 and x1 of the chart */
  /* radar points per layer: real data from real.json, simulations from the manifest (they depend only on
     the number of points and the layer setup, not on the air or the disturbances) */
  var curCounts = null;
  function layerN(e, real) {
    if (real || e.layer_points) return e.layer_points ? e.layer_points.map(function (x) { return typeof x === "number" ? x : x.n; }) : null;
    var c = manifest.layer_points && manifest.layer_points[state.points + "|" + state.layers];
    return c && c.n.length === e.edges.length - 1 ? c.n : null;
  }
  function ptsLabel(k) { return curCounts && ok(curCounts[k]) ? thousands(curCounts[k]) + " pts" : ""; }
  function barRows(q, edges, groups, x0, x1, H, m, opt) {
    opt = opt || {};
    var nl = edges.length - 1, rowH = (H - m.t - m.b) / nl, bh = Math.max(3, Math.min(16, rowH * 0.8 / groups.length));
    var vals = [0];
    groups.forEach(function (g) { g.vals.forEach(function (v) { if (ok(v)) vals.push(v); }); });
    var lo = opt.lo !== undefined ? Math.min(opt.lo, Math.min.apply(null, vals)) : 0;
    var hi = opt.hi !== undefined ? opt.hi : Math.max.apply(null, vals) * 1.08 || 1;
    var xt = opt.ticks || ticks(lo, hi, x1 - x0 < 200 ? 3 : 4), xmax = opt.hi !== undefined ? hi : Math.max(hi, xt[xt.length - 1]);
    var xs = lin(lo, xmax, x0, x1), body = "", plotB = H - m.b, d = opt.d !== undefined ? opt.d : PTE[q].d;
    if (opt.title) body += text(x0, m.t - 8, opt.title, { size: 10.5, fill: C.ink2, weight: 600 });
    xt.forEach(function (v) { var x = xs(v); body += line(x, m.t, x, plotB, C.grid) + text(x, plotB + 13, opt.ticks ? String(v) : tickLabel(v), { anchor: "middle", size: 10 }); });
    body += line(xs(0), m.t, xs(0), plotB, C.axis);
    body += text((x0 + x1) / 2, H - 3, opt.unit !== undefined ? opt.unit : PTE[q].unit, { anchor: "middle", size: 10, fill: C.ink2 });
    for (var r = 0; r < nl; r++) {
      var k = nl - 1 - r, y0 = m.t + r * rowH + (rowH - groups.length * bh) / 2, lab = layerLabel(edges, k);
      var pl = ptsLabel(k), cy0 = y0 + groups.length * bh / 2;
      if (opt.labels !== false) {
        body += text(x0 - 6, pl ? cy0 - 6 : cy0, lab, { anchor: "end", base: "middle", size: 10, fill: C.truth });
        if (pl) body += text(x0 - 6, cy0 + 7, pl, { anchor: "end", base: "middle", size: 9, fill: C.muted });
      }
      var tip = "<b>" + lab + "</b>" + (pl ? " (" + pl.replace("pts", "radar points") + ")" : "");
      groups.forEach(function (g) { tip += '<br><i class="sw" style="background:' + g.color + '"></i>' + esc(g.label) + " " + num(g.vals[k], d) + (opt.unit === "" ? "" : " " + PTE[q].unit); });
      if (groups.bias) tip += "<br>" + (groups.biasLabel || "mean error (bias)") + " " + signed(groups.bias[k], d) + " " + PTE[q].unit;
      (groups.moreBias || []).forEach(function (b) { tip += "<br>" + b.label + " " + signed(b.vals[k], d) + " " + PTE[q].unit; });
      (groups.extraTips || []).forEach(function (x) { tip += "<br>" + x.label + " " + x.fmt(x.vals[k]); });
      body += '<rect x="' + x0 + '" y="' + (m.t + r * rowH).toFixed(1) + '" width="' + (x1 - x0) + '" height="' + rowH.toFixed(1) + '" fill="transparent"' + ft(tip) + "/>";
      groups.forEach(function (g, i) {
        var v = g.vals[k], y = y0 + i * bh;
        if (!ok(v)) return;
        var a = xs(Math.min(0, v)), b = xs(Math.max(0, v));
        body += rect(a, y + 0.5, b - a, bh - 1, g.color, ' pointer-events="none"');
        if (bh >= 10) body += text(b + 3, y + bh / 2 + 0.5, num(v, d), { base: "middle", size: 9.5, fill: "#333" });
      });
    }
    return body;
  }
  function pteBars(el, q, edges, groups) {
    var w = width(el), nl = edges.length - 1, H = height(el, Math.max(220, nl * (groups.length * 13 + 18) + 40));
    var m = { l: w < 360 ? 58 : 66, r: 36, t: 6, b: 30 };
    el.innerHTML = svg(w, H, barRows(q, edges, groups, m.l, w - m.r, H, m),
      PTE[q].name + ", error per layer, lowest first. " + groups.map(function (g) { return g.label + ": " + g.vals.map(function (v) { return num(v, PTE[q].d); }).join(", "); }).join("; ") + " " + PTE[q].unit + ".");
  }
  /* r per layer only (real data) */
  function pteR(el, q, edges, groups, title) {
    var w = width(el), nl = edges.length - 1, H = height(el, Math.max(200, nl * 60 + 50));
    var m = { l: w < 360 ? 58 : 66, r: 36, t: 24, b: 30 };
    el.innerHTML = svg(w, H, barRows(q, edges, groups, m.l, w - m.r, H, m, { lo: 0, hi: 1, ticks: [0, 0.25, 0.5, 0.75, 1], d: 2, unit: "", title: title }),
      PTE[q].name + ": " + title + ", lowest layer first: " + groups.map(function (g) { return g.label + " " + g.vals.map(function (v) { return num(v, 2); }).join(", "); }).join("; ") + ".");
  }
  /* N, simulation: the rms error (left) and the correlation r with the truth (right), radar and station alone */
  function pteNScores(el, edges, rmsGroups, rGroups, q) {
    q = q || "N";
    var w = width(el), nl = edges.length - 1, H = height(el, Math.max(220, nl * 40 + 60));
    var m = { l: w < 360 ? 56 : 62, r: 30, t: 24, b: 30 }, gap = 22, pw = (w - m.l - m.r - gap) / 2;
    var body = barRows(q, edges, rmsGroups, m.l, m.l + pw, H, m, { title: "rms error (N)" }) +
      barRows(q, edges, rGroups, m.l + pw + gap, w - m.r, H, m, { lo: 0, hi: 1, ticks: [0, 0.5, 1], d: 2, unit: "", title: "r with the truth", labels: false });
    el.innerHTML = svg(w, H, body, "Refractivity per layer, lowest first: rms error " + rmsGroups.map(function (g) { return g.label + " " + g.vals.map(function (v) { return num(v, 1); }).join(", "); }).join("; ") +
      "; r with the truth " + rGroups.map(function (g) { return g.label + " " + g.vals.map(function (v) { return num(v, 2); }).join(", "); }).join("; ") + ".");
  }
  /* one pass: the true profile (real data: carried up from KNMI 344, for P and T only), the estimate per
     layer with an error bar (simulation: the rms error over all passes; real data, e only: its own
     uncertainty on this pass), for N and e the station alone; P relative to the ground */
  /* the estimate as a profile, as the truth is drawn: the layer values at the layer centres, joined
     "lin": by straight lines; "smooth": by a monotone cubic (PCHIP, Fritsch-Carlson), smooth in height
     with no corners and no overshoot between the centres (a real refractivity profile has no sharp
     corners). Both are carried on with their end slopes to the bottom and the top of the column. */
  function profilePts(v) {
    var e = pteEdges, nl = e.length - 1, z = [], x = [];
    for (var k = 0; k < nl; k++) if (ok(v[k])) { z.push((e[k] + e[k + 1]) / 2); x.push(v[k]); }
    var n = z.length;
    if (!n) return [];
    if (n === 1) return [[x[0], e[0]], [x[0], e[nl]]];
    var h = [], d = [], m = [], i;
    for (i = 0; i < n - 1; i++) { h.push(z[i + 1] - z[i]); d.push((x[i + 1] - x[i]) / h[i]); }
    if (pteInterp === "smooth") {
      m.push(d[0]);
      for (i = 1; i < n - 1; i++) {
        if (d[i - 1] * d[i] <= 0) { m.push(0); continue; }
        var w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
        m.push((w1 + w2) / (w1 / d[i - 1] + w2 / d[i]));
      }
      m.push(d[n - 2]);
    } else {
      for (i = 0; i < n; i++) m.push(i === 0 ? d[0] : i === n - 1 ? d[n - 2] : NaN);
    }
    var pts = [[x[0] + m[0] * (e[0] - z[0]), e[0]]];
    for (i = 0; i < n - 1; i++) {
      if (pteInterp !== "smooth") { pts.push([x[i], z[i]]); continue; }
      for (var s = 0; s < 24; s++) {            /* Hermite cubic on [z_i, z_i+1] */
        var t = s / 24, t2 = t * t, t3 = t2 * t;
        pts.push([(2 * t3 - 3 * t2 + 1) * x[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * x[i + 1] + (t3 - t2) * h[i] * m[i + 1], z[i] + t * h[i]]);
      }
    }
    pts.push([x[n - 1], z[n - 1]]);
    pts.push([x[n - 1] + m[n - 1] * (e[nl] - z[n - 1]), e[nl]]);
    return pts;
  }
  var pteInterp = "lin", pteEdges = [];
  function pteProfile(el, q, ps, edges, err, real) {
    pteEdges = edges;
    var ref = q === "P" ? ps.ground.P : 0, nl = edges.length - 1, top = edges[nl];
    var est = (q === "e" ? ps.est.e[pteCal] : ps.est[q]).map(function (v) { return v - ref; });
    var src = real ? ps.model && ps.model[q] : ps.truth[q];
    var tr = src ? src.map(function (v) { return v - ref; }) : null, st = ps.station[q] || null, eb = err || [];
    var stName = real ? "KNMI 344 carried up" : "station alone";
    var xsv = [ps.ground[q] - ref];
    if (tr) tr.forEach(function (v, i) { if (ps.z[i] <= top && ok(v)) xsv.push(v); });
    est.forEach(function (v, k) { if (ok(v)) { xsv.push(v - (eb[k] || 0)); xsv.push(v + (eb[k] || 0)); } });
    if (st) st.forEach(function (v) { if (ok(v)) xsv.push(v); });
    var lines = (ps.lines || []).filter(function (l) { return l.q === q; });
    lines.forEach(function (l) { var lz = l.z || ps.z; l.v.forEach(function (v, i) { if (ok(v) && lz[i] <= top) xsv.push(v - ref); }); });
    var alts = (ps.alts || []).filter(function (a) { return a.est[q]; }).map(function (a) {
      return { name: a.name, color: a.color, v: a.est[q].map(function (v) { return v - ref; }), st: q === "e" ? a.station.e : null };
    });
    alts.forEach(function (a) { [a.v, a.st].forEach(function (x) { if (x) x.forEach(function (v) { if (ok(v)) xsv.push(v); }); }); });
    var meas = (ps.meas || []).filter(function (mm) { return mm[q]; });
    meas.forEach(function (mm) { mm[q].forEach(function (v, i) { if (ok(v) && mm.z[i] <= top) xsv.push(v - ref); }); });
    var mo = q === "N" && ps.mother && pteMother ? ps.mother : null;
    if (mo) { mo.est.forEach(function (v) { if (ok(v)) xsv.push(v); }); mo.line.forEach(function (v, i) { if (ok(v) && (mo.line.length !== ps.z.length || ps.z[i] <= top)) xsv.push(v); }); }
    [est, st].concat(alts.map(function (a) { return a.v; }), alts.map(function (a) { return a.st; })).forEach(function (v) {
      if (v) profilePts(v).forEach(function (p) { if (ok(p[0])) xsv.push(p[0]); });
    });
    var lo = Math.min.apply(null, xsv), hi = Math.max.apply(null, xsv), pad = (hi - lo) * 0.06 || 0.5;
    var w = width(el), H = height(el, 300), m = { l: 40, r: 10, t: 8, b: 30 };
    var xs = lin(lo - pad, hi + pad, m.l, w - m.r), ys = lin(0, top, H - m.b, m.t);
    var body = rect(m.l, m.t, w - m.l - m.r, H - m.t - m.b, "#fcfbf8");
    /* as many decimals as the tick step needs: a temperature profile may span less than a kelvin */
    var xt = ticks(lo - pad, hi + pad, w < 320 ? 3 : 4), dec = xt.length > 1 ? Math.max(0, Math.ceil(-Math.log10(xt[1] - xt[0]) - 1e-9)) : 0;
    xt.forEach(function (v) { body += line(xs(v), m.t, xs(v), H - m.b, C.grid) + text(xs(v), H - m.b + 13, v.toFixed(dec).replace("-", "−"), { anchor: "middle", size: 10 }); });
    ticks(0, top, 4).forEach(function (v) { body += line(m.l, ys(v), w - m.r, ys(v), C.grid) + text(m.l - 5, ys(v), tickLabel(v), { anchor: "end", base: "middle", size: 10 }); });
    body += line(m.l, H - m.b, w - m.r, H - m.b, C.axis) + line(m.l, m.t, m.l, H - m.b, C.axis);
    body += text((m.l + w - m.r) / 2, H - 3, (q === "P" ? "P − P at the ground" : q === "Nte" ? "N − 77.6 P/T₀" : q) + " (" + PTE[q].unit + ")", { anchor: "middle", size: 10, fill: C.ink2 });
    body += text(10, (m.t + H - m.b) / 2, "height (m NAP)", { anchor: "middle", size: 10, fill: C.ink2, rot: -90, base: "middle" });
    if (tr) {
      var pts = [];
      ps.z.forEach(function (z, i) { if (z <= top && ok(tr[i])) pts.push([xs(tr[i]), ys(z)]); });
      body += '<path d="' + path(pts) + '" fill="none" stroke="' + (real ? PTE_C.station : PTE_C.truth) + '" stroke-width="1.6"/>';
    }
    function steps(v, color, wd, dash, dots) {
      var d = "";
      /* a profile through the layer centres, like the truth: straight or smooth (profilePts) */
      profilePts(v).forEach(function (p, i) { d += (i ? "L" : "M") + xs(p[0]).toFixed(1) + " " + ys(p[1]).toFixed(1); });
      var out = '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + wd + '" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="5 3"' : "") + "/>";
      if (dots) for (var k2 = 0; k2 < nl; k2++) if (ok(v[k2])) out += '<circle cx="' + xs(v[k2]).toFixed(1) + '" cy="' + ys((edges[k2] + edges[k2 + 1]) / 2).toFixed(1) + '" r="2.6" fill="' + color + '" pointer-events="none"/>';
      return out;
    }
    if (mo) {                                   /* the mother: the first pass, the reference of every pass */
      if (mo.line.length === ps.z.length) {
        var mp = [];
        ps.z.forEach(function (z, i) { if (z <= top && ok(mo.line[i])) mp.push([xs(mo.line[i]), ys(z)]); });
        body += '<path d="' + path(mp) + '" fill="none" stroke="' + MOTHER + '" stroke-width="1.4" opacity=".8"/>';
      } else body += steps(mo.line, MOTHER, 1.2, true);
      body += steps(mo.est, MOTHER, 2, false).replace("/>", ' stroke-dasharray="2 2" opacity=".9"/>');
    }
    lines.forEach(function (l) {                /* fine T(z) curves of the temperature profiles */
      var lp = [];
      (l.z || ps.z).forEach(function (z, i) { if (z <= top && ok(l.v[i])) lp.push([xs(l.v[i] - ref), ys(z)]); });
      body += '<path d="' + path(lp) + '" fill="none" stroke="' + l.color + '" stroke-width="1.3"' + (l.dash ? ' stroke-dasharray="3 3"' : "") + ' opacity=".9"/>';
    });
    if (st) body += steps(st, PTE_C.station, 1.4, true);
    alts.forEach(function (a) { if (a.st) body += steps(a.st, a.color, 1.4, true); body += steps(a.v, a.color, 2.2); });
    body += steps(est, PTE_C.est, 2.2, false, true);
    meas.forEach(function (mm) {                /* the measurements behind the air: open markers */
      var dia = /sounding/i.test(mm.src);
      mm[q].forEach(function (v, i) {
        if (!ok(v) || mm.z[i] > top) return;
        var cx = xs(v - ref), cy = ys(mm.z[i]);
        var tip = ft("<b>" + esc(mm.src) + "</b>, " + num(mm.z[i], 0) + " m<br>" + (q === "Nte" ? "N − 77.6 P/T₀" : q) + " " + num(v, PTE[q].d) + " " + PTE[q].unit +
          (q === "N" || q === "Nte" ? (/mast/i.test(mm.src) ? "<br>from the measured T and e" : "<br>from the reported P, T and e") : "<br>measured"));
        body += dia ? '<path d="M' + cx.toFixed(1) + " " + (cy - 5.5).toFixed(1) + "l5.5 5.5l-5.5 5.5l-5.5 -5.5z\" fill=\"#fff\" stroke=\"" + C.truth + '" stroke-width="1.6"' + tip + "/>"
          : '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="4.2" fill="#fff" stroke="' + (mm.color || C.truth) + '" stroke-width="1.8"' + tip + "/>";
      });
    });
    for (var k = 0; k < nl; k++) {
      if (!ok(est[k])) continue;
      var y = ys((edges[k] + edges[k + 1]) / 2), lab = layerLabel(edges, k);
      if (ok(eb[k])) {
        var x0 = xs(est[k] - eb[k]), x1 = xs(est[k] + eb[k]);
        body += line(x0, y, x1, y, PTE_C.est, 1.2) + line(x0, y - 4, x0, y + 4, PTE_C.est, 1.2) + line(x1, y - 4, x1, y + 4, PTE_C.est, 1.2);
      }
      var pl = ptsLabel(k);
      if (pl) body += '<text x="' + (m.l + 4) + '" y="' + (ys(edges[k + 1]) + 11).toFixed(1) + '" font-size="9" fill="' + C.muted + '" stroke="#fcfbf8" stroke-width="3" paint-order="stroke" pointer-events="none">' + esc(pl) + "</text>";
      var tip = "<b>" + lab + "</b>" + (pl ? " (" + pl.replace("pts", "radar points") + ")" : "") + "<br>" + (real && (q === "P" || q === "T") ? "from KNMI 344 alone " : "estimate ") + num(est[k] + ref, PTE[q].d) + " " + PTE[q].unit +
        (ok(eb[k]) ? " (± " + num(eb[k], PTE[q].d) + (real ? ", its uncertainty on this pass" : ", the rms error over all passes") + ")" : "") +
        (st ? "<br>" + stName + " " + num(st[k], PTE[q].d) + " " + PTE[q].unit : "") +
        alts.map(function (a) {
          return '<br><i class="sw" style="background:' + a.color + '"></i>' + esc(a.name) + ": " + num(a.v[k] + ref, PTE[q].d) + " " + PTE[q].unit +
            (a.st ? " (" + stName + " " + num(a.st[k], PTE[q].d) + ")" : "");
        }).join("");
      body += '<rect x="' + m.l + '" y="' + ys(edges[k + 1]).toFixed(1) + '" width="' + (w - m.l - m.r) + '" height="' + (ys(edges[k]) - ys(edges[k + 1])).toFixed(1) + '" fill="transparent"' + ft(tip) + "/>";
    }
    body += '<circle cx="' + xs(ps.ground[q] - ref).toFixed(1) + '" cy="' + ys(3.2).toFixed(1) + '" r="4" fill="' + PTE_C.truth + '"' + ft("<b>" + (real ? "KNMI 344" : "The station") + " at the ground</b><br>" + num(ps.ground[q], PTE[q].d) + " " + PTE[q].unit) + "/>";
    el.innerHTML = svg(w, H, body, PTE[q].name + " on " + fmtDate(ps.date) + ": estimate per layer " + est.map(function (v) { return num(v + ref, PTE[q].d); }).join(", ") + " " + PTE[q].unit + ".");
  }
  function li(color, label, kind) {
    return kind === "dash" ? '<li><i class="ln dash"></i>' + esc(label) + "</li>"
      : kind === "line" ? '<li><i class="ln c" style="border-top-color:' + color + '"></i>' + esc(label) + "</li>"
        : '<li><i class="sw" style="background:' + color + '"></i>' + esc(label) + "</li>";
  }
  function pteMessage(text) {
    QS.forEach(function (q) { document.getElementById("pte-" + q).innerHTML = '<p class="sim-sub" style="padding:14px">' + esc(text) + "</p>"; document.getElementById("pte-" + q + "-legend").innerHTML = ""; });
  }
  /* real: the entry of real.json (no truth above the street: N and e against KNMI 344 carried up) */
  function renderPte(e, real) {
    var pt = e.pte, dateLabel = document.getElementById('pte-pass-label');
    dateLabel.hidden=true;
    pteCur = null;
    curCounts = layerN(e, real);
    if (!pt) { pteMessage("N, P, T and e are not in the published results for this combination yet."); setTip('pte-note','No weather profile is available for this combination.'); return; }
    var epochs = real ? realDoc.epochs : last.run.epochs, ps = null;
    document.getElementById("pte-random").setAttribute("aria-pressed", pteShow === "random");
    /* the two-point profile: fetched once per air, then drawn again; the switch shows when it exists */
    loadTp(function () { if (view === "pte") renderView(); });
    var tpd = tpData(), mode = tpMode();
    document.getElementById("pte-tprof").style.display = tpd ? "" : "none";
    fillDatePick(epochs, tpd);
    if (pteShow.indexOf("date:") === 0 && epochs.indexOf(pteShow.slice(5)) < 0) {   /* that date is not in this air */
      pteShow = "errors";
      document.querySelectorAll('input[name="pte-show"]').forEach(function (r) { r.checked = r.value === "errors"; });
      document.getElementById("pte-date").value = "";
    }
    if (pteShow !== "errors") {
      var j = passIndex(pt, epochs);
      if (real) ps = passOf(e, j, true);
      else {
        var key = state.atm + "|" + state.points;
        if (!atmReady[key]) {
          pteMessage("Loading the profiles of every pass…");
          getAtm(state).then(function (d) { atmReady[key] = d; if (view === "pte") renderView(); },
            function (err) { pteMessage("The profiles could not be loaded (" + err.message + ")."); });
          return;
        }
        ps = passOf(e, j, false, atmReady[key]);
      }
      pteCur = ps;
    }
    var tProfTxt = mode === "lin" ? "6.5 K per km" : mode === "log" ? "a logarithmic departure from 6.5 K per km through the ground and the 29 m station"
      : "6.5 K per km in blue, the two-point log (ground + 29 m station) in orange";
    var nUp = tpd ? tpd.T_upper.filter(ok).length : 0;
    setTip('pte-note','P: surface boundary + hydrostatics. T: '+tProfTxt+'. Vapour pressure uses N, P and T; it is conditional on those assumptions.');
    dateLabel.textContent=ps?fmtDate(ps.date):'';dateLabel.hidden=!ps;
    var nl = e.edges.length - 1;
    /* T and e lumped: the T card shows the wet refractivity, the e card is hidden */
    document.getElementById("pte-e").closest("section").hidden = pteLump;
    document.getElementById("view-pte").classList.toggle("pte-lumped", pteLump);
    document.querySelector("#pte-T-h > span").textContent = pteLump ? "T and e lumped: N − 77.6 P/T₀" : "Temperature T";
    var cards = pteLump ? [["N", "N"], ["P", "P"], ["T", "Nte"]] : [["N", "N"], ["P", "P"], ["T", "T"], ["e", "e"]];
    cards.forEach(function (cq) {
      var q = cq[1], el = document.getElementById("pte-" + cq[0]), leg = document.getElementById("pte-" + cq[0] + "-legend"), groups;
      if (!ps && q === "Nte") {
        if (real) {
          var pq = e.pte.pass, rW = [];
          for (var kk = 0; kk < nl; kk++) {
            rW.push(pcorr(pq.N.map(function (r, i) { return nte(r[kk], pq.P[i][kk]); }), pq.N_station.map(function (r, i) { return nte(r[kk], pq.P[i][kk]); })));
          }
          leg.innerHTML = li(PTE_C.est, "radar, r over all passes");
          pteR(el, "Nte", e.edges, [{ label: "radar", vals: rW, color: PTE_C.est }], "r with KNMI 344 carried up");
          return;
        }
        /* simulation: against the truth, with the true pressure averaged over each layer */
        var akey = state.atm + "|" + state.points, atm2 = atmReady[akey];
        if (!atm2) {
          el.innerHTML = '<p class="sim-sub" style="padding:14px">Loading…</p>';
          getAtm(state).then(function (d) { atmReady[akey] = d; if (view === "pte") renderView(); }, function () { /* message stays */ });
          return;
        }
        var lay2 = atm2.layers[state.layers], est2 = [], tru2 = [], sta2 = [];
        for (var jj = 0; jj < atm2.epochs.length; jj++) {
          var pT = layerMeans(atm2.z, atm2.truth.P[jj], e.edges);
          est2.push(e.series.map(function (sr, k) { return nte(sr.est[jj], lay2.P[jj][k]); }));
          tru2.push(e.series.map(function (sr, k) { return nte(sr.truth[jj], pT[k]); }));
          sta2.push(lay2.N_station[jj].map(function (v, k) { return nte(v, lay2.P[jj][k]); }));
        }
        var colK = function (A, k) { return A.map(function (r) { return r[k]; }); };
        var rmsK = function (A, B, k) { var a = colK(A, k), b = colK(B, k), s = 0, n = 0; a.forEach(function (v, i) { if (ok(v) && ok(b[i])) { s += (v - b[i]) * (v - b[i]); n++; } }); return n ? Math.sqrt(s / n) : NaN; };
        var sdK = function (A, k) { var a = colK(A, k).filter(ok), mu = mean(a); return Math.sqrt(mean(a.map(function (v) { return (v - mu) * (v - mu); }))); };
        var g1 = [], g2 = [], g3 = [], r1 = [], r2 = [];
        for (var k2 = 0; k2 < nl; k2++) {
          g1.push(sdK(tru2, k2)); g2.push(rmsK(est2, tru2, k2)); g3.push(rmsK(sta2, tru2, k2));
          r1.push(pcorr(colK(est2, k2), colK(tru2, k2))); r2.push(pcorr(colK(sta2, k2), colK(tru2, k2)));
        }
        leg.innerHTML = li(PTE_C.spread, "true spread") + li(PTE_C.est, "radar") + li(PTE_C.station, "station alone");
        pteNScores(el, e.edges, [{ label: "true spread over the passes", vals: g1, color: PTE_C.spread },
          { label: "radar, rms error", vals: g2, color: PTE_C.est }, { label: "station alone, rms error", vals: g3, color: PTE_C.station }],
          [{ label: "radar", vals: r1, color: PTE_C.est }, { label: "station alone", vals: r2, color: PTE_C.station }], "Nte");
        return;
      }
      if (!ps) {
        if (q === "N") {
          if (real) {
            var pp = e.pte.pass, rN = [];
            for (var k = 0; k < nl; k++) rN.push(pcorr(pp.N.map(function (r) { return r[k]; }), pp.N_station.map(function (r) { return r[k]; })));
            leg.innerHTML = li(PTE_C.est, "radar, r over all passes");
            pteR(el, "N", e.edges, [{ label: "radar", vals: rN, color: PTE_C.est }], "r with KNMI 344 carried up");
          } else {
            var rR = [], rS = [];
            e.series.forEach(function (s) { rR.push(pcorr(s.est, s.truth)); rS.push(pcorr(s.station, s.truth)); });
            leg.innerHTML = li(PTE_C.spread, "true spread") + li(PTE_C.est, "radar") + li(PTE_C.station, "station alone");
            pteNScores(el, e.edges, [{ label: "true spread over the passes", vals: e.truth_spread, color: PTE_C.spread },
              { label: "radar, rms error", vals: e.rmse, color: PTE_C.est }, { label: "station alone, rms error", vals: e.station_rmse, color: PTE_C.station }],
              [{ label: "radar", vals: rR, color: PTE_C.est }, { label: "station alone", vals: rS, color: PTE_C.station }]);
          }
          return;
        }
        if (real && (q === "P" || q === "T")) {
          el.innerHTML = '<p class="sim-sub" style="padding:14px">' + (q === "P" ? "Pressure" : "Temperature") +
            " is KNMI 344's own, carried up from the ground, so against KNMI 344 it has no error (r = 1) by construction. Pick a pass above to see its profile.</p>";
          leg.innerHTML = "";
          return;
        }
        if (real) {
          leg.innerHTML = li(PTE_C.est, "radar, r over all passes");
          var rg = [];
          var shR = shapesOf(mode);
          if (mode !== "log") rg.push({ label: shR.length ? "radar, 6.5 K/km" : "radar", vals: pt.e[pteCal].r, color: PTE_C.est });
          shR.forEach(function (k) { rg.push({ label: "radar, " + SHAPE[k].name, vals: tpScores(e, true, k).e.r, color: SHAPE[k].color }); });
          leg.innerHTML = rg.map(function (g) { return li(g.color, g.label + ", r over all passes"); }).join("");
          pteR(el, "e", e.edges, rg, "r with KNMI 344's e carried up");
          return;
        }
        /* log: its bars in place of the 6.5 K/km ones; compare: both (station alone: 6.5 K/km only) */
        var s2 = pteScore(pt, q), shB = shapesOf(mode), cmp = mode === "compare";
        var sc3 = shB.map(function (k) { return { k: k, s: tpScores(e, false, k)[q] }; });
        groups = [{ label: "true spread over the passes", vals: s2.spread, color: PTE_C.spread }];
        if (!shB.length || cmp) groups.push({ label: cmp ? "6.5 K/km, rms error" : "estimate, rms error", vals: s2.rmse, color: PTE_C.est });
        sc3.forEach(function (x) { groups.push({ label: (cmp ? SHAPE[x.k].name : "estimate (" + SHAPE[x.k].name + "), ") + (cmp ? ", rms error" : "rms error"), vals: x.s.rmse, color: SHAPE[x.k].color }); });
        if (q === "e") {
          if (!shB.length || cmp) groups.push({ label: cmp ? "station alone (6.5 K/km), rms error" : "station alone, rms error", vals: s2.station_rmse, color: PTE_C.station });
          else groups.push({ label: "station alone (" + SHAPE[shB[0]].name + "), rms error", vals: sc3[0].s.station_rmse, color: PTE_C.station });
        }
        groups.bias = mode === "log" ? sc3[0].s.bias : s2.bias;
        if (cmp) {
          groups.biasLabel = "bias, 6.5 K/km";
          groups.moreBias = sc3.map(function (x) { return { label: "bias, " + SHAPE[x.k].name, vals: x.s.bias }; });
        }
        leg.innerHTML = groups.map(function (g) { return li(g.color, g.label); }).join("");
        pteBars(el, q, e.edges, groups);
      } else if (real) {
        leg.innerHTML = (q === "e" ? li(PTE_C.est, "radar ± its uncertainty on this pass", "line") + li(null, "KNMI 344 carried up", "dash")
          : q === "N" || q === "Nte" ? li(PTE_C.est, "radar", "line") + li(null, "KNMI 344 carried up", "dash")
            : (ps.model && ps.model[q] ? li(PTE_C.station, "carried up from KNMI 344", "line") : "") + li(PTE_C.est, "layer mean", "line")) + extraLegend(ps, q);
        pteProfile(el, q, ps, e.edges, q === "e" ? ps.sigma_e[pteCal] : null, true);
      } else {
        leg.innerHTML = li(PTE_C.truth, "truth", "line") + li(PTE_C.est, "estimate ± rms error", "line") +
          (q === "e" || q === "N" || q === "Nte" ? li(null, "station alone", "dash") : "") + extraLegend(ps, q);
        /* the lumped quantity's error is N's (P is known to about 0.1 hPa, 0.03 N) */
        pteProfile(el, q, ps, e.edges, q === "N" || q === "Nte" ? e.rmse : mode === "log" ? tpScores(e, false, "log")[q].rmse : pteScore(pt, q).rmse, false);
      }
    });
    if (real) {
      setTip("pte-N-sub", "The radar's refractivity per layer (the estimation's own calibration). There is no truth above the street; it is set against KNMI 344's ground refractivity carried up with −55 N per km. r over all passes: 1, the radar rises and falls exactly with KNMI; 0, no relation. The seasons are in both, so r is partly the yearly cycle." +
        (realPrior() === "ground" ? " With the air prior from the ground, KNMI 344's anomaly is inside the estimate, so it agrees partly by construction; pick Radar only to judge the radar." : ""));
      setTip("pte-P-sub", "Carried up from KNMI 344's ground pressure with the hydrostatic equation (temperature falling 6.5 K per km). The radar adds nothing to it, and nothing measures it above the street.");
      setTip("pte-T-sub", "KNMI 344's ground temperature falling 6.5 K per km. Nothing measures it above the street; in the simulation this assumption is off by 0.4-1.7 K, more with height and on mornings with an inversion.");
      setTip("pte-e-sub", "From the radar's refractivity, with P and T as in the other cards (the three-term formula, solved for e). There is no truth above the street, so it is set against KNMI 344's own e carried up (its ground refractivity carried up with −55 N per km, converted the same way): per layer the correlation r over the passes. The seasons are in both, so r is partly the yearly cycle." +
        (realPrior() === "ground" ? " With the air prior from the ground, KNMI 344's own anomaly is inside the radar's estimate, so it agrees with KNMI partly by construction; pick Radar only to judge the radar." : ""));
    } else {
      setTip("pte-N-sub", "The radar's refractivity per layer, the quantity the estimation itself produces. Left: its rms error over all passes against the simulation's true layer mean, next to the station alone (the ground refractivity carried up with −55 N per km) and how much the true air changes. Right: the correlation r with the truth over all passes, radar and station alone (1: follows it exactly). Where the radar's bar is shorter on the left and longer on the right than the station's, the radar adds something.");
      setTip("pte-P-sub", "Carried up from the ground pressure with the hydrostatic equation (temperature falling 6.5 K per km): the station's alone, the radar adds nothing to it. Bars: its error per layer against the simulation's true pressure, next to how much the true pressure changes from pass to pass.");
      setTip("pte-T-sub", "The ground temperature falling 6.5 K per km: the station's alone. Its error grows with height where the real air does not follow that rate, for example in morning inversions (warmer air above colder air at the ground).");
      setTip("pte-e-sub", "From the radar's refractivity, with P and T as in the other cards (the three-term formula, solved for e)." +
        " Grey: the station alone, its ground refractivity carried up with −55 N per km. Where the blue bar is shorter than the grey one, the radar adds something." +
        (pt.sigma_source === "formal" ? " The per-pass uncertainty here is the formal one, a lower bound (the jackknife needs more buildings per layer)." : ""));
    }
    if (pteLump) setTip("pte-T-sub", "T and e together, as the radar sees them: its refractivity N minus the pressure part at a fixed reference temperature, N − 77.6 P / T₀ with T₀ = 288.15 K. The pressure comes from the ground and is known to about 0.1 hPa, so what is left holds every effect of T and e (the dry term's dependence on T and the whole wet term) and nothing of the 6.5 K/km assumption. Its error is therefore practically the error of N: comparing on T and e lumped is comparing on N with the pressure taken out. The separate T and e cards show how that one number splits under the 6.5 K/km assumption.");
    setTip("pte-N-sub", document.getElementById("pte-N-sub").getAttribute("data-tip") +
      (pteMother ? " In a pass's profile, purple is the mother: the first pass, against which every other pass (a daughter) is measured." : ""));
  }

  /* ---- the air the motion fit takes: data/simulator/absorbed/<run>.json, written by the team's
     04_python/estimation/site_absorbed.py. Per fitted term the N it took from the true air (the same fit
     repeated on the air alone at the shrinking time it chose; exact, the fit being linear then). Shown
     when the file exists; the real data have no true air, so never there. */
  var absP = {}, absDoc = {}, absPrior = "ground";
  var ABS_TERMS = {
    building: [{ k: "shrinking", name: "shrinking", color: DIST.shrinking.color }, { k: "thermal", name: "thermal dilation", color: DIST.thermal.color },
      { k: "sinking", name: "sinking", color: DIST.sinking.color }],
    scatterer: [{ k: "motion", name: "per-scatterer trend", color: "#8a6a45" }, { k: "thermal", name: "thermal dilation", color: DIST.thermal.color }]
  };
  var TB_COLOR = "#9a9a9a";
  function pct(v) { return ok(v) ? Math.round(v * 100) + " %" : "n/a"; }
  /* R^2 of y on the columns of X (with the constant), least squares by the normal equations */
  function r2on(X, y) {
    var n = y.length, k = X[0].length, A = [], b = [], i, j, r;
    for (i = 0; i < k; i++) { A.push(new Array(k).fill(0)); b.push(0); }
    for (r = 0; r < n; r++) for (i = 0; i < k; i++) { b[i] += X[r][i] * y[r]; for (j = 0; j < k; j++) A[i][j] += X[r][i] * X[r][j]; }
    for (i = 0; i < k; i++) {                   /* Gauss-Jordan with partial pivoting */
      var piv = i;
      for (r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      var t = A[i]; A[i] = A[piv]; A[piv] = t; t = b[i]; b[i] = b[piv]; b[piv] = t;
      if (Math.abs(A[i][i]) < 1e-12) return NaN;
      for (r = 0; r < k; r++) if (r !== i) { var f = A[r][i] / A[i][i]; for (j = i; j < k; j++) A[r][j] -= f * A[i][j]; b[r] -= f * b[i]; }
    }
    var my = mean(y), ss = 0, sr = 0;
    for (r = 0; r < n; r++) { var fit = 0; for (i = 0; i < k; i++) fit += X[r][i] * b[i] / A[i][i]; ss += (y[r] - my) * (y[r] - my); sr += (y[r] - fit) * (y[r] - fit); }
    return ss > 1e-12 ? 1 - sr / ss : NaN;
  }
  /* which signal a series of taken N is: the share a slow trend (1, t, t^2) explains, and the share the
     building temperature explains beyond that trend (its weather-scale part). Over one year a slow trend
     and the seasons look alike, so the trend is counted first. */
  function whichSignal(v, tb, tx) {
    var y = [], Xa = [], Xb = [];
    for (var j = 0; j < v.length; j++) {
      if (!ok(v[j]) || !ok(tb[j])) continue;
      var t = (tx[j] - tx[0]) / 365.25;
      y.push(v[j]); Xa.push([1, t, t * t]); Xb.push([1, t, t * t, tb[j]]);
    }
    if (y.length < 6) return { trend: NaN, temp: NaN };
    var a = r2on(Xa, y), b = r2on(Xb, y);
    return { trend: a, temp: ok(a) && ok(b) ? Math.max(0, b - a) : NaN };
  }
  function renderAbsorbed(s) {
    var card = document.getElementById("sim-abs-card"), key = runKey(s);
    setTip('sim-abs-sub',shortHelp['sim-abs-sub']);
    if (isReal()) { card.hidden = true; return; }
    if (!(key in absDoc)) {
      if (!absP[key]) {
        var p = manifest.absorbed && manifest.absorbed[key];
        absP[key] = (p ? getJson(BASE + p) : Promise.reject(new Error("none"))).then(function (d) { absDoc[key] = d; }, function () { absDoc[key] = null; });
        absP[key].then(function () { if (view === "dist" && last && runKey(last.state) === key) renderAbsorbed(last.state); });
      }
      card.hidden = true;
      return;
    }
    var d = absDoc[key], st = d && d.setups[absPrior] && d.setups[absPrior][s.layers];
    card.hidden = !d;
    if (!d) return;
    var lay = document.getElementById("sim-abs-lay"), pas = document.getElementById("sim-abs-pass"), leg = document.getElementById("sim-abs-legend");
    if (!st || st.error) {
      lay.innerHTML = '<p class="sim-sub" style="padding:14px">Not available for this layer setup' + (st && st.error ? " (" + esc(st.error) + ")" : "") + ".</p>";
      pas.innerHTML = ""; pas._pick = null; leg.innerHTML = ""; return;
    }
    var edges = st.edges, T = st.terms, terms = ABS_TERMS[s.motion] || ABS_TERMS.building;
    var allName = terms.length === 2 ? "both" : "all three";
    curCounts = null;
    var groups = [{ label: "true spread over the passes", vals: st.truth_spread, color: PTE_C.spread }]
      .concat(terms.map(function (t) { return { label: t.name + ", rms taken", vals: T[t.k].rms, color: t.color }; }))
      .concat([{ label: allName + ", rms taken", vals: T.total.rms, color: "#17191c" }]);
    groups.extraTips = [];
    terms.concat([{ k: "total", name: allName }]).forEach(function (t) {
      groups.extraTips.push({ label: t.name + ": share of the true swings taken", vals: T[t.k].share, fmt: pct });
    });
    if (st.truth_r_T) groups.extraTips.push({ label: "r of the true air with the building temperature", vals: st.truth_r_T, fmt: function (v) { return num(v, 2); } });
    var w = width(lay), nl = edges.length - 1, H = height(lay, Math.max(220, nl * (groups.length * 12 + 18) + 40));
    var m = { l: w < 360 ? 58 : 66, r: 36, t: 22, b: 30 };
    lay.innerHTML = svg(w, H, barRows("N", edges, groups, m.l, w - m.r, H, m, { title: "per layer: rms over the passes (N)" }),
      "N taken from the air per layer, lowest first: " + groups.map(function (g) { return g.label + " " + g.vals.map(function (v) { return num(v, 2); }).join(", "); }).join("; ") + " N.");
    var tb = d.building_temperature_C;
    leg.innerHTML = groups.map(function (g) { return li(g.color, g.label.replace(", rms taken", "")); }).join("") +
      (tb ? '<li><i class="ln dash" style="border-top-color:' + TB_COLOR + '"></i>building temperature (right axis)</li>' : "") +
      "<li>" + (absPrior === "ground" ? "with the ground air prior, as the estimation runs" : "without the air prior: the radar alone") + "</li>";
    /* per pass: the N taken, mean over the layers, and the building temperature that drives the thermal fit */
    var ep = d.epochs, tx = ep.map(day), d0 = tx[0], d1 = tx[tx.length - 1], pad = (d1 - d0) * 0.012;
    var series = terms.filter(function (t) { return t.k !== "sinking"; }).map(function (t) { return { v: T[t.k].pass_mean, color: t.color, w: 1.6, name: t.name }; });
    var vals = [0];
    series.forEach(function (x) { x.v.forEach(function (v) { if (ok(v)) vals.push(v); }); });
    var w2 = width(pas), H2 = height(pas, 250), m2 = { l: 44, r: tb ? 38 : 10, t: 22, b: 22 };
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pp = (hi - lo) * 0.06 || 0.5;
    var xs = lin(d0 - pad, d1 + pad, m2.l, w2 - m2.r), ys = lin(lo - pp, hi + pp, H2 - m2.b, m2.t), tt = timeTicks(d0, d1, w2);
    var body = rect(m2.l, m2.t, w2 - m2.l - m2.r, H2 - m2.t - m2.b, "#fcfbf8") + text(m2.l, m2.t - 8, "per pass: N taken, mean over the layers", { size: 10.5, fill: C.ink2, weight: 600 });
    ticks(lo - pp, hi + pp, 4).forEach(function (v) { body += line(m2.l, ys(v), w2 - m2.r, ys(v), C.grid) + text(m2.l - 5, ys(v), tickLabel(v), { anchor: "end", base: "middle", size: 10 }); });
    tt.ticks.forEach(function (t) { var x = xs(t.d); body += line(x, m2.t, x, H2 - m2.b, C.grid) + text(x, H2 - m2.b + 14, t.s, { anchor: "middle", size: 10 }); });
    if (tt.title) body += text(w2 - m2.r, H2 - m2.b + 14, tt.title, { anchor: "end", size: 10, fill: C.ink2 });
    body += line(m2.l, ys(0), w2 - m2.r, ys(0), "#17191c", 0.8);
    var gap = s.atm === "simulated" ? 75 : 30;
    if (tb) {                                   /* the building temperature, on its own axis at the right */
      var tv = tb.filter(ok), tlo = Math.min.apply(null, tv), thi = Math.max.apply(null, tv), tp = (thi - tlo) * 0.06 || 0.5;
      var yt = lin(tlo - tp, thi + tp, H2 - m2.b, m2.t);
      ticks(tlo - tp, thi + tp, 4).forEach(function (v) { body += text(w2 - m2.r + 5, yt(v), tickLabel(v), { base: "middle", size: 10, fill: TB_COLOR }); });
      body += text(w2 - 6, (m2.t + H2 - m2.b) / 2, "building T (°C)", { anchor: "middle", size: 10, fill: TB_COLOR, rot: 90, base: "middle" });
      body += '<path d="' + path(tb.map(function (v, j) { return ok(v) ? [xs(tx[j]), yt(v)] : null; }), tx, gap) + '" fill="none" stroke="' + TB_COLOR + '" stroke-width="1.2" stroke-dasharray="4 3" stroke-linejoin="round"/>';
    }
    series.forEach(function (x) {
      body += '<path d="' + path(x.v.map(function (v, j) { return ok(v) ? [xs(tx[j]), ys(v)] : null; }), tx, gap) + '" fill="none" stroke="' + x.color + '" stroke-width="' + x.w + '" stroke-linejoin="round"/>';
    });
    body += '<line class="sim-cross" x1="0" y1="' + m2.t + '" x2="0" y2="' + (H2 - m2.b) + '" stroke="#17191c" stroke-width="1" stroke-dasharray="2 2" visibility="hidden"/>';
    pas.innerHTML = svg(w2, H2, body, "N taken from the air per pass, mean over the layers: " + series.map(function (x) { return x.name + " rms " + num(rmsMean(x.v), 2) + " N"; }).join(", ") + ".");
    pas._pick = function (px) {
      if (px < m2.l || px > w2 - m2.r) return null;
      var dd = d0 - pad + (px - m2.l) / (w2 - m2.l - m2.r) * (d1 - d0 + 2 * pad), j = 0;
      for (var i = 1; i < tx.length; i++) if (Math.abs(tx[i] - dd) < Math.abs(tx[j] - dd)) j = i;
      var h = "<b>" + fmtDate(ep[j]) + "</b>";
      series.forEach(function (x) { h += '<br><i class="sw" style="background:' + x.color + '"></i>' + esc(x.name) + " took " + signed(x.v[j], 2) + " N"; });
      if (tb && ok(tb[j])) h += "<br>building temperature " + num(tb[j], 1) + " °C";
      return { html: h, x: xs(tx[j]) };
    };
    /* in words: which part of the air each term takes (mean over the layers) */
    var words = terms.filter(function (t) { return t.k !== "sinking"; }).map(function (t) {
      var x = T[t.k], r = mean(x.rms), sh = mean(x.share), w = tb ? whichSignal(x.pass_mean, tb, tx) : { trend: NaN, temp: NaN };
      var what = !tb ? "" : ok(w.trend) && w.trend >= 0.6 ? "; per pass it is a slow trend (" + pct(w.trend) + " of its variance in t and t²)" +
          (w.temp >= 0.1 ? ", and the building temperature explains " + pct(w.temp) + " more" : "")
        : ok(w.temp) && w.temp >= 0.5 ? "; per pass it follows the building temperature: beyond a slow trend (" + pct(w.trend) + ") it explains " + pct(w.temp) + " of its variance"
          : "; per pass " + pct(w.trend) + " slow trend and " + pct(w.temp) + " building temperature beyond it";
      return "<b>" + esc(t.name.charAt(0).toUpperCase() + t.name.slice(1)) + "</b> takes " + num(r, 2) + " N rms per layer, " + pct(sh) + " of the true swings" + what + ".";
    });

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
    if (s.sinking === "1") items.push("<b>Sinking changes nothing here.</b> The simulation sinks each building as a whole, and the estimation only compares points within one building, so a movement every point of a building shares cancels exactly, on every pass and in every step.");
    /* the other motion model, same simulation and layers */
    var otherM = s.motion === "scatterer" ? "building" : "scatterer", mo = summ(variant(s, { motion: otherM }));
    if (mo) {
      var better = mo.column_rmse < sm.column_rmse;
      items.push("<b>Motion model.</b> With the " + MOTION_NAME[otherM] + " instead of the " + MOTION_NAME[s.motion] + " the column error would be " + num(mo.column_rmse, 2) + " N instead of " + num(sm.column_rmse, 2) + " N" +
        (better ? ": the " + MOTION_NAME[otherM] + " does better here." : ".") +
        " Per scatterer every point gets its own linear and quadratic term in time, so it also absorbs every point's slow drift of the air; per building only the shrinking (a straight line in height that slows down) can take the air.");
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
    var lay = layersFor(s.atm).map(function (L) {
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

  /* ------------------------------------------------------------ the real data */
  var realSel = document.getElementById("real-sc-layer");
  function realPrior() { var r = form.querySelector('input[name="prior"]:checked'); return r ? r.value : "none"; }
  /* with the real data only the atmosphere, the layers and the air prior can be chosen */
  function realMode(on) {
    var sub = document.querySelector('[data-atm-sub="real"]');
    if (sub && realDoc) sub.textContent = realDoc.passes + " passes";
    form.querySelectorAll(".sim-only").forEach(function (f) { f.disabled = on; f.hidden=on; });
    form.querySelectorAll(".real-only").forEach(function (f) { f.hidden = !on; });
    document.querySelectorAll('[data-tab="dist"],[data-tab="decide"]').forEach(function(b){b.hidden=on;});
    var rb = document.getElementById("sim-reset"), asof = document.getElementById("sim-asof");
    if (rb) rb.style.display = on ? "none" : "";
    if (asof) asof.textContent = on && realDoc ? "Real TerraSAR-X passes " + fmtDate(realDoc.first) + " to " + fmtDate(realDoc.last) + ", shown only as means over each layer's points; KNMI 344 weather (CC BY 4.0). Generated on " + fmtDate(realDoc.generated) +
      (realDoc.code && realDoc.code.virtual_radiosonde ? " with the team's code at " + String(realDoc.code.virtual_radiosonde).slice(0, 7) : "") + "." : simAsof;
  }
  function getReal() {
    if (!realP) {
      realP = getJson(BASE + "real.json").then(function (d) { realDoc = d; return d; });
      realP.catch(function () { realP = null; });
    }
    return realP;
  }
  function realVerdict(e, prior) {
    var nl = e.rmse.length, k = wins(e).length, col = e.column_rmse < e.column_station_rmse;
    var who = prior === "none" ? "The radar alone" : "With the station's air put back in, the estimate";
    var t;
    if (nl === 1) t = who + (col ? " follows KNMI 344 better than constant air" : " does not follow KNMI 344 better than constant air");
    else if (!k) t = who + " follows KNMI 344 worse than constant air in every layer" + (col ? ", though better on the column" : " and on the column");
    else t = who + " follows KNMI 344 better than constant air in " + (k === nl ? "all " + nl : k + " of " + nl) + " layers" + (col ? " and on the column" : ", but not on the column");
    return t + (prior === "ground" ? " (partly circular: the station's anomaly is inside this estimate)." : ".");
  }
  function renderRealStats(e) {
    var nl = e.rmse.length, w = wins(e), cs = colSkill(e), r0 = e.station_r && e.station_r[0];
    document.getElementById("sim-stats").innerHTML =
      stat(num(e.column_rmse, 2), "N", "radar vs KNMI 344, rms error" + (nl > 1 ? " of the column" : ""), "radar", "s-radar") +
      stat(num(e.column_station_rmse, 2), "N", "constant air (the station's own swings)", "thermo", "s-station") +
      stat('<span style="color:' + skillColor(cs) + '">' + signed(cs, 2) + "</span>", "", "skill vs constant air" + (nl > 1 ? ", better in " + w.length + "/" + nl + " layers" : "") +
        (r0 && ok(r0.r) ? "; r " + num(r0.r, 2) + " with KNMI 344 in the lowest layer" : ""), "target", "s-skill") +
      stat(thousands(e.points_used), "points", "on " + e.buildings + " buildings, " + realDoc.passes + " passes", "grid");
  }
  function renderReal() {
    if (!realDoc) {
      failed("");
      setStatus("Loading the real-data results…");
      getReal().then(function () { if (isReal()) renderView(); },
        function (err) { if (isReal()) failed("The real-data results could not be loaded (" + err.message + "). Reload the page to try again."); });
      return;
    }
    if (view === "dist" || view === "decide") {
      failed((view === "dist" ? "The disturbances are switched on and off in the simulation only" : "This reading is written for the simulation") +
        "; in the real data they are what they are. Pick a simulated atmosphere, or see Step by step and P, T, e for the real data.");
      return;
    }
    var prior = realPrior(), L = state.layers, byMotion = realDoc.results[state.motion] || {}, byPrior = byMotion[prior] || {}, e = byPrior[L];
    if (!e || e.error) { failed("The estimation on the real data could not run with " + (LAYERS_NAME[L] || L) + (e && e.error ? ": " + e.error : "") + ". Try other layers."); return; }
    failed("");
    realMode(true);
    renderRealStats(e);
    if (view === "steps") {
      realScLayer = fillLayerPick(e, realSel, realScLayer);
      renderPass(document.getElementById("real-pass"), e, realDoc.epochs, 75, W_REAL);
      renderLay(document.getElementById("real-lay"), e, W_REAL);
      renderScatter(document.getElementById("real-sc"), e, realDoc.epochs, realScLayer, W_REAL);
    } else if (view === "pte") {
      renderPte(e, true);
    }
  }

  /* ------------------------------------------------------------ save a chart as a clean figure */
  /* the card's chart with its title on top, its legend (only the lines shown) and a caption with
     the settings below, on white: as SVG, or as PNG at three times the screen size */
  function figCaption(card) {
    var s = state, L = LAYERS_NAME[s.layers] || s.layers;
    var pass = card.closest("#view-pte") && pteCur ? "; " + (pteCur.label === "random" ? "a" : "the " + pteCur.label) + " pass, " + fmtDate(pteCur.date) : "";
    if (isReal()) {
      var rp = pass;
      return "Real TerraSAR-X data" + (realDoc ? ", " + fmtDate(realDoc.first) + " to " + fmtDate(realDoc.last) + " (" + realDoc.passes + " passes)" : "") +
        "; comparison proxy: KNMI 344 Rotterdam The Hague Airport, carried up with −55 N/km; air prior: " + (realPrior() === "none" ? "none (radar only)" : "from the ground") + "; " + MOTION_NAME[s.motion] + "; " + L + rp + ". Virtual Radiosonde.";
    }
    var on = TOGGLES.filter(function (k) { return s[k] === "1"; }).map(function (k) { return DIST[k].label.toLowerCase(); });
    return "Simulation: " + (ATM_NAME[s.atm] || s.atm).replace(/^the /, "") + "; " + (on.length ? listWords(on) : "no disturbances") + "; " + s.noise + " mm noise; " +
      thousands(s.points) + " points; " + MOTION_NAME[s.motion] + "; " + L + pass + ". Synthetic data, Virtual Radiosonde simulator.";
  }
  function figLegend(card) {
    var out = [];
    card.querySelectorAll(".sim-legend li").forEach(function (li) {
      if (li.getAttribute("aria-pressed") === "false") return;
      var i = li.querySelector("i"), cls = i ? i.className : "", cs = i ? getComputedStyle(i) : null;
      var kind = !i ? "none" : /\bsw\b/.test(cls) ? "box" : /\btick\b/.test(cls) ? "tick" : /\bpt\b/.test(cls) ? (/\bdia\b/.test(cls) ? "dia" : "pt") : "line";
      out.push({ kind: kind, color: kind === "box" ? cs.backgroundColor : kind === "line" ? cs.borderTopColor : C.truth,
        dash: kind === "line" && /dash|dot/.test(cs.borderTopStyle), text: li.textContent.replace(/\s+/g, " ").trim() });
    });
    return out;
  }
  function wrapWords(s, chars) {
    var lines = [], cur = "";
    s.split(" ").forEach(function (w) { if ((cur + " " + w).trim().length > chars && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
    if (cur) lines.push(cur);
    return lines;
  }
  function figure(card) {
    var chart = card.querySelector(".sim-chart svg");
    if (!chart) return null;
    var h3 = card.querySelector("h3").cloneNode(true);
    h3.querySelectorAll(".t, .h-ic").forEach(function (n) { n.remove(); });
    var title = h3.textContent.replace(/\s+/g, " ").trim();
    var cw = +chart.getAttribute("width"), ch = +chart.getAttribute("height"), pad = 18, W = Math.max(cw + 2 * pad, 420);
    var y = 30, body = '<rect width="100%" height="100%" fill="#ffffff"/>';
    body += text(pad, y, title, { size: 15, weight: 650, fill: C.truth });
    y += 12;
    var c = chart.cloneNode(true);
    c.setAttribute("x", (W - cw) / 2); c.setAttribute("y", y);
    ["role", "aria-label", "aria-hidden"].forEach(function (a) { c.removeAttribute(a); });
    body += new XMLSerializer().serializeToString(c);
    y += ch + 18;
    var x = pad, items = figLegend(card);
    items.forEach(function (it) {
      var wd = 26 + it.text.length * 6.4 + 14;
      if (x + wd > W - pad && x > pad) { x = pad; y += 18; }
      var cy = y - 4;
      if (it.kind === "box") body += rect(x, cy - 5, 14, 10, it.color, ' rx="2"');
      else if (it.kind === "tick") body += line(x + 7, cy - 7, x + 7, cy + 7, it.color, 2.2);
      else if (it.kind === "line") body += line(x, cy, x + 20, cy, it.color, 2.2, it.dash ? ' stroke-dasharray="5 3"' : "");
      else if (it.kind === "pt") body += '<circle cx="' + (x + 7) + '" cy="' + cy + '" r="4.2" fill="#fff" stroke="' + C.truth + '" stroke-width="1.6"/>';
      else if (it.kind === "dia") body += '<path d="M' + (x + 7) + " " + (cy - 5.5) + 'l5.5 5.5l-5.5 5.5l-5.5 -5.5z" fill="#fff" stroke="' + C.truth + '" stroke-width="1.6"/>';
      body += text(x + (it.kind === "none" ? 0 : 26), y, it.text, { size: 11.5, fill: C.ink2 });
      x += wd;
    });
    if (items.length) y += 22;
    wrapWords(figCaption(card), Math.floor((W - 2 * pad) / 5.6)).forEach(function (l) { body += text(pad, y, l, { size: 10, fill: C.muted }); y += 14; });
    var H = Math.ceil(y + 6);
    return { name: "vrs-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), W: W, H: H,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">' + body + "</svg>" };
  }
  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function saveFigure(card, kind) {
    var f = figure(card);
    if (!f) return;
    if (kind === "svg") { download(new Blob([f.svg], { type: "image/svg+xml" }), f.name + ".svg"); return; }
    var img = new Image(), k = 3;
    img.onload = function () {
      var cv = document.createElement("canvas");
      cv.width = f.W * k; cv.height = f.H * k;
      var g = cv.getContext("2d");
      g.scale(k, k); g.drawImage(img, 0, 0);
      cv.toBlob(function (b) { download(b, f.name + ".png"); }, "image/png");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(f.svg);
  }
  out.querySelectorAll(".app-card").forEach(function (card) {
    var head = card.querySelector(".sim-card-head");
    if (!head || !card.querySelector(".sim-chart")) return;
    var s = document.createElement("details");
    s.className = "sim-save";
    s.innerHTML = '<summary aria-label="Download this figure">↓</summary>' + '<button type="button" data-save="png" title="Save this figure as a PNG image, with its title, legend and settings">PNG</button>' +
      '<button type="button" data-save="svg" title="Save this figure as an SVG drawing (scalable, for reports)">SVG</button>';
    head.appendChild(s);
  });
  out.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-save]");
    if (b) saveFigure(b.closest(".app-card"), b.getAttribute("data-save"));
  });

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
      ", " + d.noise + " mm noise, " + thousands(d.points) + " points, " + (MOTION_NAME[d.motion] || MOTION_NAME.building) + ", " + LAYERS_NAME[String(d.layers)] + ".";
    var asof = document.getElementById("sim-asof");
    if (asof && manifest.generated) asof.textContent = "Synthetic data only, no real radar point is used. Results generated on " + fmtDate(manifest.generated) +
      (manifest.code && manifest.code.virtual_radiosonde ? " with the team's code at " + String(manifest.code.virtual_radiosonde).slice(0, 7) : "") + ".";
    if (asof) simAsof = asof.textContent;
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
      if (r.name !== "prior" && !valid(r.name, r.value)) { r.disabled = true; r.closest("label").hidden = true; }
    });
    TOGGLES.forEach(function (k) { if (!valid(k, 1)) { form.elements[k].disabled = true; form.elements[k].closest("label").hidden = true; } });
    fillScene();
    toForm(initialState());
    var p0 = new URLSearchParams(location.search).get("prior");
    form.querySelectorAll('input[name="prior"]').forEach(function (r) { if (p0) r.checked = r.value === p0; });
    form.addEventListener("change", update);
    scSel.addEventListener("change", function () { scLayer = +scSel.value; if (last && !simMsg) renderScatter(document.getElementById("sim-sc"), last.entry, last.run.epochs, scLayer, W_SIM); });
    document.getElementById("view-dist").addEventListener("change", function (ev) {
      if (ev.target.name === "abs-prior") { absPrior = ev.target.value; if (last && !simMsg) renderAbsorbed(last.state); }
    });
    document.getElementById("view-pte").addEventListener("change", function (ev) {
      if (ev.target.name === "pte-show") pteShow = ev.target.value;
      if (ev.target.name === "pte-lump") pteLump = ev.target.value === "1";
      if (ev.target.name === "pte-mother") pteMother = ev.target.checked;
      if (ev.target.name === "pte-t") pteT = ev.target.value;
      if (ev.target.name === "pte-interp") pteInterp = ev.target.value;
      if (ev.target.id === "pte-date") {
        if (!ev.target.value) return;
        pteShow = "date:" + ev.target.value;
        document.querySelectorAll('input[name="pte-show"]').forEach(function (r) { r.checked = false; });
      }
      renderView();
    });
    /* a new random pass on every click */
    document.getElementById("pte-random").addEventListener("click", function () {
      var n = isReal() ? (realDoc ? realDoc.epochs.length : 0) : (last ? last.run.epochs.length : 0);
      if (!n) return;
      var j = Math.floor(Math.random() * n);
      if (n > 1 && pteShow === "random" && j === pteIdx) j = (j + 1) % n;
      pteIdx = j; pteShow = "random";
      document.querySelectorAll('input[name="pte-show"]').forEach(function (r) { r.checked = false; });
      renderView();
    });

    var tabs = document.querySelector(".sim-tabs");
    tabs.addEventListener("click", function (ev) { var b = ev.target.closest("[data-tab]"); if (b) setView(b.getAttribute("data-tab")); });
    tabs.addEventListener("keydown", function (ev) {
      var i = VIEWS.indexOf(view), d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
      if (d) { ev.preventDefault(); setView(VIEWS[(i + d + VIEWS.length) % VIEWS.length], true); }
    });
    showTabs();
    function flip(ev) {
      var li = ev.target.closest && ev.target.closest("li.tg");
      if (!li || (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ")) return;
      ev.preventDefault();
      var k = li.getAttribute("data-k");
      shown[k] = !shown[k];
      renderView();
    }
    ["sim-pass-legend"].forEach(function (id) {
      var pl = document.getElementById(id);
      pl.addEventListener("click", flip);
      pl.addEventListener("keydown", flip);
    });
    document.getElementById("sim-reset").addEventListener("click", function () { toForm(manifest.defaults); update(); });
    var t = null;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(render, 150); });
    update();
  }).catch(function (err) {
    fail("The simulator results are not on the site yet, or could not be read (" + err.message + "). The page needs data/simulator/manifest.json and its run files; everything else on this page still applies.");
  });

  /* every info tip on the page stays readable: shifted sideways to stay inside the side panel (which
     clips what sticks out) or the window, narrowed to the panel, and opened upwards near the bottom */
  function fitTip(t) {
    var panel = t.closest(".app-panel"), r = t.getBoundingClientRect();
    var box = panel ? panel.getBoundingClientRect() : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
    var room = box.right - box.left - 16, wMax = Math.min(panel ? 270 : 330, 0.76 * window.innerWidth, room);
    var tip = t.getAttribute("data-tip") || "", w = Math.min(wMax, tip.length * 6.6 + 24) + 6;
    var base = t.classList.contains("left") ? r.left : t.classList.contains("right") ? r.right - w : r.left + r.width / 2 - w / 2;
    var want = clamp(base, box.left + 10, box.right - 10 - w);
    t.style.setProperty("--tip-shift", (want - base).toFixed(0) + "px");
    if (panel) t.style.setProperty("--tip-max", Math.floor(wMax) + "px");
    var hgt = Math.ceil(tip.length * 6.6 / Math.max(80, w - 22)) * 19 + 24, bottom = Math.min(box.bottom, window.innerHeight);
    t.classList.toggle("up", !t.classList.contains("left") && !t.classList.contains("right") && r.bottom + hgt > bottom - 4 && r.top - hgt > Math.max(box.top, 0));
  }
  document.getElementById("sim").addEventListener("mouseover", function (ev) { var t = ev.target.closest && ev.target.closest(".t"); if (t) fitTip(t); });
  document.getElementById("sim").addEventListener("focusin", function (ev) { var t = ev.target.closest && ev.target.closest(".t"); if (t) fitTip(t); });

  /* screen readers do not read the tooltip text from CSS: give the info marks a name */
  form.querySelectorAll(".t.i").forEach(function (t) { if(!t.hasAttribute('aria-label'))t.setAttribute("aria-label", t.getAttribute("data-tip")); if(!t.matches('button'))t.setAttribute("role", "note"); });
})();
