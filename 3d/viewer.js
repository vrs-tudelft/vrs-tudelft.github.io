/* The 3D view of Kop van Zuid. Buildings from the 3DBAG as one mesh, coloured through a small
   lookup texture (one row per building, one column for the whole building and ten for its 10 m
   slabs); ground cells as one instanced mesh; a time slider over the 288 passes. All values are
   means over at least 20 radar points, read from ../data/. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const $ = (id) => document.getElementById(id);
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const DATA = "../data/";
const isMobile = matchMedia("(max-width: 767px)").matches || (navigator.maxTouchPoints > 1 && innerWidth < 1024);
const MAPS = window.VRS_COLORMAPS;

function ramp(name) {
  const st = MAPS[name];
  return (t) => {
    t = Math.max(0, Math.min(1, t));
    const k = Math.min(Math.floor(t * (st.length - 1)), st.length - 2), f = t * (st.length - 1) - k;
    const a = st[k], b = st[k + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
}
const fmtDate = (iso) => { const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return parseInt(iso.slice(8, 10), 10) + " " + m[parseInt(iso.slice(5, 7), 10) - 1] + " " + iso.slice(0, 4); };
const doyText = (d) => { const dt = new Date(2001, 0, Math.round(d)); const m = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]; return dt.getDate() + " " + m[dt.getMonth()]; };
const sgn = (v, nd) => (v >= 0 ? "+" : "") + v.toFixed(nd);

/* layer definitions: value(record) -> number|null, ramp, limits, unit, symmetric */
const LAYERS = {
  rate: { title: "long-term rate [mm/yr]", ramp: "RdBu_r", lim: [-5, 5], get: (r) => r.rate },
  tilt: { title: "tilt: rate against height [mm per 100 m per yr]", ramp: "RdBu_r", lim: [-6, 6], get: (r) => r.tilt_per100 },
  quad: { title: "curvature [mm/yr²], positive = slowing down", ramp: "PuOr", lim: [-0.3, 0.3], get: (r) => r.quad },
  amp: { title: "seasonal swing [mm]", ramp: "magma", lim: [0, 3], get: (r) => r.seasonal.amp },
  peak: { title: "day of year of the seasonal maximum", ramp: "twilight_shifted", lim: [0, 365.25], get: (r) => r.seasonal.peak_doy, cyclic: true },
  bx: { title: "east-west slope of the seasonal term [mm per m]; +0.015 expected", ramp: "RdBu_r", lim: [-0.03, 0.03], get: (r) => r.bx },
  ground_rate: { title: "rate of the pavement within 15 m [mm/yr]", ramp: "RdBu_r", lim: [-5, 5], get: (r) => r.ground_rate },
  n: { title: "number of radar points (log10)", ramp: "cividis", lim: [1.3, 3.5], get: (r) => Math.log10(r.n) },
  rate_sd: { title: "spread of the rate between the building's own points [mm/yr]", ramp: "magma", lim: [0, 1.5], get: (r) => r.rate_sd },
  scatter: { title: "spread of the points about the building mean, one pass [mm]", ramp: "magma", lim: [0, 2.5], get: (r) => r.scatter_mm },
  band_rate: { title: "rate per 10 m slab [mm/yr]", ramp: "RdBu_r", lim: [-5, 5], band: (b) => b.rate },
  band_amp: { title: "seasonal swing per 10 m slab [mm]", ramp: "magma", lim: [0, 3], band: (b) => b.amp },
  band_peak: { title: "peak day per 10 m slab", ramp: "twilight_shifted", lim: [0, 365.25], band: (b) => b.peak_doy, cyclic: true },
  height: { title: "roof height above ground, 3DBAG [m]", ramp: "viridis", lim: [0, 160], attr: (a) => a.height_agl },
  year: { title: "construction year (register)", ramp: "viridis", lim: [1890, 2020], attr: (a) => a.year }
};
const CELL_LAYERS = {
  rate_mean: { title: "mean rate of the cell's points [mm/yr]", ramp: "RdBu_r", lim: [-7, 7] },
  amp: { title: "seasonal swing of the cell [mm]", ramp: "magma", lim: [0, 2] },
  peak_doy: { title: "peak day of the cell's swing", ramp: "twilight_shifted", lim: [0, 365.25], cyclic: true },
  h_agl_mean: { title: "mean height of the cell's points [m]", ramp: "viridis", lim: [0, 60] },
  n: { title: "radar points in the cell", ramp: "cividis", lim: [20, 500] },
  rate_sd: { title: "spread of the rate inside the cell [mm/yr]", ramp: "magma", lim: [0, 2] },
  scatter_mm: { title: "spread of the points about the cell mean, one pass [mm]", ramp: "magma", lim: [0, 2.5] },
  spread_now: { title: "spread inside the cell on the pass on the slider [mm]", ramp: "magma", lim: [0, 4.5], perEpoch: true }
};

const S = {  /* state */
  epoch: 0, tmode: "increment", playing: false, speed: 8, layer: "rate", cellLayer: "time", cellGrid: "ground",
  pointLayer: "time", columns: false, edges: !isMobile, texture: true, radarLight: false, ceiling: false, rays: false, balloon: false,
  selected: null, needsRender: true, anim: null
};

let renderer, scene, camera, persp, ortho, controls, buildings, edgesObj, cellsMesh, ground, gridHelper, ceilingPlane, hemi, sun, table, tableTex, uniforms, flight;
let D = {};   /* data */
let cellGeom = { all: null, ground: null };
let rayGroup, balloonGroup, airSlab, pointCloud;

async function loadAll() {
  const [manifest, bld, cells, epochs, bands, bin, sdBin] = await Promise.all([
    fetch(DATA + "3d/manifest.json").then((r) => r.json()),
    fetch(DATA + "buildings.json").then((r) => r.json()),
    fetch(DATA + "cells.json").then((r) => r.json()),
    fetch(DATA + "epochs.json").then((r) => r.json()),
    fetch(DATA + "bands.json").then((r) => r.json()),
    fetch(DATA + "cells.bin").then((r) => r.arrayBuffer()),
    fetch(DATA + "cells-sd.bin").then((r) => r.arrayBuffer())
  ]);
  const i16 = new Int16Array(bin), sd16 = new Int16Array(sdBin);
  const grids = {};
  for (const g of ["all", "ground"]) {
    const G = cells.grids[g], start = G.offset_bytes / 2, n = cells.series.epochs;
    grids[g] = { cells: G.cells, get: (c, t) => i16[start + c * n + t] / 100, sd: (c, t) => sd16[start + c * n + t] / 100 };
  }
  D = { manifest, bld, cells, epochs, bands, grids, tYears: epochs.days_since_ref.map((d) => d / 365.25) };
  D.points = await loadLocalPoints();
}

/* data/points.* is a local build for the team: git ignores it and it is not on the published
   site, so this quietly does nothing when the files are absent. */
async function loadLocalPoints() {
  try {
    const meta = await fetch(DATA + "points.json").then((r) => (r.ok ? r.json() : null));
    if (!meta) return null;
    const buf = await fetch(DATA + "points.bin").then((r) => (r.ok ? r.arrayBuffer() : null));
    if (!buf) return null;
    const i16 = new Int16Array(buf), n = meta.epochs;
    return { meta, n, get: (k, t) => i16[k * n + t] / 100 };
  } catch (e) {
    return null;
  }
}

function initScene() {
  const canvas = $("gl");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(css("--canvas") || "#ffffff");
  persp = new THREE.PerspectiveCamera(45, 1, 1, 6000);
  ortho = new THREE.OrthographicCamera(-480, 480, 300, -300, 1, 6000);
  camera = persp;
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.1;
  controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 30; controls.maxDistance = 2500;
  controls.addEventListener("change", () => { S.needsRender = true; });
  hemi = new THREE.HemisphereLight(0xe8eef4, 0xb9b2a6, 0.9);
  sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(300, 600, 250);
  scene.add(hemi, sun);
  const gp = D.manifest.ground_plane;
  const gGeom = new THREE.PlaneGeometry(gp.width, gp.depth);
  const gMat = new THREE.MeshLambertMaterial({ color: 0xe6e6e2 });
  ground = new THREE.Mesh(gGeom, gMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(gp.centre[0], gp.centre[1], gp.centre[2]);
  scene.add(ground);
  if (D.manifest.texture) {
    new THREE.TextureLoader().load(DATA + "3d/" + (isMobile ? "ground-512.jpg" : "ground-2048.jpg"), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      ground.userData.tex = tex; applyTexture(); S.needsRender = true;
    });
  }
  gridHelper = new THREE.GridHelper(gp.width, Math.round(gp.width / 25), 0x9aa5b1, 0xcfd4d8);
  gridHelper.position.set(gp.centre[0], gp.centre[1] + 0.05, gp.centre[2]);
  gridHelper.visible = false;
  scene.add(gridHelper);
  ceilingPlane = new THREE.Mesh(new THREE.PlaneGeometry(700, 600), new THREE.MeshBasicMaterial({ color: 0x1f6fa3, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
  ceilingPlane.rotation.x = -Math.PI / 2; ceilingPlane.position.set(0, D.manifest.ground_nap + 83.2, 0); ceilingPlane.visible = false;
  scene.add(ceilingPlane);
  resize();
  new ResizeObserver(resize).observe($("stage"));
}

function applyTexture() {
  ground.material.map = S.texture ? (ground.userData.tex || null) : null;
  ground.material.color.set(S.texture && ground.userData.tex ? 0xffffff : 0xe6e6e2);
  ground.material.needsUpdate = true;
  gridHelper.visible = !S.texture;
}

function resize() {
  const st = $("stage"), w = st.clientWidth, h = st.clientHeight;
  renderer.setSize(w, h, false);
  persp.aspect = w / h; persp.updateProjectionMatrix();
  const hw = D.manifest.presets.satellite.half_width;
  ortho.left = -hw; ortho.right = hw; ortho.top = hw * h / w; ortho.bottom = -hw * h / w; ortho.updateProjectionMatrix();
  S.needsRender = true;
}

/* ------------------------------------------------------------ buildings */
async function loadBuildings() {
  const file = DATA + "3d/" + (isMobile ? "buildings-lod12.glb" : "buildings-lod22.glb");
  const gltf = await new GLTFLoader().loadAsync(file);
  let geom = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !geom) geom = o.geometry; });
  if (!geom.attributes._building) throw new Error("no _building attribute");
  const nB = D.bld.order.length, nCols = 11;
  table = new Uint8Array(nB * nCols * 4);
  tableTex = new THREE.DataTexture(table, nCols, nB, THREE.RGBAFormat);
  tableTex.magFilter = tableTex.minFilter = THREE.NearestFilter;
  uniforms = { uTable: { value: tableTex }, uNBld: { value: nB }, uNCols: { value: nCols }, uBandM: { value: 10 }, uGround: { value: D.manifest.ground_nap }, uMode: { value: 0 } };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float _building;\nvarying float vBid;\nvarying float vY;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBid = _building;\nvY = position.y;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uTable;\nuniform float uNBld;\nuniform float uNCols;\nuniform float uBandM;\nuniform float uGround;\nuniform int uMode;\nvarying float vBid;\nvarying float vY;")
      .replace("#include <color_fragment>", "#include <color_fragment>\n{\n  float col = (uMode == 0) ? 0.5 : (1.5 + floor((vY - uGround) / uBandM));\n  col = clamp(col, 0.5, uNCols - 0.5);\n  vec4 c = texture2D(uTable, vec2(col / uNCols, (vBid + 0.5) / uNBld));\n  diffuseColor.rgb = (c.a > 0.5) ? c.rgb : vec3(0.80, 0.81, 0.82);\n}");
  };
  buildings = new THREE.Mesh(geom, mat);
  buildings.name = "buildings";
  scene.add(buildings);
  if (!isMobile) {
    edgesObj = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), new THREE.LineBasicMaterial({ color: 0x5b6672, transparent: true, opacity: 0.35 }));
    edgesObj.visible = S.edges;
    scene.add(edgesObj);
  }
  fillTable();
}

function colourOf(L, v) {
  if (v === null || v === undefined || isNaN(v)) return null;
  const r = ramp(L.ramp);
  const t = L.cyclic ? ((v % 365.25) + 365.25) % 365.25 / 365.25 : (v - L.lim[0]) / (L.lim[1] - L.lim[0]);
  return r(t);
}

function fillTable() {
  const L = LAYERS[S.layer], nCols = 11;
  const recs = D.bld.buildings, attrs = D.bld.bag3d;
  uniforms.uMode.value = L.band ? 1 : 0;
  D.bld.order.forEach((bid, row) => {
    const rec = recs[bid], a = attrs[bid];
    for (let c = 0; c < nCols; c++) {
      let v = null;
      if (L.attr) v = a ? L.attr(a) : null;
      else if (L.get) v = rec ? L.get(rec) : null;
      else if (L.band && rec && c > 0) { const b = rec.bands.find((bb) => bb.lo === (c - 1) * 10); v = b ? L.band(b) : null; }
      const col = colourOf(L, v), k = (row * nCols + c) * 4;
      if (col) { table[k] = col[0]; table[k + 1] = col[1]; table[k + 2] = col[2]; table[k + 3] = 255; }
      else { table[k] = table[k + 1] = table[k + 2] = 0; table[k + 3] = 0; }
      if (S.selected && S.selected.kind === "building" && S.selected.id === bid && col) { table[k] = Math.min(255, col[0] + 60); table[k + 1] = Math.min(255, col[1] + 60); table[k + 2] = Math.min(255, col[2] + 60); }
    }
  });
  tableTex.needsUpdate = true;
  drawLegend(L);
  S.needsRender = true;
}

/* ------------------------------------------------------------ cells */
function buildCells() {
  if (cellsMesh) { scene.remove(cellsMesh); cellsMesh.geometry.dispose(); }
  const G = D.grids[S.cellGrid], cm = D.cells.grids[S.cellGrid].cell_m, ox = D.cells.origin_local[0], oy = D.cells.origin_local[1];
  const geom = new THREE.BoxGeometry(cm - 1, 1, cm - 1);
  geom.translate(0, 0.5, 0);
  cellsMesh = new THREE.InstancedMesh(geom, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }), G.cells.length);
  const m = new THREE.Matrix4();
  G.cells.forEach((c, k) => {
    const x = ox + cm * (c.i + 0.5), z = -(oy + cm * (c.j + 0.5));
    const h = S.columns ? Math.max(1, c.h_agl_mean) : 0.4;
    m.makeScale(1, h, 1); m.setPosition(x, D.manifest.ground_nap + 0.15, z);
    cellsMesh.setMatrixAt(k, m);
  });
  cellsMesh.instanceMatrix.needsUpdate = true;
  cellsMesh.name = "cells";
  scene.add(cellsMesh);
  colourCells();
}

function buildPoints() {
  if (!D.points || pointCloud) return;
  const P = D.points.meta, n = P.n_points, ground = D.manifest.ground_nap;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    pos[k * 3] = P.e[k];
    pos[k * 3 + 1] = ground + P.h_agl[k];
    pos[k * 3 + 2] = -P.n_coord[k];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  pointCloud = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: true, vertexColors: true }));
  pointCloud.visible = false;
  scene.add(pointCloud);
}

function colourPoints() {
  if (!pointCloud || !D.points) return;
  const P = D.points.meta, n = P.n_points, col = pointCloud.geometry.getAttribute("color");
  const mode = S.pointLayer;
  const L = mode === "rate" ? { ramp: "RdBu_r", lim: [-7, 7] }
    : mode === "amp" ? { ramp: "magma", lim: [0, 3] }
    : mode === "h" ? { ramp: "viridis", lim: [0, 90] }
    : { ramp: "RdBu_r", lim: [-D.manifest.scales.cells[S.tmode + "_mm"], D.manifest.scales.cells[S.tmode + "_mm"]] };
  for (let k = 0; k < n; k++) {
    let v;
    if (mode === "rate") v = P.rate[k];
    else if (mode === "amp") v = P.amp[k];
    else if (mode === "h") v = P.h_agl[k];
    else if (S.tmode === "increment") v = S.epoch === 0 ? 0 : D.points.get(k, S.epoch) - D.points.get(k, S.epoch - 1);
    else v = D.points.get(k, S.epoch);
    const rgb = colourOf(L, v) || [170, 170, 170];
    col.array[k * 3] = rgb[0] / 255; col.array[k * 3 + 1] = rgb[1] / 255; col.array[k * 3 + 2] = rgb[2] / 255;
  }
  col.needsUpdate = true;
  S.needsRender = true;
}

function cellValue(G, c, k, t) {
  if (S.tmode === "increment") return t === 0 ? 0 : G.get(k, t) - G.get(k, t - 1);
  if (S.tmode === "cumulative") return G.get(k, t);
  const tr = c.trend, ty = D.tYears[t];
  return G.get(k, t) - (tr[0] + tr[1] * ty + tr[2] * ty * ty);
}

function colourCells() {
  if (!cellsMesh) return;
  if (pointCloud) pointCloud.visible = S.cellLayer === "points";
  if (S.cellLayer === "points") { cellsMesh.visible = false; colourPoints(); return; }
  cellsMesh.visible = S.cellLayer !== "none";
  if (!cellsMesh.visible) { S.needsRender = true; return; }
  const G = D.grids[S.cellGrid], col = new THREE.Color();
  let L;
  if (S.cellLayer === "time") {
    const lim = D.manifest.scales.cells[S.tmode + "_mm"];
    L = { ramp: "RdBu_r", lim: [-lim, lim] };
    G.cells.forEach((c, k) => { const v = cellValue(G, c, k, S.epoch); const rgb = colourOf(L, v); col.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255); cellsMesh.setColorAt(k, col); });
  } else {
    L = CELL_LAYERS[S.cellLayer];
    const perEpoch = L.perEpoch;
    G.cells.forEach((c, k) => {
      const v = perEpoch ? G.sd(k, S.epoch) : c[S.cellLayer];
      const rgb = colourOf(L, v) || [200, 200, 200];
      col.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255); cellsMesh.setColorAt(k, col);
    });
  }
  cellsMesh.instanceColor.needsUpdate = true;
  S.needsRender = true;
}

/* ------------------------------------------------------------ legend, hud, epoch */
function drawLegend(L) {
  const cv = $("legend"), ctx = cv.getContext("2d"), w = cv.clientWidth || 260, h = 44;
  cv.width = w * 2; cv.height = h * 2; ctx.scale(2, 2);
  ctx.clearRect(0, 0, w, h);
  const r = ramp(L.ramp);
  for (let x = 0; x < w; x++) { const c = r(x / (w - 1)); ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; ctx.fillRect(x, 4, 1.5, 14); }
  ctx.fillStyle = css("--muted"); ctx.font = "11px system-ui"; ctx.textBaseline = "top";
  if (L.cyclic) { "JFMAMJJASOND".split("").forEach((m, k) => { ctx.textAlign = "center"; ctx.fillText(m, (k + 0.5) / 12 * w, 22); }); }
  else { ctx.textAlign = "left"; ctx.fillText(String(L.lim[0]), 0, 22); ctx.textAlign = "center"; ctx.fillText(String((L.lim[0] + L.lim[1]) / 2), w / 2, 22); ctx.textAlign = "right"; ctx.fillText(String(L.lim[1]), w, 22); }
  $("legendText").textContent = L.title + (L.ramp === "RdBu_r" ? " · blue = away from the satellite" : "") + " · grey = fewer than 20 radar points";
}

function updateEpochLabel() {
  const e = D.epochs, i = S.epoch, tg = e.knmi.tg[i];
  $("epochLabel").textContent = `Pass ${i + 1} of ${e.n_epochs} · ${fmtDate(e.dates[i])} · Rotterdam daily mean ${tg === null ? "n/a" : tg.toFixed(1) + " °C"} (KNMI 344) · s(t) minus trend and yearly wave ${sgn(e.s_resid[i], 1)} mm/100 m`;
  $("tSlider").value = i;
}

function drawStrip() {
  const cv = $("strip"), ctx = cv.getContext("2d"), w = cv.clientWidth, h = 110;
  cv.width = w * 2; cv.height = h * 2; ctx.scale(2, 2); ctx.clearRect(0, 0, w, h);
  const e = D.epochs, n = e.n_epochs, x0 = 40, x1 = w - 10, y0 = 8, y1 = h - 22;
  const lim = D.manifest.scales.s_resid_mm_per_100m * 1.6;
  const X = (k) => x0 + k / (n - 1) * (x1 - x0), Y = (v) => y1 - (v + lim) / (2 * lim) * (y1 - y0);
  ctx.strokeStyle = css("--line"); ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x1, Y(0)); ctx.stroke();
  const tg = e.knmi.tg, tmin = -5, tmax = 25;
  ctx.strokeStyle = css("--muted"); ctx.setLineDash([2, 3]); ctx.beginPath();
  let st = false; tg.forEach((v, k) => { if (v === null) { st = false; return; } const yy = y1 - (v - tmin) / (tmax - tmin) * (y1 - y0); if (!st) { ctx.moveTo(X(k), yy); st = true; } else ctx.lineTo(X(k), yy); });
  ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = css("--accent"); ctx.lineWidth = 1.2; ctx.beginPath();
  e.s_resid.forEach((v, k) => { const yy = Y(Math.max(-lim, Math.min(lim, v))); k ? ctx.lineTo(X(k), yy) : ctx.moveTo(X(k), yy); });
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.strokeStyle = css("--bad"); ctx.beginPath(); ctx.moveTo(X(S.epoch), y0); ctx.lineTo(X(S.epoch), y1); ctx.stroke();
  ctx.fillStyle = css("--muted"); ctx.font = "10px system-ui"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
  ctx.fillText(sgn(lim, 0), x0 - 4, Y(lim)); ctx.fillText("0", x0 - 4, Y(0)); ctx.fillText(sgn(-lim, 0), x0 - 4, Y(-lim));
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  let last = null; e.dates.forEach((d, k) => { const yv = d.slice(0, 4); if (yv !== last) { last = yv; ctx.fillText(yv, X(k), y1 + 4); } });
  ctx.textAlign = "left"; ctx.fillText("height gradient s(t) minus trend and yearly wave [mm/100 m]; dotted: air temperature", x0 + 4, y0);
}

/* ------------------------------------------------------------ presets and lighting */
function setPreset(name) {
  const p = D.manifest.presets[name];
  if (!p) return;
  const wasOrtho = camera === ortho;
  camera = p.orthographic ? ortho : persp;
  if ((camera === ortho) !== wasOrtho) { controls.object = camera; }
  camera.up.set(...(p.up || [0, 1, 0]));
  camera.position.set(...p.position);
  controls.target.set(...p.target);
  controls.update();
  $("radarLight").checked = !!p.radar_lighting; S.radarLight = !!p.radar_lighting; applyLighting();
  $("hud").textContent = p.caption || (name === "top" ? "Top-down, north up" : name === "overview" ? "Overview from the south-east" : "");
  document.querySelectorAll("#presets button").forEach((b) => b.classList.toggle("on", b.dataset.p === name));
  S.needsRender = true;
}

function applyLighting() {
  const u = D.manifest.los_unit_local;
  if (S.radarLight) { hemi.intensity = 0.25; sun.intensity = 1.6; sun.position.set(u[0] * 1000, u[1] * 1000, u[2] * 1000); }
  else { hemi.intensity = 0.9; sun.intensity = 1.2; sun.position.set(300, 600, 250); }
  S.needsRender = true;
}

/* ------------------------------------------------------------ rays and balloon */
function buildRays() {
  const p = D.manifest.presets.rays, u = new THREE.Vector3(...D.manifest.los_unit_local);
  rayGroup = new THREE.Group();
  const mkLine = (a, b, colour) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineDashedMaterial({ color: colour, dashSize: 6, gapSize: 4 }));
  const low = new THREE.Vector3(...p.low), high = new THREE.Vector3(...p.high);
  const farLow = low.clone().addScaledVector(u, 900), farHigh = high.clone().addScaledVector(u, 900);
  const l1 = mkLine(farLow, low, 0xc53030), l2 = mkLine(farHigh, high, 0xc53030);
  l1.computeLineDistances(); l2.computeLineDistances();
  rayGroup.add(l1, l2);
  /* the extra path of the low ray inside the layer: from the height of the high point down to the low point */
  const dy = high.y - low.y, len = dy / u.y;
  const start = low.clone().addScaledVector(u, len);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, len, 8), new THREE.MeshBasicMaterial({ color: 0x1f6fa3 }));
  cyl.position.copy(low.clone().add(start).multiplyScalar(0.5));
  cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u.clone());
  rayGroup.add(cyl);
  const sph = (c) => new THREE.Mesh(new THREE.SphereGeometry(3, 12, 12), new THREE.MeshBasicMaterial({ color: c }));
  const s1 = sph(0xc53030), s2 = sph(0xc53030);
  rayGroup.add(s1, s2);
  const pts = (c) => new THREE.Mesh(new THREE.SphereGeometry(2, 10, 10), new THREE.MeshBasicMaterial({ color: c }));
  const pA = pts(0x1b2430), pB = pts(0x1b2430); pA.position.copy(high); pB.position.copy(low); rayGroup.add(pA, pB);
  airSlab = new THREE.Mesh(new THREE.BoxGeometry(700, dy, 600), new THREE.MeshBasicMaterial({ color: 0x1f6fa3, transparent: true, opacity: 0.1, depthWrite: false }));
  airSlab.position.set(0, (low.y + high.y) / 2, 0);
  rayGroup.add(airSlab);
  rayGroup.userData = { s1, s2, farLow, farHigh, low, high, len };
  rayGroup.visible = false;
  scene.add(rayGroup);
}

function stepRays(dt) {
  const g = rayGroup.userData, T = 4000;
  g.t = ((g.t || 0) + dt) % T;
  const f = g.t / T;
  g.s1.position.lerpVectors(g.farHigh, g.high, Math.min(1, f * 1.1));
  g.s2.position.lerpVectors(g.farLow, g.low, Math.min(1, f * 1.1 * (900 / (900 + g.len))));
  const nu = D.epochs.s_resid[S.epoch] * Math.cos(23 * Math.PI / 180) * 10;
  const extra = D.manifest.presets.rays.extra_path_m;
  $("overlay").innerHTML = `<b>Two heights, one layer of air.</b> The lower ray travels ${extra.toFixed(0)} m further through the layer (${(g.high.y - g.low.y).toFixed(0)} m of height at 23° from vertical). One N-unit more refractivity in that layer delays it by ${(1e-6 * extra * 1000).toFixed(2)} mm. On this pass the height gradient, trend and yearly wave removed, is ${sgn(D.epochs.s_resid[S.epoch], 1)} mm per 100 m, about ${sgn(nu, 0)} N-units if it were all air.`;
  const lim = D.manifest.scales.s_resid_mm_per_100m, v = D.epochs.s_resid[S.epoch];
  const rgb = colourOf({ ramp: "RdBu_r", lim: [-lim, lim] }, v);
  airSlab.material.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  airSlab.material.opacity = 0.06 + 0.25 * Math.min(1, Math.abs(v) / lim);
}

function buildBalloon() {
  balloonGroup = new THREE.Group();
  const edges = D.bands.fine.map((b) => [b.lo, b.hi]);
  const slabs = edges.map(([lo, hi]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(700, Math.max(1, hi - lo) - 0.5, 600), new THREE.MeshBasicMaterial({ color: 0x1f6fa3, transparent: true, opacity: 0.0, depthWrite: false }));
    m.position.set(0, D.manifest.ground_nap + (lo + hi) / 2, 0);
    balloonGroup.add(m);
    return m;
  });
  const p = D.manifest.presets.rays;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(4, 14, 14), new THREE.MeshBasicMaterial({ color: 0xb4711a }));
  sphere.position.set(p.low[0] + 20, D.manifest.ground_nap, p.low[2] + 20);
  balloonGroup.add(sphere);
  balloonGroup.userData = { slabs, sphere, edges, x: p.low[0] + 20, z: p.low[2] + 20 };
  balloonGroup.visible = false;
  scene.add(balloonGroup);
}

function stepBalloon(dt) {
  const g = balloonGroup.userData, T = 4500;
  g.t = Math.min(T, (g.t || 0) + dt);
  const f = g.t / T, hb = f * 86;
  g.sphere.position.set(g.x, D.manifest.ground_nap + hb, g.z);
  const k = Math.max(0, Math.min(D.epochs.n_epochs - 2, S.epoch - 1));
  const lim = D.manifest.scales.band_fast_mm;
  const L = { ramp: "RdBu_r", lim: [-lim, lim] };
  let txt = `<b>A balloon from the data.</b> ${fmtDate(D.epochs.dates[k])} → ${fmtDate(D.epochs.dates[k + 1])}. Each slab: the 11-day change of its height band relative to the lowest band.<br>`;
  g.slabs.forEach((m, b) => {
    const band = D.bands.fine[b], v = band.fast[k], lit = band.lo <= hb;
    const rgb = colourOf(L, v);
    m.material.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    m.material.opacity = lit ? 0.08 + 0.3 * Math.min(1, Math.abs(v) / lim) : 0;
    if (lit) txt += `${band.lo}–${band.hi} m: ${sgn(v, 2)} mm (n = ${band.n})<br>`;
  });
  txt += `Layer gradient this step: ${sgn(D.epochs.s_fast[k], 2)} mm per 100 m.`;
  $("overlay").innerHTML = txt;
}

/* ------------------------------------------------------------ picking and cards */
function pick(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  camera.updateMatrixWorld(true);   /* render-on-demand: the world matrix may be stale between frames */
  const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera);
  const targets = [buildings, cellsMesh].filter((o) => o && o.visible);
  const hits = rc.intersectObjects(targets, false);
  if (!hits.length) return;
  const h = hits[0];
  if (h.object === buildings) {
    const bidIdx = buildings.geometry.attributes._building.getX(h.face.a);
    const bid = D.bld.order[Math.round(bidIdx)];
    S.selected = { kind: "building", id: bid }; buildingCard(bid); fillTable();
  } else if (h.object === cellsMesh && h.instanceId !== undefined) {
    S.selected = { kind: "cell", k: h.instanceId }; cellCard(h.instanceId);
  }
}

function sparkline(cv, series, epochMark, unit) {
  const ctx = cv.getContext("2d"), w = cv.clientWidth || 260, h = 70;
  cv.width = w * 2; cv.height = h * 2; ctx.scale(2, 2); ctx.clearRect(0, 0, w, h);
  const vals = series.filter((v) => v !== null), lo = Math.min(...vals), hi = Math.max(...vals), n = series.length;
  const X = (k) => 30 + k / (n - 1) * (w - 34), Y = (v) => 6 + (hi - v) / ((hi - lo) || 1) * (h - 22);
  ctx.strokeStyle = css("--line"); ctx.beginPath(); ctx.moveTo(30, Y(0)); ctx.lineTo(w - 4, Y(0)); ctx.stroke();
  ctx.strokeStyle = css("--accent"); ctx.beginPath(); series.forEach((v, k) => { if (v === null) return; k ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v)); }); ctx.stroke();
  ctx.strokeStyle = css("--bad"); ctx.beginPath(); ctx.moveTo(X(epochMark), 4); ctx.lineTo(X(epochMark), h - 14); ctx.stroke();
  ctx.fillStyle = css("--muted"); ctx.font = "9px system-ui"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
  ctx.fillText(hi.toFixed(0), 27, Y(hi)); ctx.fillText(lo.toFixed(0), 27, Y(lo));
  ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("mean displacement of the group [" + unit + "], 2014 to 2023", 30, h - 11);
}

function buildingCard(bid) {
  const r = D.bld.buildings[bid], a = D.bld.bag3d[bid], card = $("card");
  const name = r && r.label ? r.label : `Building ${a && a.year ? "from " + a.year : ""} (register id …${bid.slice(-6)})`;
  let html = `<h4>${name}</h4><table><tbody>`;
  if (a) html += `<tr><td>Roof height</td><td>${a.height_agl === null ? "n/a" : a.height_agl.toFixed(0) + " m above ground"}${a.floors ? ", " + a.floors + " floors" : ""}</td></tr>`;
  if (!r) {
    html += `<tr><td colspan="2">No radar points on this building in the TerraSAR-X set, or fewer than 20.</td></tr></tbody></table>`;
    card.innerHTML = html; return;
  }
  html += `<tr><td>Radar points</td><td>${r.n} on the building (${r.h_agl.min.toFixed(0)} to ${r.h_agl.max.toFixed(0)} m), ${r.n_ground} on the pavement within 15 m</td></tr>
    <tr><td>Long-term rate</td><td>${sgn(r.rate, 2)} mm/yr (at the top ${r.rate_at_top === null ? "n/a" : sgn(r.rate_at_top, 1)})</td></tr>
    <tr><td>Spread between its points</td><td>rate ± ${r.rate_sd.toFixed(2)} mm/yr (10th to 90th: ${sgn(r.rate_p10, 1)} to ${sgn(r.rate_p90, 1)}), swing ± ${r.amp_sd.toFixed(2)} mm; ${r.scatter_mm.toFixed(1)} mm apart on a typical pass</td></tr>
    <tr><td>Tilt</td><td>${r.tilt_per100 === null ? "n/a" : sgn(r.tilt_per100, 2) + " mm per 100 m per yr"}</td></tr>
    <tr><td>Curvature</td><td>${sgn(r.quad, 2)} mm/yr² (positive = slowing down)</td></tr>
    <tr><td>Seasonal swing</td><td>${r.seasonal.amp.toFixed(2)} mm, peaking around ${doyText(r.seasonal.peak_doy)} (± ${r.seasonal.peak_sd.toFixed(0)} days)</td></tr>
    <tr><td>Sideways expansion</td><td>${r.bx === null ? "n/a" : sgn(r.bx, 3) + " ± " + r.bx_se.toFixed(3) + " mm per m of easting (+0.015 expected for free expansion)"}</td></tr>
    <tr><td>Pavement next to it</td><td>${r.ground_rate === null ? "fewer than 20 points" : sgn(r.ground_rate, 2) + " mm/yr"}</td></tr>
    <tr><td>Slabs with data</td><td>${r.bands.map((b) => b.lo + "–" + b.hi + " m: " + sgn(b.rate, 1)).join("; ")}</td></tr>
    </tbody></table><canvas id="spark"></canvas>`;
  card.innerHTML = html;
  sparkline($("spark"), r.series, S.epoch, "mm");
}

function cellCard(k) {
  const G = D.grids[S.cellGrid], c = G.cells[k], card = $("card");
  const series = Array.from({ length: D.epochs.n_epochs }, (_, t) => G.get(k, t));
  card.innerHTML = `<h4>Cell ${c.i}, ${c.j} (${S.cellGrid === "ground" ? "ground points" : "all points"})</h4><table><tbody>
    <tr><td>Radar points</td><td>${c.n}, mean height ${c.h_agl_mean.toFixed(1)} m, highest ${c.h_agl_max.toFixed(0)} m</td></tr>
    <tr><td>Long-term rate</td><td>${sgn(c.rate_mean, 2)} mm/yr, curvature ${sgn(c.quad_mean, 2)} mm/yr²</td></tr>
    <tr><td>Spread between its points</td><td>rate ± ${c.rate_sd.toFixed(2)} mm/yr (10th to 90th: ${sgn(c.rate_p10, 1)} to ${sgn(c.rate_p90, 1)}), heights ± ${c.h_agl_sd.toFixed(1)} m; ${G.sd(k, S.epoch).toFixed(1)} mm apart on this pass, ${c.scatter_mm.toFixed(1)} mm on a typical one</td></tr>
    <tr><td>Seasonal swing</td><td>${c.amp.toFixed(2)} mm, peaking around ${doyText(c.peak_doy)}</td></tr>
    <tr><td>This pass</td><td>${sgn(cellValue(G, c, k, S.epoch), 2)} mm (${S.tmode === "increment" ? "since the previous pass" : S.tmode === "cumulative" ? "since 2014" : "minus the cell's trend"})</td></tr>
    </tbody></table><canvas id="spark"></canvas>`;
  sparkline($("spark"), series, S.epoch, "mm");
}

/* ------------------------------------------------------------ time */
function setEpoch(t) {
  S.epoch = Math.max(0, Math.min(D.epochs.n_epochs - 1, t));
  if (S.cellLayer === "time" || S.cellLayer === "points" || (CELL_LAYERS[S.cellLayer] && CELL_LAYERS[S.cellLayer].perEpoch)) colourCells();
  updateEpochLabel(); drawStrip();
  if (S.selected) { if (S.selected.kind === "building") { const cv = $("spark"); if (cv) sparkline(cv, D.bld.buildings[S.selected.id].series, S.epoch, "mm"); } else cellCard(S.selected.k); }
  S.needsRender = true;
}

let lastT = 0, acc = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = lastT ? t - lastT : 0; lastT = t;
  if (S.playing) { acc += dt; const step = 1000 / S.speed; if (acc >= step) { const n = Math.floor(acc / step); acc -= n * step; setEpoch((S.epoch + n) % D.epochs.n_epochs); } }
  if (S.rays) { stepRays(dt); S.needsRender = true; }
  if (S.balloon) { stepBalloon(dt); S.needsRender = true; }
  if (flight && flight.active) { flight.update(dt / 1000); S.needsRender = true; }
  else controls.update();
  if (S.needsRender) { renderer.render(scene, camera); S.needsRender = false; }
  if (location.search.includes("debug")) $("hud").textContent = `draw calls ${renderer.info.render.calls}, triangles ${renderer.info.render.triangles}`;
}

/* ------------------------------------------------------------ wiring */
function wire() {
  $("layer").addEventListener("change", (e) => { S.layer = e.target.value; fillTable(); });
  $("cellLayer").addEventListener("change", (e) => { S.cellLayer = e.target.value; colourCells(); });
  $("cellGround").addEventListener("change", (e) => { S.cellGrid = e.target.checked ? "ground" : "all"; S.selected = null; buildCells(); });
  $("columns").addEventListener("change", (e) => { S.columns = e.target.checked; buildCells(); });
  $("edges").addEventListener("change", (e) => { S.edges = e.target.checked; if (edgesObj) edgesObj.visible = S.edges; S.needsRender = true; });
  $("texture").addEventListener("change", (e) => { S.texture = e.target.checked; applyTexture(); S.needsRender = true; });
  $("radarLight").addEventListener("change", (e) => { S.radarLight = e.target.checked; applyLighting(); });
  $("ceiling").addEventListener("change", (e) => { S.ceiling = e.target.checked; ceilingPlane.visible = S.ceiling; S.needsRender = true; });
  const presets = [["overview", "Overview"], ["top", "Top-down"], ["satellite", "From the satellite"], ["street", "Street level"]];
  presets.forEach(([k, lab]) => { if (!D.manifest.presets[k]) return; const b = document.createElement("button"); b.type = "button"; b.textContent = lab; b.dataset.p = k; b.addEventListener("click", () => setPreset(k)); $("presets").appendChild(b); });
  $("raysBtn").addEventListener("click", () => { S.rays = !S.rays; rayGroup.visible = S.rays; $("raysBtn").classList.toggle("on", S.rays); if (S.rays) { S.balloon = false; balloonGroup.visible = false; $("balloonBtn").classList.remove("on"); } $("overlay").classList.toggle("on", S.rays || S.balloon); S.needsRender = true; });
  $("balloonBtn").addEventListener("click", () => { S.balloon = true; balloonGroup.userData.t = 0; balloonGroup.visible = true; $("balloonBtn").classList.add("on"); S.rays = false; rayGroup.visible = false; $("raysBtn").classList.remove("on"); $("overlay").classList.add("on"); S.needsRender = true; });
  $("tSlider").addEventListener("input", (e) => { S.playing = false; $("tPlay").textContent = "▶"; setEpoch(parseInt(e.target.value, 10)); });
  $("tPlay").addEventListener("click", () => { S.playing = !S.playing; $("tPlay").textContent = S.playing ? "❚❚" : "▶"; acc = 0; });
  $("tSpeed").addEventListener("change", (e) => { S.speed = parseInt(e.target.value, 10); });
  document.querySelectorAll('input[name="tmode"]').forEach((r) => r.addEventListener("change", (e) => { S.tmode = e.target.value; colourCells(); setEpoch(S.epoch); }));
  $("strip").addEventListener("pointerdown", (e) => { const r = e.target.getBoundingClientRect(); const f = (e.clientX - r.left - 40) / (r.width - 50); S.playing = false; $("tPlay").textContent = "▶"; setEpoch(Math.round(f * (D.epochs.n_epochs - 1))); });
  let down = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) pick(e); down = null; });
  renderer.domElement.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); setEpoch(S.epoch + (e.shiftKey ? 10 : 1)); } if (e.key === "ArrowLeft") { e.preventDefault(); setEpoch(S.epoch - (e.shiftKey ? 10 : 1)); } if (e.key === " ") { e.preventDefault(); $("tPlay").click(); } });
  $("flyBtn").addEventListener("click", takeOff);
  window.addEventListener("resize", drawStrip);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { scene.background = new THREE.Color(css("--canvas")); fillTable(); drawStrip(); S.needsRender = true; });
}

/* the easter egg: loaded only when someone finds the bird */
async function takeOff() {
  if (flight && flight.active) return;
  S.playing = false; $("tPlay").textContent = "▶";
  S.rays = S.balloon = false;
  if (rayGroup) rayGroup.visible = false;
  if (balloonGroup) balloonGroup.visible = false;
  $("overlay").classList.remove("on");
  $("raysBtn").classList.remove("on"); $("balloonBtn").classList.remove("on");
  if (camera !== persp) { camera = persp; controls.object = camera; resize(); }
  if (!flight) {
    const mod = await import("./flight.js");
    flight = mod.createFlight({
      scene, stage: $("stage"), camera: persp, controls, manifest: D.manifest, dataUrl: DATA,
      onExit: () => { setPreset("overview"); }
    });
  }
  await flight.start();
  $("hud").textContent = "";
}

async function main() {
  try {
    await loadAll();
    initScene();
    await loadBuildings();
    buildCells(); buildRays(); buildBalloon(); buildPoints();
    if (D.points) {                       /* only on a machine with the local per-point build */
      const sel = $("cellLayer"), o = document.createElement("option");
      o.value = "points";
      o.textContent = "every radar point (local file, not published)";
      sel.insertBefore(o, sel.lastElementChild);
      const note = document.createElement("p");
      note.className = "small";
      note.textContent = "A local per-point file is present, so the view can show all " +
        D.points.meta.n_points + " points instead of cell means. That file is not part of the published site.";
      $("panel").appendChild(note);
    }
    wire();
    setPreset("overview");
    setEpoch(0);
    $("loading").remove();
    $("hud").textContent = "Overview from the south-east · drag to orbit, scroll to zoom, click a building";
    if (location.search.includes("debug")) window.__vrs = { THREE, pick, scene, get camera() { return camera; }, buildings, get cells() { return cellsMesh; }, ground, renderer, S, D, setPreset, setEpoch };
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    $("loading").textContent = "The 3D view could not start: " + err.message;
    $("noWebgl").hidden = false;
  }
}
main();
