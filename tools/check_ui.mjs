/* Real Chrome regression checks for layout, first-load charts, fit state and map links.
 * Usage: node tools/check_ui.mjs [evidence-directory]
 * Set CHROME_PATH when Google Chrome is not installed at the Windows default path.
 * External traffic is limited to the site's pinned three.js imports. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const here=process.argv[2]?path.resolve(process.argv[2]):fs.mkdtempSync(path.join(os.tmpdir(),'vrs-ui-'));
fs.mkdirSync(here,{recursive:true});
const roots={after:source};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){
 const servers=[];const ports={};
 fs.mkdirSync(path.join(here,'raw'),{recursive:true});
 for(const [version,root] of Object.entries(roots)){
  const server=http.createServer((req,res)=>{let name=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(name===root)name=path.join(root,'index.html');if(!name.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
   fs.readFile(name,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary'})[path.extname(name)]||'application/octet-stream');res.end(data);});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));ports[version]=server.address().port;servers.push(server);
 }
 const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--window-size=1440,960','--user-data-dir='+path.join(here,'raw/chrome'),'about:blank'],{windowsHide:true,stdio:'ignore'});
 let ws;const errors=[],network=[];
 try{
  let tabs;for(let i=0;i<100;i++){try{const port=fs.readFileSync(path.join(here,'raw/chrome/DevToolsActivePort'),'utf8').split(/\r?\n/)[0];tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await pause(100);}
  if(!tabs)throw Error('Chrome did not start');
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let seq=0;const pending=new Map();
  ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description||a.type).join(' '));else if(m.method==='Network.loadingFailed')network.push(m.params);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  const until=async(expression,ms=15000)=>{const start=Date.now();do{if(await run(expression))return true;await pause(150);}while(Date.now()-start<ms);return false;};
  const nav=async(version,url,ready)=>{await send('Page.navigate',{url:'http://127.0.0.1:'+ports[version]+'/'+url});await until('document.readyState==="complete"');const ok=ready?await until(ready,25000):true;await pause(500);return ok;};
  const size=async(w,h)=>{await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<1000});};
  const shot=async(name)=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(here,'raw',name+'.png'),Buffer.from(r.data,'base64'));return 'raw/'+name+'.png';};
  return {send,run,until,nav,size,shot,errors,network,close(){try{ws.close();}catch{}chrome.kill();servers.forEach(s=>s.close());}};
 }catch(e){try{ws?.close();}catch{}chrome.kill();servers.forEach(s=>s.close());throw e;}
}
const metrics=`(()=>{
 const visible=e=>e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().height>0;
 const rect=e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),bottom:Math.round(r.bottom),right:Math.round(r.right)}};
 const data=e=>({id:e.id,cls:e.className?.baseVal||e.className,rect:rect(e),scrollX:e.scrollWidth-e.clientWidth,scrollY:e.scrollHeight-e.clientHeight,overflow:getComputedStyle(e).overflow,text:e.innerText?.trim().slice(0,100)});
 const main=document.querySelector('main,.app-main'),side=document.querySelector('.app-panel');
 return {url:location.href,width:innerWidth,height:innerHeight,horizontal:document.documentElement.scrollWidth-innerWidth,vertical:document.documentElement.scrollHeight-innerHeight,main:main&&data(main),side:side&&data(side),
  regions:[...document.querySelectorAll('.site-view,.sim-view,.app-card,.city-research-grid,.city-inspector,#stage,.pte-bar,.timepanel,.city-row,.city-strip')].filter(visible).map(data),
  charts:[...document.querySelectorAll('.sim-chart,.report-chart,#airProfile,#cityProfile')].filter(visible).map(data),
  controls:[...document.querySelectorAll('button,select,input,footer')].filter(visible).map(e=>({tag:e.tagName,type:e.type,id:e.id,name:e.name,text:e.innerText?.trim().slice(0,60)||e.getAttribute('aria-label')||e.value,rect:rect(e),disabled:e.disabled})),
  clippedSVGText:[...document.querySelectorAll('svg text')].filter(visible).flatMap(e=>{const r=e.getBoundingClientRect(),s=e.ownerSVGElement.getBoundingClientRect();return r.right>s.right+2||r.left<s.left-2||r.top<s.top-2||r.bottom>s.bottom+2?[{text:e.textContent,rect:rect(e),svg:rect(e.ownerSVGElement)}]:[]}).slice(0,30)};
})()`;


const b=await start(),checks=[];
const check=(name,data)=>{checks.push({name,data});fs.writeFileSync(path.join(here,'verification.json'),JSON.stringify({checks,errors:b.errors},null,2));console.log(name);};
const click=async selector=>{await b.run(`document.querySelector(${JSON.stringify(selector)}).click()`);await pause(250);};
const radio=(name,value)=>click(`input[name="${name}"][value="${value}"]`);
const fit=()=>b.run(`({form:{...VRSFit},map:{motion:__vrs.state.motion,prior:__vrs.state.prior,layers:__vrs.state.layers}})`);
const mini=async()=>{
 await click('[data-open-dialog="map-preview"]');assert(await b.until("!!window.__vrs&&document.getElementById('report-mini-date').textContent&&document.getElementById('report-mini').getContext('2d').getImageData(0,0,1,1).data[3]>0",15000));await pause(500);
 const data=await b.run("document.getElementById('report-mini').toDataURL()");await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(100);return createHash('sha256').update(data).digest('hex');
};
try{
 for(const [w,h] of [[1440,900],[1366,657],[1280,600],[390,844]]){
  await b.size(w,h);
  for(const page of ['index','simulator','results']){
   assert(await b.nav('after',page+'.html?debug#'+(page==='index'?'height':page==='simulator'?'steps':'coverage'),page==='index'?"!!document.querySelector('[data-bmodel] svg')":page==='simulator'?"!!document.querySelector('#sim-pass svg')":"!!window.__vrs"));
   const selector=page==='simulator'?'[data-tab]':'[data-site-tab]';
   const tabs=await b.run(`Array.from(document.querySelectorAll('${selector}')).map(e=>e.getAttribute('${page==='simulator'?'data-tab':'data-site-tab'}'))`);
   for(const tab of tabs){
    await click(`${selector}[${page==='simulator'?'data-tab':'data-site-tab'}="${tab}"]`);await pause(tab==='city'?800:250);
    const m=await b.run(metrics);
    assert.equal(m.horizontal,0,`${page}/${tab}/${w}: horizontal overflow`);
    if(w>=1000){
     for(const region of [m.main,m.side]){assert.equal(region.rect.w,region===m.side?260:region.rect.w,`${page}/${tab}/${w}: rail width`);assert(region.rect.y>=47,`${page}/${tab}/${w}: page moved above its header`);assert(region.rect.bottom<=h+1,`${page}/${tab}/${w}: panel below viewport`);assert.equal(region.scrollY,0,`${page}/${tab}/${w}: panel overflow`);}
     assert(m.charts.every(c=>c.rect.bottom<=h+1),`${page}/${tab}/${w}: clipped chart`);
    }
    const screenshot=await b.shot(`verified-${page}-${tab}-${w}-${h}`);
    check(`layout ${page}/${tab} ${w}x${h}`,{main:m.main?.rect,side:m.side?.rect,screenshot});
   }
  }
 }
 await b.size(1366,657);
 assert(await b.nav('after','simulator.html?debug#steps',"!!document.querySelector('#sim-pass svg')"));
 await click('[data-open-dialog="sim-fit-settings"]');assert(await b.run("document.getElementById('sim-fit-settings').open"));
 await radio('points','3000');await radio('motion','scatterer');await click('#sim-fit-settings [data-close-dialog]');
 assert(await b.until("!!document.querySelector('#sim-pass svg')&&!document.querySelector('#sim-out.busy')"));
 const reset=await b.run("(()=>{const r=document.getElementById('sim-reset').getBoundingClientRect();return {top:r.top,bottom:r.bottom}})()");assert(reset.bottom<=657);
 await click('#sim-reset');await pause(500);await click('[data-tab=dist]');await pause(500);
 const sizes=await b.run(`['sim-attr','sim-cum'].map(id=>{const e=document.getElementById(id);return {id,container:e.clientHeight,svg:e.querySelector('svg').getBoundingClientRect().height}})`);
 assert(sizes.every(s=>Math.abs(s.container-s.svg)<=1));check('first-open Disturbances charts fit',sizes);
 await click('[data-open-dialog="motion-absorption"]');await pause(300);assert(await b.run("document.getElementById('motion-absorption').open&&!!document.querySelector('#sim-abs-pass svg')"));await b.shot('verified-absorption-dialog');await click('#motion-absorption [data-close-dialog]');
 await radio('atm','real');await click('[data-tab=pte]');assert(await b.until("document.querySelector('#pte-N svg')&&!document.getElementById('sim-out').classList.contains('failed')"));
 await radio('pte-show','median');assert(await b.until("!!document.querySelector('#pte-e svg')"));await b.shot('verified-real-profiles-1366-657');check('real-data P/T/e profiles remain available',await b.run("document.getElementById('pte-note').textContent"));
 await radio('atm','cabauw');await pause(700);assert(await b.run("!document.getElementById('sim-out').classList.contains('failed')"));check('Cabauw sensor-layer profiles remain available',true);
 await b.size(1440,900);assert(await b.nav('after','results.html?debug#signal',"!!document.querySelector('#report-time svg')"));
 const mini1=await mini();let f=await fit();assert.deepEqual(f.form,f.map);
 await radio('motion','scatterer');await radio('prior','none');await radio('layers','n1000');
 f=await fit();assert.deepEqual(f.form,f.map);const mini2=await mini();assert.notEqual(mini1,mini2);check('comparison, map and miniature use the selected fit',{fit:f,mini1,mini2});
 await click('[data-site-tab=coverage]');f=await fit();assert.deepEqual(f.form,f.map);
 await radio('airQty','e');await radio('layers','1');
 await click('[data-open-dialog="map-display"]');await radio('airView','buildings');await radio('airInterp','layers');await radio('cityMap','colour');
 await b.run("document.getElementById('showBuildings').click()");await click('#map-display [data-close-dialog]');await click('#presets [data-p=top]');
 const before=await b.run("({qty:__vrs.state.qty,layers:__vrs.state.layers,view:__vrs.state.view,interp:__vrs.state.interp,showBuildings:__vrs.state.showBuildings,camera:__vrs.state.camera,url:location.href})");
 await b.send('Page.reload',{ignoreCache:true});assert(await b.until('!!window.__vrs',25000));
 const after=await b.run("({qty:__vrs.state.qty,layers:__vrs.state.layers,view:__vrs.state.view,interp:__vrs.state.interp,showBuildings:__vrs.state.showBuildings,camera:__vrs.state.camera,url:location.href})");assert.deepEqual(after,before);assert.equal(await b.run("document.querySelector('input[name=airQty]:checked').value"),after.qty);assert.equal(await b.run("document.querySelector('input[name=airView]:checked').value"),after.view);check('map URL reproduces variable, fit and display choices',{before,after});
 await radio('colourBy','points');assert(await b.run("!!document.getElementById('heightSlice').getClientRects().length"));
 await b.run("const h=document.getElementById('heightSlice');h.value='120';h.dispatchEvent(new Event('input',{bubbles:true}))");assert(await b.run("document.getElementById('heightLabel').textContent==='120–130 m'"));
 await click('[data-open-dialog="building-finder"]');await b.run("const s=document.querySelector('#building-finder input[type=search]');s.value='Rotterdam';s.dispatchEvent(new Event('input',{bubbles:true}))");await pause(400);assert(await b.run("!!document.querySelector('#building-finder [data-select-building]')"));
 await click('#building-finder [data-select-building]');assert(await b.run("!!__vrs.state.selected&&!document.getElementById('buildingPop').hidden"));
 await click('#presets [data-p=overview]');await b.shot('verified-height-coverage-and-building-search');
 await b.send('Page.reload',{ignoreCache:true});assert(await b.until('!!window.__vrs',25000));assert.equal(await b.run('__vrs.state.mode'),'points');assert.equal(await b.run('__vrs.state.height'),120);check('height coverage, building search, presets and deep links work',true);
 await radio('colourBy','air');await b.send('Page.reload',{ignoreCache:true});assert(await b.until('!!window.__vrs',25000));assert.equal(await b.run('__vrs.state.mode'),'air');check('switching back to air survives refresh',true);
 assert(await b.nav('after','results.html?debug&data=2014-2023-processor#coverage','!!window.__vrs'));assert.equal(await b.run('__vrs.state.mode'),'points');assert(await b.run("document.querySelector('input[name=colourBy][value=air]').disabled"));check('archived processing remains labelled and coverage-only',true);
 assert.equal(b.errors.length,0,b.errors.join('\n'));check('no browser exceptions',true);console.log('Evidence: '+here);
}catch(e){await b.shot('verification-failure');fs.writeFileSync(path.join(here,'failure-dom.html'),await b.run('document.documentElement.outerHTML'));throw e;}finally{b.close();}
