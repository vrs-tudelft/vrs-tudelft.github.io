/* One spatial question: where do published radar groups provide height support?
   Geometry and all statistics remain the original public aggregate products. */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {supportedBands,heightSummary,heightContrast,heightProfile} from './research.js?v=20261101c';

const $=id=>document.getElementById(id),root=document.documentElement.dataset.root||'';
const geo=root+'data/3d/', stage=$('stage'), css=name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const state={height:40,epoch:0,selected:null,playing:false,speed:8,needsRender:true};
let D,ds,renderer,scene,camera,persp,ortho,controls,buildings,ground,uniforms,texture,selectionBox,contrast;
const boundsCache=new Map();
let maxCount=100;
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
  state.needsRender=true;drawTimeline();
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
  const rows=D.bld.order.length,cols=10,table=new Uint8Array(rows*cols*4);
  D.bld.order.forEach((id,row)=>supportedBands(D.bld.buildings[id],D.bld.min_n).forEach(b=>{
    const column=b.lo/10;if(!Number.isInteger(column)||column<0||column>=cols)return;
    const k=(row*cols+column)*4;table.set([...colour(b.n),255],k);
  }));
  const lookup=new THREE.DataTexture(table,cols,rows,THREE.RGBAFormat);
  lookup.magFilter=lookup.minFilter=THREE.NearestFilter;lookup.needsUpdate=true;
  uniforms={uTable:{value:lookup},uFocus:{value:state.height/10},
    uGround:{value:D.bld.order.map(id=>D.bld.bag3d[id]?.ground_nap??D.geometry.ground_nap)},
    uSupport:{value:D.bld.order.flatMap(id=>{const h=D.bld.buildings[id]?.h_agl;return h?[h.min,h.max]:[-1,-1];})}};
  const material=new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float _building;\nvarying float vBid,vY;').replace('#include <begin_vertex>','#include <begin_vertex>\nvBid=_building;vY=position.y;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D uTable;uniform float uFocus;uniform float uGround[${rows}];uniform vec2 uSupport[${rows}];varying float vBid,vY;`)
      .replace('#include <color_fragment>',`#include <color_fragment>
{int id=int(vBid+0.5);float height=vY-uGround[id];float band=floor(height/10.0);
vec4 c=texture2D(uTable,vec2((clamp(band,0.0,9.0)+0.5)/10.0,(vBid+0.5)/${rows}.0));
if(band<0.0||band>9.0||height<uSupport[id].x||height>uSupport[id].y)c.a=0.0;
vec3 grey=vec3(0.80,0.81,0.82);diffuseColor.rgb=c.a>0.5?c.rgb:grey;
if(c.a>0.5&&abs(band-uFocus)>0.1)diffuseColor.rgb=mix(grey,c.rgb,0.32);}`);
  };
  buildings=new THREE.Mesh(geometry,material);scene.add(buildings);
  if(!mobile){const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,25),new THREE.LineBasicMaterial({color:0x5b6672,transparent:true,opacity:.25}));scene.add(edges);}
}
function setPreset(key){
  if(!renderer)return;
  const p=D.geometry.presets[key];if(!p)return;
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
  state.selected=id;$('buildingSelect').value=id;
  const r=D.bld.buildings[id],a=D.bld.bag3d[id],s=heightSummary(r,a,D.bld.min_n);contrast=heightContrast(r,D.bld.min_n);
  $('card').innerHTML='<div class="city-selection-head"><div>'+window.VRSBuildings.identity(id,r,a)+'</div><button type="button" id="focusBuilding" aria-label="Locate this building in the city">Locate</button></div>'+
    '<div class="city-selection-stats"><div><b>'+(s.points===null?'n/a':s.points.toLocaleString('en-GB'))+'</b><span>radar points</span></div><div><b>'+s.bands+'</b><span>published slabs</span></div><div><b>'+(s.highest===null?'n/a':s.highest.toFixed(1)+' m')+'</b><span>highest point</span></div></div>'+
    '<div class="height-profile">'+heightProfile(r,a,rgb,D.bld.min_n)+'</div><p class="city-profile-note">Grey: no published 10 m group. A coloured slab does not mean continuous facade coverage.</p>';
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
  for(let x=0;x<w;x++){ctx.fillStyle=rgb(20+x/(w-1)*(maxCount-20));ctx.fillRect(x,2,1.5,12);}
  ctx.font='10px system-ui';ctx.fillStyle=css('--muted');ctx.textBaseline='top';ctx.fillText('20',0,18);ctx.textAlign='center';ctx.fillText(Math.round((20+maxCount)/2),w/2,18);ctx.textAlign='right';ctx.fillText(maxCount,w,18);
  $('legendText').textContent='Points per 10 m group · active band bright · grey: no published group';
}
export function setEpoch(value){state.epoch=Math.max(0,Math.min(D.epochs.n_epochs-1,Math.round(value)));drawTimeline();}
function drawTimeline(){
  if(!D)return;
  const cv=$('strip'),w=cv.clientWidth,h=cv.clientHeight||90;if(!w)return;
  const ctx=cv.getContext('2d');cv.width=w*2;cv.height=h*2;ctx.scale(2,2);ctx.clearRect(0,0,w,h);
  $('tSlider').value=state.epoch;
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
  const hit=rc.intersectObject(buildings)[0];if(hit){const row=Math.round(buildings.geometry.attributes._building.getX(hit.face.a));selectBuilding(D.bld.order[row]);}
}
function wire(){
  $('buildingSelect').addEventListener('change',e=>selectBuilding(e.target.value));
  $('heightSlice').addEventListener('input',e=>{state.height=Number(e.target.value);heightSlice();const u=new URL(location.href);u.searchParams.set('height',state.height);history.replaceState(history.state,'',u);});
  $('tSlider').max=D.epochs.n_epochs-1;
  $('tSlider').addEventListener('input',e=>{state.playing=false;$('tPlay').textContent='▶';setEpoch(Number(e.target.value));});
  $('tPlay').addEventListener('click',()=>{state.playing=!state.playing;$('tPlay').textContent=state.playing?'❚❚':'▶';});
  $('tSpeed').addEventListener('change',e=>state.speed=Number(e.target.value));
  $('strip').addEventListener('pointerdown',e=>{state.playing=false;$('tPlay').textContent='▶';const r=e.target.getBoundingClientRect();setEpoch((e.clientX-r.left-42)/(r.width-54)*(D.epochs.n_epochs-1));});
  $('city-map').addEventListener('change',e=>{
    if(!ground)return;
    if(e.target.checked&&!texture){new THREE.TextureLoader().load(geo+(innerWidth<768?'ground-512.jpg':'ground-2048.jpg'),t=>{texture=t;t.colorSpace=THREE.SRGBColorSpace;if(e.target.checked){ground.material.map=t;ground.material.color.set(0xffffff);ground.material.needsUpdate=true;state.needsRender=true;}});}
    ground.material.map=e.target.checked?texture:null;ground.material.color.set(e.target.checked&&texture?0xffffff:0xe6e6e2);ground.material.needsUpdate=true;state.needsRender=true;
  });
  for(const [key,label] of [['overview','Overview'],['top','Top-down']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.p=key;b.addEventListener('click',()=>setPreset(key));$('presets').appendChild(b);}
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
  controls?.update();if(renderer&&state.needsRender){renderer.render(scene,camera);state.needsRender=false;}
}
async function main(){
  const cfg=await json(root+'data/datasets.json'),q=new URLSearchParams(location.search),id=cfg.sets[q.get('data')]?q.get('data'):cfg.default;
  ds=cfg.sets[id];const base=root+'data/'+ds.path;
  const [geometry,bld,epochs]=await Promise.all([json(geo+'manifest.json'),json(base+'buildings.json'),json(base+'epochs.json')]);D={geometry,bld,epochs};
  maxCount=Math.max(100,Math.ceil(Math.max(20,...Object.values(bld.buildings).flatMap(r=>supportedBands(r,bld.min_n).map(b=>b.n)))/100)*100);
  const name=id=>window.VRSBuildings.name(id,bld.buildings[id],bld.bag3d[id]);
  $('buildingSelect').innerHTML=[...bld.order].sort((a,b)=>name(a).localeCompare(name(b))).map(id=>'<option value="'+id+'">'+window.VRSBuildings.esc(name(id))+' · '+id+'</option>').join('');
  if(q.has('height')&&Number.isFinite(Number(q.get('height'))))state.height=Number(q.get('height'));
  wire();heightSlice();drawLegend();
  const selected=bld.order.includes(q.get('building'))?q.get('building'):bld.order.find(id=>bld.buildings[id]);
  selectBuilding(selected,false);
  if(ds.archived){document.querySelector('#coverage .site-boundary').textContent='Archived processor-reference data, 2014–2023. These are not the current report findings.';}
  try{initScene();await loadModels();setPreset('overview');outline(selected);$('loading').remove();}
  catch(error){$('gl').hidden=true;$('loading').textContent='3D is unavailable here. Building search, height profiles and published counts remain usable.';}
  if(q.has('debug'))window.__vrs={THREE,state,S:state,D,renderer,scene,buildings,uniforms,get camera(){return camera;},setEpoch,selectBuilding,pick,setPreset};
  requestAnimationFrame(loop);
}
await main();
