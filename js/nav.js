/* Shared navigation and viewport-safe, keyboard/touch tooltips. */
(function () {
  "use strict";
  var pages=[
    {href: "index.html",label:"1 · Idea"},
    {href: "simulator.html",label:"2 · Experiment"},
    {href: "results.html",label:"3 · Findings"}
  ];
  var root=document.documentElement.getAttribute('data-root')||'';
  var here=location.pathname.replace(/\/+$/,'').split('/').pop()||'index.html';
  var in3d=document.documentElement.hasAttribute('data-3d');
  function current(p){return p.in3d&&in3d?true:!in3d&&(p.href===here||(p.also||[]).indexOf(here)>=0);}
  function link(p,on){var a=document.createElement('a');a.href=root+p.href;a.textContent=p.label;if(on)a.setAttribute('aria-current','page');return a;}
  var header=document.querySelector('header.top .top-inner');
  if(header){
    header.querySelectorAll('nav,noscript').forEach(function(n){n.remove();});
    document.documentElement.classList.remove('has-subnav');
    var nav=document.createElement('nav');nav.setAttribute('aria-label','Site');
    pages.forEach(function(p){
      if(!p.sub){nav.appendChild(link(p,current(p)));return;}
      var menu=document.createElement('details');menu.className='site-menu';
      var summary=document.createElement('summary');summary.textContent=p.label;
      if(p.sub.some(current))summary.setAttribute('aria-current','page');
      menu.appendChild(summary);
      var items=document.createElement('div');items.className='site-menu-items';
      p.sub.forEach(function(child){items.appendChild(link(child,current(child)));});menu.appendChild(items);nav.appendChild(menu);
    });header.appendChild(nav);
    document.addEventListener('click',function(e){nav.querySelectorAll('details[open]').forEach(function(d){if(!d.contains(e.target))d.open=false;});});
  }
  var footer=document.querySelector('footer[data-shared]');
  if(footer&&!footer.innerHTML.trim())footer.innerHTML='<p>Virtual Radiosonde · TU Delft · <a href="'+root+'index.html#about">Sources & licences</a> · <a href="https://github.com/vrs-tudelft">GitHub</a></p>';
  var bubble=document.createElement('div');bubble.id='site-tooltip';bubble.className='site-tooltip';bubble.role='tooltip';bubble.hidden=true;document.body.appendChild(bubble);
  document.documentElement.classList.add('has-portal-tooltips');
  var active=null,timer;
  function hide(){clearTimeout(timer);if(active){active.dataset.tipPinned='false';active.classList.remove('open');active.setAttribute('aria-expanded','false');var old=(active.getAttribute('aria-describedby')||'').split(/\s+/).filter(function(x){return x&&x!=='site-tooltip';});if(old.length)active.setAttribute('aria-describedby',old.join(' '));else active.removeAttribute('aria-describedby');}active=null;bubble.hidden=true;}
  function place(){
    if(!active)return;
    var r=active.getBoundingClientRect(),pad=12;
    bubble.style.maxWidth=Math.min(340,innerWidth-pad*2)+'px';bubble.style.maxHeight=Math.max(120,innerHeight-pad*2)+'px';
    var b=bubble.getBoundingClientRect();
    var left=Math.max(pad,Math.min(innerWidth-b.width-pad,r.left+r.width/2-b.width/2));
    var top=r.bottom+8;
    if(top+b.height>innerHeight-pad&&r.top-b.height-8>=pad)top=r.top-b.height-8;
    top=Math.max(pad,Math.min(top,innerHeight-b.height-pad));
    bubble.style.left=left+'px';bubble.style.top=top+'px';
  }
  function show(t){
    clearTimeout(timer);var text=t.getAttribute('data-tip');if(!text)return;
    var scope=t.closest('dialog')||document.body;if(bubble.parentNode!==scope)scope.appendChild(bubble);
    if(active!==t)hide();active=t;bubble.textContent=text;bubble.hidden=false;
    t.classList.add('open');t.setAttribute('aria-expanded','true');
    var ids=(t.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);if(ids.indexOf('site-tooltip')<0)ids.push('site-tooltip');t.setAttribute('aria-describedby',ids.join(' '));place();
  }
  function prepare(t){if(!t.hasAttribute('tabindex')&&!t.matches('button,a,input'))t.tabIndex=0;if(!t.matches('button,a,input'))t.setAttribute('role','button');}
  document.querySelectorAll('.t[data-tip]').forEach(prepare);
  new MutationObserver(function(records){records.forEach(function(r){r.addedNodes.forEach(function(n){if(n.nodeType!==1)return;if(n.matches('.t[data-tip]'))prepare(n);n.querySelectorAll('.t[data-tip]').forEach(prepare);});});}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('pointerover',function(e){var t=e.target.closest('.t[data-tip]');if(t)show(t);else if(!bubble.contains(e.target)&&active&&document.activeElement!==active)timer=setTimeout(hide,140);});
  document.addEventListener('focusin',function(e){var t=e.target.closest('.t[data-tip]');if(t)show(t);else hide();});
  document.addEventListener('click',function(e){var t=e.target.closest('.t[data-tip]');if(t){if(active===t&&t.dataset.tipPinned==='true'){t.dataset.tipPinned='false';hide();}else{t.dataset.tipPinned='true';show(t);}}else if(!bubble.contains(e.target))hide();});
  bubble.addEventListener('pointerenter',function(){clearTimeout(timer);});bubble.addEventListener('pointerleave',function(){if(!active||document.activeElement!==active)timer=setTimeout(hide,140);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){hide();document.querySelectorAll('.site-menu[open]').forEach(function(m){m.open=false;});}var t=e.target.closest('.t[data-tip]');if(t&&!t.matches('button,a')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();t.click();}});
  document.addEventListener('scroll',function(e){if(!bubble.contains(e.target)){if(active&&document.activeElement===active)place();else hide();}},true);
  window.addEventListener('resize',function(){if(active&&document.activeElement===active)place();else hide();});
}());
