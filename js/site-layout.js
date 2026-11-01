/* Focused views share the simulator's rail, tabs, deep links and mobile settings. */
(function () {
  "use strict";
  var root=document.querySelector('.site-app');
  if(!root)return;
  var tabs=Array.from(root.querySelectorAll('[data-site-tab]'));
  var panels=Array.from(root.querySelectorAll('[data-site-view]'));
  var rail=root.querySelector('.site-panel'),main=root.querySelector('.site-main');
  var controls=document.createElement('div');controls.className='site-controls';controls.id='site-controls';
  Array.from(rail.children).forEach(function(n){if(!n.matches('.sim-head,.site-foot'))controls.appendChild(n);});
  rail.insertBefore(controls,rail.querySelector('.site-foot'));
  var toggle=document.createElement('button');toggle.type='button';toggle.className='site-settings-toggle';toggle.textContent='Settings & context';toggle.setAttribute('aria-controls','site-controls');toggle.setAttribute('aria-expanded','false');
  rail.insertBefore(toggle,controls);
  toggle.addEventListener('click',function(){var open=rail.classList.toggle('settings-open');toggle.setAttribute('aria-expanded',String(open));});
  function choices(select){var active=root.querySelector('[data-site-view]:not([hidden])');root.querySelectorAll('[data-choice-group]').forEach(function(n){if(n.dataset.choiceGroup===select.dataset.switch)n.hidden=n.dataset.choice!==select.value||(n.dataset.forView&&active&&n.dataset.forView.split(',').indexOf(active.dataset.siteView)<0);});}
  var switches=Array.from(root.querySelectorAll('select[data-switch]'));
  switches.forEach(function(s){s.addEventListener('change',function(){choices(s);window.dispatchEvent(new Event('resize'));});choices(s);});
  function show(key,focus,save){
    if(!panels.some(function(p){return p.dataset.siteView===key;}))return;
    panels.forEach(function(p){p.hidden=p.dataset.siteView!==key;});
    tabs.forEach(function(b){var on=b.dataset.siteTab===key;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;if(on&&focus)b.focus();});
    root.querySelectorAll('[data-for-view]').forEach(function(n){n.hidden=n.dataset.forView.split(',').indexOf(key)<0;});
    switches.forEach(choices);
    if(save)history.pushState(null,'','#'+key);
    main.scrollTop=0;
    requestAnimationFrame(function(){document.dispatchEvent(new CustomEvent('site:viewchange',{detail:{view:key}}));window.dispatchEvent(new Event('resize'));});
  }
  function route(){
    var key;
    try{key=decodeURIComponent(location.hash.slice(1));}catch(e){key='';}
    var target=key&&document.getElementById(key),panel=target&&target.closest('[data-site-view]');
    if(panel){
      var choice=target.closest('[data-choice-group]');
      if(choice)switches.forEach(function(s){if(s.dataset.switch===choice.dataset.choiceGroup){s.value=choice.dataset.choice;choices(s);}});
      show(panel.dataset.siteView,false,false);
    }else show(tabs[0].dataset.siteTab,false,false);
  }
  tabs.forEach(function(b,i){
    b.addEventListener('click',function(){show(b.dataset.siteTab,false,true);});
    b.addEventListener('keydown',function(e){var next;if(e.key==='ArrowRight')next=(i+1)%tabs.length;else if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;if(next!==undefined){e.preventDefault();show(tabs[next].dataset.siteTab,true,true);}});
  });
  window.addEventListener('hashchange',route);window.addEventListener('popstate',route);
  document.body.classList.add('site-ready');route();
}());
