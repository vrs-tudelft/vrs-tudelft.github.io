/* Report variants and per-pass aggregate plots, all read through the shared report source. */
(function () {
  "use strict";
  var form = document.getElementById("report-controls"), doc, metricPage=0;
  if (!form) return;
  var fmt = window.VRSReport.fmt;
  function id(name) { return document.getElementById("report-" + name); }
  function esc(s) { return String(s).replace(/[&<>\"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function metricHelp(name,label,text,warning) {
    var icon=warning?'<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></svg>':'<span aria-hidden="true" class="info">i</span>';
    return '<button id="'+name+'" class="t tip-trigger '+(warning?'metric-warning':'i')+'" type="button" aria-label="'+esc(label)+'" data-tip="'+esc(text)+'">'+icon+'</button>';
  }
  function selected() { return doc.results[form.elements.motion.value][form.elements.prior.value][form.elements.layers.value]; }
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
      y.forEach(function (v, i) { if (Number.isFinite(v) && Number.isFinite(station[i])) body += '<circle cx="' + px(station[i]) + '" cy="' + py(v) + '" r="3" fill="#15688f" opacity=".6"><title>' + esc(x[i]) + ': station ' + fmt(station[i]) + ', radar ' + fmt(v) + ' N</title></circle>'; });
    } else {
      [station, y].forEach(function (a, j) {
        var d = "", pen = false;
        a.forEach(function (v, i) { if (!Number.isFinite(v)) { pen = false; return; } d += (pen ? "L" : "M") + px(Date.parse(x[i])) + " " + py(v); pen = true; });
        body += '<path d="' + d + '" fill="none" stroke="' + (j ? '#15688f' : '#8a8f96') + '" stroke-width="1.5"/>';
      });
      body += '<text x="58" y="'+(h-24)+'" font-size="12">' + esc(x[0]) + '</text><text x="' + (w - right) + '" y="'+(h-24)+'" font-size="12" text-anchor="end">' + esc(x[x.length - 1]) + '</text>';
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
      form.elements.layer.innerHTML = e.layer_points.map(function (l, k) { return '<option value="' + k + '">' + fmt(e.edges[k], 1) + ' to ' + fmt(e.edges[k + 1], 1) + ' m NAP</option>'; }).join("");
    }
    var k = +form.elements.layer.value || 0, circular=form.elements.prior.value==='ground';
    var outcome=(e.skill[k]>0?'This fit beats constant air against the station proxy.':e.skill[k]<0?'Constant air has the lower error against the station proxy in this layer.':'This fit matches constant air against the station proxy at the published precision.')+
      ' Positive skill means a smaller RMS difference; negative skill means a larger one. Vertical accuracy remains unverified.';
    id("content").hidden = false;
    if(id('kpis'))id('kpis').innerHTML=[
      [fmt(e.station_r[k].r),'station agreement (r)'],[fmt(e.rmse[k])+' N','RMS difference to proxy'],[fmt(e.skill[k]),'skill vs constant air']
    ].map(function(s,i){return '<div class="stat"><span class="v">'+s[0]+'</span><span class="k">'+s[1]+(i===0&&circular?metricHelp('station-prior-warning','Station agreement reuses station data','Station information is inside this fit: its agreement is partly circular. The station-based prior uses the same station that this metric compares against.',true):'')+(i===2?metricHelp('report-outcome-help','About skill against constant air',outcome,false):'')+'</span></div>';}).join('');
    if(id('layer-summary'))id('layer-summary').innerHTML='<b>'+fmt(e.edges[k],1)+'–'+fmt(e.edges[k+1],1)+' m NAP</b> · '+fmt(e.layer_points[k].n,0)+' points · r without annual cycle '+fmt(e.station_r[k].r_no_annual);
    renderMetrics(e);
    id("time").innerHTML = plot(doc.epochs, e.steps.est_anomaly[k], e.steps.truth_anomaly[k], false);
    id("scatter").innerHTML = plot(doc.epochs, e.steps.est_anomaly[k], e.steps.truth_anomaly[k], true);
    id("reading").dataset.tip = (form.elements.prior.value === "ground" ? "This variant uses the station-based air prior: station agreement is partly built into the fit. " : "This fit has no station-based air prior. ") +
      "Skill compares RMS difference against predicting constant air using the same station-based proxy; negative skill means that constant prediction has a smaller RMS difference. It does not measure independently validated urban retrieval skill.";
    id("source").innerHTML = 'Report export · '+doc.generated+' '+window.VRSReport.help('reproducibility','All sixteen real-run variants reproduced from committed source '+doc.code.virtual_radiosonde+'. Canonical export: data/simulator/real.json.');
    id("status").textContent = doc.passes+' passes · '+e.buildings+' buildings · '+fmt(e.points_used,0)+' points';
    id("content").hidden = false;
  }
  function saveChoice(){
    var url=new URL(location.href);
    ['motion','prior','layers','layer'].forEach(function(key){var value=form.elements[key].value,def=key==='layer'?'0':String(doc.defaults[key]);if(value===def)url.searchParams.delete(key);else url.searchParams.set(key,value);});
    history.replaceState(history.state,'',url);
  }
  form.addEventListener("change", function (event) { if (doc) {if(event.target.name==='layer')metricPage=Math.floor(+form.elements.layer.value/6);render(event.target.name !== "layer");saveChoice();} });
  id('metrics').addEventListener('click',function(event){var button=event.target.closest('[data-metric-page]');if(button&&doc){metricPage+=+button.dataset.metricPage;renderMetrics(selected());}});
  window.addEventListener("resize", function () { if (doc) render(false); });
  window.VRSReport.load().then(function (data) {
    doc=data;var query=new URLSearchParams(location.search);
    ['motion','prior','layers'].forEach(function(key){if(doc.controls[key].includes(query.get(key)))form.elements[key].value=query.get(key);});
    render(true);
    var layer=Number(query.get('layer'));if(Number.isInteger(layer)&&layer>=0&&layer<selected().layer_points.length){form.elements.layer.value=layer;render(false);}
  }).catch(function (err) { id("status").textContent = 'Report results could not be loaded: ' + err.message; });
  var coverage;
  function loadCoverage(){
    if(!coverage)coverage=import('../3d/viewer.js?v=20261101-help-sweep').catch(function(err){var loading=document.getElementById('loading');if(loading)loading.textContent='Coverage could not load: '+err.message+'. Reload to try again.';throw err;});
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
  }
}());
