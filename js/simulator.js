/* Estimation simulator: reads the precomputed results in data/simulator/ (manifest.json and one
   runs/<key>.json per simulation, fetched when first needed and kept), and draws the comparison
   between the estimated and the true air refractivity as inline SVG. Plain script, no libraries.
   Nothing is computed here beyond picking the right entry and formatting it. */
(function () {
  "use strict";

  var BASE = "data/simulator/";
  var C = { truth: "#17191c", radar: "#d62728", ground: "#9a9a9a", spread: "#c6dbef", grid: "#ece9e1", axis: "#cdc9be", muted: "#6e747b" };
  var KEYS = ["noise", "thermal", "sinking", "crossrange", "method", "layers"];
  var METHOD = { none: "fit α only", air_prior: "fit α + air prior", jaap: "Jaap's method" };
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  var form = document.getElementById("sim-controls");
  var statusEl = document.getElementById("sim-status");
  var out = document.getElementById("sim-out");
  if (!form || !out) return;

  var manifest = null, state = {}, runs = {}, last = null, token = 0;

  /* ------------------------------------------------------------ small helpers */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function num(v, d) { return v === null || v === undefined || isNaN(v) ? "n/a" : (+v).toFixed(d === undefined ? 1 : d).replace("-", "−"); }
  function fmtDate(iso) { var p = iso.split("-"); return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function yearFrac(iso) { var p = iso.split("-"); return +p[0] + (+p[1] - 1) / 12 + (+p[2] - 1) / 365; }
  function mean(a) { var s = 0, n = 0; a.forEach(function (v) { if (v !== null && !isNaN(v)) { s += v; n++; } }); return n ? s / n : NaN; }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0); }; }
  function ticks(d0, d1, count) {
    var span = d1 - d0 || 1, step = Math.pow(10, Math.floor(Math.log10(span / count))), err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var t = [];
    for (var v = Math.ceil(d0 / step - 1e-9) * step; v <= d1 + 1e-9; v += step) t.push(+v.toFixed(10));
    return t;
  }
  function tickLabel(v) { var s = Math.abs(v) >= 10 || v === Math.round(v) ? v.toFixed(0) : v.toFixed(1); return s.replace("-", "−"); }
  function layerLabel(e, k) { return Math.round(e[k]) + "–" + Math.round(e[k + 1]) + " m"; }
  function width(el) { return Math.max(260, Math.floor(el.clientWidth || 600)); }
  function svg(w, h, body, label) {
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg"' +
      (label ? ' role="img" aria-label="' + esc(label) + '"' : ' aria-hidden="true"') + ">" + body + "</svg>";
  }
  function text(x, y, s, o) {
    o = o || {};
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + (o.size || 11) + '" fill="' + (o.fill || C.muted) + '"' +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : "") + (o.base ? ' dominant-baseline="' + o.base + '"' : "") +
      (o.rot ? ' transform="rotate(' + o.rot + " " + x.toFixed(1) + " " + y.toFixed(1) + ')"' : "") +
      (o.weight ? ' font-weight="' + o.weight + '"' : "") + ">" + esc(s) + "</text>";
  }
  function line(x1, y1, x2, y2, stroke, w, extra) {
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + stroke + '" stroke-width="' + (w || 1) + '"' + (extra || "") + "/>";
  }
  function rect(x, y, w, h, fill) { return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(0, w).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" fill="' + fill + '"/>'; }
  /* axes: x along the bottom, y on the left, light grid lines */
  function axes(m, w, h, xs, xt, ys, yt, xlab, ylab, xfmt) {
    var s = "";
    yt.forEach(function (v) { var y = ys(v); s += line(m.l, y, w - m.r, y, C.grid) + text(m.l - 6, y, tickLabel(v), { anchor: "end", base: "middle" }); });
    xt.forEach(function (v) { var x = xs(v); s += line(x, m.t, x, h - m.b, C.grid) + text(x, h - m.b + 15, xfmt ? xfmt(v) : tickLabel(v), { anchor: "middle" }); });
    s += line(m.l, h - m.b, w - m.r, h - m.b, C.axis) + line(m.l, m.t, m.l, h - m.b, C.axis);
    s += text((m.l + w - m.r) / 2, h - 6, xlab, { anchor: "middle", fill: "#3c4249", size: 12 });
    s += text(13, (m.t + h - m.b) / 2, ylab, { anchor: "middle", fill: "#3c4249", size: 12, rot: -90, base: "middle" });
    return s;
  }

  /* ------------------------------------------------------------ state */
  function keyOf(s) { return "n" + s.noise + "_t" + s.thermal + "_s" + s.sinking + "_c" + s.crossrange; }
  function fromForm() {
    var s = {};
    ["noise", "method", "layers"].forEach(function (k) {
      var r = form.querySelector('input[name="' + k + '"]:checked');
      s[k] = r ? r.value : String(manifest.defaults[k]);
    });
    ["thermal", "sinking", "crossrange"].forEach(function (k) { s[k] = form.elements[k].checked ? "1" : "0"; });
    return s;
  }
  function toForm(s) {
    ["noise", "method", "layers"].forEach(function (k) {
      form.querySelectorAll('input[name="' + k + '"]').forEach(function (r) { r.checked = r.value === String(s[k]); });
    });
    ["thermal", "sinking", "crossrange"].forEach(function (k) { form.elements[k].checked = String(s[k]) === "1"; });
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
      var path = manifest.runs && manifest.runs[key];
      runs[key] = path ? getJson(BASE + path) : Promise.reject({ missing: true, message: key });
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
    state = fromForm();
    writeUrl(state);
    var key = keyOf(state), my = ++token;
    var slow = setTimeout(function () { if (my === token) { setStatus("Loading the results for this combination…"); out.classList.add("busy"); } }, 120);
    getRun(key).then(function (run) {
      if (my !== token) return;
      clearTimeout(slow); out.classList.remove("busy");
      var entry = run.results && run.results[state.method + "|" + state.layers];
      if (!entry) throw new Error("no result for " + state.method + "|" + state.layers + " in " + key);
      last = { run: run, entry: entry, state: state };
      render();
    }).catch(function (err) {
      if (my !== token) return;
      clearTimeout(slow); out.classList.remove("busy");
      out.hidden = true; last = null;
      setStatus(err && err.missing ? "This combination (" + err.message + ") is not in the published results yet. Try another setting, or press \u201cReset to realistic\u201d."
        : "The results for this combination could not be loaded (" + (err && err.message) + "). Try another setting, or reload the page.", "error");
    });
  }

  /* ------------------------------------------------------------ rendering */
  function render() {
    if (!last) return;
    var e = last.entry, s = last.state;
    if (e.error) {
      out.hidden = true;
      setStatus("The estimation could not run for this combination: " + e.error + ". Thinner layers need more radar points; try 40 m layers or less noise.", "error");
      return;
    }
    setStatus("");
    out.hidden = false;
    var nl = e.rmse.length;
    document.getElementById("sim-verdict").textContent = verdict(e, s);
    renderStats(e, s);
    renderTable(e);
    renderProfile(document.getElementById("sim-profile"), e);
    renderSeries(document.getElementById("sim-series"), e, last.run);
    renderPasses(document.getElementById("sim-passes"), e);
    out.setAttribute("data-layers", nl);
  }

  /* "follows the air" = error below half the air's own spread (the estimate explains at least
     three quarters of the variance); "beats the station" = smaller rms error than the station alone */
  function verdict(e, s) {
    var nl = e.rmse.length, wins = [], follows = 0;
    for (var k = 0; k < nl; k++) {
      if (e.rmse[k] < e.ground_rmse[k]) wins.push(layerLabel(e.edges, k));
      if (e.rmse[k] < 0.5 * e.truth_spread[k]) follows++;
    }
    if (!follows) {
      return "The radar cannot follow the air here: its error (" + num(mean(e.rmse)) + " N" + (nl > 1 ? " on average" : "") + ") is close to the air's own variation (" +
        num(mean(e.truth_spread)) + " N)" + (nl === 1 ? "" : " in every layer") + (s.noise === "0" ? ", even without any noise" : s.noise === "4" ? ", mostly because of the noise" : "") +
        ", so the estimate says little more than the long-term average.";
    }
    if (nl === 1) {
      return wins.length ? "The radar beats the weather station in its single layer (" + num(e.rmse[0], 2) + " against " + num(e.ground_rmse[0], 2) + " N)."
        : "The weather station alone does better than the radar in the single layer (" + num(e.ground_rmse[0], 2) + " against " + num(e.rmse[0], 2) + " N), although the radar does follow the air.";
    }
    if (!wins.length) return "The weather station alone does better than the radar in all " + nl + " layers, although the radar follows the air in " + follows + " of them.";
    if (wins.length === nl) return "The radar beats the weather station in all " + nl + " layers.";
    return "The radar beats the weather station in " + wins.length + " of " + nl + " layers" + (wins.length <= 2 ? " (" + wins.join(" and ") + ")" : "") + ".";
  }

  function stat(v, unit, k, ic) {
    var i = ic && window.VRS_ICON ? '<span class="s-ic">' + window.VRS_ICON(ic) + "</span>" : "";
    return '<div class="stat">' + i + '<span class="v">' + v + (unit ? ' <span class="u">' + unit + "</span>" : "") + '</span><span class="k">' + k + "</span></div>";
  }
  function renderStats(e, s) {
    var aTrue = s.thermal === "1" ? (manifest.scene && manifest.scene.alpha_true_per_K) || 7e-6 : 0;
    var aFit = e.alpha_median_per_K;
    var nl = e.rmse.length, avg = nl === 1 ? "" : ", mean of " + nl + " layers";
    var html = stat(num(mean(e.rmse)), "N", "radar estimate, rms error" + avg, "radar") +
      stat(num(mean(e.ground_rmse)), "N", "weather station alone, rms error" + avg, "thermo") +
      stat(aFit === null || aFit === undefined ? "not fitted" : num(aFit * 1e6, 2), aFit === null || aFit === undefined ? "" : "× 10⁻⁶ /K",
        "fitted thermal expansion α; true value " + num(aTrue * 1e6, 1) + (aTrue ? " × 10⁻⁶ /K" : " (switched off)"), "sun") +
      stat(e.points_used !== undefined ? Number(e.points_used).toLocaleString("en-GB").replace(/,/g, " ") : "n/a", "points",
        "used by the estimation" + (e.buildings !== undefined ? ", on " + e.buildings + " buildings" : ""), "grid");
    document.getElementById("sim-stats").innerHTML = html;
  }

  function renderTable(e) {
    var hasSkill = Array.isArray(e.skill);
    var h = "<thead><tr><th>Layer</th><th>Radar error</th><th>Weather station alone</th>" +
      (hasSkill ? '<th title="1 minus the radar\'s squared error divided by the station\'s: above 0 the radar adds something">Skill vs station</th>' : "") +
      "<th>True spread</th><th>Radar bias</th></tr></thead><tbody>";
    for (var k = e.rmse.length - 1; k >= 0; k--) {
      var win = e.rmse[k] < e.ground_rmse[k];
      var sk = hasSkill ? e.skill[k] : null;
      h += "<tr><td class=\"num\">" + layerLabel(e.edges, k) + '</td><td class="num' + (win ? " win" : "") + '">' + num(e.rmse[k], 2) + '</td><td class="num' + (win ? "" : " win") + '">' +
        num(e.ground_rmse[k], 2) + "</td>" +
        (hasSkill ? '<td class="num skill ' + (sk > 0 ? "pos" : "neg") + '">' + (sk > 0 ? "+" : "") + num(sk, 2) + "</td>" : "") +
        '<td class="num">' + num(e.truth_spread[k], 2) + '</td><td class="num">' + num(e.bias[k], 2) + "</td></tr>";
    }
    document.getElementById("sim-table").innerHTML = h + '</tbody><caption class="small">rms over all passes, N-units; the smaller error in each layer is in bold. Skill above 0 (green): the radar beats the station alone. Highest layer first.</caption>';
  }

  /* b: per layer, the true spread as a band, the station and the radar error as bars; height up */
  function renderProfile(el, e) {
    var w = width(el), nl = e.rmse.length, edges = e.edges;
    var top = edges[edges.length - 1], ymax = Math.ceil(top / 20) * 20;
    var m = { l: 50, r: 14, t: 10, b: 44 };
    var h = Math.max(280, Math.min(520, nl * 52)) + m.t + m.b;
    var xmaxRaw = Math.max.apply(null, e.rmse.concat(e.ground_rmse, e.truth_spread)) * 1.12;
    var xt = ticks(0, xmaxRaw, w < 420 ? 4 : 7), xmax = Math.max(xmaxRaw, xt[xt.length - 1]);
    var xs = lin(0, xmax, m.l, w - m.r), ys = lin(0, ymax, h - m.b, m.t);
    var body = axes(m, w, h, xs, xt, ys, ticks(0, ymax, nl > 4 ? 8 : 6), "rms error or spread (N-units)", "height (m)");
    for (var k = 0; k < nl; k++) {
      var y0 = ys(edges[k + 1]), y1 = ys(edges[k]), ph = y1 - y0, bh = Math.min(16, Math.max(5, ph * 0.26)), mid = (y0 + y1) / 2;
      body += rect(m.l + 0.5, y0 + 1, xs(e.truth_spread[k]) - m.l, ph - 2, C.spread);
      body += rect(m.l + 0.5, mid - bh - 1.5, xs(e.ground_rmse[k]) - m.l, bh, C.ground);
      body += rect(m.l + 0.5, mid + 1.5, xs(e.rmse[k]) - m.l, bh, C.radar);
      if (bh >= 9) {
        body += barLabel(xs(e.ground_rmse[k]), mid - bh / 2 - 1.5, e.ground_rmse[k], w - m.r);
        body += barLabel(xs(e.rmse[k]), mid + bh / 2 + 1.5, e.rmse[k], w - m.r);
      }
      if (k > 0) body += line(m.l, y1, w - m.r, y1, "#ffffff", 1);
    }
    el.innerHTML = svg(w, h, body, "Per height layer: radar rms error " + e.rmse.map(function (v) { return num(v); }).join(", ") +
      " N; weather station alone " + e.ground_rmse.map(function (v) { return num(v); }).join(", ") + " N; true spread " + e.truth_spread.map(function (v) { return num(v); }).join(", ") + " N, lowest layer first.");
  }
  function barLabel(x, y, v, xmax) {
    var inside = x + 34 > xmax;
    return text(inside ? x - 4 : x + 4, y, num(v), { anchor: inside ? "end" : "start", base: "middle", size: 10.5, fill: inside ? "#fff" : "#3c4249" });
  }

  /* c: truth line and estimate dots over the years, one panel per stored layer */
  function renderSeries(el, e, run) {
    var w = width(el) - 2, html = "";
    var x0 = Math.floor(yearFrac(run.epochs[0])), x1 = Math.ceil(yearFrac(run.epochs[run.epochs.length - 1]) + 0.001);
    var tx = run.epochs.map(yearFrac);
    (e.series || []).forEach(function (sr) {
      var vals = sr.truth.concat(sr.est).filter(function (v) { return v !== null && !isNaN(v); });
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.06 || 1;
      var m = { l: 50, r: 12, t: 10, b: 44 }, h = w < 500 ? 220 : 250;
      var yt = ticks(lo - pad, hi + pad, 5), xs = lin(x0, x1, m.l, w - m.r), ys = lin(lo - pad, hi + pad, h - m.b, m.t);
      var step = w < 500 ? 2 : 1, xt = [];
      for (var y = x0; y <= x1; y += step) xt.push(y);
      var body = axes(m, w, h, xs, xt, ys, yt, "year", "N (N-units)", function (v) { return w < 500 ? "’" + String(v).slice(2) : String(v); });
      var p = "";
      sr.truth.forEach(function (v, i) { if (v !== null && !isNaN(v)) p += (p ? "L" : "M") + xs(tx[i]).toFixed(1) + " " + ys(v).toFixed(1); });
      body += '<path d="' + p + '" fill="none" stroke="' + C.truth + '" stroke-width="1" stroke-opacity=".85" stroke-linejoin="round"/>';
      var d = "", r = w < 500 ? 1.8 : 2.2;
      sr.est.forEach(function (v, i) { if (v !== null && !isNaN(v)) d += '<circle cx="' + xs(tx[i]).toFixed(1) + '" cy="' + ys(v).toFixed(1) + '" r="' + r + '"/>'; });
      body += '<g fill="' + C.radar + '" fill-opacity=".7">' + d + "</g>";
      var label = sr.label || layerLabel(e.edges, sr.layer);
      html += '<figure class="sim-fig"><figcaption>Layer ' + esc(label) + "</figcaption>" +
        svg(w, h, body, "Layer " + label + ": true layer mean and radar estimate on each of " + sr.truth.length + " passes, " + x0 + " to " + (x1 - 1) + ".") + "</figure>";
    });
    el.innerHTML = html || '<p class="small">No time series stored for this combination.</p>';
  }

  /* d: the coldest and the warmest pass, height profile */
  function renderPasses(el, e) {
    var passes = e.passes || [];
    if (!passes.length) { el.innerHTML = '<p class="small">No example passes stored for this combination.</p>'; return; }
    var gap = 18, full = width(el), two = full >= 560, w = (two ? Math.floor((full - gap) / 2) : full) - 2;
    var edges = e.edges, ymax = Math.ceil(Math.max(edges[edges.length - 1], Math.max.apply(null, passes[0].truth_z)) / 20) * 20;
    var html = "";
    passes.forEach(function (p) {
      var vals = p.truth_n.concat(p.truth_layers, p.est_layers).filter(function (v) { return v !== null && !isNaN(v); });
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = Math.max(1, (hi - lo) * 0.1);
      var m = { l: 50, r: 14, t: 10, b: 44 }, h = 320;
      var xt = ticks(lo - pad, hi + pad, w < 360 ? 4 : 5), xs = lin(lo - pad, hi + pad, m.l, w - m.r), ys = lin(0, ymax, h - m.b, m.t);
      var body = axes(m, w, h, xs, xt, ys, ticks(0, ymax, 6), "N (N-units)", "height (m)");
      for (var k = 0; k < edges.length - 1; k++) {
        var ya = ys(edges[k]), yb = ys(edges[k + 1]);
        if (k > 0) body += line(m.l, ya, w - m.r, ya, C.axis, 1, ' stroke-dasharray="2 3"');
        if (p.truth_layers[k] !== null && p.truth_layers[k] !== undefined) body += line(xs(p.truth_layers[k]), ya, xs(p.truth_layers[k]), yb, C.truth, 2, ' stroke-dasharray="5 3"');
        if (p.est_layers[k] !== null && p.est_layers[k] !== undefined) body += line(xs(p.est_layers[k]), ya, xs(p.est_layers[k]), yb, C.radar, 3.2);
      }
      var d = "";
      p.truth_z.forEach(function (z, i) { var v = p.truth_n[i]; if (v !== null && !isNaN(v)) d += (d ? "L" : "M") + xs(v).toFixed(1) + " " + ys(z).toFixed(1); });
      body += '<path d="' + d + '" fill="none" stroke="' + C.truth + '" stroke-width="1.2"/>';
      var cap = (p.label === "coldest" ? "Coldest" : p.label === "warmest" ? "Warmest" : esc(p.label)) + " pass: " + fmtDate(p.date) + (p.T_C !== undefined ? ", " + num(p.T_C) + " °C" : "");
      html += '<figure class="sim-fig"><figcaption>' + esc(cap) + "</figcaption>" + svg(w, h, body, cap + ". True profile, true layer means and estimated layer means.") + "</figure>";
    });
    el.innerHTML = html;
    el.classList.toggle("two", two);
  }

  /* ------------------------------------------------------------ start */
  function fillScene() {
    var sc = manifest.scene || {};
    function put(name, v) { document.querySelectorAll('[data-scene="' + name + '"]').forEach(function (n) { n.textContent = v; }); }
    if (sc.buildings) put("buildings", sc.buildings);
    if (sc.points) put("points", Number(sc.points).toLocaleString("en-GB").replace(/,/g, " "));
    if (sc.passes) put("passes", sc.passes);
    if (sc.first && sc.last) put("years", sc.first.slice(0, 4) + " to " + sc.last.slice(0, 4));
    var d = manifest.defaults || {}, hint = document.querySelector(".sim-hint");
    if (hint) hint.textContent = "Realistic: " + d.noise + " mm noise, thermal expansion " + (d.thermal == 1 ? "on" : "off") + ", sinking & shrinking " + (d.sinking == 1 ? "on" : "off") +
      ", cross-range error " + (d.crossrange == 1 ? "on" : "off") + ", " + (METHOD[d.method] || d.method) + ", " + (d.layers === "1" ? "one layer" : d.layers + " m layers") + ".";
    var rb = document.getElementById("sim-reset"); if (rb && hint) rb.title = hint.textContent;
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
    if (!m || !m.controls || !m.defaults || !m.runs) throw new Error("manifest.json is incomplete");
    manifest = m;
    /* only offer values the manifest has */
    form.querySelectorAll('input[type="radio"]').forEach(function (r) {
      if (!valid(r.name, r.value)) { r.disabled = true; r.closest("label").hidden = true; }
    });
    fillScene();
    toForm(initialState());
    form.addEventListener("change", update);
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
