/* The city in 3D, for the run on show in the simulator (window.VRSSim hands it over):
   - a simulation: its invented city (data/simulator/city/, written by the team's 04_python/estimation/site_city.py,
     seed 0 as the simulation) with the true air (5 m profiles, data/simulator/atm/) and the estimate per layer;
   - the real data: the Rotterdam buildings of the Findings map (data/3d/) with the estimate of the chosen motion
     fit, air prior and layers, against KNMI 344 carried up (data/simulator/real.json).
   Shown pass by pass: the truth, the estimate, the error (estimate minus truth, on one scale for every run:
   data/simulator/city/error_scale.json) or r (per layer, over all passes), for N, P, T or e. T, and e with it,
   follows the temperature profile chosen under N, P, T, e. The buildings are coloured by the air at their
   height, or the air as filled slabs over the city (3d/airvolume.js); layers, or a smooth profile through the
   layer centres. The strip shows every pass at once, with the ground station's own value underneath. */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AirVolume} from '../3d/airvolume.js?v=20261103b';
import {smoothAt,profileSVG} from '../3d/profile.js?v=20261103a';

const $=id=>document.getElementById(id),css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const QTY={N:{name:'Refractivity N',unit:'N',d:0},P:{name:'Pressure P',unit:'hPa',d:1},T:{name:'Temperature T',unit:'°C',d:1},e:{name:'Water-vapour pressure e',unit:'hPa',d:1}};
const BLUES=[[239,243,255],[198,219,239],[158,202,225],[107,174,214],[66,146,198],[33,113,181],[8,69,148]];   /* white to dark blue, as at first */
const RDBU=[[178,24,43],[239,138,98],[253,219,199],[247,247,247],[209,229,240],[103,169,207],[33,102,172]];
const st={show:'est',qty:'N',view:'blocks',interp:'smooth',opacity:.2,buildings:true,points:false,epoch:0,need:true};
let renderer,scene,camera,controls,geomKey='',bld=null,bldEdges=null,pts=null,ground=null,volume=null,uniforms=null,air=null,box=null;
const cache={},getJSON=url=>cache[url]||(cache[url]=fetch(url).then(r=>{if(!r.ok)throw Error(url+': '+r.status);return r.json();}));

/* ---- values */
const ramp=(s,t)=>{t=THREE.MathUtils.clamp(t,0,1)*(s.length-1);const k=Math.min(Math.floor(t),s.length-2),f=t-k;return s[k].map((c,i)=>Math.round(c+(s[k+1][i]-c)*f));};
function colourOf(v){
  if(!Number.isFinite(v))return [200,203,206];
  return st.show==='err'?ramp(RDBU,(v/air.span+1)/2):st.show==='r'?ramp(BLUES,v):ramp(BLUES,(v-air.lo)/(air.hi-air.lo));
}
const smooth=smoothAt;                              /* 3d/profile.js: through the layer centres, on along the end slope */
const layerOf=(E,z)=>{for(let k=0;k<E.length-1;k++)if(z<E[k+1])return k;return E.length-2;};
function fineAt(zs,vals,z){if(z<=zs[0])return vals[0];for(let i=1;i<zs.length;i++)if(z<=zs[i]){const f=(z-zs[i-1])/(zs[i]-zs[i-1]);return vals[i-1]+f*(vals[i]-vals[i-1]);}return vals[vals.length-1];}
const eFrom=(N,P,T)=>N.map((n,k)=>{const t=T[k],p=P[k];return Number.isFinite(n)&&Number.isFinite(t)&&Number.isFinite(p)?(n-77.6*p/t)/((72-77.6)/t+3.75e5/(t*t)):NaN;});
function pcorr(a,b){const ok=a.map((v,i)=>Number.isFinite(v)&&Number.isFinite(b[i]));const x=a.filter((v,i)=>ok[i]),y=b.filter((v,i)=>ok[i]);if(x.length<3)return NaN;
  const mx=x.reduce((s,v)=>s+v,0)/x.length,my=y.reduce((s,v)=>s+v,0)/y.length;let sxy=0,sxx=0,syy=0;x.forEach((v,i)=>{sxy+=(v-mx)*(y[i]-my);sxx+=(v-mx)**2;syy+=(y[i]-my)**2;});return sxy/Math.sqrt(sxx*syy);}
/* the value at height z (m NAP) on pass j */
function valueAt(j,z){
  const E=air.edges;if(z<E[0]||z>E[E.length-1])return NaN;
  const sm=st.interp==='smooth';
  if(st.show==='r')return sm?smooth(air.r,E,z):air.r[layerOf(E,z)];
  const truth=()=>sm?(air.fine?air.fine.at(j,z):smooth(air.truthL[j],E,z)):air.truthL[j][layerOf(E,z)];
  const est=()=>sm?smooth(air.est[j],E,z):air.est[j][layerOf(E,z)];
  return st.show==='truth'?truth():st.show==='est'?est():est()-truth();
}
const toC=rows=>rows.map(r=>r.map(v=>Number.isFinite(v)?v-273.15:NaN));
/* the arrays of either source: per pass and layer the estimate and the truth, the ground station, the scales */
function buildAir(S){
  const q=st.qty,real=!!S.real,E=S.entry.edges,nl=E.length-1,L=S.state.layers,tp=S.tp;
  /* T (and e from N with it) as chosen under N, P, T, e: the two-point profile where it exists for these layers */
  const tpL=tp&&(real?tp.shapes.log.results[S.state.motion+'|'+S.prior+'|'+L]:tp.shapes.log.layers[L]);
  const log=S.tmode==='log'&&!!tpL,tUsed=log?'log':'lin';
  let est,truthL,fine=null,ground,dates;
  if(real){
    const pp=S.entry.pte.pass,g=S.doc.profiles.ground;dates=S.doc.epochs;
    est=q==='N'?pp.N:q==='P'?pp.P:q==='T'?toC(log?tpL.T:pp.T):(log?pp.N.map((n,j)=>eFrom(n,tpL.P[j],tpL.T[j])):pp.e);
    truthL=q==='N'?pp.N_station:q==='P'?pp.P:q==='T'?toC(pp.T):(log?tpL.e_station:pp.e_station);
    ground=q==='T'?g.T.map(v=>v-273.15):g[q];
  }else{
    const atm=S.atm,lay=atm.layers[L],np=S.run.epochs.length,Nest=[];dates=S.run.epochs;
    for(let j=0;j<np;j++)Nest.push(S.entry.series.map(s=>s.est[j]));
    est=q==='N'?Nest:q==='P'?lay.P:q==='T'?toC(log?tpL.T:lay.T):(log?Nest.map((n,j)=>eFrom(n,tpL.P[j],tpL.T[j])):S.entry.pte.e_pass);
    const mean=(f,j)=>E.slice(0,-1).map((z0,k)=>{let s=0,n=0;for(let z=z0+.5;z<E[k+1];z+=1){s+=fineAt(atm.z,f[j],z);n++;}return s/n;});
    truthL=[];for(let j=0;j<np;j++)truthL.push(q==='N'?S.entry.series.map(s=>s.truth[j]):mean(atm.truth[q],j));
    if(q==='T')truthL=toC(truthL);
    const tc=q==='T'?v=>v-273.15:v=>v;fine={at:(j,z)=>tc(fineAt(atm.z,atm.truth[q][j],z))};
    ground=atm.ground[q].map(tc);
  }
  air={edges:E,nl,est,truthL,fine,ground,dates,tUsed,real};
  /* the scale of the values: the truth's range (1st-99th percentile); of the error: one for every run */
  const tv=truthL.flat().filter(Number.isFinite).sort((a,b)=>a-b),pc=(a,p)=>a[Math.min(a.length-1,Math.floor(a.length*p))];
  air.lo=pc(tv,.01);air.hi=pc(tv,.99);const pad=Math.max((air.hi-air.lo)*.05,q==='N'?1:.1);air.lo-=pad;air.hi+=pad;
  const sc=S.scales&&S.scales[real?'real':'sim'],key=q+(log&&(q==='T'||q==='e')?'_log':'');
  air.span=sc&&Number.isFinite(sc[key])&&sc[key]>0?sc[key]:(q==='N'?5:.5);
  air.r=E.slice(0,-1).map((z,k)=>pcorr(est.map(r=>r[k]),truthL.map(r=>r[k])));
  st.epoch=Math.min(st.epoch,dates.length-1);
  air.note=noteFor(S,log);
}
function noteFor(S,log){
  const m=S.tmode,cab=S.state.layers==='cab';
  const t=log?'T of the estimate: the two-point log profile (the ground and a station 29 m up)':'T of the estimate: falling 6.5 K per km from the ground station';
  const why=m==='log'&&!log?' (no two-point profile for '+(cab?'the Cabauw layers':'these layers')+')':m==='compare'?' (Both is chosen there; this view shows 6.5 K per km)':'';
  return t+why+', as chosen under N, P, T, e; e follows from the radar’s N with it. P: hydrostatic from the ground.'+
    (S.real?' Truth here: KNMI 344 at the airport carried up (N with −55 N per km); P and T are KNMI 344’s own, so they agree with it by construction.':'');
}
/* ---- the scene */
function initScene(){
  renderer=new THREE.WebGLRenderer({canvas:$('cityGl'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  scene=new THREE.Scene();scene.background=new THREE.Color(css('--canvas')||'#fff');
  camera=new THREE.PerspectiveCamera(42,1,1,6000);controls=new OrbitControls(camera,$('cityGl'));controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;
  controls.addEventListener('change',()=>st.need=true);
  scene.add(new THREE.HemisphereLight(0xe8eef4,0xb9b2a6,.9));const sun=new THREE.DirectionalLight(0xffffff,1.2);sun.position.set(300,600,250);scene.add(sun);
  const tex=new THREE.DataTexture(new Uint8Array(256*4),256,1,THREE.RGBAFormat);tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=tex.minFilter=THREE.LinearFilter;
  uniforms={uProf:{value:tex},uBot:{value:0},uTop:{value:1},uMode:{value:1}};
  new ResizeObserver(resize).observe($('city3d'));
  requestAnimationFrame(loop);
  if(new URLSearchParams(location.search).has('debug'))window.__city={get scene(){return scene;},get camera(){return camera;},renderer,st,THREE,get air(){return air;}};
}
function resize(){if(!renderer)return;const el=$('city3d'),w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();st.need=true;drawStrip();drawProfile();}
function dispose(o){if(!o)return;scene.remove(o);o.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});}
function airMaterial(){                              /* the facades coloured by the air at their height */
  const mat=new THREE.MeshLambertMaterial({color:0xffffff});
  mat.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,uniforms);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying float vWy;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWy=(modelMatrix*vec4(position,1.0)).y;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uProf;uniform float uBot,uTop;uniform int uMode;varying float vWy;')
      .replace('#include <color_fragment>','#include <color_fragment>\nvec3 grey=vec3(0.80,0.81,0.82);diffuseColor.rgb=(uMode==0||vWy<uBot||vWy>uTop+0.05)?grey:texture2D(uProf,vec2(clamp((vWy-uBot)/(uTop-uBot),0.0,1.0),0.5)).rgb;');
  };
  return mat;
}
function setGeometry(mesh,edges,points,b,view){
  [bld,bldEdges,pts,ground].forEach(dispose);bld=mesh;bldEdges=edges;pts=points;
  ground=new THREE.Mesh(new THREE.PlaneGeometry(b.x1-b.x0+80,b.z1-b.z0+80),new THREE.MeshLambertMaterial({color:0xe6e6e2}));
  ground.rotation.x=-Math.PI/2;ground.position.set((b.x0+b.x1)/2,b.ground-.05,(b.z0+b.z1)/2);
  [ground,bld,bldEdges,pts].forEach(o=>o&&scene.add(o));box=b;
  camera.position.set(...view.position);controls.target.set(...view.target);controls.update();
}
function buildSynthetic(c){                         /* the invented city: boxes, and its simulated radar points */
  const X=x=>x-c.size/2,Z=y=>-(y-c.size_y/2);
  const geos=c.buildings.map(b=>{const g=new THREE.BoxGeometry(b.x1-b.x0,b.h,b.y1-b.y0);g.translate(X((b.x0+b.x1)/2),c.ground_nap+b.h/2,Z((b.y0+b.y1)/2));return g;});
  const pos=[],nor=[],idx=[];let off=0;
  geos.forEach(g=>{pos.push(...g.attributes.position.array);nor.push(...g.attributes.normal.array);g.index.array.forEach(i=>idx.push(i+off));off+=g.attributes.position.count;g.dispose();});
  const merged=new THREE.BufferGeometry();merged.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));merged.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));merged.setIndex(idx);
  const n=c.x.length,pp=new Float32Array(n*3),col=new Float32Array(n*3),K=[[.55,.57,.6],[.82,.4,.17],[.2,.24,.3]];   /* street grey, facades orange, roofs dark */
  for(let i=0;i<n;i++){pp.set([X(c.x[i]),c.z[i]+.3,Z(c.y[i])],i*3);col.set(K[c.kind[i]]||K[1],i*3);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pp,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
  const r=Math.max(c.size,c.size_y);
  setGeometry(new THREE.Mesh(merged,airMaterial()),new THREE.LineSegments(new THREE.EdgesGeometry(merged,25),new THREE.LineBasicMaterial({color:0x5b6672,transparent:true,opacity:.35})),
    new THREE.Points(g,new THREE.PointsMaterial({size:2.5,sizeAttenuation:false,vertexColors:true})),
    {x0:-c.size/2-10,x1:c.size/2+10,z0:-c.size_y/2-10,z1:c.size_y/2+10,ground:c.ground_nap},{position:[r*.85,r*.6,r*1.05],target:[0,40,0]});
  $('cityPoints').disabled=false;
}
async function buildReal(){                         /* the Rotterdam buildings of the Findings map, the ones on the map only */
  const geo=await getJSON('data/3d/manifest.json'),gltf=await new GLTFLoader().loadAsync('data/3d/'+(innerWidth<768?'buildings-lod12.glb':'buildings-lod22.glb'));
  let g;gltf.scene.traverse(o=>{if(o.isMesh&&!g)g=o.geometry;});
  const gp=geo.ground_plane,x0=gp.centre[0]-gp.width/2,x1=gp.centre[0]+gp.width/2,z0=gp.centre[2]-gp.depth/2,z1=gp.centre[2]+gp.depth/2;
  const p=g.attributes.position,bid=g.attributes._building,off=new Set();
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);if(x<x0||x>x1||z<z0||z>z1)off.add(Math.round(bid.getX(i)));}
  const keep=i=>!off.has(Math.round(bid.getX(i)));
  if(g.index){const ix=g.index.array,o=[];for(let k=0;k<ix.length;k+=3)if(keep(ix[k]))o.push(ix[k],ix[k+1],ix[k+2]);g.setIndex(o);}
  else{const t=[];for(let k=0;k<p.count;k+=3)if(keep(k))t.push(k,k+1,k+2);g.setIndex(t);}
  /* the individual points exist only in a local build (site_export --points); never on the public site */
  let cloud=null;
  try{
    const P=await getJSON('data/2020-2026-ground/points.json'),ids=[];
    for(let i=0;i<P.n_points;i++)if(P.e[i]>=x0&&P.e[i]<=x1&&-P.n_coord[i]>=z0&&-P.n_coord[i]<=z1)ids.push(i);
    const pp=new Float32Array(ids.length*3);ids.forEach((i,j)=>pp.set([P.e[i],geo.ground_nap+P.h_agl[i],-P.n_coord[i]],j*3));
    const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pp,3));
    cloud=new THREE.Points(pg,new THREE.PointsMaterial({size:2.5,sizeAttenuation:false,color:0xd1662b}));
  }catch(e){cloud=null;}
  $('cityPoints').disabled=!cloud;$('cityPoints').closest('label').title=cloud?'':'The real points exist only in a local build; the public site has none';
  setGeometry(new THREE.Mesh(g,airMaterial()),new THREE.LineSegments(new THREE.EdgesGeometry(g,25),new THREE.LineBasicMaterial({color:0x5b6672,transparent:true,opacity:.25})),cloud,
    {x0,x1,z0,z1,ground:geo.ground_nap},geo.presets.overview);
}
function paint(){
  if(!air||!uniforms||!box)return;
  const E=air.edges,bot=E[0],top=E[E.length-1],data=uniforms.uProf.value.image.data;
  for(let i=0;i<256;i++){const c=colourOf(valueAt(st.epoch,bot+(i+.5)/256*(top-bot)));data.set([...c,255],i*4);}
  uniforms.uProf.value.needsUpdate=true;uniforms.uBot.value=bot;uniforms.uTop.value=top;
  const vol=st.view==='blocks';uniforms.uMode.value=vol?0:1;
  if(vol){
    if(!volume){volume=new AirVolume();scene.add(volume.group);}
    volume.setSlabs(box.x0,box.x1,box.z0,box.z1,E,st.interp==='smooth');
    volume.paint(z=>colourOf(valueAt(st.epoch,z)),st.opacity);
  }
  if(volume)volume.group.visible=vol;
  if(bld){bld.visible=st.buildings;bldEdges.visible=st.buildings;}
  if(pts)pts.visible=st.points;
  st.need=true;drawLegend();drawStrip();drawProfile();
}
/* ---- the profile of the pass on show, as under N, P, T, e: the truth (or KNMI 344) as a line, the estimate
   through the layer centres (steps in Layers, the smooth curve in Smooth) with its points, the ground station */
function drawProfile(){
  const el=$('cityProfile');if(!el||!air)return;
  const E=air.edges,j=st.epoch,sm=st.interp==='smooth',Q=QTY[st.qty],show=st.show,tname=air.real?'KNMI 344 carried up':'truth';
  const estAt=z=>sm?smooth(air.est[j],E,z):air.est[j][layerOf(E,z)];
  const truAt=z=>air.fine?air.fine.at(j,z):sm?smooth(air.truthL[j],E,z):air.truthL[j][layerOf(E,z)];
  const lines=show==='r'?[{at:z=>sm?smooth(air.r,E,z):air.r[layerOf(E,z)],colour:'#1f5fa8',width:2.2,name:'r over all passes'}]
    :show==='err'?[{at:z=>estAt(z)-truAt(z),colour:'#1f5fa8',width:2.2,name:'estimate − '+tname}]
    :[{at:truAt,colour:'#17191c',width:1.6,dash:air.real?'5 3':'',name:tname},{at:estAt,colour:'#1f5fa8',width:2.2,name:'estimate'}];
  const dots=show==='truth'||show==='est'?air.est[j].map((v,k)=>({v,z:(E[k]+E[k+1])/2,colour:'#1f5fa8'}))
    .concat([{v:air.ground[j],z:E[0],colour:'#17191c',r:5,tip:(air.real?'KNMI 344':'the station')+' at the ground: '+(+air.ground[j]).toFixed(Q.d)+' '+Q.unit}]):[];
  el.innerHTML=profileSVG({w:el.clientWidth||300,h:el.clientHeight||380,bot:E[0],top:E[E.length-1],edges:E,layered:!sm,lines,dots,
    unit:show==='r'?'r':Q.name.split(' ').pop()+' ('+Q.unit+')',dec:show==='r'?1:Q.d,zero:show==='err',range:show==='r'?[0,1]:null,
    title:show==='r'?'r per height, all passes':'Profile on '+String(air.dates[j]).slice(0,10)});
}
/* ---- legend, the strip of every pass and height with the ground station under it, the pass on show */
const showName=()=>({truth:air.real?'KNMI 344 carried up':'True air (simulation)',est:'Estimate',err:'Error: estimate − '+(air.real?'KNMI 344':'truth'),r:'r over all passes, estimate with '+(air.real?'KNMI 344':'the truth')})[st.show];
function drawLegend(){
  const cv=$('cityLegendBar'),w=cv.clientWidth||220,h=14,ctx=cv.getContext('2d');cv.width=w*2;cv.height=h*2;ctx.scale(2,2);
  for(let x=0;x<w;x++){const t=x/(w-1);ctx.fillStyle='rgb('+(st.show==='err'?ramp(RDBU,t):ramp(BLUES,t)).join(',')+')';ctx.fillRect(x,0,1.5,h);}
  const Q=QTY[st.qty],lo=st.show==='err'?-air.span:st.show==='r'?0:air.lo,hi=st.show==='err'?air.span:st.show==='r'?1:air.hi,d=st.show==='r'?1:Q.d;
  $('cityLegendLo').textContent=(st.show==='err'?'':'')+lo.toFixed(d);$('cityLegendHi').textContent=(st.show==='err'?'+':'')+hi.toFixed(d)+(st.show==='r'?'':' '+Q.unit);
  $('cityLegendText').textContent=showName()+' · '+Q.name+(st.show==='err'?' · red: too low, blue: too high; one scale for every '+(air.real?'real-data variant':'run'):'')+' · beyond the scale saturated';
}
function drawStrip(){
  if(!air)return;
  const cv=$('cityStrip'),w=cv.clientWidth,h=cv.clientHeight||120;if(!w)return;
  const ctx=cv.getContext('2d');cv.width=w*2;cv.height=h*2;ctx.scale(2,2);ctx.clearRect(0,0,w,h);
  const E=air.edges,bot=E[0],top=E[E.length-1],n=air.dates.length,x0=42,x1=w-12,y0=14,y1=h-28,dx=(x1-x0)/Math.max(1,n-1),Xp=i=>x0+i*dx,rows=Math.max(20,Math.floor(y1-y0));
  for(let i=0;i<n;i++)for(let r=0;r<rows;r++){const z=bot+(r+.5)/rows*(top-bot);ctx.fillStyle='rgb('+colourOf(valueAt(i,z)).join(',')+')';ctx.fillRect(Xp(i)-dx/2,y1-(r+1)*(y1-y0)/rows,dx+.6,(y1-y0)/rows+.4);}
  /* the ground station's own value on every pass, in the colours of the values (not for the error or r) */
  if(st.show==='truth'||st.show==='est')air.ground.forEach((v,i)=>{ctx.fillStyle='rgb('+colourOf(v).join(',')+')';ctx.fillRect(Xp(i)-dx/2,y1+3,dx+.6,6);});
  ctx.strokeStyle='#d1662b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(Xp(st.epoch),y0);ctx.lineTo(Xp(st.epoch),y1);ctx.stroke();ctx.lineWidth=1;
  ctx.fillStyle=css('--muted');ctx.font='10px system-ui';ctx.textAlign='right';ctx.fillText(Math.round(top)+' m',x0-5,y0+8);ctx.fillText(Math.round(bot)+' m',x0-5,y1-2);
  if(st.show==='truth'||st.show==='est')ctx.fillText(air.real?'KNMI':'station',x0-5,y1+9);
  ctx.textAlign='left';ctx.fillText(showName()+': '+QTY[st.qty].name+', every pass and height (m NAP)',x0+4,10);
  let yr;air.dates.forEach((d,i)=>{const y=String(d).slice(0,4);if(y!==yr){yr=y;ctx.fillText(y,Xp(i),h-4);}});
  cv.setAttribute('aria-valuenow',st.epoch);cv.setAttribute('aria-valuemax',n-1);
  const Q=QTY[st.qty],lo=valueAt(st.epoch,bot+1),hi=valueAt(st.epoch,top-1),gv=air.ground[st.epoch],d=st.show==='r'?2:Q.d,u=st.show==='r'?'':' '+Q.unit;
  $('cityLabel').textContent=String(air.dates[st.epoch]).slice(0,10)+' · near the ground '+(Number.isFinite(lo)?lo.toFixed(d):'n/a')+', at the top '+(Number.isFinite(hi)?hi.toFixed(d):'n/a')+u+
    (Number.isFinite(gv)?' · '+(air.real?'KNMI 344':'the station')+' at the ground '+gv.toFixed(Q.d)+' '+Q.unit:'');
}
function loop(t){
  requestAnimationFrame(loop);const vis=$('city3d').getClientRects().length;if(!vis)return;
  controls.update();if(st.need){if(volume)volume.render(renderer,scene,camera);else renderer.render(scene,camera);st.need=false;}
}
function wire(){
  const radios=(name,key,after)=>document.querySelectorAll('input[name="'+name+'"]').forEach(r=>{r.checked=r.value===st[key];r.addEventListener('change',()=>{st[key]=r.value;after();});});
  radios('cityShow','show',paint);
  radios('cityQty','qty',()=>{current&&buildAir(current);$('cityNote').textContent=air.note;paint();});
  radios('cityView','view',()=>{$('cityOpacityBox').hidden=st.view!=='blocks';paint();});
  radios('cityInterp','interp',paint);
  $('cityOpacity').addEventListener('input',e=>{st.opacity=Number(e.target.value)/100;paint();});
  $('cityBuildings').addEventListener('change',e=>{st.buildings=e.target.checked;paint();});
  $('cityPoints').addEventListener('change',e=>{st.points=e.target.checked;paint();});
  /* the strip is the pass picker: press and drag across it; the arrow keys step a pass */
  const strip=$('cityStrip'),pick=e=>{if(!air)return;const r=strip.getBoundingClientRect(),n=air.dates.length;
    const j=Math.max(0,Math.min(n-1,Math.round((e.clientX-r.left-42)/((r.width-54)/Math.max(1,n-1)))));if(j!==st.epoch){st.epoch=j;paint();}};
  strip.addEventListener('pointerdown',e=>{strip.setPointerCapture(e.pointerId);pick(e);});
  strip.addEventListener('pointermove',e=>{if(strip.hasPointerCapture(e.pointerId))pick(e);});
  strip.addEventListener('keydown',e=>{if(!air||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();st.epoch=Math.max(0,Math.min(air.dates.length-1,st.epoch+(e.key==='ArrowRight'?1:-1)));paint();});
}
let current=null,wired=false,ptePass=null;
/* called by simulator.js whenever the run on show changes or the tab opens */
export async function render(){
  const V=window.VRSSim,S=V&&V.now();
  if(!S){$('cityStatus').textContent='Pick a combination with results to see its city.';return;}
  $('cityStatus').textContent='Loading the city and the air of every pass…';
  if(!wired){wire();wired=true;initScene();}
  const key=S.real?'real':S.state.atm+'_p'+S.state.points;
  try{
    const [scales,tp,atm,c]=await Promise.all([getJSON('data/simulator/city/error_scale.json').catch(()=>null),V.tp(),S.real?null:V.atm(S.state),S.real?null:getJSON('data/simulator/city/'+key+'.json')]);
    if(key!==geomKey){geomKey=key;if(S.real)await buildReal();else buildSynthetic(c);}
    current=Object.assign({},S,{scales,tp,atm,tmode:V.tmode()});
    buildAir(current);
    const pj=V.pass();if(pj!==ptePass){ptePass=pj;if(Number.isInteger(pj))st.epoch=Math.min(pj,air.dates.length-1);}
    $('cityStatus').textContent=S.real?'The real Rotterdam buildings on the map, '+S.doc.passes+' passes; motion '+(S.state.motion==='scatterer'?'per scatterer':'per building')+', air prior '+(S.prior==='ground'?'from the ground':'none (radar only)')+', the layers of the panel.'
      :c.buildings.length+' buildings of the synthetic city ('+c.atm+' air, '+c.x.length.toLocaleString('en-GB')+' points, seed '+c.seed+'); the same simulation and estimate as the other tabs.';
    document.querySelectorAll('input[name="cityShow"]').forEach(r=>{const off=S.real&&r.value!=='est';r.closest('label').hidden=off;if(off&&r.checked){r.checked=false;}});
    if(S.real&&st.show!=='est'){st.show='est';document.querySelector('input[name="cityShow"][value="est"]').checked=true;buildAir(current);}
    $('cityNote').textContent=air.note;$('cityTitle').textContent=S.real?'The real city and its air':'The simulated city and its air';
    document.querySelector('input[name="cityShow"][value="truth"]+span').textContent=S.real?'KNMI 344':'Truth';
  }catch(err){$('cityStatus').textContent='The city of this run could not be loaded ('+err.message+').';return;}
  resize();paint();
}
