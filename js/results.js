/* Report variants and per-pass aggregate plots, all read through the shared report source. */
(function () {
  "use strict";
  var form = document.getElementById("report-controls"), doc, metricPage=0, timeAxis=null;
  /* the selected pass, shared with the 3D map (event vrs:pass); 0, the first pass, until one is chosen */
  function pass(){ return Number.isInteger(window.VRSPass) ? window.VRSPass : 0; }
  function choose(i){ window.VRSPass=i; document.dispatchEvent(new CustomEvent("vrs:pass",{detail:{index:i,from:"report"}})); }
  if (!form) return;
  var fmt = window.VRSReport.fmt;
  function id(name) { return document.getElementById("report-" + name); }
  function esc(s) { return String(s).replace(/[&<>\"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function selected() { return doc.results[form.elements.motion.value][form.elements.prior.value][form.elements.layers.value]; }
  /* one layer, or the whole column: the thickness-weighted mean of the layers on every pass (the report's own
     column, the same as its column RMS), with r, the RMS difference and the skill against constant air computed
     as the report computes them per layer */
  function seriesOf(e, kv) {
    if (kv !== "col") {
      var k = +kv || 0;
      return { est: e.steps.est_anomaly[k], tru: e.steps.truth_anomaly[k], r: e.station_r[k].r, rmse: e.rmse[k], skill: e.skill[k],
        label: fmt(e.edges[k], 1) + "–" + fmt(e.edges[k + 1], 1) + " m NAP", n: e.layer_points[k].n, rNoAnnual: e.station_r[k].r_no_annual };
    }
    var w = e.edges.slice(1).map(function (z, k) { return z - e.edges[k]; }), W = w.reduce(function (a, b) { return a + b; }, 0);
    var mean = function (rows) { return rows[0].map(function (_, j) { var s = 0, ww = 0; rows.forEach(function (r, k) { if (Number.isFinite(r[j])) { s += r[j] * w[k]; ww += w[k]; } }); return ww ? s / ww : NaN; }); };
    var est = mean(e.steps.est_anomaly), tru = mean(e.steps.truth_anomaly), a = [], b = [];
    est.forEach(function (v, j) { if (Number.isFinite(v) && Number.isFinite(tru[j])) { a.push(v); b.push(tru[j]); } });
    var n = a.length, ma = a.reduce(function (x, y) { return x + y; }, 0) / n, mb = b.reduce(function (x, y) { return x + y; }, 0) / n, sab = 0, saa = 0, sbb = 0, mse = 0;
    a.forEach(function (v, i) { sab += (v - ma) * (b[i] - mb); saa += (v - ma) * (v - ma); sbb += (b[i] - mb) * (b[i] - mb); mse += (v - b[i]) * (v - b[i]); });
    mse /= n;
    return { est: est, tru: tru, r: sab / Math.sqrt(saa * sbb), rmse: Math.sqrt(mse), skill: 1 - mse / (sbb / n),
      label: "whole column, " + fmt(e.edges[0], 1) + "–" + fmt(e.edges[e.edges.length - 1], 1) + " m NAP", n: e.points_used, rNoAnnual: null };
  }
  function renderMetrics(e) {
    var size=6,total=e.layer_points.length;
    metricPage=Math.max(0,Math.min(Math.ceil(total/size)-1,metricPage));
    var start=metricPage*size;
    id('metrics').innerHTML='<p><b>'+fmt(e.points_used,0)+' points on '+e.buildings+' buildings; '+doc.passes+' passes.</b> Median fitted expansion: '+fmt(e.alpha_median_per_K*1e6)+' × 10<sup>−6</sup>/K.</p>'+
      '<table><thead><tr><th>Layer (m NAP)</th><th>Points</th><th>Station r</th><th>r without annual cycle</th><th>RMS difference (N)</th><th>Skill vs constant air</th></tr></thead><tbody>'+
      e.layer_points.slice(start,start+size).map(function(l,j){var i=start+j;return '<tr data-layer-index="'+i+'"><td>'+fmt(e.edges[i],1)+' to '+fmt(e.edges[i+1],1)+'</td><td>'+fmt(l.n,0)+'</td><td>'+fmt(e.station_r[i].r)+'</td><td>'+fmt(e.station_r[i].r_no_annual)+'</td><td>'+fmt(e.rmse[i])+'</td><td>'+fmt(e.skill[i])+'</td></tr>';}).join('')+'</tbody></table>'+
      (total>size?'<div class="report-pages"><span>Layers '+(start+1)+'–'+Math.min(start+size,total)+' of '+total+'</span><button type="button" data-metric-page="-1" aria-label="Previous layers" '+(start===0?'disabled':'')+'>←</button><button type="button" data-metric-page="1" aria-label="Next layers" '+(start+size>=total?'disabled':'')+'>→</button></div>':'');
    window.VRSReport.labelTables(id('metrics'));
  }
  function plot(x, y, station, scatter) {
    var box=id(scatter?'scatter':'time');
    var w = Math.max(280, box.clientWidth || 720), h = Math.max(140,Math.min(650,box.clientHeight||290)), left = 58, right = 20, top = 20, bottom = 44;
    var values = y.concat(station).filter(Number.isFinite), lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    var pad = (hi - lo || 1) * 0.08; lo -= pad; hi += pad;
    var xmin = scatter ? lo : Date.parse(x[0]), xmax = scatter ? hi : Date.parse(x[x.length - 1]);
    function px(v) { return left + (v - xmin) / (xmax - xmin || 1) * (w - left - right); }
    function py(v) { return h - bottom - (v - lo) / (hi - lo) * (h - top - bottom); }
    var body = '<rect width="' + w + '" height="'+h+'" fill="#fcfbf8"/>';
    for (var t = 0; t <= 4; t++) {
      var n = lo + (hi - lo) * t / 4, yy = py(n);
      body += '<path d="M58 ' + yy + 'H' + (w - right) + '" stroke="#e5e3db"/><text x="50" y="' + (yy + 4) + '" text-anchor="end" font-size="12">' + fmt(n, 0) + '</text>';
      if (scatter) body += '<text x="' + px(n) + '" y="'+(h-24)+'" text-anchor="middle" font-size="12">' + fmt(n, 0) + '</text>';
    }
    if (scatter) {
      body += '<path d="M' + px(lo) + ' ' + py(lo) + 'L' + px(hi) + ' ' + py(hi) + '" stroke="#a9a9a9" stroke-dasharray="4 4"/>';
      y.forEach(function (v, i) { if (Number.isFinite(v) && Number.isFinite(station[i])) body += '<circle data-pass="' + i + '" cx="' + px(station[i]) + '" cy="' + py(v) + '" r="4" fill="#15688f" opacity=".6" style="cursor:pointer"><title>' + esc(x[i]) + ': station ' + fmt(station[i]) + ', radar ' + fmt(v) + ' N</title></circle>'; });
      var s = pass();
      if (Number.isFinite(y[s]) && Number.isFinite(station[s])) body += '<circle cx="' + px(station[s]) + '" cy="' + py(y[s]) + '" r="7.5" fill="#d1662b" stroke="#fff" stroke-width="2" pointer-events="none"/><text x="' + (px(station[s]) + 11) + '" y="' + (py(y[s]) - 9) + '" font-size="12" font-weight="600" fill="#b5541f">' + esc(x[s]) + '</text>';
    } else {
      [station, y].forEach(function (a, j) {
        var d = "", pen = false;
        a.forEach(function (v, i) { if (!Number.isFinite(v)) { pen = false; return; } d += (pen ? "L" : "M") + px(Date.parse(x[i])) + " " + py(v); pen = true; });
        body += '<path d="' + d + '" fill="none" stroke="' + (j ? '#15688f' : '#8a8f96') + '" stroke-width="1.5"/>';
      });
      body += '<text x="58" y="'+(h-24)+'" font-size="12">' + esc(x[0]) + '</text><text x="' + (w - right) + '" y="'+(h-24)+'" font-size="12" text-anchor="end">' + esc(x[x.length - 1]) + '</text>';
      var s = pass(), sx = px(Date.parse(x[s]));
      body += '<path d="M' + sx + ' ' + top + 'V' + (h - bottom) + '" stroke="#d1662b" stroke-width="1.5"/>' +
        [station, y].map(function (a, j) { return Number.isFinite(a[s]) ? '<circle cx="' + sx + '" cy="' + py(a[s]) + '" r="5" fill="' + (j ? '#15688f' : '#8a8f96') + '" stroke="#fff" stroke-width="1.5"/>' : ''; }).join('') +
        '<text x="' + Math.min(sx + 6, w - right - 70) + '" y="' + (top + 12) + '" font-size="12" font-weight="600" fill="#b5541f">' + esc(x[s]) + '</text>' +
        '<rect x="' + left + '" y="' + top + '" width="' + (w - left - right) + '" height="' + (h - top - bottom) + '" fill="transparent" style="cursor:pointer"/>';
      timeAxis = { w: w, left: left, right: right, xmin: xmin, xmax: xmax };
    }
    var middle=(top+h-bottom)/2;
    body += '<text x="15" y="'+middle+'" transform="rotate(-90 15 '+middle+')" font-size="12" text-anchor="middle">Radar N anomaly (N)</text>';
    if (scatter) body += '<text x="' + ((left + w - right) / 2) + '" y="'+(h-4)+'" font-size="12" text-anchor="middle">Station-based N anomaly (N)</text>';
    return '<svg viewBox="0 0 ' + w + ' '+h+'" width="100%" role="img" aria-label="' + (scatter ? 'Radar against station-based N anomalies, one dot per pass' : 'Radar and station-based N anomalies over satellite passes') + '" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">' + body + '</svg>';
  }
  function render(resetLayer) {
    var e = selected();
    if (e.error) { id("status").textContent = e.error; return; }
    if (resetLayer) {
      metricPage=0;
      var kept = form.elements.layer && form.elements.layer.value;
      id("layer-seg").innerHTML = '<option value="col">All</option>' + e.layer_points.map(function (l, k) { return '<option value="' + k + '">' + fmt(e.edges[k], 1) + ' to ' + fmt(e.edges[k + 1], 1) + ' m NAP</option>'; }).join("");
      form.elements.layer.value = kept && (kept === "col" || +kept < e.layer_points.length) && !resetLayer ? kept : "col";
    }
    var kv = form.elements.layer.value || "col", S = seriesOf(e, kv);
    id("content").hidden = false;
    if(id('layer-summary'))id('layer-summary').innerHTML='<b>'+S.label+'</b> · '+fmt(S.n,0)+' points'+(S.rNoAnnual===null?'':' · r without annual cycle '+fmt(S.rNoAnnual));
    renderMetrics(e);
    drawPlots(e, kv);
    id("reading").dataset.tip = (form.elements.prior.value === "ground" ? "This variant uses the station-based air prior: station agreement is partly built into the fit. " : "This fit has no station-based air prior. ") +
      "Skill compares RMS difference against predicting constant air using the same station-based proxy; negative skill means that constant prediction has a smaller RMS difference. It does not measure independently validated urban retrieval skill.";
    id("source").innerHTML = 'Report export · '+doc.generated+' '+window.VRSReport.help('reproducibility','All sixteen real-run variants reproduced from committed source '+doc.code.virtual_radiosonde+'. Canonical export: data/simulator/real.json.');
    id("status").textContent = doc.passes+' passes · '+e.buildings+' buildings · '+fmt(e.points_used,0)+' points';
    id("content").hidden = false;
  }
  /* the small map: the 3D map of Air over the city at its standard settings and angle, on the chosen pass
     (3d/viewer.js draws it); only while this tab is on show, so playing the map does not redraw it all the time */
  function drawMini() {
    var cv = id("mini"); if (!cv || !doc || !cv.getClientRects().length) return;
    id("mini-date").textContent = doc.epochs[pass()];
    loadCoverage().then(function (api) { api.miniView(cv, pass()); }).catch(function () {});
  }
  id("mini-go").addEventListener("click", function () { document.querySelector("[data-site-tab=coverage]").click(); });
  function drawPlots(e, kv) {
    var S = seriesOf(e, kv);
    id("time").innerHTML = plot(doc.epochs, S.est, S.tru, false);
    id("scatter").innerHTML = plot(doc.epochs, S.est, S.tru, true).replace("</svg>",
      '<text x="66" y="38" font-size="13" font-weight="600" fill="#15688f">r = ' + fmt(S.r) + '</text>' +
      (form.elements.prior.value === "ground" ? '<text x="66" y="54" font-size="10.5" fill="#8a5a1f">station data inside the fit: partly by construction</text>' : "") + "</svg>");
    drawMini();
  }
  /* choosing a pass: a dot in the scatter, or a date in the time series; the map and both charts follow */
  id("scatter").addEventListener("click", function (ev) { var d = ev.target.closest("[data-pass]"); if (d) choose(+d.dataset.pass); });
  id("time").addEventListener("click", function (ev) {
    var svg = ev.currentTarget.querySelector("svg"); if (!svg || !timeAxis || !doc) return;
    var b = svg.getBoundingClientRect(), a = timeAxis, xv = (ev.clientX - b.left) / b.width * a.w;
    var t = a.xmin + (xv - a.left) / (a.w - a.left - a.right) * (a.xmax - a.xmin), best = 0;
    doc.epochs.forEach(function (d, i) { if (Math.abs(Date.parse(d) - t) < Math.abs(Date.parse(doc.epochs[best]) - t)) best = i; });
    choose(best);
  });
  document.addEventListener("vrs:pass", function () { if (doc && !selected().error) drawPlots(selected(), form.elements.layer.value || "col"); });
  function saveChoice(){
    var url=new URL(location.href);
    ['motion','prior','layers','layer'].forEach(function(key){var value=form.elements[key].value,def=key==='layer'?'col':String(doc.defaults[key]);if(value===def)url.searchParams.delete(key);else url.searchParams.set(key,value);});
    history.replaceState(history.state,'',url);
  }
  form.addEventListener("change", function (event) { if (doc) {if(event.target.name==='layer'&&form.elements.layer.value!=='col')metricPage=Math.floor(+form.elements.layer.value/6);render(event.target.name !== "layer");saveChoice();} });
  id('metrics').addEventListener('click',function(event){var button=event.target.closest('[data-metric-page]');if(button&&doc){metricPage+=+button.dataset.metricPage;renderMetrics(selected());}});
  window.addEventListener("resize", function () { if (doc) render(false); });
  window.VRSReport.load().then(function (data) {
    doc=data;doc.defaults=Object.assign({},doc.defaults,{prior:'ground'});   /* from the ground, as the map and the simulator */
    var query=new URLSearchParams(location.search);
    ['motion','prior','layers'].forEach(function(key){if(doc.controls[key].includes(query.get(key)))form.elements[key].value=query.get(key);});
    render(true);
    var layer=query.get('layer'),li=Number(layer);if(layer!==null&&Number.isInteger(li)&&li>=0&&li<selected().layer_points.length){form.elements.layer.value=String(li);render(false);}
  }).catch(function (err) { id("status").textContent = 'Report results could not be loaded: ' + err.message; });
  var coverage;
  function loadCoverage(){
    if(!coverage)coverage=import('../3d/viewer.js?v=20261103h').catch(function(err){var loading=document.getElementById('loading');if(loading)loading.textContent='Coverage could not load: '+err.message+'. Reload to try again.';throw err;});
    return coverage;
  }
  document.addEventListener('site:viewchange',function(e){if(e.detail.view==='coverage')loadCoverage().catch(function(){});});
  document.addEventListener('click',function(e){
    var link=e.target.closest('[data-select-building]');if(!link)return;e.preventDefault();
    var url=new URL(location.href);url.searchParams.set('building',link.dataset.selectBuilding);url.hash='coverage';history.replaceState(history.state,'',url);
    link.closest('dialog')?.close();document.querySelector('[data-site-tab=coverage]').click();
    loadCoverage().then(function(api){api.selectBuilding(link.dataset.selectBuilding);}).catch(function(){});
  });
  if(['coverage','buildings','city'].includes(location.hash.slice(1))||new URLSearchParams(location.search).has('building')){
    document.querySelector('[data-site-tab=coverage]').click();loadCoverage().catch(function(){});
  }else if(!location.hash)loadCoverage().catch(function(){});   /* the coverage view is the first tab */
}());
