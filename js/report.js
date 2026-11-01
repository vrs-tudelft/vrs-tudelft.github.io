/* One report result source for Home, Estimation, Results and the existing simulator. */
(function () {
  "use strict";
  var promise;
  function load() {
    if (!promise) promise = fetch("data/simulator/real.json").then(function (r) {
      if (!r.ok) throw new Error("Report data: HTTP " + r.status);
      return r.json();
    }).then(function (d) {
      if (d.version !== 2 || d.code.uncommitted_changes) throw new Error("Report export is not pinned to clean source");
      return d;
    });
    return promise;
  }
  function fmt(n, digits) { return Number(n).toLocaleString("en-GB", { maximumFractionDigits: digits === undefined ? 2 : digits }); }
  function summary(d) {
    var e = d.results.building.none["2"];
    return '<p><b>The report run:</b> ' + fmt(d.passes, 0) + ' passes, ' + fmt(e.points_used, 0) + ' points on ' + e.buildings + ' buildings. ' +
      'Layer edges: ' + e.edges.map(function (v) { return fmt(v, 1); }).join(" / ") + ' m NAP. Building temperature uses a 72 h exponential memory of hourly weather.</p>' +
      '<div class="tbl"><table><caption>Radar only, motion fitted per building, no air prior</caption><thead><tr><th>Layer (m NAP)</th><th>Station r</th><th>r without annual cycle</th><th>RMS difference (N)</th></tr></thead><tbody>' +
      e.station_r.map(function (r, k) { return '<tr><td>' + fmt(e.edges[k], 1) + ' to ' + fmt(e.edges[k + 1], 1) + '</td><td>' + fmt(r.r) + '</td><td>' + fmt(r.r_no_annual) + '</td><td>' + fmt(e.rmse[k]) + '</td></tr>'; }).join("") +
      '</tbody></table></div><p class="asof">The comparison is with ground-station N carried upward, not a measured urban air profile. Agreement is not independent vertical accuracy. <a href="results.html">Inspect the run</a>.</p>';
  }
  function labelTables(root) {
    root.querySelectorAll("table").forEach(function (table) {
      var labels = Array.from(table.querySelectorAll("thead th")).map(function (th) { return th.textContent; });
      table.querySelectorAll("tbody tr").forEach(function (row) {
        Array.from(row.children).forEach(function (cell, i) { cell.setAttribute("data-label", labels[i]); });
      });
    });
  }
  window.VRSReport = { load: load, fmt: fmt, summary: summary, labelTables: labelTables };
  var targets = document.querySelectorAll("[data-report-summary]");
  if (targets.length) load().then(function (d) { targets.forEach(function (el) { el.innerHTML = summary(d); labelTables(el); }); }).catch(function (err) {
    targets.forEach(function (el) { el.textContent = "Report results could not be loaded: " + err.message; });
  });
}());
