/* The six animations. Each mounts on an element with data-anim="..." and reads the aggregate
   files in data/ (means over at least 20 radar points; see tools/check_data.py). */
(function () {
  "use strict";
  var V = window.VRS, L = V.load, A = V.axes, D = V.draw, U = V.util, css = V.css;
  var root = document.documentElement.getAttribute("data-root") || "";
  var DATA = root + "data/";
  var COS23 = Math.cos(23 * Math.PI / 180);

  function tg(ep, i) { var v = ep.knmi.tg[i]; return (v === null || v === undefined) ? "no KNMI value" : v.toFixed(1) + " °C"; }
  function passLabel(ep, i) { return U.fmtDate(ep.dates[i]) + " · pass " + (i + 1) + " of " + ep.n_epochs + " · Rotterdam daily mean " + tg(ep, i); }
  function pad(size) { return { l: 46, r: 14, t: 10, b: 30, f: size.font + "px system-ui" }; }
  function cursor(ctx, x, y0, y1, colour) { ctx.strokeStyle = colour || css("--bad"); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); ctx.lineWidth = 1; }

  /* ================================================================ (a) scene */
  function scene(mount) {
    Promise.all([L.json(DATA + "cells.json"), L.int16(DATA + "cells.bin"), L.json(DATA + "outlines.json"), L.json(DATA + "epochs.json")])
      .then(function (r) {
        var cells = r[0], bin = r[1], outlines = r[2], ep = r[3];
        var mode = "increment", gridName = "all";
        var grids = {};
        ["all", "ground"].forEach(function (g) {
          var G = cells.grids[g];
          grids[g] = { cells: G.cells, S: L.grid(bin, G.offset_bytes, G.n_cells, cells.series.epochs) };
        });
        var ox = cells.origin_local[0], oy = cells.origin_local[1], cm = cells.cell_m;
        /* map extent: the cells plus a margin, not the whole outline box */
        var ci = cells.grids.all.cells.map(function (c) { return c.i; }), cj = cells.grids.all.cells.map(function (c) { return c.j; });
        var e0 = ox + cm * Math.min.apply(null, ci) - 60, e1 = ox + cm * (Math.max.apply(null, ci) + 1) + 60;
        var n0 = oy + cm * Math.min.apply(null, cj) - 40, n1 = oy + cm * (Math.max.apply(null, cj) + 1) + 40;
        var lim = { increment: cells.scales.increment_mm, cumulative: cells.scales.cumulative_mm, detrended: cells.scales.detrended_mm };
        var tYears = ep.days_since_ref.map(function (d) { return d / 365.25; });
        function value(G, c, k, i) {
          var S = G.S;
          if (mode === "increment") return i === 0 ? 0 : S.get(k, i) - S.get(k, i - 1);
          if (mode === "cumulative") return S.get(k, i);
          var tr = c.trend; return S.get(k, i) - (tr[0] + tr[1] * tYears[i] + tr[2] * tYears[i] * tYears[i]);
        }
        var player = V.Player.create({
          mount: mount, frames: ep.n_epochs, fps: 6,
          aspect: function (w) { return w < 600 ? 0.8 : 1.25; },
          label: function (i) { return passLabel(ep, i) + " · s(t) minus trend and yearly wave " + (ep.s_resid[i] >= 0 ? "+" : "") + ep.s_resid[i].toFixed(1) + " mm/100 m"; },
          draw: function (i, ctx, size) {
            var w = size.w, h = size.h, stripH = Math.round(h * 0.22), mapH = h - stripH - 8;
            var sc = Math.min((w - 20) / (e1 - e0), (mapH - 10) / (n1 - n0));
            var mx0 = (w - (e1 - e0) * sc) / 2, my0 = 6 + (mapH - (n1 - n0) * sc) / 2;
            function px(e) { return mx0 + (e - e0) * sc; }
            function py(n) { return my0 + (n1 - n) * sc; }
            /* water and land hint: nothing; cells first, outlines on top */
            var G = grids[gridName], colour = V.scales.diverging(lim[mode]);
            G.cells.forEach(function (c, k) {
              var v = value(G, c, k, i);
              ctx.fillStyle = colour(v);
              ctx.fillRect(px(ox + cm * c.i), py(oy + cm * (c.j + 1)), cm * sc + 0.5, cm * sc + 0.5);
            });
            /* outlines */
            ctx.save(); ctx.beginPath(); ctx.rect(px(e0), py(n1), px(e1) - px(e0), py(n0) - py(n1)); ctx.clip();
            ctx.strokeStyle = css("--muted"); ctx.lineWidth = 0.8;
            outlines.outlines.forEach(function (o) {
              o.rings.forEach(function (ring) {
                ctx.beginPath(); ring.forEach(function (p, k) { k ? ctx.lineTo(px(p[0]), py(p[1])) : ctx.moveTo(px(p[0]), py(p[1])); });
                ctx.closePath(); ctx.stroke();
              });
            });
            ctx.restore(); ctx.lineWidth = 1;
            /* scale bar and legend */
            var sb = 200 * sc;
            ctx.strokeStyle = css("--ink"); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px(e0) + 10, py(n0) - 10); ctx.lineTo(px(e0) + 10 + sb, py(n0) - 10); ctx.stroke(); ctx.lineWidth = 1;
            D.text(ctx, "200 m", px(e0) + 10, py(n0) - 14, { font: size.font + "px system-ui", colour: css("--muted") });
            var lw = Math.min(180, w * 0.3), f1 = (size.font - 1) + "px system-ui";
            var title = mode === "increment" ? "change since the previous pass [mm]" : mode === "cumulative" ? "displacement since January 2014 [mm]" : "displacement minus the cell's trend [mm]";
            D.text(ctx, title, w - 12, 14, { font: f1, colour: css("--muted"), align: "right" });
            V.legend(ctx, w - lw - 12, 20, lw, 9, V.scales.ramp("RdBu_r"),
              ["-" + lim[mode].toFixed(mode === "cumulative" ? 0 : 1), "0", "+" + lim[mode].toFixed(mode === "cumulative" ? 0 : 1)], f1);
            D.text(ctx, "blue = away from the satellite, red = towards it", w - 12, 56, { font: f1, colour: css("--muted"), align: "right" });
            D.text(ctx, "north up · 25 m cells, each a mean over at least 20 radar points", 12, 16, { font: f1, colour: css("--muted") });
            D.text(ctx, "outlines: BAG buildings", 12, 30, { font: f1, colour: css("--muted") });
            /* strip: s_resid */
            var y0 = h - stripH, X = A.linear(0, ep.n_epochs - 1, 46, w - 12), s = ep.s_resid;
            var lim2 = ep.scales.s_resid_mm_per_100m * 1.6, Y = A.linear(-lim2, lim2, h - 24, y0 + 4);
            ctx.strokeStyle = css("--line"); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(ep.n_epochs - 1), Y(0)); ctx.stroke();
            D.line(ctx, s.map(function (_, k) { return X(k); }), s.map(function (v) { return Y(Math.max(-lim2, Math.min(lim2, v))); }), css("--accent"), 1);
            cursor(ctx, X(i), y0, h - 24);
            A.yAxis(ctx, Y, 46, [-Math.round(lim2), 0, Math.round(lim2)], "", (size.font - 1) + "px system-ui");
            A.xAxis(ctx, X, h - 24, A.yearTicks(ep.dates), "", (size.font - 1) + "px system-ui");
            D.text(ctx, "height gradient s(t), trend and yearly wave removed [mm/100 m]", 50, y0 + 10, { font: (size.font - 1) + "px system-ui", colour: css("--muted") });
          }
        });
        player.addToggle("Show:", "mode", [
          { value: "increment", label: "change since the previous pass", checked: true },
          { value: "cumulative", label: "displacement since 2014" },
          { value: "detrended", label: "minus each cell's trend" }], function (v) { mode = v; });
        player.addToggle("Cells:", "grid", [
          { value: "all", label: "all points", checked: true },
          { value: "ground", label: "ground points only (below 5 m)" }], function (v) { gridName = v; });
      }).catch(function (e) { V.Player.fallback(mount, "The scene animation could not load its data (" + e.message + ")."); });
  }

  /* ================================================================ (b) bands */
  function bands(mount) {
    Promise.all([L.json(DATA + "bands.json"), L.json(DATA + "epochs.json")]).then(function (r) {
      var B = r[0].fine, ep = r[1];
      var allv = []; B.forEach(function (b) { b.mean_rel.forEach(function (v) { allv.push(Math.abs(v)); }); });
      var lim = Math.ceil(U.pct(allv, 99));
      var hmax = 90, sLim = Math.ceil(U.pct(ep.s.slope.map(Math.abs), 99.5));
      var nTot = B.reduce(function (a, b) { return a + b.n; }, 0);
      var hbar = B.reduce(function (a, b) { return a + b.h_mean * b.n; }, 0) / nTot;
      V.Player.create({
        mount: mount, frames: ep.n_epochs, fps: 6, aspect: function (w) { return w < 600 ? 0.9 : 1.5; },
        label: function (i) { return passLabel(ep, i) + " · slope " + (ep.s.slope[i] >= 0 ? "+" : "") + ep.s.slope[i].toFixed(1) + " mm/100 m, r = " + (ep.s.r[i] === null ? "n/a" : ep.s.r[i].toFixed(2)); },
        draw: function (i, ctx, size) {
          var w = size.w, h = size.h, p = pad(size), topH = Math.round(h * 0.6);
          var X = A.linear(-lim, lim, p.l, w - p.r), Y = A.linear(0, hmax, topH - 26, p.t + 6);
          A.xAxis(ctx, X, topH - 26, A.niceTicks(-lim, lim, 6), "mean displacement of the band minus the scene mean [mm]", p.f);
          A.yAxis(ctx, Y, p.l, [0, 20, 40, 60, 80], "height above ground [m]", p.f);
          ctx.strokeStyle = css("--line"); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(0), Y(hmax)); ctx.stroke(); ctx.setLineDash([]);
          /* fitted line: through (0, hbar) with slope s/100 */
          var s = ep.s.slope[i] / 100;
          ctx.strokeStyle = css("--bad"); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(s * (0 - hbar)), Y(0)); ctx.lineTo(X(s * (hmax - hbar)), Y(hmax)); ctx.stroke(); ctx.lineWidth = 1;
          B.forEach(function (b) {
            var v = b.mean_rel[i], rr = 3 + Math.log10(b.n) * 1.6;
            ctx.fillStyle = css("--accent"); ctx.beginPath(); ctx.arc(X(Math.max(-lim, Math.min(lim, v))), Y(b.h_mean), rr, 0, 2 * Math.PI); ctx.fill();
            D.text(ctx, "n=" + b.n, w - p.r - 2, Y(b.h_mean), { font: (size.font - 2) + "px system-ui", colour: css("--muted"), align: "right", baseline: "middle" });
          });
          D.text(ctx, "ten height bands, each a mean over 119 to 3 273 points; red line: the weighted fit, slope s(t)", p.l + 4, p.t + 12, { font: (size.font - 1) + "px system-ui", colour: css("--muted") });
          /* bottom: s(t) */
          var X2 = A.linear(0, ep.n_epochs - 1, p.l, w - p.r), Y2 = A.linear(-sLim, sLim, h - p.b, topH + 8);
          ctx.strokeStyle = css("--line"); ctx.beginPath(); ctx.moveTo(X2(0), Y2(0)); ctx.lineTo(X2(ep.n_epochs - 1), Y2(0)); ctx.stroke();
          D.line(ctx, ep.s.slope.map(function (_, k) { return X2(k); }), ep.s.slope.map(function (v) { return Y2(v); }), css("--accent"), 1);
          ctx.fillStyle = css("--bad"); ctx.beginPath(); ctx.arc(X2(i), Y2(ep.s.slope[i]), 4, 0, 2 * Math.PI); ctx.fill();
          cursor(ctx, X2(i), topH + 8, h - p.b);
          A.yAxis(ctx, Y2, p.l, A.niceTicks(-sLim, sLim, 4), "s(t) [mm/100 m]", p.f);
          A.xAxis(ctx, X2, h - p.b, A.yearTicks(ep.dates), "", p.f);
        }
      });
    }).catch(function (e) { V.Player.fallback(mount, "The height-band animation could not load its data (" + e.message + ")."); });
  }

  /* ================================================================ (c) decomposition */
  function decomp(mount) {
    L.json(DATA + "epochs.json").then(function (ep) {
      var PER = 70, frames = 4 * PER, n = ep.n_epochs;
      var s = ep.s.slope, m = ep.s_model, t = ep.days_since_ref.map(function (d) { return d / 365.25; });
      var trend = t.map(function (tt) { return m.offset + m.trend_per_yr * tt; });
      var annual = t.map(function (tt) { return m.cos * Math.cos(2 * Math.PI * tt) + m.sin * Math.sin(2 * Math.PI * tt); });
      var resid = ep.s_resid, fast = ep.s_fast, sigma = ep.summary.formal_sigma_mm_per_100m, rms = ep.summary.fast_rms_mm_per_100m;
      var titles = [
        "1. The height gradient s(t), one number per pass: how much more the high points moved than the low ones",
        "2. Take out the slow trend (" + m.trend_per_yr.toFixed(2) + " mm/100 m per year): the towers at the north-east end sinking faster than the ground",
        "3. Take out the yearly wave (" + m.annual_amp.toFixed(2) + " mm/100 m, peaking around day " + Math.round(m.annual_peak_doy) + "): the buildings expanding in summer",
        "4. What changes from one pass to the next: " + rms.toFixed(2) + " mm/100 m rms, three times the fit noise of " + sigma.toFixed(2) + ", about " + Math.round(ep.summary.fast_as_n_units) + " N-units of air"
      ];
      var player = V.Player.create({
        mount: mount, frames: frames, fps: 24, aspect: function (w) { return w < 600 ? 1.1 : 2; },
        label: function (i) { return titles[Math.min(3, Math.floor(i / PER))]; },
        draw: function (i, ctx, size) {
          var w = size.w, h = size.h, p = pad(size);
          var stage = Math.min(3, Math.floor(i / PER)), f = U.ease(Math.min(1, (i % PER) / (PER * 0.6)));
          var lim = 14;
          var X = A.linear(0, n - 1, p.l, w - p.r), Y = A.linear(-lim, lim, h - p.b, p.t + 8);
          ctx.strokeStyle = css("--line"); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(n - 1), Y(0)); ctx.stroke();
          var xs = s.map(function (_, k) { return X(k); });
          if (stage < 3) {
            var kT = stage === 0 ? 0 : stage === 1 ? f : 1, kA = stage < 2 ? 0 : f;
            var ys = s.map(function (v, k) { return Y(v - kT * trend[k] - kA * annual[k]); });
            if (stage === 1) D.line(ctx, xs, trend.map(function (v, k) { return Y(v * (1 - f)); }), css("--bad"), 1.5);
            if (stage === 2) D.line(ctx, xs, annual.map(function (v, k) { return Y(v * (1 - f)); }), css("--warn"), 1.5);
            D.line(ctx, xs, ys, css("--accent"), 1.2);
          } else {
            /* crossfade resid -> fast */
            ctx.globalAlpha = 1 - f; D.line(ctx, xs, resid.map(function (v) { return Y(v); }), css("--accent"), 1.2);
            ctx.globalAlpha = f;
            ctx.fillStyle = css("--line"); ctx.fillRect(X(0), Y(sigma), X(n - 1) - X(0), Y(-sigma) - Y(sigma));
            ctx.fillStyle = css("--accent-soft"); ctx.fillRect(X(0), Y(rms), X(n - 1) - X(0), Y(-rms) - Y(rms));
            D.line(ctx, xs.slice(1), fast.map(function (v) { return Y(v); }), css("--good"), 1.2);
            ctx.globalAlpha = 1;
            if (f > 0.5) {
              D.text(ctx, "±" + sigma.toFixed(2) + " formal noise of the fit", X(n - 1) - 4, Y(-sigma) + 12, { font: p.f, colour: css("--muted"), align: "right" });
              D.text(ctx, "±" + rms.toFixed(2) + " rms of the 11-day changes ≈ " + Math.round(ep.summary.fast_as_n_units) + " N-units", X(n - 1) - 4, Y(rms) - 6, { font: p.f, colour: css("--good"), align: "right" });
            }
          }
          A.yAxis(ctx, Y, p.l, [-10, -5, 0, 5, 10], "s(t) [mm per 100 m of height]", p.f);
          A.xAxis(ctx, X, h - p.b, A.yearTicks(ep.dates), "", p.f);
          var legend = stage === 1 ? "red: the fitted trend being removed" : stage === 2 ? "orange: the fitted yearly wave being removed" : stage === 3 ? "green: change from pass to pass (the candidate air signal)" : "blue: s(t) as measured, coherence > 0.6";
          D.text(ctx, legend, p.l + 6, p.t + 14, { font: p.f, colour: css("--muted") });
        }
      });
      var stages = document.createElement("span");
      ["s(t)", "minus trend", "minus yearly wave", "pass to pass"].forEach(function (lab, k) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = lab;
        b.addEventListener("click", function () { player.pause(); player.set(k * PER + PER - 1); });
        stages.appendChild(b);
      });
      player.extra.appendChild(stages);
    }).catch(function (e) { V.Player.fallback(mount, "The decomposition animation could not load its data (" + e.message + ")."); });
  }

  /* ================================================================ (d) joint */
  function joint(mount) {
    Promise.all([L.json(DATA + "joint.json"), L.json(DATA + "epochs.json")]).then(function (r) {
      var J = r[0], ep = r[1], which = "full";
      function G() { return J[which]; }
      var player = V.Player.create({
        mount: mount, frames: ep.n_epochs - 1, fps: 8, aspect: function (w) { return w < 600 ? 0.7 : 1.7; },
        label: function (i) {
          var g = G(), fd = g.fit_diff, pred = fd.const + fd.bT * g.dT[i] + fd.bN * g.dN[i];
          return U.fmtDate(ep.dates[i]) + " → " + U.fmtDate(ep.dates[i + 1]) + " · measured change " + (g.ds[i] >= 0 ? "+" : "") + g.ds[i].toFixed(2) + " mm/100 m · the two-term model says " + (isNaN(pred) ? "no sounding" : (pred >= 0 ? "+" : "") + pred.toFixed(2));
        },
        draw: function (i, ctx, size) {
          var w = size.w, h = size.h, p = pad(size), g = G(), fd = g.fit_diff, n = g.ds.length, narrow = w < 600;
          var leftW = narrow ? w : Math.round(w * 0.5), rows = [["ds", "Δ s(t) [mm/100 m]", css("--accent")], ["dT", "Δ building temperature, lag 5 days [K]", css("--bad")], ["dN", "Δ De Bilt layer refractivity [N-units]", css("--good")]];
          var rowH = (narrow ? h * 0.5 : h - p.b) / 3;
          var X = A.linear(0, n - 1, p.l, leftW - 12);
          rows.forEach(function (rw, k) {
            var arr = g[rw[0]], lim = U.pct(arr.map(Math.abs), 99) * 1.1 || 1;
            var y0 = p.t + k * rowH, Y = A.linear(-lim, lim, y0 + rowH - 6, y0 + 12);
            ctx.strokeStyle = css("--line"); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(n - 1), Y(0)); ctx.stroke();
            D.line(ctx, arr.map(function (_, j) { return X(j); }), arr.map(function (v) { return v === null ? NaN : Y(v); }), rw[2], 1);
            if (arr[i] !== null) { ctx.fillStyle = rw[2]; ctx.beginPath(); ctx.arc(X(i), Y(arr[i]), 3.5, 0, 2 * Math.PI); ctx.fill(); }
            cursor(ctx, X(i), y0 + 6, y0 + rowH - 6, css("--muted"));
            D.text(ctx, rw[1], p.l + 4, y0 + 12, { font: p.f, colour: css("--muted") });
            A.yAxis(ctx, Y, p.l, [-Math.round(lim * 10) / 10, 0, Math.round(lim * 10) / 10], "", (size.font - 1) + "px system-ui");
          });
          A.xAxis(ctx, X, narrow ? p.t + 3 * rowH : h - p.b, A.yearTicks(ep.dates).filter(function (t, q) { return (leftW > 700) || q % 2 === 0; }), "", p.f);
          /* scatters */
          var sx0 = narrow ? 0 : leftW, sy0 = narrow ? p.t + 3 * rowH + 26 : p.t, sw = narrow ? w : w - leftW, sh = narrow ? h - sy0 : h - p.t;
          [["dT", "Δ temperature [K]", fd.bT, fd.seT, J.expected.bT, css("--bad")], ["dN", "Δ refractivity [N-units]", fd.bN, fd.seN, J.expected.bN, css("--good")]].forEach(function (sc, k) {
            var x0 = sx0 + k * sw / 2 + 40, x1 = sx0 + (k + 1) * sw / 2 - 10, yTop = sy0 + 12, yBot = sy0 + sh - p.b;
            var arr = g[sc[0]], xl = U.pct(arr.map(Math.abs), 99) * 1.1 || 1, yl = U.pct(g.ds.map(Math.abs), 99) * 1.1;
            var Xs = A.linear(-xl, xl, x0, x1), Ys = A.linear(-yl, yl, yBot, yTop);
            ctx.strokeStyle = css("--line"); ctx.beginPath(); ctx.moveTo(Xs(-xl), Ys(0)); ctx.lineTo(Xs(xl), Ys(0)); ctx.moveTo(Xs(0), Ys(-yl)); ctx.lineTo(Xs(0), Ys(yl)); ctx.stroke();
            ctx.fillStyle = sc[5]; ctx.globalAlpha = 0.55;
            for (var j = 0; j <= i; j++) { if (arr[j] === null) continue; ctx.beginPath(); ctx.arc(Xs(Math.max(-xl, Math.min(xl, arr[j]))), Ys(Math.max(-yl, Math.min(yl, g.ds[j]))), 2.6, 0, 2 * Math.PI); ctx.fill(); }
            ctx.globalAlpha = 1;
            if (arr[i] !== null) { ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(Xs(arr[i]), Ys(g.ds[i]), 6, 0, 2 * Math.PI); ctx.stroke(); ctx.lineWidth = 1; }
            ctx.strokeStyle = sc[5]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(Xs(-xl), Ys(fd.const - sc[2] * xl)); ctx.lineTo(Xs(xl), Ys(fd.const + sc[2] * xl)); ctx.stroke();
            ctx.setLineDash([5, 4]); ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Xs(-xl), Ys(-sc[4] * xl)); ctx.lineTo(Xs(xl), Ys(sc[4] * xl)); ctx.stroke(); ctx.setLineDash([]);
            A.xAxis(ctx, Xs, yBot, A.niceTicks(-xl, xl, 4), sc[1], (size.font - 1) + "px system-ui");
            A.yAxis(ctx, Ys, x0, A.niceTicks(-yl, yl, 4), k === 0 ? "Δ s(t) [mm/100 m]" : "", (size.font - 1) + "px system-ui");
            D.text(ctx, "fitted " + sc[2].toFixed(3) + " ± " + sc[3].toFixed(3), x0 + 6, yTop + 12, { font: (size.font - 1) + "px system-ui", colour: sc[5] });
            D.text(ctx, "dashed: physics if all of it, " + sc[4].toFixed(3), x0 + 6, yTop + 26, { font: (size.font - 1) + "px system-ui", colour: css("--muted") });
          });
          D.text(ctx, "joint fit: R² " + fd.r2.toFixed(2) + ", VIF " + fd.vif_T.toFixed(2) + " (the two explanations are barely tangled)", sx0 + 44, sy0 + 54, { font: (size.font - 1) + "px system-ui", colour: css("--muted") });
        }
      });
      player.addToggle("Scene:", "which", [{ value: "full", label: "whole scene", checked: true }, { value: "SW", label: "south-west half only (no sinking towers)" }], function (v) { which = v; });
    }).catch(function (e) { V.Player.fallback(mount, "The buildings-versus-air animation could not load its data (" + e.message + ")."); });
  }

  /* ================================================================ (e) year clock */
  function yearclock(mount) {
    L.json(DATA + "yearclock.json").then(function (Y) {
      var showFeet = false, doy = Y.doy;
      var series = [
        { key: "open_ground", label: "open ground (> 30 m from a tower)", colour: css("--accent") },
        { key: "buildings_gt_40m", label: "buildings above 40 m", colour: css("--bad") },
        { key: "tower_feet", label: "ground at the towers' feet (< 30 m)", colour: css("--warn"), optional: true }
      ];
      var mmLim = 4;
      function ang(d) { return (d / 365.25) * 2 * Math.PI - Math.PI / 2; }
      V.Player.create({
        mount: mount, frames: 366, fps: 30, aspect: function () { return 1; },
        label: function (i) {
          var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          var d = new Date(2001, 0, 1 + Math.min(364, i)), extra = i >= 364 ? " · full year: buildings peak on day " + Math.round(Y.groups.buildings_gt_40m.annual.peak_doy) + ", the open ground on day " + Math.round(Y.groups.open_ground.annual.peak_doy) : "";
          return "day " + (Math.min(365, i + 1)) + ", " + d.getDate() + " " + months[d.getMonth()] + extra;
        },
        draw: function (i, ctx, size) {
          var w = size.w, h = size.h, cx = w / 2, cy = h / 2 + 8, R = Math.min(w, h) / 2 - 36, r0 = R * 0.55;
          function rad(v) { return r0 + (v / mmLim) * (R - r0) * 0.95; }
          var day = Math.min(365, i + 1);
          /* rings */
          ctx.strokeStyle = css("--line"); ctx.setLineDash([2, 4]);
          [-3, -2, -1, 1, 2, 3].forEach(function (v) { ctx.beginPath(); ctx.arc(cx, cy, rad(v), 0, 2 * Math.PI); ctx.stroke(); });
          ctx.setLineDash([]); ctx.beginPath(); ctx.arc(cx, cy, rad(0), 0, 2 * Math.PI); ctx.strokeStyle = css("--muted"); ctx.stroke();
          /* month spokes */
          var names = "JFMAMJJASOND";
          for (var mth = 0; mth < 12; mth++) {
            var a = ang(mth * 365.25 / 12), a2 = ang((mth + 0.5) * 365.25 / 12);
            ctx.strokeStyle = css("--line"); ctx.beginPath(); ctx.moveTo(cx + r0 * 0.3 * Math.cos(a), cy + r0 * 0.3 * Math.sin(a)); ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); ctx.stroke();
            D.text(ctx, names[mth], cx + (R + 14) * Math.cos(a2), cy + (R + 14) * Math.sin(a2), { font: size.font + "px system-ui", colour: css("--muted"), align: "center", baseline: "middle" });
          }
          D.text(ctx, "+" + mmLim.toFixed(0) + " mm", cx + 4, cy - rad(mmLim) - 4, { font: (size.font - 2) + "px system-ui", colour: css("--muted") });
          D.text(ctx, "0", cx + 4, cy - rad(0) - 4, { font: (size.font - 2) + "px system-ui", colour: css("--muted") });
          D.text(ctx, "towards the satellite ↑", cx + 4, cy - rad(1.5), { font: (size.font - 2) + "px system-ui", colour: css("--muted") });
          /* markers */
          [[28, "day 28: mirror of the buildings"], [45, "day 45: open ground peak"], [205, "day 205: air temperature peak"], [210, "day 210: buildings peak"]].forEach(function (mk) {
            var a = ang(mk[0]); ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + (R - 6) * Math.cos(a), cy + (R - 6) * Math.sin(a)); ctx.lineTo(cx + (R + 4) * Math.cos(a), cy + (R + 4) * Math.sin(a)); ctx.stroke();
          });
          /* series: per-epoch dots up to the current day, and the monthly climatology as a smooth trace */
          series.forEach(function (sr) {
            if (sr.optional && !showFeet) return;
            var g = Y.groups[sr.key];
            ctx.fillStyle = sr.colour; ctx.globalAlpha = 0.35;
            g.per_epoch.forEach(function (v, k) {
              if (doy[k] > day) return;
              var a = ang(doy[k]), rr = rad(Math.max(-mmLim, Math.min(mmLim, v)));
              ctx.beginPath(); ctx.arc(cx + rr * Math.cos(a), cy + rr * Math.sin(a), 2.2, 0, 2 * Math.PI); ctx.fill();
            });
            ctx.globalAlpha = 1;
            /* climatology: interpolate monthly means around the circle up to today */
            ctx.strokeStyle = sr.colour; ctx.lineWidth = 2.2; ctx.beginPath();
            var started = false;
            for (var d = 1; d <= day; d += 2) {
              var mpos = (d - 15.2) / 30.44, k0 = Math.floor(mpos), fr = mpos - k0;
              var v0 = g.monthly[((k0 % 12) + 12) % 12], v1 = g.monthly[(((k0 + 1) % 12) + 12) % 12];
              var v = v0 + (v1 - v0) * fr, a = ang(d), rr = rad(v);
              if (!started) { ctx.moveTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); started = true; } else ctx.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
            }
            ctx.stroke(); ctx.lineWidth = 1;
          });
          /* air temperature as a thin grey trace on its own scale (inner ring) */
          var air = Y.air.monthly, tmin = Math.min.apply(null, air), tmax = Math.max.apply(null, air);
          ctx.strokeStyle = css("--muted"); ctx.setLineDash([3, 3]); ctx.beginPath(); var st2 = false;
          for (var d2 = 1; d2 <= day; d2 += 2) {
            var mp = (d2 - 15.2) / 30.44, kk = Math.floor(mp), ff = mp - kk;
            var t0 = air[((kk % 12) + 12) % 12], t1 = air[(((kk + 1) % 12) + 12) % 12], tv = t0 + (t1 - t0) * ff;
            var rr2 = r0 * 0.35 + (tv - tmin) / (tmax - tmin) * r0 * 0.55, aa = ang(d2);
            if (!st2) { ctx.moveTo(cx + rr2 * Math.cos(aa), cy + rr2 * Math.sin(aa)); st2 = true; } else ctx.lineTo(cx + rr2 * Math.cos(aa), cy + rr2 * Math.sin(aa));
          }
          ctx.stroke(); ctx.setLineDash([]);
          /* hand */
          var ah = ang(day); ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(ah), cy + R * Math.sin(ah)); ctx.stroke(); ctx.lineWidth = 1;
          /* legend */
          var ly = h - 6 - (showFeet ? 4 : 3) * 15;
          series.forEach(function (sr) {
            if (sr.optional && !showFeet) return;
            var g = Y.groups[sr.key];
            ctx.fillStyle = sr.colour; ctx.fillRect(10, ly - 8, 10, 10);
            D.text(ctx, sr.label + ": n = " + g.n + ", " + g.annual.amp.toFixed(2) + " mm peaking day " + Math.round(g.annual.peak_doy), 26, ly, { font: (size.font - 1) + "px system-ui", colour: css("--muted") });
            ly += 15;
          });
          D.text(ctx, "dotted grey, inner: air temperature (KNMI 344 monthly mean, " + tmin.toFixed(0) + " to " + tmax.toFixed(0) + " °C)", 10, ly, { font: (size.font - 1) + "px system-ui", colour: css("--muted") });
          D.text(ctx, "dots: one pass each, mean of the group after removing offset, trend and curvature per point; line: monthly mean", 10, 14, { font: (size.font - 1) + "px system-ui", colour: css("--muted") });
        }
      }).addCheck("also show the ground at the towers' feet", false, function (v) { showFeet = v; });
    }).catch(function (e) { V.Player.fallback(mount, "The year-clock animation could not load its data (" + e.message + ")."); });
  }

  /* ================================================================ (f) virtual balloon */
  function balloon(mount) {
    Promise.all([L.json(DATA + "profile.json"), L.json(DATA + "epochs.json")]).then(function (r) {
      var P = r[0], ep = r[1], SUB = 12, nStep = P.s_fast.length, frames = nStep * SUB;
      var centres = P.bins.centres, se = P.bins.se_mm, ns = P.bins.n, prof = P.prof_fast, slope = P.fit_line_slope_fast, db = P.debilt.dlos11_mm_per_100m;
      var xl = 4, top = 83;
      V.Player.create({
        mount: mount, frames: frames, fps: 24, aspect: function (w) { return w < 600 ? 0.8 : 1.8; },
        label: function (i) {
          var k = Math.floor(i / SUB), s = slope[k], nu = s * COS23 * 10;
          return U.fmtDate(ep.dates[k]) + " → " + U.fmtDate(ep.dates[k + 1]) + " · layer gradient " + (s >= 0 ? "+" : "") + s.toFixed(2) + " mm/100 m ≈ " + (nu >= 0 ? "+" : "") + nu.toFixed(0) + " N-units" + (db[k] === null ? "" : " · De Bilt would say " + (db[k] >= 0 ? "+" : "") + db[k].toFixed(2));
        },
        draw: function (i, ctx, size) {
          var w = size.w, h = size.h, p = pad(size), k = Math.floor(i / SUB), sub = i % SUB, narrow = w < 600;
          var leftW = narrow ? w : Math.round(w * 0.42);
          var X = A.linear(-xl, xl, p.l + 10, leftW - 20), Yh = A.linear(-2, 90, (narrow ? h * 0.55 : h) - p.b, p.t + 10);
          ctx.strokeStyle = css("--line"); ctx.beginPath(); ctx.moveTo(X(0), Yh(-2)); ctx.lineTo(X(0), Yh(90)); ctx.stroke();
          ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(-xl), Yh(top)); ctx.lineTo(X(xl), Yh(top)); ctx.stroke(); ctx.setLineDash([]);
          D.text(ctx, "83 m: the highest radar point", X(-xl) + 4, Yh(top) - 4, { font: (size.font - 1) + "px system-ui", colour: css("--muted") });
          var hb = centres[0] + U.ease(sub / (SUB - 1)) * (top - centres[0]);
          /* fitted line through the lowest bin */
          var s = slope[k] / 100;
          ctx.strokeStyle = css("--bad"); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(0), Yh(centres[0])); ctx.lineTo(X(s * (hb - centres[0])), Yh(hb)); ctx.stroke(); ctx.lineWidth = 1;
          if (db[k] !== null) { var sd = db[k] / 100; ctx.setLineDash([5, 4]); ctx.strokeStyle = css("--ink"); ctx.beginPath(); ctx.moveTo(X(0), Yh(centres[0])); ctx.lineTo(X(sd * (hb - centres[0])), Yh(hb)); ctx.stroke(); ctx.setLineDash([]); }
          /* dots dropped so far */
          centres.forEach(function (c, b) {
            if (c > hb + 0.01) return;
            var v = prof[b][k], e = se[b] * Math.SQRT2;
            ctx.strokeStyle = css("--accent"); ctx.beginPath(); ctx.moveTo(X(v - e), Yh(c)); ctx.lineTo(X(v + e), Yh(c)); ctx.stroke();
            ctx.fillStyle = css("--accent"); ctx.beginPath(); ctx.arc(X(Math.max(-xl, Math.min(xl, v))), Yh(c), 4, 0, 2 * Math.PI); ctx.fill();
            D.text(ctx, "n=" + ns[b], leftW - 16, Yh(c), { font: (size.font - 2) + "px system-ui", colour: css("--muted"), align: "right", baseline: "middle" });
          });
          /* the balloon */
          var bx = X(0) - 30, by = Yh(hb);
          ctx.strokeStyle = css("--muted"); ctx.beginPath(); ctx.moveTo(bx, Yh(-2)); ctx.lineTo(bx, by + 12); ctx.stroke();
          ctx.fillStyle = css("--warn"); ctx.beginPath(); ctx.ellipse(bx, by, 9, 11, 0, 0, 2 * Math.PI); ctx.fill();
          ctx.fillStyle = css("--ink"); ctx.fillRect(bx - 3, by + 12, 6, 5);
          A.xAxis(ctx, X, (narrow ? h * 0.55 : h) - p.b, [-4, -2, 0, 2, 4], "11-day change relative to the lowest bin [mm]", p.f);
          A.yAxis(ctx, Yh, p.l + 10, [0, 20, 40, 60, 80], "height above ground [m]", p.f);
          D.text(ctx, "red: fitted line, slope = layer gradient; dashed: De Bilt", p.l + 16, p.t + 12, { font: (size.font - 1) + "px system-ui", colour: css("--muted") });
          /* right: s_fast series */
          var rx0 = narrow ? p.l : leftW + 30, ry0 = narrow ? h * 0.55 + 10 : p.t + 10, ry1 = h - p.b;
          var X2 = A.linear(0, nStep - 1, rx0, w - p.r), yl = 6, Y2 = A.linear(-yl, yl, ry1, ry0);
          ctx.strokeStyle = css("--line"); ctx.beginPath(); ctx.moveTo(X2(0), Y2(0)); ctx.lineTo(X2(nStep - 1), Y2(0)); ctx.stroke();
          D.line(ctx, db.map(function (_, j) { return X2(j); }), db.map(function (v) { return v === null ? NaN : Y2(Math.max(-yl, Math.min(yl, v))); }), css("--muted"), 0.8);
          D.line(ctx, slope.map(function (_, j) { return X2(j); }), slope.map(function (v) { return Y2(Math.max(-yl, Math.min(yl, v))); }), css("--bad"), 1);
          cursor(ctx, X2(k), ry0, ry1);
          ctx.fillStyle = css("--bad"); ctx.beginPath(); ctx.arc(X2(k), Y2(Math.max(-yl, Math.min(yl, slope[k]))), 4, 0, 2 * Math.PI); ctx.fill();
          A.yAxis(ctx, Y2, rx0, [-6, -3, 0, 3, 6], "layer gradient per 11 days [mm/100 m]", p.f);
          A.xAxis(ctx, X2, ry1, A.yearTicks(ep.dates), "", p.f);
          D.text(ctx, "red: from the radar points; grey: De Bilt sounding, interpolated below 650 m", rx0 + 6, ry0 + 12, { font: (size.font - 1) + "px system-ui", colour: css("--muted") });
        }
      });
    }).catch(function (e) { V.Player.fallback(mount, "The balloon animation could not load its data (" + e.message + ")."); });
  }

  var builders = { scene: scene, bands: bands, decomp: decomp, joint: joint, yearclock: yearclock, balloon: balloon };
  document.querySelectorAll("[data-anim]").forEach(function (el) {
    var b = builders[el.getAttribute("data-anim")];
    if (b) b(el); else V.Player.fallback(el, "Unknown animation.");
  });
})();
