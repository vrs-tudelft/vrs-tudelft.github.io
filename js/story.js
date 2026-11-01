/* An explicit differential-path illustration, not another radar data product. */
(function(){
  'use strict';
  var slider=document.getElementById('air-change');
  if(!slider)return;
  var path=80/Math.cos(23*Math.PI/180);
  function signed(n,d){return(n>0?'+':n<0?'−':'')+Math.abs(n).toFixed(d);}
  function draw(){
    var dn=Number(slider.value),contrast=dn*1e-3*path;
    document.getElementById('air-change-value').textContent=signed(dn,0)+' N';
    document.getElementById('air-result').textContent=signed(contrast,2)+' mm';
    document.getElementById('air-band-label').textContent='Air change: '+signed(dn,0)+' N';
    document.getElementById('air-band').style.opacity=String(.08+.4*Math.abs(dn)/20);
    document.getElementById('extra-air-path').style.strokeWidth=String(3+Math.abs(dn)*.35);
    slider.setAttribute('aria-valuetext',signed(dn,0)+' N; upper minus lower contrast '+signed(contrast,2)+' millimetres');
  }
  slider.addEventListener('input',draw);
  document.getElementById('air-reset').addEventListener('click',function(){slider.value=10;draw();});
  document.addEventListener('click',function(e){
    var view=e.target.closest('[data-select-view]');if(view){document.querySelector('[data-site-tab='+view.dataset.selectView+']').click();return;}
    var preset=e.target.closest('[data-motion-preset]');if(!preset)return;
    var p=preset.dataset.motionPreset,values={vs:p==='all'||p==='sink'?-2:0,g0:p==='all'||p==='shrink'?25:0,tc:Math.log(5),al:p==='all'||p==='thermal'?10:0};
    var sliders=document.querySelectorAll('#motion-controls input[type=range]');
    ['vs','g0','tc','al'].forEach(function(key,i){if(sliders[i]){sliders[i].value=values[key];sliders[i].dispatchEvent(new Event('input',{bubbles:true}));}});
    document.querySelectorAll('[data-motion-preset]').forEach(function(b){b.setAttribute('aria-pressed',String(b===preset));});
  });
  var hash=location.hash.slice(1);
  if(['report','claims'].includes(hash)){location.replace('results.html#signal');return;}
  if(['thermal','sinking','shrink','combined'].includes(hash))document.querySelector('[data-site-tab=motion]').click();
  draw();
}());
