/* Theory page: a refractivity calculator (Smith and Weintraub, three terms, coefficients as in the
   report: k1 = 77.6, k2 = 72, k3 = 3.75e5, dry term on the dry-air pressure P - e) and three
   sensitivity charts drawn as inline SVG in the style of js/simulator.js. Plain script, no libraries. */
(function () {
  "use strict";

  var K1 = 77.6, K2 = 72, K3 = 3.75e5;
  var THETA = 23 * Math.PI / 180;        /* incidence from vertical */
  var LAYER = 40;                         /* m, the estimation's layer thickness */
  var ALPHA = 10e-6;                      /* 1/K, thermal expansion of concrete (EN 1992-1-1) */
  var DEDT_RDAM = 0.511;                  /* hPa/K, KNMI 344 fit e = 0.511 T + 5.262 */
  var LAT = 51.962 * Math.PI / 180;       /* KNMI 344, Rotterdam airport */
  var RDAM = { t: 11.67, rh: 79.3 };
  var C = {
    grid: "#ece9e1", axis: "#cdc9be", muted: "#6e747b", ink: "#17191c", ink2: "#3c4249",
    air: "#15688f", neg: "#a8433b", now: "#d62728", thermal: "#d2603a", net: "#3c4249"
  };
  var RH_LINES = [
    { rh: 0, color: "#c9d6e6" }, { rh: 25, color: "#9db6d8" }, { rh: 50, color: "#6f95c8" },
    { rh: 75, color: "#3b73b0" }, { rh: 100, color: "#1b4d86" }
  ];
  var PRESETS = {
    std: { p: 1013.25, t: 15, rh: 50 },
    rdam: { p: 1015.5, t: 11.7, rh: 79 },
    cold: { p: 1030, t: -5, rh: 60 },
    summer: { p: 1010, t: 25, rh: 70 }
  };

  var calc = document.getElementById("calc");
  if (!calc) return;
  var $ = function (id) { return document.getElementById(id); };
  var sP = $("s-p"), sT = $("s-t"), sH = $("s-h");
  var state = { p: 1013.25, t: 15, mode: "rh", rh: 50, e: 0 };

  /* ------------------------------------------------------------ physics */
  function es(t) { return 6.112 * Math.exp(17.62 * t / (243.12 + t)); }
  function dew(e) { if (e <= 0.01) return NaN; var l = Math.log(e / 6.112); return 243.12 * l / (17.62 - l); }
  function terms(p, t, e) {
    var T = t + 273.15;
    return { dry: K1 * (p - e) / T, w2: K2 * e / T, w3: K3 * e / (T * T) };
  }
  function N(p, t, e) { var s = terms(p, t, e); return s.dry + s.w2 + s.w3; }
  function vapour() { return state.mode === "rh" ? state.rh / 100 * es(state.t) : Math.min(state.e, es(state.t)); }
  /* change of N for one kelvin of warming in the three cases of the report's section 2.5 */
  function cases(p, t, e) {
    var n0 = N(p, t, e), rh = e / es(t);
    return {
      dry: N(p, t + 1, e) - n0,
      wet: N(p, t + 1, rh * es(t + 1)) - n0,
      hyb: N(p, t + 1, Math.min(e + DEDT_RDAM, es(t + 1))) - n0
    };
  }
  /* the relative humidity at which warming at fixed RH leaves N unchanged (N is linear in e) */
  function boundary(p, t) {
    var f0 = N(p, t + 1, 0) - N(p, t, 0), f1 = N(p, t + 1, es(t + 1)) - N(p, t, es(t));
    return f1 === f0 ? NaN : 100 * -f0 / (f1 - f0);
  }

  /* ------------------------------------------------------------ formatting and svg helpers */
  function fmt(v, d) { return (+v).toFixed(d).replace("-", "−"); }
  function sgn(v, d) { return (v > 0 ? "+" : "") + fmt(v, d); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0); }; }
  function ticks(d0, d1, count) {
    var span = d1 - d0 || 1, step = Math.pow(10, Math.floor(Math.log10(span / count))), err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var t = [];
    for (var v = Math.ceil(d0 / step - 1e-9) * step; v <= d1 + 1e-9; v += step) t.push(+v.toFixed(10));
    return t;
  }
  function tickLabel(v) { var s = Math.abs(v) >= 10 || v === Math.round(v) ? v.toFixed(0) : (Math.abs(v) < 1 ? v.toFixed(2).replace(/0$/, "") : v.toFixed(1)); return s.replace("-", "−"); }
  function svg(w, h, body, label) {
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" role="img" aria-label="' + esc(label) + '">' + body + "</svg>";
  }
  function text(x, y, s, o) {
    o = o || {};
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="' + (o.size || 11) + '" fill="' + (o.fill || C.muted) + '"' +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : "") + (o.base ? ' dominant-baseline="' + o.base + '"' : "") +
      (o.rot ? ' transform="rotate(' + o.rot + " " + x.toFixed(1) + " " + y.toFixed(1) + ')"' : "") +
      (o.weight ? ' font-weight="' + o.weight + '"' : "") + ' pointer-events="none">' + esc(s) + "</text>";
  }
  function line(x1, y1, x2, y2, stroke, w, extra) {
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + stroke + '" stroke-width="' + (w || 1) + '"' + (extra || "") + "/>";
  }
  function path(pts) { return pts.map(function (q, i) { return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join(""); }
  function width(el) { return Math.max(260, Math.floor(el.clientWidth || 500)); }
  function dot(x, y) {
    return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="8" fill="' + C.now + '" fill-opacity=".15"/>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5" fill="' + C.now + '" stroke="#fff" stroke-width="1.5"/>';
  }

  /* ------------------------------------------------------------ chart 1: N against T */
  function chartNT(el, p, t, e) {
    var w = width(el), H = 235, m = { l: 40, r: 44, t: 10, b: 34 };
    var T0 = -10, T1 = 35, xs = lin(T0, T1, m.l, w - m.r);
    var curves = RH_LINES.map(function (c) {
      var pts = [];
      for (var x = T0; x <= T1 + 1e-9; x += 0.5) pts.push([x, N(p, x, c.rh / 100 * es(x))]);
      return { c: c, pts: pts };
    });
    var lo = Infinity, hi = -Infinity;
    curves.forEach(function (k) { k.pts.forEach(function (q) { lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]); }); });
    var yt = ticks(lo - 8, hi + 8, 5), y0 = Math.min(lo - 8, yt[0]), y1 = Math.max(hi + 8, yt[yt.length - 1]);
    var ys = lin(y0, y1, H - m.b, m.t), body = "";
    yt.forEach(function (v) { body += line(m.l, ys(v), w - m.r, ys(v), C.grid) + text(m.l - 5, ys(v), tickLabel(v), { anchor: "end", base: "middle", size: 10 }); });
    ticks(T0, T1, w < 380 ? 5 : 9).forEach(function (v) { body += line(xs(v), m.t, xs(v), H - m.b, C.grid) + text(xs(v), H - m.b + 14, tickLabel(v), { anchor: "middle", size: 10 }); });
    body += line(m.l, H - m.b, w - m.r, H - m.b, C.axis) + line(m.l, m.t, m.l, H - m.b, C.axis);
    body += text((m.l + w - m.r) / 2, H - 4, "temperature (°C)", { anchor: "middle", size: 10 });
    body += text(11, (m.t + H - m.b) / 2, "N", { anchor: "middle", size: 10, rot: -90 });
    curves.forEach(function (k) {
      body += '<path d="' + path(k.pts.map(function (q) { return [xs(q[0]), ys(q[1])]; })) + '" fill="none" stroke="' + k.c.color + '" stroke-width="1.7" stroke-linejoin="round"/>';
      var last = k.pts[k.pts.length - 1];
      body += text(w - m.r + 4, ys(last[1]), k.c.rh + " %", { base: "middle", size: 10, fill: k.c.color === "#c9d6e6" ? C.muted : k.c.color });
    });
    /* fixed e through the current point: the dry case */
    var td = Math.max(T0, isNaN(dew(e)) ? T0 : dew(e)), dp = [];
    for (var x = td; x <= T1 + 1e-9; x += 0.5) dp.push([xs(x), ys(N(p, x, Math.min(e, es(x))))]);
    if (dp.length > 1) body += '<path d="' + path(dp) + '" fill="none" stroke="' + C.neg + '" stroke-width="1.5" stroke-dasharray="5 4"/>';
    var nx = xs(t), ny = ys(N(p, t, e));
    body += dot(nx, ny);
    var lab = "now: N " + fmt(N(p, t, e), 1);
    body += text(nx + (nx > w - 130 ? -10 : 10), ny - 10, lab, { anchor: nx > w - 130 ? "end" : "start", size: 11, fill: C.ink, weight: 600 });
    body += text(m.l + 6, m.t + 12, "dashed: e fixed at " + fmt(e, 1) + " hPa", { size: 10, fill: C.neg });
    el.innerHTML = svg(w, H, body, "Refractivity against temperature from −10 to 35 °C at relative humidity 0, 25, 50, 75 and 100 %, at " + fmt(p, 0) + " hPa. Current point: " + fmt(t, 1) + " °C, N " + fmt(N(p, t, e), 1) + ".");
  }

  /* ------------------------------------------------------------ chart 2: the sign map in (T, RH) */
  var mapGeo = null;
  function chartMap(el, p, t, e) {
    var w = width(el), H = 235, m = { l: 40, r: 14, t: 10, b: 34 };
    var T0 = -10, T1 = 35, xs = lin(T0, T1, m.l, w - m.r), ys = lin(0, 100, H - m.b, m.t);
    mapGeo = { xs: lin(m.l, w - m.r, T0, T1), ys: lin(H - m.b, m.t, 0, 100), w: w };
    var b = [];
    for (var x = T0; x <= T1 + 1e-9; x += 0.5) b.push([x, Math.max(0, Math.min(100, boundary(p, x)))]);
    var bp = b.map(function (q) { return [xs(q[0]), ys(q[1])]; });
    var body = "";
    body += '<path d="' + path([[xs(T0), ys(100)]].concat(bp).concat([[xs(T1), ys(100)]])) + 'Z" fill="' + C.air + '" fill-opacity=".09"/>';
    body += '<path d="' + path([[xs(T0), ys(0)]].concat(bp).concat([[xs(T1), ys(0)]])) + 'Z" fill="' + C.neg + '" fill-opacity=".08"/>';
    [0, 20, 40, 60, 80, 100].forEach(function (v) { body += line(m.l, ys(v), w - m.r, ys(v), C.grid) + text(m.l - 5, ys(v), String(v), { anchor: "end", base: "middle", size: 10 }); });
    ticks(T0, T1, w < 380 ? 5 : 9).forEach(function (v) { body += line(xs(v), m.t, xs(v), H - m.b, C.grid) + text(xs(v), H - m.b + 14, tickLabel(v), { anchor: "middle", size: 10 }); });
    body += line(m.l, H - m.b, w - m.r, H - m.b, C.axis) + line(m.l, m.t, m.l, H - m.b, C.axis);
    body += text((m.l + w - m.r) / 2, H - 4, "temperature (°C)", { anchor: "middle", size: 10 });
    body += text(11, (m.t + H - m.b) / 2, "relative humidity (%)", { anchor: "middle", size: 10, rot: -90 });
    body += '<path d="' + path(bp) + '" fill="none" stroke="' + C.ink2 + '" stroke-width="1.6"/>';
    body += text(xs(T1) - 6, ys(92), "wet wins: warming raises N", { anchor: "end", size: 11, fill: C.air, weight: 600 });
    body += text(xs(T0) + 6, ys(5), "dry wins: warming lowers N", { size: 11, fill: C.neg, weight: 600 });
    /* the Rotterdam mean */
    var rx = xs(RDAM.t), ry = ys(RDAM.rh);
    body += line(rx - 5, ry - 5, rx + 5, ry + 5, C.ink2, 1.5) + line(rx - 5, ry + 5, rx + 5, ry - 5, C.ink2, 1.5);
    body += text(rx + 8, ry + 14, "Rotterdam mean", { size: 10, fill: C.ink2 });
    var rh = 100 * e / es(t), nx = xs(t), ny = ys(rh);
    body += dot(nx, ny);
    el.innerHTML = svg(w, H, body, "Map of temperature and relative humidity. Above the boundary, at about " + fmt(boundary(p, 15), 0) + " % at 15 °C and " + fmt(boundary(p, 0), 0) + " % at 0 °C, warming at fixed humidity raises N; below it, it lowers N. Current point " + fmt(t, 1) + " °C, " + fmt(rh, 0) + " %.");
  }

  /* ------------------------------------------------------------ chart 3: one kelvin, the bars */
  function chartBars(el, p, t, e) {
    var w = width(el), cs = cases(p, t, e);
    var air = function (dn) { return 1e-6 * dn * LAYER / Math.cos(THETA) * 1000; };
    var th = ALPHA * LAYER * Math.cos(THETA) * 1000;
    var rows = [
      { label: "Building grows, α = 10⁻⁵ per K", v: th, color: C.thermal },
      { label: "Air, e fixed (dry case): ΔN " + sgn(cs.dry, 2), v: air(cs.dry) },
      { label: "Air, relative humidity fixed (wet case): ΔN " + sgn(cs.wet, 2), v: air(cs.wet) },
      { label: "Air, e follows Rotterdam average (hybrid): ΔN " + sgn(cs.hyb, 2), v: air(cs.hyb) },
      { label: "Seen by the radar, hybrid: building + air", v: th + air(cs.hyb), color: C.net }
    ];
    var m = { l: 12, r: 70, t: 6, b: 36 }, rowH = 40, H = m.t + rows.length * rowH + m.b;
    var lo = Math.min(-0.1, Math.min.apply(null, rows.map(function (r) { return r.v; }))), hi = Math.max(0.1, Math.max.apply(null, rows.map(function (r) { return r.v; })));
    var xt = ticks(lo, hi, w < 420 ? 4 : 7), x0 = Math.min(lo, xt[0]), x1 = Math.max(hi, xt[xt.length - 1]);
    var xs = lin(x0, x1, m.l, w - m.r), body = "", plotB = m.t + rows.length * rowH;
    xt.forEach(function (v) { body += line(xs(v), m.t, xs(v), plotB, v === 0 ? C.axis : C.grid) + text(xs(v), plotB + 13, tickLabel(v), { anchor: "middle", size: 10 }); });
    body += text((m.l + w - m.r) / 2, H - 2, "mm along the line of sight, + is up toward the satellite", { anchor: "middle", size: 10 });
    rows.forEach(function (r, i) {
      var y = m.t + i * rowH, col = r.color || (r.v >= 0 ? C.air : C.neg);
      var a = xs(Math.min(0, r.v)), b = xs(Math.max(0, r.v));
      body += text(m.l, y + 13, r.label, { size: 11, fill: C.ink2, weight: i === rows.length - 1 ? 600 : 0 });
      body += '<rect x="' + a.toFixed(1) + '" y="' + (y + 19) + '" width="' + Math.max(1.5, b - a).toFixed(1) + '" height="13" rx="2" fill="' + col + '"/>';
      /* the value always to the right of the bar or of zero, so it never leaves the chart on a phone */
      body += text(b + 5, y + 29, sgn(r.v, 3) + " mm", { size: 11, fill: C.ink, weight: 600 });
    });
    el.innerHTML = svg(w, H, body, "One kelvin of warming, for a point 40 m up relative to the street, along the line of sight: " + rows.map(function (r) { return r.label + " " + sgn(r.v, 3) + " mm"; }).join("; ") + ".");
  }

  /* ------------------------------------------------------------ update everything */
  function render() {
    var p = state.p, t = state.t, e = vapour(), s = terms(p, t, e), n = s.dry + s.w2 + s.w3, sat = es(t);
    var T = t + 273.15, rh = 100 * e / sat;
    $("o-p").textContent = fmt(p, p % 1 ? 1 : 0) + " hPa";
    $("o-t").textContent = fmt(t, 1) + " °C";
    $("o-h").textContent = state.mode === "rh" ? fmt(state.rh, 0) + " %" : fmt(e, 2) + " hPa";
    $("o-sat").textContent = state.mode === "e" && state.e > sat + 1e-9 ? "Capped at saturation, " + fmt(sat, 2) + " hPa at this temperature." : "";
    $("r-n").textContent = "N = " + fmt(n, 1);
    $("r-idx").textContent = "n = " + (1 + n * 1e-6).toFixed(6);
    $("r-dry").textContent = fmt(s.dry, 1) + " (" + fmt(100 * s.dry / n, 0) + " %)";
    $("r-wet").textContent = fmt(s.w2 + s.w3, 1) + " (" + fmt(100 * (s.w2 + s.w3) / n, 0) + " %)";
    $("r-wetsplit").textContent = "= " + fmt(s.w2, 2) + " (k₂) + " + fmt(s.w3, 1) + " (k₃)";
    var bar = $("r-bar").children;
    bar[0].style.width = (100 * s.dry / n).toFixed(2) + "%";
    bar[1].style.width = (100 * (s.w2 + s.w3) / n).toFixed(2) + "%";
    var slant = LAYER / Math.cos(THETA);
    $("r-delay").innerHTML = fmt(1e-6 * n * slant * 1000, 1) + ' <span class="u">mm</span>';
    $("r-per").innerHTML = fmt(1e-6 * slant * 1000, 3) + ' <span class="u">mm</span>';
    var dT = -(K1 * (p - e) + K2 * e) / (T * T) - 2 * K3 * e / (T * T * T);
    var dE = (K2 - K1) / T + K3 / (T * T);
    $("r-dt").innerHTML = sgn(dT, 2) + ' <span class="u">N/K</span>';
    $("r-de").innerHTML = sgn(dE, 2) + ' <span class="u">N/hPa</span>';
    $("r-ratio").innerHTML = fmt(Math.abs(dE / dT), 1) + ' <span class="u">K</span>';
    var td = dew(e);
    if (state.mode === "rh") {
      $("r-hum").innerHTML = fmt(e, 2) + ' <span class="u">hPa</span>';
      $("r-humk").textContent = "vapour pressure e; dew point " + (isNaN(td) ? "n/a" : fmt(td, 1) + " °C");
    } else {
      $("r-hum").innerHTML = fmt(rh, 0) + ' <span class="u">%</span>';
      $("r-humk").textContent = "relative humidity; dew point " + (isNaN(td) ? "n/a" : fmt(td, 1) + " °C");
    }
    /* Saastamoinen, at the calculator's air, H = 0 */
    var zhd = 0.0022768 * p / (1 - 0.00266 * Math.cos(2 * LAT)), zwd = 0.002277 * (1255 / T + 0.05) * e;
    $("sa-zhd").textContent = fmt(zhd, 3);
    $("sa-zwd").textContent = fmt(zwd, 3);
    $("sa-ztd").textContent = fmt(zhd + zwd, 3);
    $("sa-slant").textContent = fmt((zhd + zwd) / Math.cos(THETA), 2);
    /* hydrostatic pressure with height, scale height from the virtual temperature */
    var Tv = T * (1 + 0.378 * e / p), Hs = 287.05 * Tv / 9.80665;
    var p40 = p * Math.exp(-40 / Hs), p150 = p * Math.exp(-150 / Hs);
    $("pz-40").textContent = fmt(p40, 1);
    $("pz-150").textContent = fmt(p150, 1);
    $("pz-dn").textContent = fmt(K1 * (p - p * Math.exp(-100 / Hs)) / T, 1);
    /* presets: mark the one that matches */
    [].forEach.call(calc.querySelectorAll("[data-preset]"), function (b) {
      var q = PRESETS[b.getAttribute("data-preset")];
      b.classList.toggle("on", Math.abs(q.p - p) < 0.01 && Math.abs(q.t - t) < 0.01 && Math.abs(q.rh - rh) < 0.5 && state.mode === "rh");
    });
    charts();
  }
  function charts() {
    var e = vapour();
    var a = $("ch-nt"), b = $("ch-map"), c = $("ch-bars");
    if (a) chartNT(a, state.p, state.t, e);
    if (b) chartMap(b, state.p, state.t, e);
    if (c) chartBars(c, state.p, state.t, e);
  }

  /* ------------------------------------------------------------ controls */
  function setHumSlider() {
    if (state.mode === "rh") {
      sH.min = 0; sH.max = 100; sH.step = 1; sH.value = state.rh;
      $("k-h").textContent = "Relative humidity";
    } else {
      sH.min = 0; sH.max = es(state.t).toFixed(2); sH.step = 0.05; sH.value = Math.min(state.e, es(state.t));
      $("k-h").textContent = "Vapour pressure e";
    }
  }
  function setAll(q) {
    state.p = q.p; state.t = q.t; state.rh = q.rh; state.e = q.rh / 100 * es(q.t);
    sP.value = q.p; sT.value = q.t; setHumSlider(); render();
  }
  sP.addEventListener("input", function () { state.p = +sP.value; render(); });
  sT.addEventListener("input", function () {
    state.t = +sT.value;
    if (state.mode === "e") { state.e = Math.min(state.e, es(state.t)); setHumSlider(); }
    else state.e = state.rh / 100 * es(state.t);
    render();
  });
  sH.addEventListener("input", function () {
    if (state.mode === "rh") { state.rh = +sH.value; state.e = state.rh / 100 * es(state.t); }
    else { state.e = +sH.value; state.rh = 100 * state.e / es(state.t); }
    render();
  });
  [].forEach.call(calc.querySelectorAll('input[name="hmode"]'), function (r) {
    r.addEventListener("change", function () {
      if (!r.checked) return;
      var e = vapour();
      state.mode = r.value; state.e = e; state.rh = Math.round(100 * e / es(state.t));
      if (state.mode === "rh") state.e = state.rh / 100 * es(state.t);
      setHumSlider(); render();
    });
  });
  [].forEach.call(calc.querySelectorAll("[data-preset]"), function (b) {
    b.addEventListener("click", function () { setAll(PRESETS[b.getAttribute("data-preset")]); });
  });

  /* tap or drag on the sign map moves the point */
  var map = $("ch-map"), dragging = false;
  function fromPointer(ev) {
    if (!mapGeo) return;
    var r = map.querySelector("svg").getBoundingClientRect();
    var sx = mapGeo.w / r.width;
    var t = Math.max(-10, Math.min(35, mapGeo.xs((ev.clientX - r.left) * sx)));
    var rh = Math.max(0, Math.min(100, mapGeo.ys((ev.clientY - r.top) * sx)));
    state.t = Math.round(t * 10) / 10; state.rh = Math.round(rh);
    state.e = state.rh / 100 * es(state.t);
    sT.value = state.t; setHumSlider(); render();
  }
  if (map) {
    map.addEventListener("pointerdown", function (ev) { dragging = true; fromPointer(ev); if (ev.pointerType === "mouse") ev.preventDefault(); });
    map.addEventListener("pointermove", function (ev) { if (dragging && ev.pointerType === "mouse") fromPointer(ev); });
    window.addEventListener("pointerup", function () { dragging = false; });
  }

  var raf = 0, lastW = window.innerWidth;
  window.addEventListener("resize", function () {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(charts);
  });

  setAll(PRESETS.std);
  document.addEventListener('site:viewchange',charts);
})();
