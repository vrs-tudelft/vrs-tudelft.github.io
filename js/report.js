/* One report result source for Home, Estimation, Results and the existing simulator. */
(function () {
  "use strict";
  var promise;
  function load() {
    if (!promise) promise = fetch("data/simulator/real.json", {cache:"no-cache"}).then(function (r) {
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
    return '<p>Per building · two layers · no air prior ' + help('Report default','The 72 h exponential memory of hourly KNMI temperature drives the fitted thermal response. The selected 10,324 points on 12 buildings span 213 passes.') + '</p>' +
      '<div class="tbl"><table><caption>Radar only, motion fitted per building, no air prior</caption><thead><tr><th>Layer (m NAP)</th><th>Station r</th><th>r without annual cycle</th><th>RMS difference (N)</th></tr></thead><tbody>' +
      e.station_r.map(function (r, k) { return '<tr><td>' + fmt(e.edges[k], 1) + ' to ' + fmt(e.edges[k + 1], 1) + '</td><td>' + fmt(r.r) + '</td><td>' + fmt(r.r_no_annual) + '</td><td>' + fmt(e.rmse[k]) + '</td></tr>'; }).join("") +
      '</tbody></table></div><p class="site-small">Station-based comparison; vertical accuracy is unverified.</p>';
  }
  function help(label,text) { return '<button type="button" class="t i tip-trigger" aria-label="About '+label+'" data-tip="'+text.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"><span class="info" aria-hidden="true">i</span></button>'; }
  function labelTables(root) {
    root.querySelectorAll("table").forEach(function (table) {
      var labels = Array.from(table.querySelectorAll("thead th")).map(function (th) { return th.textContent; });
      table.querySelectorAll("tbody tr").forEach(function (row) {
        Array.from(row.children).forEach(function (cell, i) { cell.setAttribute("data-label", labels[i]); });
      });
    });
  }
  window.VRSReport = { load: load, fmt: fmt, summary: summary, labelTables: labelTables, help: help };
  var targets = document.querySelectorAll("[data-report-summary]");
  var values = document.querySelectorAll('[data-report-value]');
  if (targets.length || values.length) load().then(function (d) {
    targets.forEach(function (el) { el.innerHTML = summary(d); labelTables(el); });
    var e=d.results.building.none['2'];var fields={passes:d.passes,points:e.points_used,buildings:e.buildings,r:e.station_r[0].r,r_no_annual:e.station_r[0].r_no_annual,edge0:e.edges[0],edge1:e.edges[1],edge2:e.edges[2]};
    values.forEach(function(el){el.textContent=fmt(fields[el.dataset.reportValue]);});
  }).catch(function (err) {
    targets.forEach(function (el) { el.textContent = "Report results could not be loaded: " + err.message; });
    values.forEach(function(el){el.textContent='Unavailable';});
  });
}());
