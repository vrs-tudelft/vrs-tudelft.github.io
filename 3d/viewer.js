/* Two questions on one city: where do published radar groups provide height support (Radar points), and
   what air did the radar find on each pass (Air). The air is the report's real-data run in the simulator's
   data (data/simulator/real.json: per pass the estimated refractivity N per height layer, and KNMI 344's
   ground N carried up with -55 N/km), shown as each layer's anomaly from its mean over the passes.
   Geometry and all statistics remain the original public aggregate products. */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {supportedBands,heightSummary,heightContrast,heightProfile} from './research.js?v=20261101c';
import {AirVolume} from './airvolume.js?v=20261103b';
import {smoothAt,profileSVG} from './profile.js?v=20261103a';

const $=id=>document.getElementById(id),root=document.documentElement.dataset.root||'';
const geo=root+'data/3d/', stage=$('stage'), css=name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const state={height:40,epoch:0,selected:null,playing:false,speed:8,needsRender:true,mode:'air',motion:'building',prior:'ground',layers:'n500',qty:'N',view:'blocks',interp:'smooth',opacity:.2,showPoints:false,showBuildings:true};
let D,ds,renderer,scene,camera,persp,ortho,controls,buildings,ground,uniforms,texture,selectionBox,contrast;
const boundsCache=new Map();
let maxCount=100;
/* the air: real.json, its layers per setup, and one sequential colour scale (light: low, dark blue: high) */
const LAYER_NAME={n1000:'≥1000 points',n500:'≥500 points','2':'two','1':'one'};
const QTY={N:{name:'Refractivity N',unit:'N',d:0},P:{name:'Pressure P',unit:'hPa',d:1},T:{name:'Temperature T',unit:'°C',d:1},e:{name:'Water-vapour pressure e',unit:'hPa',d:1}};
let real=null,air=null,points=null,pointCloud=null,buildingEdges=null,offMap=new Set();
const profTex=()=>{const t=new THREE.DataTexture(new Uint8Array(256*4),256,1,THREE.RGBAFormat);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=t.minFilter=THREE.LinearFilter;t.needsUpdate=true;return t;};
const BLUES=[[239,243,255],[198,219,239],[158,202,225],[107,174,214],[66,146,198],[33,113,181],[8,69,148]];   /* white to dark blue, as at first */
function airColour(v,lo,hi){
  if(!Number.isFinite(v))return [200,203,206];
  const t=THREE.MathUtils.clamp((v-lo)/(hi-lo),0,1)*(BLUES.length-1),k=Math.min(Math.floor(t),BLUES.length-2),f=t-k;
  return BLUES[k].map((c,i)=>Math.round(c+(BLUES[k+1][i]-c)*f));
}
const pct=(a,q)=>a[Math.min(a.length-1,Math.max(0,Math.floor(a.length*q)))];
function buildAir(){
  air=null;if(!real)return;
  const e=real.results?.[state.motion]?.[state.prior]?.[state.layers];if(!e||!e.pte)return;
  const pp=e.pte.pass,q=state.qty,toC=rows=>rows.map(r=>r.map(v=>Number.isFinite(v)?v-273.15:NaN));
  /* the radar: N per layer, e from N with P and T; P and T are KNMI 344's alone (hydrostatic, 6.5 K/km) */
  const radar=q==='T'?toC(pp.T):pp[q],knmi=q==='N'?pp.N_station:q==='e'?pp.e_station:q==='T'?toC(pp.T):pp.P;
  /* one scale for both, from the station's range (1st-99th percentile): the radar's thin layers swing
     several times more on the real data, which shows as saturated colour rather than a washed-out station */
  const st=knmi.flat().filter(Number.isFinite).sort((a,b)=>a-b);
  let lo=pct(st,.01),hi=pct(st,.99);const pad=Math.max((hi-lo)*.05,q==='N'?1:.1);lo-=pad;hi+=pad;
  const g=real.profiles.ground,ground=q==='T'?g.T.map(v=>Number.isFinite(v)?v-273.15:NaN):g[q];   /* KNMI 344 at the airport, at the ground */
  air={edges:e.edges,nl:e.edges.length-1,radar,knmi,lo,hi,ground};
}
const airRows=()=>air?(state.mode==='knmi'?air.knmi:air.radar):null;
/* the value at height z (m NAP) on one pass: the layer it is in, or the smooth profile through the layer
   centres (3d/profile.js: monotone, carried on along its end slope as the simulator's profiles) */
const NS=256;
function profileAt(row,z){
  const E=air.edges,nl=air.nl;
  if(z<E[0]||z>E[nl])return NaN;
  if(state.interp!=='smooth'){for(let k=0;k<nl;k++)if(z<E[k+1]||k===nl-1)return row[k];}
  return smoothAt(row,E,z);
}
/* the profile of the pass on show, as under N, P, T, e in the simulator: the radar's estimate (steps or smooth,
   its points at the layer centres) and KNMI 344 carried up, with KNMI 344 at the ground */
function drawProfile(){
  const el=$('airProfile');if(!el||!air||!D)return;
  const E=air.edges,j=state.epoch,Q=QTY[state.qty],r=air.radar[j],k=air.knmi[j],gv=air.ground[j];
  el.innerHTML=profileSVG({w:el.clientWidth||300,h:el.clientHeight||420,bot:E[0],top:E[air.nl],edges:E,layered:state.interp!=='smooth',
    lines:[{at:z=>profileAt(k,z),colour:'#17191c',width:1.6,dash:'5 3',name:'KNMI 344 carried up'},{at:z=>profileAt(r,z),colour:'#1f5fa8',width:2.2,name:'radar estimate'}],
    dots:r.map((v,i)=>({v,z:(E[i]+E[i+1])/2,colour:'#1f5fa8'})).concat([{v:gv,z:E[0],colour:'#17191c',r:5,tip:'KNMI 344 at the ground: '+(+gv).toFixed(Q.d)+' '+Q.unit}]),
    unit:Q.name.split(' ').pop()+' ('+Q.unit+')',dec:Q.d,title:'Profile on '+D.epochs.dates[j]});
}
/* the whole atmosphere as filled slabs over the map (3d/airvolume.js) */
let volume=null;
function placeVolume(){
  if(!air||!uniforms)return;
  if(!volume){volume=new AirVolume();scene.add(volume.group);}
  const gp=D.geometry.ground_plane,cx=gp.centre[0],cz=gp.centre[2],row=airRows()[state.epoch];
  volume.setSlabs(cx-gp.width/2,cx+gp.width/2,cz-gp.depth/2,cz+gp.depth/2,air.edges,state.interp==='smooth');
  volume.paint(z=>airColour(profileAt(row,z),air.lo,air.hi),state.opacity);
}
/* every coherent radar point, from the local-only per-point build; absent on the public site */
function makePointCloud(){
  if(pointCloud||!points||!scene)return;
  /* only the points over the modelled area (the ground plane); the export reaches further */
  const gp=D.geometry.ground_plane,inside=i=>Math.abs(points.e[i]-gp.centre[0])<=gp.width/2&&Math.abs(-points.n_coord[i]-gp.centre[2])<=gp.depth/2;
  const ids=[];for(let i=0;i<points.n_points;i++)if(inside(i))ids.push(i);
  const n=ids.length,pos=new Float32Array(n*3),col=new Float32Array(n*3),g0=D.geometry.ground_nap,c=new THREE.Color();
  for(let j=0;j<n;j++){
    const i=ids[j];
    pos.set([points.e[i],g0+points.h_agl[i],-points.n_coord[i]],j*3);
    const v=colour(20+Math.min(1,Math.max(0,points.h_agl[i]/150))*(maxCount-20));c.setRGB(v[0]/255,v[1]/255,v[2]/255,THREE.SRGBColorSpace);col.set([c.r,c.g,c.b],j*3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
  pointCloud=new THREE.Points(g,new THREE.PointsMaterial({size:3,sizeAttenuation:false,vertexColors:true,depthTest:true}));
  pointCloud.renderOrder=3;scene.add(pointCloud);
}
function showPoints(){
  if(state.showPoints)makePointCloud();
  if(pointCloud)pointCloud.visible=state.showPoints;
  state.needsRender=true;
}
function updateAir(){
  if(!uniforms)return;
  const on=state.mode!=='points'&&!!air,asVol=on&&state.view==='blocks';
  uniforms.uMode.value=asVol?2:on?1:0;                /* 2: plain grey buildings inside the see-through air */
  if(asVol)placeVolume();
  if(volume)volume.group.visible=asVol;
  if(buildings)buildings.visible=state.showBuildings;if(buildingEdges)buildingEdges.visible=state.showBuildings;
  if(air){
    const row=airRows()[state.epoch],bot=air.edges[0],top=air.edges[air.nl],data=uniforms.uProf.value.image.data;
    for(let i=0;i<NS;i++){const c=airColour(profileAt(row,bot+(i+.5)/NS*(top-bot)),air.lo,air.hi);data.set([...c,255],i*4);}
    uniforms.uProf.value.needsUpdate=true;uniforms.uBot.value=bot;uniforms.uTop.value=top;
  }
  knmiMark();drawProfile();
  state.needsRender=true;
}
/* The map at its standard settings, from the overview angle, on pass j, drawn into a 2D canvas (the small map
   under Radar vs weather station). The settings on show are put back afterwards; the view itself is not touched. */
const STANDARD={layers:'n500',qty:'N',view:'blocks',interp:'smooth',opacity:.2,motion:'building',prior:'ground',showBuildings:true,showPoints:false};
let miniRT=null,miniCam=null;
export function miniView(canvas,j){
  if(!renderer||!buildings||!real)return false;
  const pr=Math.min(devicePixelRatio||1,2),W=Math.max(2,Math.round((canvas.clientWidth||320)*pr)),H=Math.max(2,Math.round((canvas.clientHeight||240)*pr));
  const keep={epoch:state.epoch};Object.keys(STANDARD).forEach(k=>keep[k]=state[k]);const sel=selectionBox?selectionBox.visible:null;
  Object.assign(state,STANDARD,{opacity:.35,epoch:Math.max(0,Math.min(D.epochs.n_epochs-1,j))});   /* a little denser in the small picture */buildAir();updateAir();showPoints();if(selectionBox)selectionBox.visible=false;
  if(!miniRT||miniRT.width!==W||miniRT.height!==H){miniRT?.dispose();miniRT=new THREE.WebGLRenderTarget(W,H,{samples:4});miniRT.texture.colorSpace=THREE.SRGBColorSpace;}
  if(!miniCam)miniCam=new THREE.PerspectiveCamera(42,1,1,6000);
  /* the overview angle, closer in; a narrower picture steps back a little */
  const p=D.geometry.presets.overview,t=new THREE.Vector3(...p.target),pos=new THREE.Vector3(...p.position).sub(t).multiplyScalar(.82*Math.max(1,1.6/(W/H))).add(t);   /* closer in than the map */
  miniCam.aspect=W/H;miniCam.up.set(0,1,0);miniCam.position.copy(pos);miniCam.lookAt(t);miniCam.updateProjectionMatrix();
  renderer.setRenderTarget(miniRT);renderer.render(scene,miniCam);
  const px=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(miniRT,0,0,W,H,px);renderer.setRenderTarget(null);
  Object.assign(state,keep);buildAir();updateAir();showPoints();if(selectionBox&&sel!==null)selectionBox.visible=sel;
  canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d'),img=ctx.createImageData(W,H);
  for(let y=0;y<H;y++)img.data.set(px.subarray((H-1-y)*W*4,(H-y)*W*4),y*W*4);          /* WebGL rows run bottom-up */
  ctx.putImageData(img,0,0);return true;
}
/* KNMI 344's ground value shows as the bottom row of the strip only (no dot on the map) */
function knmiMark(){$('heightSummary').style.display='none';}
async function json(url){const r=await fetch(url);if(!r.ok)throw Error(url+': '+r.status);return r.json();}
function colour(n){
  const stops=window.VRS_COLORMAPS.cividis,t=THREE.MathUtils.clamp((n-20)/(maxCount-20),0,1)*(stops.length-1),k=Math.min(Math.floor(t),stops.length-2),f=t-k;
  return stops[k].map((v,i)=>Math.round(v+(stops[k+1][i]-v)*f));
}
const rgb=n=>'rgb('+colour(n).join(',')+')';
function resize(){
  if(!renderer||!stage.clientWidth||!stage.clientHeight)return;
  const w=stage.clientWidth,h=stage.clientHeight;
  renderer.setSize(w,h,false);persp.aspect=w/h;persp.updateProjectionMatrix();
  const hw=D.geometry.presets.satellite.half_width;
  ortho.left=-hw;ortho.right=hw;ortho.top=hw*h/w;ortho.bottom=-hw*h/w;ortho.updateProjectionMatrix();
  state.needsRender=true;drawTimeline();drawProfile();
}
function initScene(){
  renderer=new THREE.WebGLRenderer({canvas:$('gl'),antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  scene=new THREE.Scene();scene.background=new THREE.Color(css('--canvas')||'#fff');
  persp=new THREE.PerspectiveCamera(42,1,1,6000);ortho=new THREE.OrthographicCamera(-480,480,300,-300,1,6000);camera=persp;
  controls=new OrbitControls(camera,$('gl'));controls.enableDamping=true;controls.dampingFactor=.1;
  controls.maxPolarAngle=Math.PI*.49;controls.minDistance=30;controls.maxDistance=2500;
  controls.addEventListener('change',()=>state.needsRender=true);
  scene.add(new THREE.HemisphereLight(0xe8eef4,0xb9b2a6,.9));
  const sun=new THREE.DirectionalLight(0xffffff,1.2);sun.position.set(300,600,250);scene.add(sun);
  const p=D.geometry.ground_plane;
  ground=new THREE.Mesh(new THREE.PlaneGeometry(p.width,p.depth),new THREE.MeshLambertMaterial({color:0xe6e6e2}));
  ground.rotation.x=-Math.PI/2;ground.position.set(...p.centre);scene.add(ground);
  const grid=new THREE.GridHelper(p.width,Math.round(p.width/25),0xbdc5c8,0xdde1e1);
  grid.position.set(p.centre[0],p.centre[1]+.05,p.centre[2]);scene.add(grid);
  new ResizeObserver(resize).observe(stage);resize();
}
async function loadModels(){
  const mobile=innerWidth<768,file=mobile?'buildings-lod12.glb':'buildings-lod22.glb';
  const gltf=await new GLTFLoader().loadAsync(geo+file);let geometry;
  gltf.scene.traverse(o=>{if(o.isMesh&&!geometry)geometry=o.geometry;});
  if(!geometry?.attributes._building)throw Error('Building identity is missing from the geometry');
  {
    const gp=D.geometry.ground_plane,x0=gp.centre[0]-gp.width/2,x1=gp.centre[0]+gp.width/2,z0=gp.centre[2]-gp.depth/2,z1=gp.centre[2]+gp.depth/2;
    const pos=geometry.attributes.position,bid=geometry.attributes._building,off=new Set();
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);if(x<x0||x>x1||z<z0||z>z1)off.add(Math.round(bid.getX(i)));}
    if(off.size){
      const keep=i=>!off.has(Math.round(bid.getX(i)));
      if(geometry.index){const ix=geometry.index.array,out=[];for(let k=0;k<ix.length;k+=3)if(keep(ix[k]))out.push(ix[k],ix[k+1],ix[k+2]);geometry.setIndex(out);}
      else{const tri=[];for(let k=0;k<pos.count;k+=3)if(keep(k))tri.push(k,k+1,k+2);geometry.setIndex(tri);}
      offMap=off;
    }
  }
  const rows=D.bld.order.length,table0=D.bld.order.flatMap(id=>supportedBands(D.bld.buildings[id],D.bld.min_n).map(b=>b.hi));
  const cols=Math.max(10,Math.ceil(Math.max(0,...table0)/10)),table=new Uint8Array(rows*cols*4);   // one 10 m slab per column, as high as the data go
  D.bld.order.forEach((id,row)=>supportedBands(D.bld.buildings[id],D.bld.min_n).forEach(b=>{
    const column=b.lo/10;if(!Number.isInteger(column)||column<0||column>=cols)return;
    const k=(row*cols+column)*4;table.set([...colour(b.n),255],k);
  }));
  const lookup=new THREE.DataTexture(table,cols,rows,THREE.RGBAFormat);
  lookup.magFilter=lookup.minFilter=THREE.NearestFilter;lookup.needsUpdate=true;
  uniforms={uTable:{value:lookup},uFocus:{value:state.height/10},uMode:{value:0},
    uProf:{value:profTex()},uBot:{value:0},uTop:{value:1},
    uGround:{value:D.bld.order.map(id=>D.bld.bag3d[id]?.ground_nap??D.geometry.ground_nap)},
    uSupport:{value:D.bld.order.flatMap(id=>{const h=D.bld.buildings[id]?.h_agl;return h?[h.min,h.max]:[-1,-1];})}};
  const material=new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float _building;\nvarying float vBid,vY;').replace('#include <begin_vertex>','#include <begin_vertex>\nvBid=_building;vY=position.y;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D uTable;uniform float uFocus;uniform float uGround[${rows}];uniform vec2 uSupport[${rows}];varying float vBid,vY;
uniform int uMode;uniform sampler2D uProf;uniform float uBot,uTop;`)
      .replace('#include <color_fragment>',`#include <color_fragment>
{int id=int(vBid+0.5);float height=vY-uGround[id];float band=floor(height/10.0);
vec4 c=texture2D(uTable,vec2((clamp(band,0.0,${cols-1}.0)+0.5)/${cols}.0,(vBid+0.5)/${rows}.0));
if(band<0.0||band>${cols-1}.0||height<uSupport[id].x||height>uSupport[id].y)c.a=0.0;
vec3 grey=vec3(0.80,0.81,0.82);diffuseColor.rgb=c.a>0.5?c.rgb:grey;
if(c.a>0.5&&abs(band-uFocus)>0.1)diffuseColor.rgb=mix(grey,c.rgb,0.32);
if(uMode==1){diffuseColor.rgb=(vY<uBot||vY>uTop+0.05)?grey:texture2D(uProf,vec2((vY-uBot)/(uTop-uBot),0.5)).rgb;}
if(uMode==2)diffuseColor.rgb=grey;}`);
  };
  buildings=new THREE.Mesh(geometry,material);scene.add(buildings);updateAir();
  if(!mobile){buildingEdges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,25),new THREE.LineBasicMaterial({color:0x5b6672,transparent:true,opacity:.25}));scene.add(buildingEdges);}
}
function setPreset(key){
  if(!renderer)return;
  const p=key==='side'?{position:[0,70,760],target:[0,60,0]}:D.geometry.presets[key];if(!p)return;   /* side: at eye level from the south */
  camera=p.orthographic||key==='top'?ortho:persp;controls.object=camera;
  controls.maxPolarAngle=key==='top'?Math.PI:Math.PI*.49;
  camera.up.set(...(p.up||[0,1,0]));camera.position.set(...p.position);controls.target.set(...p.target);controls.update();resize();
  document.querySelectorAll('#presets button').forEach(b=>b.classList.toggle('on',b.dataset.p===key));
}
function boundsFor(id){
  if(!buildings)return null;if(boundsCache.has(id))return boundsCache.get(id);
  const row=D.bld.order.indexOf(id),g=buildings.geometry,box=new THREE.Box3(),v=new THREE.Vector3();
  for(let i=0;i<g.attributes.position.count;i++)if(Math.round(g.attributes._building.getX(i))===row)box.expandByPoint(v.fromBufferAttribute(g.attributes.position,i));
  boundsCache.set(id,box);return box;
}
function outline(id){
  if(!scene)return;
  if(selectionBox){scene.remove(selectionBox);selectionBox.geometry.dispose();selectionBox.material.dispose();}
  const box=boundsFor(id);if(!box||box.isEmpty())return;
  selectionBox=new THREE.Box3Helper(box,0xd3792e);scene.add(selectionBox);state.needsRender=true;
}
function focus(){
  const box=boundsFor(state.selected);if(!box||box.isEmpty())return;
  const centre=box.getCenter(new THREE.Vector3()),distance=Math.max(130,box.getSize(new THREE.Vector3()).length()*1.25);
  camera=persp;controls.object=camera;camera.up.set(0,1,0);camera.position.copy(centre).add(new THREE.Vector3(distance*.8,distance*.45,distance));controls.target.copy(centre);controls.update();resize();
  document.querySelectorAll('#presets button').forEach(b=>b.classList.remove('on'));
}
export function selectBuilding(id,save=true){
  if(!D.bld.order.includes(id))return;
  state.selected=id;$('buildingPop').hidden=false;   /* chosen by clicking a building; its card opens over the map */
  const r=D.bld.buildings[id],a=D.bld.bag3d[id],s=heightSummary(r,a,D.bld.min_n);contrast=heightContrast(r,D.bld.min_n);
  $('card').innerHTML='<div class="city-selection-head"><div>'+window.VRSBuildings.identity(id,r,a)+'</div><button type="button" id="focusBuilding" aria-label="Locate this building in the city">Locate</button></div>'+
    '<div class="city-selection-stats"><div><b>'+(s.points===null?'n/a':s.points.toLocaleString('en-GB'))+'</b><span>radar points</span></div><div><b>'+s.bands+'</b><span>published slabs</span></div><div><b>'+(s.highest===null?'n/a':s.highest.toFixed(1)+' m')+'</b><span>highest point</span></div></div>'+
    '<div class="height-profile">'+heightProfile(r,a,rgb,D.bld.min_n)+'</div>';
  $('focusBuilding').addEventListener('click',focus);outline(id);drawTimeline();
  if(save){const u=new URL(location.href);u.searchParams.set('building',id);u.hash='coverage';history.replaceState(history.state,'',u);}
}
function heightSlice(){
  state.height=Math.max(0,Math.min(Math.floor(ds.h_top_m/10)*10,Math.floor(state.height/10)*10));
  $('heightSlice').max=Math.floor(ds.h_top_m/10)*10;$('heightSlice').value=state.height;
  const label=state.height+'–'+(state.height+10)+' m';$('heightLabel').textContent=label;
  $('heightSlice').setAttribute('aria-valuetext',label+' above ground');
  const groups=Object.values(D.bld.buildings).flatMap(r=>supportedBands(r,D.bld.min_n).filter(b=>b.lo===state.height));
  $('sliceStatus').textContent=groups.length+' buildings · '+groups.reduce((n,b)=>n+b.n,0).toLocaleString('en-GB')+' published points';
  $('heightSummary').innerHTML='<b>'+label+' above ground</b><span>'+groups.length+' of '+D.bld.order.length+' building models have a published group here</span>';
  if(uniforms)uniforms.uFocus.value=state.height/10;state.needsRender=true;
}
function drawLegend(){
  const cv=$('legend'),w=cv.clientWidth||260,h=40,ctx=cv.getContext('2d');cv.width=w*2;cv.height=h*2;ctx.scale(2,2);
  if(state.mode!=='points'&&air){
    const Q=QTY[state.qty];
    for(let x=0;x<w;x++){ctx.fillStyle='rgb('+airColour(air.lo+x/(w-1)*(air.hi-air.lo),air.lo,air.hi).join(',')+')';ctx.fillRect(x,2,1.5,12);}
    ctx.font='10px system-ui';ctx.fillStyle=css('--muted');ctx.textBaseline='top';ctx.fillText(air.lo.toFixed(Q.d),0,18);ctx.textAlign='center';ctx.fillText(((air.lo+air.hi)/2).toFixed(Q.d),w/2,18);ctx.textAlign='right';ctx.fillText(air.hi.toFixed(Q.d)+' '+Q.unit,w,18);
    $('legendText').textContent=(state.mode==='knmi'?'KNMI 344 carried up':'Radar estimate')+' · '+Q.name+' per layer on the pass shown · beyond the scale saturated · grey: outside the layers';
    return;
  }
  for(let x=0;x<w;x++){ctx.fillStyle=rgb(20+x/(w-1)*(maxCount-20));ctx.fillRect(x,2,1.5,12);}
  ctx.font='10px system-ui';ctx.fillStyle=css('--muted');ctx.textBaseline='top';ctx.fillText('20',0,18);ctx.textAlign='center';ctx.fillText(Math.round((20+maxCount)/2),w/2,18);ctx.textAlign='right';ctx.fillText(maxCount,w,18);
  $('legendText').textContent='Points per 10 m group · active band bright · grey: no published group';
}
export function setEpoch(value,quiet){
  state.epoch=Math.max(0,Math.min(D.epochs.n_epochs-1,Math.round(value)));if(state.mode!=='points')updateAir();drawTimeline();
  window.VRSPass=state.epoch;
  if(!quiet)document.dispatchEvent(new CustomEvent('vrs:pass',{detail:{index:state.epoch,from:'map'}}));   /* the comparison charts follow */
}
document.addEventListener('vrs:pass',e=>{if(e.detail.from!=='map'&&D)setEpoch(e.detail.index,true);});
/* the whole air at once: passes left to right, layers bottom to top (heights to scale), the pass on show marked */
function drawAirStrip(ctx,w,h){
  const Q=QTY[state.qty],rows=airRows(),x0=42,x1=w-12,y0=14,y1=h-22,n=rows.length,top=air.edges[air.nl],bot=air.edges[0];
  const X=i=>x0+i/(n-1)*(x1-x0),Y=z=>y1-(z-bot)/(top-bot)*(y1-y0),dx=(x1-x0)/(n-1);
  if(state.interp==='smooth')rows.forEach((r,i)=>{for(let y=Math.floor(y0);y<y1;y++){const z=bot+(y1-y-.5)/(y1-y0)*(top-bot);ctx.fillStyle='rgb('+airColour(profileAt(r,z),air.lo,air.hi).join(',')+')';ctx.fillRect(X(i)-dx/2,y,dx+.6,1.2);}});
  else rows.forEach((r,i)=>r.forEach((v,k)=>{ctx.fillStyle='rgb('+airColour(v,air.lo,air.hi).join(',')+')';ctx.fillRect(X(i)-dx/2,Y(air.edges[k+1]),dx+.6,Y(air.edges[k])-Y(air.edges[k+1])+.4);}));
  air.ground.forEach((v,i)=>{ctx.fillStyle='rgb('+airColour(v,air.lo,air.hi).join(',')+')';ctx.fillRect(X(i)-dx/2,y1+3,dx+.6,6);});
  ctx.strokeStyle='#d1662b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(X(state.epoch),y0);ctx.lineTo(X(state.epoch),y1);ctx.stroke();ctx.lineWidth=1;
  ctx.fillStyle=css('--muted');ctx.font='10px system-ui';ctx.textAlign='right';
  ctx.fillText(Math.round(top)+' m',x0-5,Y(top)+8);ctx.fillText(Math.round(bot)+' m',x0-5,Y(bot)-2);ctx.fillText('KNMI',x0-5,y1+9);
  ctx.textAlign='left';ctx.fillText((state.mode==='knmi'?'KNMI 344 carried up':'Radar estimate')+': '+Q.name+' per layer ('+LAYER_NAME[state.layers]+' layers, m NAP), all '+n+' passes',x0+5,11);
  let year;D.epochs.dates.forEach((d,i)=>{if(d.slice(0,4)!==year){year=d.slice(0,4);ctx.fillText(year,X(i),h-6);}});
  const r=rows[state.epoch];let sw=0,sv=0;r.forEach((v,k)=>{if(Number.isFinite(v)){const t=air.edges[k+1]-air.edges[k];sw+=t;sv+=v*t;}});
  $('epochLabel').textContent=D.epochs.dates[state.epoch]+' · column mean '+(sw?(sv/sw).toFixed(Q.d):'n/a')+' '+Q.unit+' · lowest layer '+(Number.isFinite(r[0])?r[0].toFixed(Q.d):'n/a')+', highest '+(Number.isFinite(r[r.length-1])?r[r.length-1].toFixed(Q.d):'n/a');
}
function drawTimeline(){
  if(!D)return;
  const cv=$('strip'),w=cv.clientWidth,h=cv.clientHeight||90;if(!w)return;
  const ctx=cv.getContext('2d');cv.width=w*2;cv.height=h*2;ctx.scale(2,2);ctx.clearRect(0,0,w,h);
  $('tSlider').value=state.epoch;
  if(state.mode!=='points'&&air){drawAirStrip(ctx,w,h);return;}
  const date=D.epochs.dates[state.epoch],v=contrast?.series[state.epoch];
  $('epochLabel').textContent=date+' · '+(Number.isFinite(v)?(v>0?'+':'')+v.toFixed(2)+' mm LOS':'no published slab contrast');
  if(!contrast){ctx.fillStyle=css('--muted');ctx.font='12px system-ui';ctx.fillText('Select a building with at least two published height groups.',16,28);return;}
  const values=contrast.series.filter(Number.isFinite),lo=Math.min(0,...values),hi=Math.max(0,...values),pad=Math.max(.1,(hi-lo)*.08),x0=42,x1=w-12,y0=14,y1=h-22;
  const X=i=>x0+i/(contrast.series.length-1)*(x1-x0),Y=v=>y1-(v-lo+pad)/(hi-lo+2*pad)*(y1-y0);
  ctx.strokeStyle=css('--line');ctx.beginPath();ctx.moveTo(x0,Y(0));ctx.lineTo(x1,Y(0));ctx.stroke();
  ctx.strokeStyle=css('--accent');ctx.beginPath();let pen=false;
  contrast.series.forEach((v,i)=>{if(!Number.isFinite(v)){pen=false;return;}if(pen)ctx.lineTo(X(i),Y(v));else ctx.moveTo(X(i),Y(v));pen=true;});ctx.stroke();
  ctx.strokeStyle=css('--warn')||'#b18b39';ctx.beginPath();ctx.moveTo(X(state.epoch),y0);ctx.lineTo(X(state.epoch),y1);ctx.stroke();
  ctx.fillStyle=css('--muted');ctx.font='10px system-ui';ctx.textAlign='right';ctx.fillText(hi.toFixed(1),x0-5,Y(hi)+3);ctx.fillText(lo.toFixed(1),x0-5,Y(lo)+3);
  ctx.textAlign='left';ctx.fillText(contrast.high.lo+'–'+contrast.high.hi+' m minus '+contrast.low.lo+'–'+contrast.low.hi+' m [mm LOS]: motion and air remain mixed',x0+5,11);
  let year;D.epochs.dates.forEach((d,i)=>{if(d.slice(0,4)!==year){year=d.slice(0,4);ctx.fillText(year,X(i),h-6);}});
}
function pick(e){
  if(!renderer)return;
  const r=$('gl').getBoundingClientRect(),rc=new THREE.Raycaster();camera.updateMatrixWorld(true);
  rc.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
  const hit=rc.intersectObject(buildings)[0];if(!hit)return;
  const id=D.bld.order[Math.round(buildings.geometry.attributes._building.getX(hit.face.a))];
  if(id===state.selected)deselect();else selectBuilding(id);   /* a second click on the same building closes its card */
}
function deselect(){
  state.selected=null;contrast=null;
  $('buildingPop').hidden=true;
  if(selectionBox){scene.remove(selectionBox);selectionBox.geometry.dispose();selectionBox.material.dispose();selectionBox=null;}
  state.needsRender=true;drawTimeline();
  const u=new URL(location.href);u.searchParams.delete('building');history.replaceState(history.state,'',u);
}
const AIR_TIP="The real-data estimate: motion per building or per scatterer (as chosen), air prior from the ground (so KNMI 344\'s own anomaly is inside the radar\'s N). N per layer is the radar\'s; e follows from it with P and T, and P and T are KNMI 344\'s own (hydrostatic, 6.5 K per km), so for P and T the radar and KNMI 344 are the same. KNMI 344 carried up: its ground N with -55 N per km and its e converted the same way. Buildings: each facade coloured by the layer it is in. Air volume: the atmosphere as filled slabs over the city (one per layer, or 2 m slices when smooth), the buildings grey inside (set the opacity; switch the buildings off to see the air alone). Layers: one value per layer; Smooth: a monotone curve through the layer centres, as the simulator's profiles. The strip below shows every pass at once; play or click through it.";
let coverageTip='';
function setMode(mode){
  state.mode=air||mode==='points'?mode:'points';
  document.querySelectorAll('input[name="colourBy"]').forEach(r=>r.checked=r.value===state.mode);
  $('airLayersPick').hidden=state.mode==='points';$('heightSliceBox').hidden=state.mode!=='points';$('airOptions').hidden=state.mode==='points';
  $('coverage').classList.toggle('air-mode',state.mode!=='points');resize();
  $('timelineTitle').textContent=state.mode==='points'?'Selected building · upper minus lower radar displacement [mm LOS]':'The air over the city, every pass and layer · click or play to move through the passes';
  $('coverage-context').dataset.tip=state.mode==='points'?coverageTip:AIR_TIP;
  updateAir();drawLegend();drawTimeline();
  const u=new URL(location.href);if(state.mode==='air')u.searchParams.delete('colour');else u.searchParams.set('colour',state.mode);history.replaceState(history.state,'',u);
}
function wire(){
  coverageTip=$('coverage-context').dataset.tip;
  document.querySelectorAll('input[name="colourBy"]').forEach(r=>r.addEventListener('change',()=>setMode(r.value)));
  document.querySelectorAll('input[name="airLayers"]').forEach(r=>r.addEventListener('change',()=>{state.layers=r.value;buildAir();setMode(state.mode);}));
  document.querySelectorAll('input[name="airPrior"]').forEach(r=>r.addEventListener('change',()=>{state.prior=r.value;buildAir();setMode(state.mode);
    const u=new URL(location.href);if(state.prior==='ground')u.searchParams.delete('prior');else u.searchParams.set('prior',state.prior);history.replaceState(history.state,'',u);}));
  document.querySelectorAll('input[name="airMotion"]').forEach(r=>r.addEventListener('change',()=>{state.motion=r.value;buildAir();setMode(state.mode);
    const u=new URL(location.href);if(state.motion==='building')u.searchParams.delete('motion');else u.searchParams.set('motion',state.motion);history.replaceState(history.state,'',u);}));
  document.querySelectorAll('input[name="airInterp"]').forEach(r=>r.addEventListener('change',()=>{state.interp=r.value;updateAir();drawTimeline();}));
  document.querySelectorAll('input[name="airQty"]').forEach(r=>r.addEventListener('change',()=>{state.qty=r.value;buildAir();setMode(state.mode);}));
  document.querySelectorAll('input[name="airView"]').forEach(r=>r.addEventListener('change',()=>{state.view=r.value;$('airOpacityBox').hidden=state.view!=='blocks';updateAir();}));
  $('airOpacity').addEventListener('input',e=>{state.opacity=Number(e.target.value)/100;updateAir();});
  $('showPoints').addEventListener('change',e=>{state.showPoints=e.target.checked;showPoints();});
  $('showBuildings').addEventListener('change',e=>{state.showBuildings=e.target.checked;updateAir();if(selectionBox)selectionBox.visible=state.showBuildings;});
  $('heightSlice').addEventListener('input',e=>{state.height=Number(e.target.value);heightSlice();const u=new URL(location.href);u.searchParams.set('height',state.height);history.replaceState(history.state,'',u);});
  $('tSlider').max=D.epochs.n_epochs-1;
  $('tSlider').addEventListener('input',e=>{state.playing=false;$('tPlay').textContent='▶';setEpoch(Number(e.target.value));});
  $('tPlay').addEventListener('click',()=>{state.playing=!state.playing;$('tPlay').textContent=state.playing?'❚❚':'▶';});
  $('tSpeed').addEventListener('change',e=>state.speed=Number(e.target.value));
  $('strip').addEventListener('pointerdown',e=>{state.playing=false;$('tPlay').textContent='▶';const r=e.target.getBoundingClientRect();setEpoch((e.clientX-r.left-42)/(r.width-54)*(D.epochs.n_epochs-1));});
  /* the aerial map: off, muted (the toned-down image) or in colour (as photographed) */
  const maps={};
  const setMap=kind=>{
    if(!ground)return;
    const show=t=>{ground.material.map=t;ground.material.color.set(t?0xffffff:0xe6e6e2);ground.material.needsUpdate=true;state.needsRender=true;};
    if(kind==='off')return show(null);
    if(maps[kind])return show(maps[kind]);
    const file=(innerWidth<768?'ground-512':'ground-2048')+(kind==='colour'?'-colour':'')+'.jpg';
    new THREE.TextureLoader().load(geo+file,t=>{t.colorSpace=THREE.SRGBColorSpace;maps[kind]=t;if(document.querySelector('input[name="cityMap"]:checked')?.value===kind)show(t);});
  };
  document.querySelectorAll('input[name="cityMap"]').forEach(r=>r.addEventListener('change',()=>setMap(r.value)));
  let down;
  $('gl').addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
  $('gl').addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<6)pick(e);down=null;});
  $('gl').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setEpoch(state.epoch+(e.key==='ArrowRight'?1:-1));}});
  window.addEventListener('resize',()=>{resize();drawLegend();});
  document.addEventListener('site:viewchange',e=>{if(e.detail.view!=='coverage'){state.playing=false;$('tPlay').textContent='▶';}else resize();});
}
let last=0,acc=0;
function loop(t){
  requestAnimationFrame(loop);if(!stage.getClientRects().length){last=t;return;}
  const dt=last?t-last:0;last=t;
  if(state.playing){acc+=dt;const step=1000/state.speed;if(acc>=step){setEpoch((state.epoch+Math.floor(acc/step))%D.epochs.n_epochs);acc%=step;}}
  controls?.update();if(renderer&&state.needsRender){if(volume)volume.render(renderer,scene,camera);else renderer.render(scene,camera);state.needsRender=false;}
}
async function main(){
  const cfg=await json(root+'data/datasets.json'),q=new URLSearchParams(location.search),id=cfg.sets[q.get('data')]?q.get('data'):cfg.default;
  ds=cfg.sets[id];const base=root+'data/'+ds.path;
  const [geometry,bld,epochs]=await Promise.all([json(geo+'manifest.json'),json(base+'buildings.json'),json(base+'epochs.json')]);D={geometry,bld,epochs};
  /* the individual points exist only in a local build (site_export --points); the public site has none */
  try{points=await json(base+'points.json');$('pointsToggle').hidden=false;}catch(e){points=null;}
  /* the air needs the same passes as the city's data set (the 2020-2026 set) */
  try{const r=await json(root+'data/simulator/real.json');if(JSON.stringify(r.epochs)===JSON.stringify(epochs.dates))real=r;}catch(e){real=null;}
  buildAir();
  if(!air)document.querySelectorAll('input[name="colourBy"]:not([value="points"])').forEach(r=>{r.disabled=true;r.closest('label').title='The air is available for the 2020-2026 data only';});
  maxCount=Math.max(100,Math.ceil(Math.max(20,...Object.values(bld.buildings).flatMap(r=>supportedBands(r,bld.min_n).map(b=>b.n)))/100)*100);
  if(q.has('height')&&Number.isFinite(Number(q.get('height'))))state.height=Number(q.get('height'));
  wire();heightSlice();drawLegend();
  const selected=bld.order.includes(q.get('building'))?q.get('building'):null;
  if(selected)selectBuilding(selected,false);
  $('buildingClose').addEventListener('click',()=>{if(scene)deselect();else{state.selected=null;$('buildingPop').hidden=true;}});
  if(ds.archived){
    $('coverage-context').dataset.tip='Archived processor-reference data (2014–2023). These colours show published radar support, not retrieved air. This is not the current report dataset.';
    $('coverage-archive').hidden=false;
  }
  try{initScene();await loadModels();setPreset(['side','top'].includes(q.get('camera'))?q.get('camera'):'overview');if(selected)outline(selected);$('loading').remove();}
  catch(error){$('gl').hidden=true;$('loading').textContent='3D is unavailable here. Building search, height profiles and published counts remain usable.';}
  const mp=q.get('map');
  if(['muted','colour'].includes(mp)){const r=document.querySelector('input[name="cityMap"][value="'+mp+'"]');r.checked=true;r.dispatchEvent(new Event('change'));}
  if(QTY[q.get('qty')])state.qty=q.get('qty');
  if(['buildings','blocks'].includes(q.get('view')))state.view=q.get('view');
  if(['layers','smooth'].includes(q.get('interp')))state.interp=q.get('interp');
  if(q.get('points')==='1'&&points){state.showPoints=true;$('showPoints').checked=true;}
  if(q.get('buildings')==='0'){state.showBuildings=false;$('showBuildings').checked=false;}
  $('airOpacityBox').hidden=state.view!=='blocks';
  document.querySelectorAll('input[name="airInterp"]').forEach(r=>r.checked=r.value===state.interp);
  if(LAYER_NAME[q.get('layers')])state.layers=q.get('layers');
  document.querySelectorAll('input[name="airQty"]').forEach(r=>r.checked=r.value===state.qty);
  document.querySelectorAll('input[name="airView"]').forEach(r=>r.checked=r.value===state.view);
  if(['building','scatterer'].includes(q.get('motion')))state.motion=q.get('motion');
  document.querySelectorAll('input[name="airMotion"]').forEach(r=>r.checked=r.value===state.motion);
  if(['ground','none'].includes(q.get('prior')))state.prior=q.get('prior');
  document.querySelectorAll('input[name="airPrior"]').forEach(r=>r.checked=r.value===state.prior);
  document.querySelectorAll('input[name="airLayers"]').forEach(r=>r.checked=r.value===state.layers);buildAir();
  setMode('air');showPoints();
  if(Number.isInteger(window.VRSPass))setEpoch(window.VRSPass,true);   /* a pass chosen in the comparison before the map loaded */
  if(q.has('debug'))window.__vrs={THREE,state,S:state,D,renderer,scene,buildings,uniforms,get camera(){return camera;},setEpoch,selectBuilding,pick,setPreset};
  requestAnimationFrame(loop);
}
await main();
