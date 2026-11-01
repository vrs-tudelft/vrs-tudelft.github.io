/* Report variants and per-pass aggregate plots, all read through the shared report source. */
(function () {
  "use strict";
  var form = document.getElementById("report-controls"), doc;
  if (!form) return;
  var fmt = window.VRSReport.fmt;
  function id(name) { return document.getElementById("report-" + name); }
  function esc(s) { return String(s).replace(/[&<>\"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function selected() { return doc.results[form.elements.motion.value][form.elements.prior.value][form.elements.layers.value]; }
  function plot(x, y, station, scatter) {
    var w = 720, h = 290, left = 58, right = 20, top = 20, bottom = 44;
    var values = y.concat(station).filter(Number.isFinite), lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    var pad = (hi - lo || 1) * 0.08; lo -= pad; hi += pad;
    var xmin = scatter ? lo : Date.parse(x[0]), xmax = scatter ? hi : Date.parse(x[x.length - 1]);
    function px(v) { return left + (v - xmin) / (xmax - xmin || 1) * (w - left - right); }
    function py(v) { return h - bottom - (v - lo) / (hi - lo) * (h - top - bottom); }
    var body = '<rect width="720" height="290" fill="#fcfbf8"/>';
    for (var t = 0; t <= 4; t++) {
      var n = lo + (hi - lo) * t / 4, yy = py(n);
      body += '<path d="M58 ' + yy + 'H700" stroke="#e5e3db"/><text x="50" y="' + (yy + 4) + '" text-anchor="end" font-size="12">' + fmt(n, 0) + '</text>';
      if (scatter) body += '<text x="' + px(n) + '" y="266" text-anchor="middle" font-size="12">' + fmt(n, 0) + '</text>';
    }
    if (scatter) {
      body += '<path d="M' + px(lo) + ' ' + py(lo) + 'L' + px(hi) + ' ' + py(hi) + '" stroke="#a9a9a9" stroke-dasharray="4 4"/>';
      y.forEach(function (v, i) { if (Number.isFinite(v) && Number.isFinite(station[i])) body += '<circle cx="' + px(station[i]) + '" cy="' + py(v) + '" r="3" fill="#15688f" opacity=".6"><title>' + esc(x[i]) + ': station ' + fmt(station[i]) + ', radar ' + fmt(v) + ' N</title></circle>'; });
    } else {
      [station, y].forEach(function (a, j) {
        var d = "", pen = false;
        a.forEach(function (v, i) { if (!Number.isFinite(v)) { pen = false; return; } d += (pen ? "L" : "M") + px(Date.parse(x[i])) + " " + py(v); pen = true; });
        body += '<path d="' + d + '" fill="none" stroke="' + (j ? '#15688f' : '#8a8f96') + '" stroke-width="1.5"/>';
      });
      body += '<text x="58" y="266" font-size="12">' + esc(x[0]) + '</text><text x="700" y="266" font-size="12" text-anchor="end">' + esc(x[x.length - 1]) + '</text>';
    }
    body += '<text x="15" y="150" transform="rotate(-90 15 150)" font-size="12" text-anchor="middle">Radar N anomaly (N)</text>';
    if (scatter) body += '<text x="380" y="286" font-size="12" text-anchor="middle">Station-based N anomaly (N)</text>';
    return '<svg viewBox="0 0 720 290" width="100%" role="img" aria-label="' + (scatter ? 'Radar against station-based N anomalies, one dot per pass' : 'Radar and station-based N anomalies over satellite passes') + '" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">' + body + '</svg>';
  }
  function render(resetLayer) {
    var e = selected();
    if (e.error) { id("status").textContent = e.error; return; }
    if (resetLayer) {
      form.elements.layer.innerHTML = e.layer_points.map(function (l, k) { return '<option value="' + k + '">' + fmt(e.edges[k], 1) + ' to ' + fmt(e.edges[k + 1], 1) + ' m NAP</option>'; }).join("");
    }
    var k = +form.elements.layer.value || 0;
    id("metrics").innerHTML = '<p><b>' + fmt(e.points_used, 0) + ' points on ' + e.buildings + ' buildings; ' + doc.passes + ' passes.</b> Median fitted expansion: ' + fmt(e.alpha_median_per_K * 1e6) + ' × 10<sup>−6</sup>/K.</p>' +
      '<table><thead><tr><th>Layer (m NAP)</th><th>Points</th><th>Station r</th><th>r without annual cycle</th><th>RMS difference (N)</th><th>Skill vs constant air</th></tr></thead><tbody>' +
      e.layer_points.map(function (l, i) { return '<tr><td>' + fmt(e.edges[i], 1) + ' to ' + fmt(e.edges[i + 1], 1) + '</td><td>' + fmt(l.n, 0) + '</td><td>' + fmt(e.station_r[i].r) + '</td><td>' + fmt(e.station_r[i].r_no_annual) + '</td><td>' + fmt(e.rmse[i]) + '</td><td>' + fmt(e.skill[i]) + '</td></tr>'; }).join("") + '</tbody></table>';
    id("time").innerHTML = plot(doc.epochs, e.steps.est_anomaly[k], e.steps.truth_anomaly[k], false);
    id("scatter").innerHTML = plot(doc.epochs, e.steps.est_anomaly[k], e.steps.truth_anomaly[k], true);
    id("reading").textContent = (form.elements.prior.value === "ground" ? "This variant uses the station-based air prior: station agreement is partly built into the fit. " : "This fit has no station-based air prior. ") +
      "Skill compares RMS difference against predicting constant air using the same station-based proxy; negative skill means that constant prediction has a smaller RMS difference. It does not measure independently validated urban retrieval skill.";
    id("source").textContent = 'Source: data/simulator/real.json, generated ' + doc.generated + ', committed analysis ' + doc.code.virtual_radiosonde.slice(0, 12) + '. Temperature memory: 72 h. All sixteen variants reproduced from committed source.';
    id("status").textContent = doc.first + ' to ' + doc.last + '; aggregates only. Selected layer shown in both plots.';
    id("content").hidden = false;
  }
  form.addEventListener("change", function (event) { if (doc) render(event.target.name !== "layer"); });
  window.VRSReport.load().then(function (data) { doc = data; render(true); }).catch(function (err) { id("status").textContent = 'Report results could not be loaded: ' + err.message; });
}());
