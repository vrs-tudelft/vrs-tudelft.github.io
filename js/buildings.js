/* The building-motion widgets on buildings.html: the functional model of the report (chapter 4)
   drawn as plain inline SVG. Each element with data-bmodel="sink|shrink|thermal|combined" gets
   sliders for its parameters and a chart of the line-of-sight displacement of a high and a low
   point on one building over the 213 passes of 2020-2026, and of their difference: the height
   contrast that looks like air and that the estimation has to remove.

     d(h, t) = v_s dt  -  h gamma0 tau_c (1 - exp(-dt / tau_c))  +  h alpha dT(t)
     y       = cos(theta) d            (positive towards the satellite)

   The shrinking term is the form of the report and of fit_report_group in the team's estimation
   code. Temperatures use the report's 72 h exponential memory of KNMI 344 hourly weather
   at the pass dates; nothing in this illustration is radar point data. */
(function () {
  "use strict";
  var root = document.documentElement.getAttribute("data-root") || "";
  var COS = Math.cos(23 * Math.PI / 180);
  var H_HI = 85, H_LO = 5;                 /* illustrative 80 m contrast, not the report's layer edges */
  var NS = "http://www.w3.org/2000/svg";

  /* parameters: id, symbol, unit, min, max, step, default, scale (slider value -> model value), format */
  var P = {
    vs: { sym: "v<sub>s</sub>", name: "sinking rate", unit: "mm/yr", min: -6, max: 2, step: 0.1, def: -2,
          fmt: function (v) { return (v > 0 ? "+" : "") + v.toFixed(1); } },
    g0: { sym: "γ<sub>0</sub>", name: "shrinking rate, first pass", unit: "× 10⁻⁶ /yr", min: 0, max: 60, step: 1, def: 25,
          fmt: function (v) { return v.toFixed(0); } },
    tc: { sym: "τ<sub>c</sub>", name: "relaxation time", unit: "yr", min: Math.log(0.25), max: Math.log(50), step: 0.01, def: Math.log(5), log: true,
          fmt: function (v) { return v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : v.toFixed(0); } },
    al: { sym: "α", name: "thermal expansion", unit: "× 10⁻⁶ /K", min: 0, max: 15, step: 0.5, def: 10,
          fmt: function (v) { return v.toFixed(1); } }
  };
  var SETS = {
    sink: ["vs"], shrink: ["g0", "tc"], thermal: ["al"], combined: ["vs", "g0", "tc", "al"]
  };

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888"; }
  function niceTicks(lo, hi, count) {
    var span = hi - lo || 1, step = Math.pow(10, Math.floor(Math.log10(span / count))), err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function sgn(v, d) { return (v > 0.0005 ? "+" : v < -0.0005 ? "−" : "") + Math.abs(v).toFixed(d === undefined ? 1 : d); }

  /* the model of the report, line of sight, mm; h in m, dt in years, dT in K */
  function los(p, h, dt, dT) {
    var vs = p.vs || 0, g0 = (p.g0 || 0) * 1e-6, tc = p.tc || 5, al = (p.al || 0) * 1e-6;
    var d = vs * dt - h * 1000 * g0 * tc * (1 - Math.exp(-dt / tc)) + h * 1000 * al * dT;
    return COS * d;
  }

  function build(mount, T) {
    var kind = mount.getAttribute("data-bmodel"), ids = SETS[kind];
    if (!ids) return;
    var state = {};
    ids.forEach(function (id) { state[id] = P[id].def; });
    var showAir = kind === "combined";

    mount.classList.add("bm");
    mount.innerHTML = "";
    var controls = document.createElement("div"); controls.className = "bm-controls";
    var target=mount.getAttribute('data-controls-target');
    (target&&document.querySelector(target)||mount).appendChild(controls);
    var outputs = {}, inputs = {};
    ids.forEach(function (id) {
      var q = P[id], lab = document.createElement("label"); lab.className = "bm-slider";
      var top = document.createElement("span"); top.className = "bm-name";
      top.innerHTML = '<span class="bm-sym">' + q.sym + "</span> " + q.name;
      var out = document.createElement("output"); out.className = "bm-val"; outputs[id] = out;
      top.appendChild(out);
      var r = document.createElement("input"); r.type = "range"; r.min = q.min; r.max = q.max; r.step = q.step; r.value = q.def;
      r.setAttribute("aria-label", q.name + " (" + q.unit + ")"); inputs[id] = r;
      r.addEventListener("input", function () { state[id] = parseFloat(r.value); draw(); });
      lab.appendChild(top); lab.appendChild(r); controls.appendChild(lab);
    });
    var legend = document.createElement("ul"); legend.className = "bm-legend"; mount.appendChild(legend);
    legend.innerHTML =
      '<li><i class="sw hi"></i>high point, ' + H_HI + " m up</li>" +
      '<li><i class="sw lo"></i>low point, ' + H_LO + " m up</li>" +
      '<li><i class="sw ct"></i>height contrast: high minus low</li>' +
      (showAir ? '<li><i class="sw air"></i>what ±10 N-units of air do across the same 80 m</li>' : "");
    var box = document.createElement("div"); box.className = "bm-chart"; mount.appendChild(box);
    var svg = el("svg", { role: "img" }, box);
    var read = document.createElement("p"); read.className = "bm-read"; read.setAttribute("aria-live", "polite"); mount.appendChild(read);
    var reset = document.createElement("button"); reset.type = "button"; reset.className = "bm-reset"; reset.textContent = "Reset";
    reset.addEventListener("click", function () {
      ids.forEach(function (id) { state[id] = P[id].def; inputs[id].value = P[id].def; });
      draw();
    });
    controls.appendChild(reset);

    function val(id) { var q = P[id], v = state[id]; return q.log ? Math.exp(v) : v; }

    function draw() {
      var p = {};
      ids.forEach(function (id) { p[id] = val(id); outputs[id].textContent = P[id].fmt(p[id]) + " " + P[id].unit; });
      var W = Math.max(280, Math.round(box.clientWidth || 600)), narrow = W < 520;
      var H = narrow ? 250 : 290, m = { l: narrow ? 40 : 48, r: 12, t: 14, b: 28 };
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("width", W); svg.setAttribute("height", H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var n = T.dt.length, hi = [], lo = [], ct = [];
      for (var k = 0; k < n; k++) {
        hi.push(los(p, H_HI, T.dt[k], T.dT[k])); lo.push(los(p, H_LO, T.dt[k], T.dT[k]));
        ct.push(hi[k] - lo[k]);
      }
      var air = showAir ? 1e-3 * (H_HI - H_LO) * 10 / COS : 0;   /* mm in line of sight for 10 N-units across 80 m */
      var all = hi.concat(lo, ct, [air, -air, 0.5, -0.5]);
      var ymin = Math.min.apply(null, all), ymax = Math.max.apply(null, all), pad = (ymax - ymin) * 0.08;
      ymin -= pad; ymax += pad;
      var tmax = T.dt[n - 1];
      function X(t) { return m.l + t / tmax * (W - m.l - m.r); }
      function Y(v) { return m.t + (ymax - v) / (ymax - ymin) * (H - m.t - m.b); }

      var ink = css("--ink"), muted = css("--muted"), line = css("--line"), font = narrow ? 11 : 12;
      /* grid and axes */
      niceTicks(ymin, ymax, narrow ? 4 : 6).forEach(function (v) {
        el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: v === 0 ? css("--line-2") : line, "stroke-width": 1 }, svg);
        var t = el("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end", "font-size": font, fill: muted }, svg);
        t.textContent = v === 0 ? "0" : String(v).replace("-", "−");
      });
      T.years.forEach(function (yr) {
        if (yr.t > tmax || (narrow && yr.label % 2)) return;
        el("line", { x1: X(yr.t), x2: X(yr.t), y1: H - m.b, y2: H - m.b + 4, stroke: muted }, svg);
        var t = el("text", { x: X(yr.t), y: H - m.b + 17, "text-anchor": "middle", "font-size": font, fill: muted }, svg);
        t.textContent = yr.label;
      });
      var yl = el("text", { x: 12, y: (m.t + H - m.b) / 2, "font-size": font, fill: muted, "text-anchor": "middle",
                            transform: "rotate(-90 12 " + (m.t + H - m.b) / 2 + ")" }, svg);
      yl.textContent = "towards the satellite [mm]";
      if (showAir) {
        el("rect", { x: m.l, width: W - m.l - m.r, y: Y(air), height: Y(-air) - Y(air), fill: css("--good"), opacity: 0.16 }, svg);
      }
      function path(arr, colour, width, dash) {
        var d = "";
        for (var k = 0; k < arr.length; k++) d += (k ? "L" : "M") + X(T.dt[k]).toFixed(1) + " " + Y(arr[k]).toFixed(1);
        var a = { d: d, fill: "none", stroke: colour, "stroke-width": width, "stroke-linejoin": "round" };
        if (dash) a["stroke-dasharray"] = dash;
        el("path", a, svg);
      }
      path(lo, muted, 1.4, "4 3");
      path(hi, css("--accent"), 1.6);
      path(ct, css("--bad"), 2.4);

      /* the numbers in words: where the contrast ends, and its yearly swing */
      var last = ct[n - 1], swing = 0;
      if (ids.indexOf("al") >= 0) {
        var r = ct.map(function (v, k) { return v - (los(p, H_HI, T.dt[k], 0) - los(p, H_LO, T.dt[k], 0)); });
        swing = Math.max.apply(null, r) - Math.min.apply(null, r);
      }
      var txt = "After " + tmax.toFixed(1) + " years: high point " + sgn(hi[n - 1]) + " mm, low point " + sgn(lo[n - 1]) +
        " mm, height contrast " + sgn(last) + " mm.";
      if (kind === "sink") txt += " Both points move together, so the contrast stays at zero: sinking alone does not look like air.";
      if (kind === "shrink") txt += " The contrast grows with height and slows down over time; with a relaxation time of " + P.tc.fmt(p.tc) + " years, " + Math.round(100 * (1 - Math.exp(-tmax / p.tc))) + " % of the shortening that would ever happen from the first pass on has happened by the last.";
      if (kind === "thermal") txt += " Between the coldest and the warmest pass the contrast swings by " + swing.toFixed(1) + " mm.";
      if (kind === "combined") {
        txt += " Between the coldest and the warmest pass, temperature moves it by " + swing.toFixed(1) + " mm. Ten N-units of air across the same 80 m move the contrast by " +
          air.toFixed(2) + " mm (green band), about " + Math.round(Math.max(swing, Math.abs(last)) / air) + " times less than the buildings.";
      }
      read.textContent = 'Final high / low: '+sgn(hi[n-1])+' / '+sgn(lo[n-1])+' mm · contrast '+sgn(last)+' mm. ';
      var help=document.createElement('button');help.type='button';help.className='t i tip-trigger';help.setAttribute('aria-label','About the building curves');help.setAttribute('data-tip',txt);help.innerHTML='<span class="info" aria-hidden="true">i</span>';read.appendChild(help);
      svg.setAttribute("aria-label", "Line-of-sight displacement over 2020 to 2026 of a point " + H_HI + " m and a point " + H_LO + " m up the building, and their difference. " + txt);
    }
    if (window.ResizeObserver) new ResizeObserver(function () { draw(); }).observe(box);
    else window.addEventListener("resize", draw);
    draw();
  }

  /* Time and the report's temperature memory on the 213 passes; fail clearly if unavailable. */
  function times() {
    return fetch(root + "data/building-temperature.json").then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (ep) {
      if(ep.memory_h!==72||ep.dates.length!==ep.temperature_c.length||!ep.temperature_c.every(Number.isFinite))throw new Error('Incomplete temperature memory series');
      var first=Date.parse(ep.dates[0]);
      return {dt:ep.dates.map(function(d){return (Date.parse(d)-first)/864e5/365.25;}),dT:ep.temperature_c.map(function(v){return v-ep.temperature_c[0];}),first:ep.dates[0]};
    }).then(function (T) {
      var y0 = parseInt(T.first.slice(0, 4), 10), d0 = new Date(T.first + "T00:00:00Z");
      T.years = [];
      for (var y = y0 + 1; y <= y0 + 7; y++) T.years.push({ label: y, t: (Date.UTC(y, 0, 1) - d0) / 864e5 / 365.25 });
      return T;
    });
  }

  var mounts = document.querySelectorAll("[data-bmodel]");
  if (mounts.length) times().then(function (T) {
    [].forEach.call(mounts, function (m) { try { build(m, T); } catch (e) { console.error(e); } });
  }).catch(function(){mounts.forEach(function(m){m.textContent='The hourly temperature-memory series could not be loaded. Reload to try again.';});});
})();
