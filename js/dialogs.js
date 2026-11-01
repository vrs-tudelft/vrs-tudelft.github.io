/* Supporting detail stays with the research question, rather than another page. */
(function () {
  'use strict';
  var simPanel=document.querySelector('#sim .sim-panel');
  if(simPanel){
    var settings=document.createElement('button');settings.type='button';settings.className='site-settings-toggle';settings.textContent='Experiment settings';settings.setAttribute('aria-controls','sim-controls');settings.setAttribute('aria-expanded','false');
    simPanel.insertBefore(settings,document.getElementById('sim-controls'));
    simPanel.classList.add('settings-ready');
    settings.addEventListener('click',function(){var opened=simPanel.classList.toggle('settings-open');settings.setAttribute('aria-expanded',String(opened));});
  }
  var sources=document.createElement('dialog');sources.id='site-sources';sources.className='site-dialog sources-dialog';
  sources.setAttribute('aria-labelledby','site-sources-title');
  sources.innerHTML='<div class="dialog-head"><h2 id="site-sources-title">Sources & team</h2><button type="button" data-close-dialog aria-label="Close sources">Close</button></div>'+
    '<div class="sources-grid"><section><h3>What the figures use</h3><dl>'+
    '<dt>Rotterdam findings</dt><dd>The full-height TerraSAR-X report fit, 2020–2026. Its selection and all numeric variants live in the <a href="data/simulator/real.json">canonical result export</a>.</dd>'+
    '<dt>Controlled experiments</dt><dd>Simulated radar with station-built air, reconstructed soundings or Cabauw tower profiles. Input dates and samples are in the <a href="data/simulator/manifest.json">experiment manifest</a>.</dd>'+
    '<dt>Coverage explorer</dt><dd>An earlier height-limited processing, not the report’s full-height input. <a href="data/2020-2026-ground/MANIFEST.json">Aggregate manifest</a>.</dd></dl></section>'+
    '<section><h3>Attribution & reuse</h3><dl><dt>Radar</dt><dd>Supplied for the course by R. F. Hanssen. Raw points stay private; published radar groups contain at least 20 points.</dd>'+
    '<dt>Weather</dt><dd>KNMI, NOAA IGRA2 and ICOS. KNMI and ICOS data: CC BY 4.0. Balloon/tower source locations differ from Rotterdam.</dd>'+
    '<dt>Buildings & map</dt><dd>BAG via PDOK: CC0. 3DBAG and the PDOK aerial image: CC BY 4.0. Viewer: three.js.</dd>'+
    '<dt>Site</dt><dd>Text and figures: CC BY 4.0, Virtual Radiosonde team, TU Delft, 2026.</dd></dl></section></div>'+
    '<details class="source-credits"><summary>Project contributors</summary><p>Sander da Costa, Jaap de Ruiter, Dirk van Dale, Alejandro Giner Gil, Phoebe Smirk, Quinten Uivel, Lars van Dijk, Rosalyn van Hemert, Shaquille Huiswoud, Akhil Veeranki, Jihun Yoo, Oula Zhu.</p><p>Supervision: Ramon Hanssen, Freek van Leijen and Hanno Maljaars.</p></details>';
  document.body.appendChild(sources);
  function open(id) { var dialog=document.getElementById(id);if(dialog&&!dialog.open){dialog.showModal();window.dispatchEvent(new Event('resize'));} }
  document.addEventListener('click',function(e){
    var button=e.target.closest('[data-open-dialog]');if(button){open(button.dataset.openDialog);return;}
    button=e.target.closest('[data-close-dialog]');if(button){button.closest('dialog').close();return;}
    if(e.target instanceof HTMLDialogElement){var r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}
  });
  // Old source links remain useful without keeping a duplicate About page.
  var query=new URLSearchParams(location.search),hash=location.hash.slice(1);
  if(query.get('sources')==='1'||['sources','about','paper','paper-team','paper-course','paper-paper','paper-outline'].includes(hash))open('site-sources');
  if(query.get('finder')==='1')open('building-finder');
  if(['metrics','readout'].includes(hash))open('layer-details');
}());
