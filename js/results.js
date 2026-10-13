/* Results: the estimation on the real TerraSAR-X data, 2020-2026. Reads data/real/estimation.json
   (written by the team repo's 04_python/estimation/site_real.py from the aggregate result tables; no
   radar point is in it) and draws, as inline SVG: the N anomaly per pass and layer with its jackknife
   uncertainty, the KNMI ground anomaly, a 90-day running mean and the drift line; the radar against
   the station; the monthly means; the points and buildings; and what it all means. Plain script, no
   libraries. Computed here: only window selections, the annual-cycle fit, Pearson r, the straight-line
   drift, running and monthly means, the same definitions as the exporter (which the full window
   reproduces). */
(function () {
  "use strict";

  var URL_DATA = "data/real/estimation.json";
  var C = {
    ink: "#17191c", ink2: "#3c4249", muted: "#6e747b", grid: "#ece9e1", axis: "#cdc9be", plot: "#fcfbf8",
    station: "#8a8f96", drift: "#d62728", pos: "#2f7d3a", neg: "#a8433b"
  };
  var LAYER_C = ["#15688f", "#c58a2c"];
  var LAYER_SOFT = ["#9cc3d6", "#e6c690"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var VIEWS = ["time", "station", "seasons", "build", "means"];
  var DEF = { layer: "both", run: "published", station: true, deseason: false };
  var RUN_NAME = { published: "published estimate", radar_only: "radar-only estimate" };

  var form = document.getElementById("res-controls");
  var out = document.getElementById("res-out");
  var statusEl = document.getElementById("res-status");
  if (!form || !out) return;

  var D = null, T = [], YEARS = [], state = {}, view = "time";

  /* ------------------------------------------------------------ helpers */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ok(v) { return v !== null && v !== undefined && !isNaN(v); }
  function num(v, d) { return ok(v) ? (+v).toFixed(d === undefined ? 1 : d).replace("-", "−") : "n/a"; }
  function signed(v, d) { return ok(v) ? (v > 0 ? "+" : "") + num(v, d) : "n/a"; }
  function thousands(v) { return String(Math.round(+v)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function day(iso) { var p = iso.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function fmtDate(iso) { var p = iso.split("-"); return +p[2] + " " + MONTHS[+p[1] - 1].slice(0, 3) + " " + p[0]; }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0); }; }
  function ticks(d0, d1, count) {
    var span = d1 - d0 || 1, step = Math.pow(10, Math.floor(Math.log10(span / count))), err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var t = [];
    for (var v = Math.ceil(d0 / step - 1e-9) * step; v <= d1 + 1e-9; v += step) t.push(+v.toFixed(10));
    return t;
  }
  function tickLabel(v) { var s = Math.abs(v) >= 10 || v === Math.round(v) ? v.toFixed(0) : v.toFixed(1); return s.replace("-", "−"); }
  function width(el) { return Math.max(240, Math.floor(el.clientWidth || 600)); }
  function height(el, fallback) { var h = Math.floor(el.clientHeight || 0); return h > 80 ? h : fallback; }
  function svg(w, h, body, label) {
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"' +
      (label ? ' role="img" aria-label="' + esc(label) + '"' : ' aria-hidden="true"') + ">" + body + "</svg>";
  }
  function text(x, y, s, o) {
    o = o || {};
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + (o.size || 11) + '" fill="' + (o.fill || C.muted) + '"' +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : "") + (o.base ? ' dominant-baseline="' + o.base + '"' : "") +
      (o.rot ? ' transform="rotate(' + o.rot + " " + x.toFixed(1) + " " + y.toFixed(1) + ')"' : "") +
      (o.weight ? ' font-weight="' + o.weight + '"' : "") + ' pointer-events="none">' + (o.raw ? s : esc(s)) + "</text>";
  }
  function line(x1, y1, x2, y2, stroke, w, extra) {
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + stroke + '" stroke-width="' + (w || 1) + '"' + (extra || "") + "/>";
  }
  function rect(x, y, w, h, fill, extra) {
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(0, w).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" fill="' + fill + '"' + (extra || "") + "/>";
  }
  function pathOf(pts) { var d = "", up = true; pts.forEach(function (p) { if (!p) { up = true; return; } d += (up ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1); up = false; }); return d; }
  function plain(html) { var d = document.createElement("div"); d.innerHTML = html; return d.textContent; }
  function setTip(id, s) { var t = document.getElementById(id); if (t) { t.setAttribute("data-tip", plain(s)); t.setAttribute("aria-label", plain(s)); } }
  function ft(html) { return ' data-ftip="' + esc(html) + '"'; }
  function layerName(k) { var L = D.layers[k]; return Math.round(L.lo_m) + "–" + Math.round(L.hi_m) + " m"; }

  /* ------------------------------------------------------------ statistics (same definitions as site_real.py) */
  function mean(a) { var s = 0, n = 0; a.forEach(function (v) { if (ok(v)) { s += v; n++; } }); return n ? s / n : NaN; }
  function doy(iso) { var p = iso.split("-"); return (Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(+p[0], 0, 1)) / 864e5 + 1; }
  function solve3(A, b) {
    var M = A.map(function (r, i) { return r.concat([b[i]]); });
    for (var c = 0; c < 3; c++) {
      var p = c; for (var r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      var tmp = M[c]; M[c] = M[p]; M[p] = tmp;
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (r = 0; r < 3; r++) if (r !== c) { var f = M[r][c] / M[c][c]; for (var k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }
  /* y minus its least-squares mean + cos + sin of the day of the year, over the given passes */
  function deseason(idx, y) {
    var A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0], rows = [];
    idx.forEach(function (i) {
      var a = 2 * Math.PI * doy(D.epochs[i]) / 365.25, x = [1, Math.cos(a), Math.sin(a)];
      rows.push(x);
      if (!ok(y[i])) return;
      for (var r = 0; r < 3; r++) { b[r] += x[r] * y[i]; for (var c = 0; c < 3; c++) A[r][c] += x[r] * x[c]; }
    });
    var beta = solve3(A, b), outv = y.slice();
    idx.forEach(function (i, j) { var x = rows[j]; outv[i] = ok(y[i]) && beta ? y[i] - (beta[0] * x[0] + beta[1] * x[1] + beta[2] * x[2]) : y[i]; });
    return outv;
  }
  function pearson(idx, a, b) {
    var xs = [], ys = [];
    idx.forEach(function (i) { if (ok(a[i]) && ok(b[i])) { xs.push(a[i]); ys.push(b[i]); } });
    if (xs.length < 3) return NaN;
    var mx = mean(xs), my = mean(ys), sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += Math.pow(xs[i] - mx, 2); syy += Math.pow(ys[i] - my, 2); }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
  }
  /* least-squares line y = a + b t, t in years; returns {a, b} with t from the first pass */
  function lineFit(idx, y) {
    var t0 = T[idx[0]], xs = [], ys = [];
    idx.forEach(function (i) { if (ok(y[i])) { xs.push((T[i] - t0) / 365.25); ys.push(y[i]); } });
    if (xs.length < 3) return null;
    var mx = mean(xs), my = mean(ys), sxy = 0, sxx = 0;
    for (var i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += Math.pow(xs[i] - mx, 2); }
    var b = sxx ? sxy / sxx : NaN;
    return { a: my - b * mx, b: b, t0: t0 };
  }
  function olsXY(idx, x, y) {
    var xs = [], ys = [];
    idx.forEach(function (i) { if (ok(x[i]) && ok(y[i])) { xs.push(x[i]); ys.push(y[i]); } });
    var mx = mean(xs), my = mean(ys), sxy = 0, sxx = 0;
    for (var i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += Math.pow(xs[i] - mx, 2); }
    var b = sxx ? sxy / sxx : NaN;
    return { a: my - b * mx, b: b };
  }
  function running(idx, y, days) {
    var h = days / 2, r = {};
    idx.forEach(function (i) {
      var s = 0, n = 0;
      idx.forEach(function (j) { if (Math.abs(T[j] - T[i]) <= h && ok(y[j])) { s += y[j]; n++; } });
      r[i] = n ? s / n : NaN;
    });
    return r;
  }

  /* ------------------------------------------------------------ state */
  function series(run, k) { var s = run === "radar_only" && D.radar_only ? D.radar_only : D.series; return s[k]; }
  function win() {
    var a = +state.from, b = +state.to, idx = [];
    D.epochs.forEach(function (e, i) { var y = +e.slice(0, 4); if (y >= a && y <= b) idx.push(i); });
    return idx;
  }
  function fullWindow() { return +state.from === YEARS[0] && +state.to === YEARS[YEARS.length - 1]; }
  function shownLayers() { return state.layer === "both" ? [1, 0] : [+state.layer]; }   /* highest on top */
  /* the values to plot: anomalies, with the annual cycle taken out if asked (fitted on the window) */
  function vals(arr, idx, des) { return des ? deseason(idx, arr) : arr; }
  function scores(run, k, idx) {
    var y = series(run, k).dN, g = D.ground.dN, fit = lineFit(idx, y);
    return { r: pearson(idx, y, g), rd: pearson(idx, deseason(idx, y), deseason(idx, g)), drift: fit ? fit.b : NaN };
  }

  function fromForm() {
    var s = {};
    ["layer", "run"].forEach(function (k) { var r = form.querySelector('input[name="' + k + '"]:checked'); s[k] = r ? r.value : DEF[k]; });
    s.station = form.elements.station.checked;
    s.deseason = form.elements.deseason.checked;
    s.from = form.elements.from.value; s.to = form.elements.to.value;
    if (+s.from > +s.to) { var t = s.from; s.from = s.to; s.to = t; }
    return s;
  }
  function toForm(s) {
    ["layer", "run"].forEach(function (k) { form.querySelectorAll('input[name="' + k + '"]').forEach(function (r) { r.checked = r.value === String(s[k]); }); });
    form.elements.station.checked = !!s.station;
    form.elements.deseason.checked = !!s.deseason;
    form.elements.from.value = String(s.from); form.elements.to.value = String(s.to);
  }
  function defaults() { return { layer: DEF.layer, run: DEF.run, station: DEF.station, deseason: DEF.deseason, from: String(YEARS[0]), to: String(YEARS[YEARS.length - 1]) }; }
  function initialState() {
    var q = new URLSearchParams(location.search), s = defaults();
    if (["both", "0", "1"].indexOf(q.get("layer")) >= 0) s.layer = q.get("layer");
    if (q.get("run") === "radar_only" && D.radar_only) s.run = "radar_only";
    if (q.get("station") === "0") s.station = false;
    if (q.get("deseason") === "1") s.deseason = true;
    if (YEARS.indexOf(+q.get("from")) >= 0) s.from = q.get("from");
    if (YEARS.indexOf(+q.get("to")) >= 0) s.to = q.get("to");
    return s;
  }
  function writeUrl() {
    try {
      var d = defaults(), q = new URLSearchParams();
      if (state.layer !== d.layer) q.set("layer", state.layer);
      if (state.run !== d.run) q.set("run", state.run);
      if (state.station !== d.station) q.set("station", state.station ? "1" : "0");
      if (state.deseason !== d.deseason) q.set("deseason", "1");
      if (state.from !== d.from) q.set("from", state.from);
      if (state.to !== d.to) q.set("to", state.to);
      var qs = q.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    } catch (err) { /* file:// */ }
  }

  /* ------------------------------------------------------------ verdict and stats */
  function stat(v, unit, k, ic, cls) {
    var i = ic && window.VRS_ICON ? '<span class="s-ic">' + window.VRS_ICON(ic) + "</span>" : "";
    return '<div class="stat' + (cls ? " " + cls : "") + '">' + i + '<span class="v">' + v + (unit ? ' <span class="u">' + unit + "</span>" : "") + '</span><span class="k">' + k + "</span></div>";
  }
  function renderTop(idx) {
    var indep = D.radar_only ? scores("radar_only", 0, idx) : null, cur = [scores(state.run, 0, idx), scores(state.run, 1, idx)];
    var span = D.epochs[idx[0]].slice(0, 4) + (fullWindow() ? "–" + D.data.last.slice(0, 4) : "–" + D.epochs[idx[idx.length - 1]].slice(0, 4));
    var v;
    if (indep) {
      v = "Only the lowest layer is supported: on its own, the radar's 3–43 m follows the weather station with r = " + num(indep.r, 2) +
        " (" + num(indep.rd, 2) + " without the annual cycle). The layer above drifts by " + signed(cur[1].drift, 1) + " N per year and does not follow it.";
    } else {
      v = "The upper layer drifts by " + signed(cur[1].drift, 1) + " N per year: building motion left in the estimate, not air.";
    }
    if (!fullWindow()) v = "In " + span + ": " + v.charAt(0).toLowerCase() + v.slice(1);
    document.getElementById("res-verdict").textContent = v;
    var h = "";
    if (indep) h += stat(num(indep.r, 2), "", "r, lowest layer vs station, radar only; " + num(indep.rd, 2) + " without the annual cycle", "target", "s-r");
    h += stat(signed(cur[0].drift, 1), "N/yr", "drift, 3–43 m, " + RUN_NAME[state.run] + ", " + span, "chart", "s-d0");
    h += stat('<span style="color:' + C.neg + '">' + signed(cur[1].drift, 1) + "</span>", "N/yr", "drift, 43–123 m: building motion, not air", "chart", "s-d1");
    h += stat(thousands(D.data.points_used), "points", "on " + D.data.buildings + " buildings, " + idx.length + " passes " + span, "grid", "s-pts");
    document.getElementById("res-stats").innerHTML = h;
  }

  /* ------------------------------------------------------------ 1. N over time */
  function timeAxis(d0, d1, w) {
    var t = [], a = new Date(d0 * 864e5), b = new Date(d1 * 864e5), y0 = a.getUTCFullYear(), y1 = b.getUTCFullYear();
    if (y1 - y0 >= 2) {
      var step = w < 520 && y1 - y0 > 4 ? 2 : 1;
      for (var y = y0 + 1; y <= y1; y += step) t.push({ d: Date.UTC(y, 0, 1) / 864e5, s: w < 520 ? "’" + String(y).slice(2) : String(y) });
      return t;
    }
    for (var yy = y0; yy <= y1; yy++) for (var m = 0; m < 12; m += (w < 520 ? 3 : 2)) {
      var d = Date.UTC(yy, m, 1) / 864e5;
      if (d >= d0 && d <= d1) t.push({ d: d, s: MONTHS[m].slice(0, 3) + (m === 0 ? " " + yy : "") });
    }
    return t;
  }
  function renderTime(idx) {
    var host = document.getElementById("res-time"), layers = shownLayers(), des = state.deseason;
    var g = vals(D.ground.dN, idx, des), per = {}, all = [];
    layers.forEach(function (k) {
      var s = series(state.run, k), y = vals(s.dN, idx, des), fit = lineFit(idx, y);
      per[k] = { s: s, y: y, run: running(idx, y, D.settings.running_mean_days || 90), fit: fit };
      idx.forEach(function (i) { if (ok(y[i])) all.push(y[i]); });
    });
    if (state.station) idx.forEach(function (i) { if (ok(g[i])) all.push(g[i]); });
    /* the axis follows the dots (99th percentile of |values| plus a margin); whiskers and outliers are clipped to the plot */
    var sorted = all.map(Math.abs).sort(function (a, b) { return a - b; });
    var lim = Math.max(10, (sorted[Math.floor(sorted.length * 0.99)] || 10) * 1.12);
    var d0 = T[idx[0]], d1 = T[idx[idx.length - 1]], pad = Math.max(8, (d1 - d0) * 0.012);
    host.innerHTML = layers.map(function (k) { return '<div class="res-tpanel sim-chart" data-k="' + k + '"></div>'; }).join("");
    var leg = '<li><i class="dt" style="background:' + LAYER_C[layers[layers.length - 1]] + '"></i>pass, with jackknife ± 1 se</li>' +
      '<li><i class="ln" style="border-top-color:' + C.ink + '"></i>' + (D.settings.running_mean_days || 90) + "-day running mean</li>" +
      '<li><i class="ln dash red"></i>drift (straight line)</li>' +
      (state.station ? '<li><i class="ln grey"></i>KNMI ground ΔN</li>' : "");
    document.getElementById("res-time-legend").innerHTML = leg;
    var panels = host.querySelectorAll(".res-tpanel");
    layers.forEach(function (k, pi) {
      var el = panels[pi], P = per[k], L = D.layers[k], w = width(el), narrow = w < 520, H = height(el, 220);
      var last = pi === layers.length - 1, m = { l: narrow ? 34 : 44, r: 10, t: 20, b: last ? 22 : 8 };
      var xs = lin(d0 - pad, d1 + pad, m.l, w - m.r), ys = lin(-lim, lim, H - m.b, m.t), cy = function (v) { return Math.max(m.t, Math.min(H - m.b, ys(v))); };
      var body = rect(m.l, m.t, w - m.l - m.r, H - m.t - m.b, C.plot);
      ticks(-lim, lim, H < 180 ? 3 : 5).forEach(function (v) { body += line(m.l, ys(v), w - m.r, ys(v), C.grid) + text(m.l - 5, ys(v), tickLabel(v), { anchor: "end", base: "middle", size: 10 }); });
      timeAxis(d0, d1, w).forEach(function (t) { var x = xs(t.d); body += line(x, m.t, x, H - m.b, C.grid) + (last ? text(x, H - m.b + 14, t.s, { anchor: "middle", size: 10 }) : ""); });
      body += line(m.l, ys(0), w - m.r, ys(0), C.ink, 0.6);
      /* jackknife whiskers, one path */
      var wd = "";
      idx.forEach(function (i) { var v = P.y[i], se = P.s.se[i]; if (ok(v) && ok(se)) wd += "M" + xs(T[i]).toFixed(1) + " " + cy(v - se).toFixed(1) + "V" + cy(v + se).toFixed(1); });
      body += '<path d="' + wd + '" stroke="' + LAYER_SOFT[k] + '" stroke-width="' + (narrow ? 1 : 1.6) + '" opacity=".75" fill="none"/>';
      if (state.station) {
        body += '<path d="' + pathOf(idx.map(function (i) { return ok(g[i]) ? [xs(T[i]), ys(g[i])] : null; })) + '" fill="none" stroke="' + C.station + '" stroke-width="1.2" opacity=".9"/>';
      }
      idx.forEach(function (i) { var v = P.y[i]; if (ok(v)) body += '<circle cx="' + xs(T[i]).toFixed(1) + '" cy="' + cy(v).toFixed(1) + '" r="' + (narrow ? 2 : 2.6) + '" fill="' + LAYER_C[k] + '" opacity=".8"/>'; });
      body += '<path d="' + pathOf(idx.map(function (i) { return ok(P.run[i]) ? [xs(T[i]), ys(P.run[i])] : null; })) + '" fill="none" stroke="' + C.ink + '" stroke-width="2" stroke-linejoin="round"/>';
      if (P.fit) {
        var ya = P.fit.a + P.fit.b * (d0 - P.fit.t0) / 365.25, yb = P.fit.a + P.fit.b * (d1 - P.fit.t0) / 365.25;
        body += line(xs(d0), cy(ya), xs(d1), cy(yb), C.drift, 2, ' stroke-dasharray="7 4"');
      }
      body += line(m.l, H - m.b, w - m.r, H - m.b, C.axis) + line(m.l, m.t, m.l, H - m.b, C.axis);
      var drift = P.fit ? P.fit.b : NaN, bad = !L.usable;
      body += text(m.l, 13, layerName(k) + " NAP · " + thousands(L.n) + (narrow ? " pts" : " points") + (bad ? (narrow ? " · not usable" : " · not supported by the station") : ""), { size: narrow ? 10.5 : 11.5, weight: 650, fill: bad ? C.neg : C.ink });
      body += text(w - m.r, 13, (narrow ? "" : "drift ") + signed(drift, 1) + " N/yr", { anchor: "end", size: 11.5, weight: 650, fill: Math.abs(drift) > 3 ? C.drift : C.ink2 });
      if (!narrow) body += text(11, (m.t + H - m.b) / 2, "ΔN (N)", { anchor: "middle", fill: C.ink2, size: 10, rot: -90, base: "middle" });
      body += '<line class="res-cross" x1="0" y1="' + m.t + '" x2="0" y2="' + (H - m.b) + '" stroke="' + C.ink + '" stroke-dasharray="2 2" visibility="hidden"/>';
      el.innerHTML = svg(w, H, body, "N anomaly per pass, " + layerName(k) + ", " + idx.length + " passes; drift " + signed(drift, 1) + " N per year.");
      el._pick = function (px) {
        if (px < m.l || px > w - m.r) return null;
        var d = d0 - pad + (px - m.l) / (w - m.l - m.r) * (d1 - d0 + 2 * pad), j = idx[0];
        idx.forEach(function (i) { if (Math.abs(T[i] - d) < Math.abs(T[j] - d)) j = i; });
        var h = "<b>" + fmtDate(D.epochs[j]) + "</b>, " + esc(layerName(k)) +
          '<br><i class="sw" style="background:' + LAYER_C[k] + '"></i>ΔN ' + signed(P.y[j], 1) + " ± " + num(P.s.se[j], 1) + " N" +
          "<br>running mean " + signed(P.run[j], 1) + " N" +
          (state.station ? '<br><i class="sw" style="background:' + C.station + '"></i>station ' + signed(g[j], 1) + " N" : "") +
          (des ? "<br><i>annual cycle removed</i>" : "");
        return { html: h, x: xs(T[j]) };
      };
    });
    setTip("res-time-tip", "Each dot is one radar pass (about 06:08 UTC): the layer's refractivity minus its mean over the passes (ΔN, in N-units), from the " + RUN_NAME[state.run] +
      ". The light bar is ± one jackknife standard error (one building left out at a time; median " + num(D.layers[0].se_jackknife_median, 1) + " and " + num(D.layers[1].se_jackknife_median, 1) +
      " N). Black: the " + (D.settings.running_mean_days || 90) + "-day running mean. Red dashes: the straight-line drift. Real air does not get several N-units more or less refractive every year, so a large drift is building motion the model left in.");
  }

  /* ------------------------------------------------------------ 2. station check */
  function renderStation(idx) {
    var el = document.getElementById("res-sc"), k = state.layer === "1" ? 1 : 0, des = state.deseason;
    var y = vals(series(state.run, k).dN, idx, des), x = vals(D.ground.dN, idx, des), r = pearson(idx, x, y), fit = olsXY(idx, x, y);
    /* legend and warning first: they take space from the chart's card */
    document.getElementById("res-sc-legend").innerHTML =
      '<li><i class="dt" style="background:' + LAYER_C[k] + '"></i>pass (May to September darker)</li><li><i class="ln red"></i>least-squares line</li><li><i class="ln dash"></i>1 : 1</li>';
    var warn = document.getElementById("res-sc-warn");
    if (state.run === "published") {
      warn.hidden = false;
      warn.innerHTML = "<b>Not an independent check.</b> The published estimate puts the station's anomaly back into every layer (the air prior), so it follows the station partly by construction. Switch the estimate to <b>Radar only</b> for the honest test.";
    } else warn.hidden = true;
    var w = width(el), H = height(el, 300), narrow = w < 460, m = { l: narrow ? 38 : 48, r: 12, t: 10, b: 34 };
    var vs = []; idx.forEach(function (i) { if (ok(x[i]) && ok(y[i])) { vs.push(Math.abs(x[i])); vs.push(Math.abs(y[i])); } });
    vs.sort(function (a, b) { return a - b; });
    var lim = Math.max(10, (vs[Math.floor(vs.length * 0.995)] || 10) * 1.08);
    var pw = w - m.l - m.r, ph = H - m.t - m.b, xs = lin(-lim, lim, m.l, w - m.r), ys = lin(-lim, lim, H - m.b, m.t);
    var body = rect(m.l, m.t, pw, ph, C.plot);
    var tk = ticks(-lim, lim, narrow ? 4 : 6);
    tk.forEach(function (v) {
      body += line(xs(v), m.t, xs(v), H - m.b, C.grid) + text(xs(v), H - m.b + 13, tickLabel(v), { anchor: "middle", size: 10 });
      body += line(m.l, ys(v), w - m.r, ys(v), C.grid) + text(m.l - 5, ys(v), tickLabel(v), { anchor: "end", base: "middle", size: 10 });
    });
    body += line(xs(0), m.t, xs(0), H - m.b, C.axis) + line(m.l, ys(0), w - m.r, ys(0), C.axis);
    body += '<clipPath id="res-sc-clip"><rect x="' + m.l + '" y="' + m.t + '" width="' + pw + '" height="' + ph + '"/></clipPath><g clip-path="url(#res-sc-clip)">';
    body += line(xs(-lim), ys(-lim), xs(lim), ys(lim), C.ink2, 1, ' stroke-dasharray="5 4"');
    idx.forEach(function (i) {
      if (!ok(x[i]) || !ok(y[i])) return;
      var mo = +D.epochs[i].slice(5, 7), warm = mo >= 5 && mo <= 9;
      body += '<circle cx="' + xs(x[i]).toFixed(1) + '" cy="' + ys(y[i]).toFixed(1) + '" r="' + (narrow ? 3 : 3.6) + '" fill="' + LAYER_C[k] + '" fill-opacity="' + (warm ? ".85" : ".45") + '" stroke="#fff" stroke-width=".6"' +
        ft("<b>" + fmtDate(D.epochs[i]) + "</b><br>station " + signed(x[i], 1) + " N<br>radar " + esc(layerName(k)) + " " + signed(y[i], 1) + " N") + "/>";
    });
    if (ok(fit.b)) body += line(xs(-lim), ys(fit.a - fit.b * lim), xs(lim), ys(fit.a + fit.b * lim), C.drift, 2);
    body += "</g>";
    body += text((m.l + w - m.r) / 2, H - 4, "KNMI ground ΔN (N)" + (des ? ", annual cycle removed" : ""), { anchor: "middle", size: 10.5, fill: C.ink2 });
    body += text(12, (m.t + H - m.b) / 2, "radar ΔN, " + layerName(k) + " (N)", { anchor: "middle", size: 10.5, fill: C.ink2, rot: -90, base: "middle" });
    body += text(m.l + 8, m.t + 16, "r = " + num(r, 2), { size: 15, weight: 700, fill: C.ink });
    body += text(m.l + 8, m.t + 32, "slope " + num(fit.b, 2) + ", " + idx.length + " passes", { size: 10.5, fill: C.ink2 });
    el.innerHTML = svg(w, H, body, "Radar N anomaly of " + layerName(k) + " against the station's ground anomaly, " + idx.length + " passes, r = " + num(r, 2) + ".");
    setTip("res-sc-tip", "One dot per pass: the station's ground anomaly (across) against the radar's " + layerName(k) + " anomaly (up), from the " + RUN_NAME[state.run] +
      ". Perfect agreement would put every dot on the dashed 1 : 1 line. The station measures the air at 1.5 m only, so it is a check of the lowest layer, not a truth for the layer above." +
      (des ? " The annual cycle is removed from both: what is left is the day-to-day weather." : " Switch on 'Remove the annual cycle' for the stricter test."));
    renderR(idx);
  }
  function renderR(idx) {
    var el = document.getElementById("res-r"), runs = D.radar_only ? ["radar_only", "published"] : ["published"], rows = [];
    runs.forEach(function (run) { [0, 1].forEach(function (k) { var s = scores(run, k, idx); rows.push({ run: run, k: k, r: s.r, rd: s.rd }); }); });
    var w = width(el), H = height(el, 260), narrow = w < 420, m = { l: narrow ? 100 : 128, r: 14, t: 8, b: 26 };
    var lo = -0.4, hi = 1, xs = lin(lo, hi, m.l, w - m.r), rowH = (H - m.t - m.b) / rows.length, bh = Math.min(16, rowH * 0.34);
    var body = "";
    ticks(lo, hi, narrow ? 4 : 7).forEach(function (v) { body += line(xs(v), m.t, xs(v), H - m.b, C.grid) + text(xs(v), H - m.b + 13, tickLabel(v), { anchor: "middle", size: 10 }); });
    body += line(xs(0), m.t, xs(0), H - m.b, C.ink, 0.8);
    rows.forEach(function (rw, i) {
      var y = m.t + i * rowH, cy = y + rowH / 2, sel = rw.run === state.run;
      if (i === 2) body += line(6, y, w - 6, y, C.axis, 1, ' stroke-dasharray="3 3"');
      body += text(m.l - 8, cy - 6, layerName(rw.k), { anchor: "end", size: 10.5, weight: 650, fill: C.ink });
      body += text(m.l - 8, cy + 8, rw.run === "radar_only" ? "radar only" : "published", { anchor: "end", size: 10, fill: rw.run === "radar_only" ? C.pos : C.muted });
      [["r", rw.r, LAYER_C[rw.k], "as measured"], ["rd", rw.rd, LAYER_SOFT[rw.k], "annual cycle removed"]].forEach(function (b, j) {
        var v = b[1], yb = cy - bh - 1 + j * (bh + 2);
        if (!ok(v)) return;
        var x0 = xs(Math.min(0, v)), x1 = xs(Math.max(0, v));
        body += rect(x0, yb, x1 - x0, bh, b[2], (sel ? "" : ' opacity=".55"') + ft("<b>" + esc(layerName(rw.k)) + ", " + (rw.run === "radar_only" ? "radar only" : "published") + "</b><br>r " + num(v, 2) + " (" + b[3] + ")"));
        body += text(v >= 0 ? x1 + 4 : x0 - 4, yb + bh / 2 + 0.5, num(v, 2), { anchor: v >= 0 ? "start" : "end", base: "middle", size: 10, fill: C.ink2 });
      });
    });
    body += text((m.l + w - m.r) / 2, H - 2, "r with the KNMI ground anomaly", { anchor: "middle", size: 10, fill: C.ink2 });
    el.innerHTML = svg(w, H, body, "Correlation with the station per layer and estimate: " + rows.map(function (r) { return layerName(r.k) + " " + r.run.replace("_", " ") + " " + num(r.r, 2) + " (" + num(r.rd, 2) + " without annual cycle)"; }).join("; ") + ".");
    document.getElementById("res-r-legend").innerHTML = '<li><i class="sw" style="background:' + LAYER_C[0] + '"></i>as measured</li><li><i class="sw" style="background:' + LAYER_SOFT[0] + '"></i>annual cycle removed</li>' +
      (D.radar_only ? '<li>only <b style="color:' + C.pos + '">radar only</b> is independent</li>' : "");
  }

  /* ------------------------------------------------------------ 3. seasons */
  function monthly(idx) {
    if (fullWindow()) {
      var mo = state.run === "radar_only" && D.monthly_radar_only ? D.monthly_radar_only : D.monthly;
      return mo.map(function (m) { return { passes: m.passes, layers: m.layers, ground: m.ground }; });
    }
    var outm = [];
    for (var m = 1; m <= 12; m++) {
      var sel = idx.filter(function (i) { return +D.epochs[i].slice(5, 7) === m; });
      var ms = function (a) {
        var v = sel.map(function (i) { return a[i]; }).filter(ok), mu = mean(v);
        if (!v.length) return { mean: null, se: null };
        var sd = v.length > 1 ? Math.sqrt(v.reduce(function (s, x) { return s + (x - mu) * (x - mu); }, 0) / (v.length - 1)) : NaN;
        return { mean: mu, se: v.length > 1 ? sd / Math.sqrt(v.length) : null };
      };
      outm.push({ passes: sel.length, layers: [ms(series(state.run, 0).dN), ms(series(state.run, 1).dN)], ground: ms(D.ground.dN) });
    }
    return outm;
  }
  function renderSeasons(idx) {
    var el = document.getElementById("res-mo"), mo = monthly(idx), layers = shownLayers().slice().reverse();
    var lines = layers.map(function (k) { return { name: layerName(k), c: LAYER_C[k], get: function (m) { return m.layers[k]; }, w: 2.2 }; });
    if (state.station) lines.push({ name: "KNMI ground", c: C.station, get: function (m) { return m.ground; }, w: 2, dash: true });
    var w = width(el), H = height(el, 280), narrow = w < 480, m = { l: narrow ? 34 : 44, r: 10, t: 10, b: 24 };
    var all = [0];
    lines.forEach(function (L) { mo.forEach(function (x) { var v = L.get(x); if (v && ok(v.mean)) { all.push(v.mean + (ok(v.se) ? v.se : 0)); all.push(v.mean - (ok(v.se) ? v.se : 0)); } }); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), p = (hi - lo) * 0.08 || 2;
    var cw = (w - m.l - m.r) / 12, xs = function (i) { return m.l + cw * (i + 0.5); }, ys = lin(lo - p, hi + p, H - m.b, m.t);
    var body = rect(m.l, m.t, w - m.l - m.r, H - m.t - m.b, C.plot);
    ticks(lo - p, hi + p, 5).forEach(function (v) { body += line(m.l, ys(v), w - m.r, ys(v), C.grid) + text(m.l - 5, ys(v), tickLabel(v), { anchor: "end", base: "middle", size: 10 }); });
    for (var i = 0; i < 12; i++) body += text(xs(i), H - m.b + 14, narrow ? MONTHS[i].charAt(0) : MONTHS[i].slice(0, 3), { anchor: "middle", size: 10 });
    body += line(m.l, ys(0), w - m.r, ys(0), C.ink, 0.6);
    lines.forEach(function (L, li) {
      var off = (li - (lines.length - 1) / 2) * Math.min(6, cw * 0.12);
      var pts = mo.map(function (x, i) { var v = L.get(x); return v && ok(v.mean) ? [xs(i) + off, ys(v.mean)] : null; });
      mo.forEach(function (x, i) { var v = L.get(x); if (v && ok(v.mean) && ok(v.se)) body += line(xs(i) + off, ys(v.mean - v.se), xs(i) + off, ys(v.mean + v.se), L.c, 1.4, ' opacity=".55"'); });
      body += '<path d="' + pathOf(pts) + '" fill="none" stroke="' + L.c + '" stroke-width="' + L.w + '"' + (L.dash ? ' stroke-dasharray="6 4"' : "") + "/>";
      mo.forEach(function (x, i) {
        var v = L.get(x); if (!v || !ok(v.mean)) return;
        body += '<circle cx="' + (xs(i) + off).toFixed(1) + '" cy="' + ys(v.mean).toFixed(1) + '" r="4" fill="' + L.c + '" stroke="#fff" stroke-width="1"' +
          ft("<b>" + MONTHS[i] + "</b>, " + esc(L.name) + "<br>mean " + signed(v.mean, 1) + (ok(v.se) ? " ± " + num(v.se, 1) : "") + " N<br>" + x.passes + " passes") + "/>";
      });
    });
    if (!narrow) body += text(11, (m.t + H - m.b) / 2, "mean ΔN (N)", { anchor: "middle", fill: C.ink2, size: 10, rot: -90, base: "middle" });
    el.innerHTML = svg(w, H, body, "Monthly mean N anomaly: " + lines.map(function (L) { return L.name + " " + mo.map(function (x) { var v = L.get(x); return v ? num(v.mean, 1) : "n/a"; }).join(", "); }).join("; ") + ".");
    document.getElementById("res-mo-legend").innerHTML = lines.map(function (L) { return '<li><i class="ln' + (L.dash ? " dash" : "") + '" style="border-top-color:' + L.c + '"></i>' + esc(L.name) + "</li>"; }).join("") + "<li>bars: ± 1 standard error</li>";
    setTip("res-mo-tip", "The mean N anomaly of all passes in each calendar month (" + RUN_NAME[state.run] + "), with its standard error. The air near the ground is more refractive in summer (warm, humid) than in winter. The lowest layer swings with the station; the upper layer's cycle is weaker and, in the published estimate, partly the station's own anomaly put back by the air prior. The annual-cycle switch does not apply here.");
    renderPm(mo);
  }
  function renderPm(mo) {
    var el = document.getElementById("res-pm"), w = width(el), H = height(el, 200), narrow = w < 400, m = { l: 30, r: 8, t: 10, b: 24 };
    var mx = Math.max.apply(null, mo.map(function (x) { return x.passes; }).concat([1])), tk = ticks(0, mx, 4), top = Math.max(mx, tk[tk.length - 1]);
    var cw = (w - m.l - m.r) / 12, ys = lin(0, top, H - m.b, m.t), body = "";
    tk.forEach(function (v) { body += line(m.l, ys(v), w - m.r, ys(v), C.grid) + text(m.l - 5, ys(v), tickLabel(v), { anchor: "end", base: "middle", size: 10 }); });
    mo.forEach(function (x, i) {
      var bx = m.l + cw * i + cw * 0.18;
      body += rect(bx, ys(x.passes), cw * 0.64, ys(0) - ys(x.passes), C.station, ft("<b>" + MONTHS[i] + "</b><br>" + x.passes + " passes"));
      if (cw > 26) body += text(bx + cw * 0.32, ys(x.passes) - 4, String(x.passes), { anchor: "middle", size: 9.5, fill: C.ink2 });
      body += text(bx + cw * 0.32, H - m.b + 14, narrow ? MONTHS[i].charAt(0) : MONTHS[i].slice(0, 3), { anchor: "middle", size: 10 });
    });
    body += line(m.l, ys(0), w - m.r, ys(0), C.axis);
    el.innerHTML = svg(w, H, body, "Passes per calendar month: " + mo.map(function (x, i) { return MONTHS[i].slice(0, 3) + " " + x.passes; }).join(", ") + ".");
  }

  /* ------------------------------------------------------------ 4. buildings and coverage */
  function renderCoverage() {
    var el = document.getElementById("res-cov"), d = D.data;
    var rows = [
      { label: "in the area", v: d.points_input, c: "#d9d5ca", tip: "All radar points of the 2020-2026 set in the Kop van Zuid area." },
      { label: "stable signal", v: d.points_coherent, c: "#b8b3a6", tip: "Coherence above " + D.settings.coherence_min + ": the signal is steady enough over the passes." },
      { label: "on " + d.buildings + " buildings", v: d.points_used, c: C.ink2, tip: "Coherent points 5 m or more above the ground, on BAG buildings with at least 60 points and a 20 m height span (" + d.buildings_skipped + " buildings left out)." }
    ];
    [0, 1].forEach(function (k) { var L = D.layers[k]; rows.push({ label: layerName(k), v: L.n, c: LAYER_C[k], tip: thousands(L.n) + " points sit in " + layerName(k) + " NAP" + (k === 0 ? "; " + thousands(L.n_traversing) + " cross it on their way up" : "") + ". Median jackknife uncertainty " + num(L.se_jackknife_median, 1) + " N per pass." }); });
    rows.push({ label: "ground reference", v: d.reference_points, c: "#7aa06f", tip: "Shared ground points that set the zero of every pass (subsiding ground excluded)." });
    var w = width(el), H = height(el, 280), narrow = w < 420, m = { l: narrow ? 104 : 128, r: 56, t: 6, b: 8 };
    var rowH = (H - m.t - m.b) / rows.length, bh = Math.min(26, rowH * 0.62), xs = lin(0, d.points_input, m.l, w - m.r), body = "";
    rows.forEach(function (r, i) {
      var cy = m.t + i * rowH + rowH / 2;
      body += '<g' + ft("<b>" + esc(r.label) + "</b>: " + thousands(r.v) + " points<br>" + esc(r.tip)) + ">";
      body += rect(m.l, cy - bh / 2, w - m.r - m.l, bh, "transparent");
      body += rect(m.l, cy - bh / 2, xs(r.v) - m.l, bh, r.c, ' rx="3"');
      body += "</g>";
      body += text(m.l - 8, cy, r.label, { anchor: "end", base: "middle", size: narrow ? 10 : 11, fill: C.ink, weight: i >= 3 && i <= 4 ? 650 : null });
      body += text(xs(r.v) + 6, cy, thousands(r.v), { base: "middle", size: 11, fill: C.ink2, weight: 650 });
    });
    el.innerHTML = svg(w, H, body, "Points: " + rows.map(function (r) { return r.label + " " + r.v; }).join(", ") + ".");
  }
  function renderBuildings() {
    var el = document.getElementById("res-bt");
    var flag = { fitted: "", gamma0_zero: "no shrinking found", upper_edge: "linear (no slowing seen)", lower_edge: "at the lower bound" };
    var h = '<table><thead><tr><th>BAG building</th><th class="num">points</th><th class="num">mean height</th><th class="num"><span class="t up" tabindex="0" data-tip="Fitted thermal expansion, per kelvin (10^-6 /K). Concrete and steel: about 10; the effective value is lower because a building does not follow the air temperature fully.">&alpha;</span></th>' +
      '<th class="num"><span class="t up" tabindex="0" data-tip="Sinking of the whole building, mm per year (negative: down).">v<sub>s</sub></span></th><th class="num"><span class="t up" tabindex="0" data-tip="Shrinking: how much faster the top sinks than the foot, mm per 100 m of height per year, at the start.">&gamma;<sub>0</sub></span></th><th class="num"><span class="t up right" tabindex="0" data-tip="Time over which the shrinking slows down, years. No value: no shrinking found, so no time; linear: the fit preferred the upper end of the grid (no slowing down seen).">&tau;<sub>c</sub></span></th></tr></thead><tbody>';
    D.buildings.forEach(function (b) {
      var tau = ok(b.tau_c_yr) && b.tau_c_flag === "fitted" ? num(b.tau_c_yr, 1) + " yr" : '<span class="res-flag">' + esc(flag[b.tau_c_flag] || b.tau_c_flag) + "</span>";
      h += "<tr><td><code>" + esc(b.bag_id) + "</code></td><td class=\"num\">" + thousands(b.n) + '</td><td class="num">' + num(b.h_mean_m, 0) + " m</td><td class=\"num\">" + num(b.alpha_e6_per_K, 1) +
        '</td><td class="num">' + signed(b.v_s_mm_per_yr, 1) + '</td><td class="num">' + num(b.gamma0_mm_per_100m_per_yr, 1) + '</td><td class="num">' + tau + "</td></tr>";
    });
    h += "</tbody></table>";
    el.innerHTML = h;
    var heads = [].slice.call(el.querySelectorAll("thead th")).map(function (th) { return th.textContent.trim(); });
    el.querySelectorAll("tbody tr").forEach(function (tr) { [].slice.call(tr.children).forEach(function (td, i) { td.setAttribute("data-label", heads[i]); }); });
  }

  /* ------------------------------------------------------------ 5. what it means */
  function renderMeans() {
    var L0 = D.layers[0], L1 = D.layers[1], ro0 = L0.radar_only, ro1 = L1.radar_only, p0 = L0.published, p1 = L1.published, d = D.data, pv = D.provenance;
    var h = '<div class="res-means-grid">';
    h += '<div class="res-block res-good"><h4><i data-icon="check"></i>What the data support</h4><ul>' +
      (ro0 ? "<li><b>The lowest 40 m follows the weather.</b> Without any station data in the estimate, the radar's 3–43 m layer goes up and down with the KNMI ground refractivity: r = " + num(ro0.r, 2) + " over " + d.passes + " passes, and still " + num(ro0.r_no_annual, 2) + " once the shared annual cycle is removed. So it sees day-to-day weather, not only the seasons.</li>" : "") +
      "<li><b>The seasons come out the right way round.</b> The lowest layer is more refractive in summer than in winter, like the air at the station.</li>" +
      "<li><b>The buildings can be modelled.</b> " + thousands(d.points_used) + " points on " + d.buildings + " buildings, with sinking, shrinking and thermal expansion fitted per building (median &alpha; " + num(d.median_alpha_e6_per_K, 1) + " &times; 10<sup>−6</sup>/K); what is left of the radar signal has an rms of " + num(d.residual_rms_mm, 1) + " mm.</li></ul></div>";
    h += '<div class="res-block res-bad"><h4><i data-icon="xcircle"></i>What they do not support</h4><ul>' +
      "<li><b>The upper layer (43–123 m) is not usable.</b> It drifts by " + signed(p1.drift_N_per_yr, 1) + " N per year, the lower one by " + signed(p0.drift_N_per_yr, 1) + ": the two move apart, while real air layers a few tens of metres apart move together. That is building motion the model left in, shifted between the layers." +
      (ro1 ? " On its own it does not follow the station (r = " + num(ro1.r, 2) + ")." : "") + "</li>" +
      "<li><b>The swings are too large.</b> The layers vary by " + num(p0.spread, 0) + " and " + num(p1.spread, 0) + " N from pass to pass, the station by about " + num(sd(D.ground.dN), 0) + " N, with a jackknife uncertainty of " + num(L0.se_jackknife_median, 0) + "–" + num(L1.se_jackknife_median, 0) + " N per pass. One pass on its own says little.</li>" +
      "<li><b>No skill can be claimed.</b> Nobody measured the air profile over Kop van Zuid at 06 UTC on these days, so there is no truth to score against (decision D8). A correlation with a ground station is agreement, not accuracy; on the simulation the station alone is still better per 40 m layer.</li>" +
      "<li><b>The published estimate leans on the station.</b> Its air prior puts the ground anomaly back after the building fit, which is why it correlates more (r = " + num(p0.r, 2) + "); only the radar-only run is an independent test.</li></ul></div>";
    h += '<div class="res-block"><h4><i data-icon="flag"></i>What is needed next</h4><ul>' +
      "<li><b>A real profile measurement</b> over Kop van Zuid at about 06 UTC on a few pass dates (tethered balloon, drone or a mast), the only way to test the layers above the ground.</li>" +
      "<li><b>A better building model</b> for the tall buildings, so that the drift of the upper layer goes away; the thermal response time (now a 5-day lag) is not pinned down.</li>" +
      "<li><b>Measure what processing keeps.</b> Put sounding-based air into the simulation and run it through the same chain, to see how much of the atmosphere survives the building fit (report, section 6).</li>" +
      "<li><b>Use radar and station together.</b> On the simulation a combination of the two beats either alone in every layer; it is an opt-in tool, not yet the default (D12).</li></ul></div>";
    h += '<div class="res-block res-note"><h4><i data-icon="info"></i>About these numbers</h4><p>These are the team’s current results on the 2020–2026 data (' + d.passes + " passes, " + fmtDate(d.first) + " to " + fmtDate(d.last) +
      "). The report's results chapter was written on an earlier run on the 2014–2024 set; the numbers here are the newer ones. Two 40 m layers, building temperature from KNMI 344 with a 5-day lag, thermal expansion fitted per building, ground reference from " + d.reference_points + " stable ground points.</p>" +
      "<p class=\"res-prov\">Data: <code>data/real/estimation.json</code>, written by <code>" + esc(pv.exporter) + "</code> from <code>" + esc(pv.source) + "</code>" +
      (pv.virtual_radiosonde ? " at commit <code>" + esc(pv.virtual_radiosonde.slice(0, 7)) + "</code>" + (pv.uncommitted_changes ? " (with uncommitted results)" : "") : "") +
      (pv.decisions && pv.decisions.latest ? "; decision log up to " + esc(pv.decisions.latest) + " (" + esc(pv.decisions.date) + ")" : "") + ". Generated " + esc(D.generated) + ".</p></div>";
    h += "</div>";
    var el = document.getElementById("res-means");
    el.innerHTML = h;
    if (window.VRS_ICON) el.querySelectorAll("[data-icon]").forEach(function (e) { e.innerHTML = window.VRS_ICON(e.getAttribute("data-icon")); });
  }
  function sd(a) { var v = a.filter(ok), mu = mean(v); return Math.sqrt(v.reduce(function (s, x) { return s + (x - mu) * (x - mu); }, 0) / (v.length - 1)); }

  /* ------------------------------------------------------------ views */
  try { var v0 = localStorage.getItem("vrs-res-view"); if (VIEWS.indexOf(v0) >= 0) view = v0; } catch (err) { /* storage blocked */ }
  if (VIEWS.indexOf(location.hash.slice(1)) >= 0) view = location.hash.slice(1);
  function showTabs() {
    document.querySelectorAll(".sim-tabs [data-tab]").forEach(function (b) { var on = b.getAttribute("data-tab") === view; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
    VIEWS.forEach(function (k) { document.getElementById("view-" + k).hidden = k !== view; });
    out.setAttribute("data-view", view);
  }
  function render() {
    if (!D) return;
    showTabs();
    var idx = win();
    if (idx.length < 6) { document.getElementById("res-verdict").textContent = "Too few passes in this window; widen it."; return; }
    renderTop(idx);
    if (view === "time") renderTime(idx);
    else if (view === "station") renderStation(idx);
    else if (view === "seasons") renderSeasons(idx);
    else if (view === "build") { renderCoverage(); renderBuildings(); }
    else renderMeans();
  }
  function setView(v, focus) {
    view = v;
    try { localStorage.setItem("vrs-res-view", v); } catch (err) { /* storage blocked */ }
    try { history.replaceState(null, "", location.pathname + location.search + (v === "time" ? "" : "#" + v)); } catch (err) { /* file:// */ }
    render();
    if (focus) document.getElementById("tab-" + v).focus();
  }
  document.querySelectorAll(".sim-tabs [data-tab]").forEach(function (b) { b.addEventListener("click", function () { setView(b.getAttribute("data-tab")); }); });
  document.querySelector(".sim-tabs").addEventListener("keydown", function (ev) {
    var i = VIEWS.indexOf(view);
    if (ev.key === "ArrowRight") { ev.preventDefault(); setView(VIEWS[(i + 1) % VIEWS.length], true); }
    else if (ev.key === "ArrowLeft") { ev.preventDefault(); setView(VIEWS[(i + VIEWS.length - 1) % VIEWS.length], true); }
  });

  /* ------------------------------------------------------------ floating tooltip and crosshair */
  var tipEl = document.getElementById("res-floattip");
  function placeTip(html, cx, cy) {
    tipEl.innerHTML = html; tipEl.hidden = false;
    var r = tipEl.getBoundingClientRect(), x = cx + 14, y = cy + 14;
    if (x + r.width > window.innerWidth - 8) x = cx - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = cy - r.height - 14;
    tipEl.style.left = Math.max(8, x) + "px"; tipEl.style.top = Math.max(8, y) + "px";
  }
  function hideCross() { document.querySelectorAll(".res-cross").forEach(function (c) { c.setAttribute("visibility", "hidden"); }); }
  function hideTip() { tipEl.hidden = true; hideCross(); }
  out.addEventListener("mousemove", function (ev) {
    var panel = ev.target.closest && ev.target.closest(".res-tpanel");
    if (panel && panel._pick) {
      var box = panel.getBoundingClientRect(), hit = panel._pick(ev.clientX - box.left);
      hideCross();
      if (hit) {
        document.querySelectorAll(".res-tpanel .res-cross").forEach(function (cr) { cr.setAttribute("x1", hit.x); cr.setAttribute("x2", hit.x); cr.setAttribute("visibility", "visible"); });
        placeTip(hit.html, ev.clientX, ev.clientY); return;
      }
    }
    var t = ev.target.closest && ev.target.closest("[data-ftip]");
    if (t) placeTip(t.getAttribute("data-ftip"), ev.clientX, ev.clientY); else hideTip();
  });
  out.addEventListener("mouseleave", hideTip);
  out.addEventListener("scroll", hideTip, true);

  /* ------------------------------------------------------------ controls */
  form.addEventListener("change", function () { state = fromForm(); toForm(state); writeUrl(); render(); });
  document.getElementById("res-reset").addEventListener("click", function () { state = defaults(); toForm(state); writeUrl(); render(); });
  var rt = null, lastW = 0, lastH = 0;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (window.innerWidth !== lastW || window.innerHeight !== lastH) { lastW = window.innerWidth; lastH = window.innerHeight; render(); } }, 120);
  });

  /* ------------------------------------------------------------ load */
  fetch(URL_DATA).then(function (r) { if (!r.ok) throw new Error(r.status + " " + r.statusText); return r.json(); }).then(function (doc) {
    D = doc;
    T = D.epochs.map(day);
    var y0 = +D.epochs[0].slice(0, 4), y1 = +D.epochs[D.epochs.length - 1].slice(0, 4);
    for (var y = y0; y <= y1; y++) YEARS.push(y);
    ["from", "to"].forEach(function (k) { form.elements[k].innerHTML = YEARS.map(function (y) { return '<option value="' + y + '">' + y + "</option>"; }).join(""); });
    if (!D.radar_only) form.querySelector('input[name="run"][value="radar_only"]').disabled = true;
    document.getElementById("res-intro-passes").textContent = D.data.passes;
    document.getElementById("res-intro-span").textContent = y0 + " to " + y1;
    document.getElementById("res-asof").innerHTML = "Real radar data, averages over at least 20 points only; no single radar point is published. " + D.data.passes + " passes, " + fmtDate(D.data.first) + " to " + fmtDate(D.data.last) +
      ". Results of " + esc(D.generated) + (D.provenance.virtual_radiosonde ? ", team code <code>" + esc(D.provenance.virtual_radiosonde.slice(0, 7)) + "</code>" : "") + ".";
    state = initialState(); toForm(state);
    statusEl.hidden = true; out.hidden = false;
    lastW = window.innerWidth; lastH = window.innerHeight;
    render();
  }).catch(function (err) {
    statusEl.className = "sim-status error";
    statusEl.textContent = "The results could not be loaded (" + err.message + "). They are read from " + URL_DATA + "; on a local copy, serve the folder over http (python -m http.server) instead of opening the file.";
  });
})();
