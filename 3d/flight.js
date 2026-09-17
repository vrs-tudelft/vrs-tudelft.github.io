/* An easter egg: fly over Kop van Zuid.
   Loaded on demand, so the page pays nothing for it unless the plane icon is clicked.
   It borrows the scene, the renderer and the perspective camera that are already there,
   adds a light aircraft and a HUD, and hands control back untouched on exit.

   Flight model: thrust against quadratic drag, gravity along the flight path, a
   coordinated turn from the bank angle, and a stall that drops the nose. Collision is
   done against the published building footprints, not the mesh, which is one
   point-in-polygon test per frame instead of a ray through 22 000 triangles. */

import * as THREE from "three";

const G = 9.81;
const THRUST = 34;          // m/s^2 at full throttle
const DRAG = 0.0042;        // top speed ~ 90 m/s
const V_STALL = 28;         // m/s
const KEYS = {
  ArrowUp: "pitchUp", ArrowDown: "pitchDown", ArrowLeft: "rollLeft", ArrowRight: "rollRight",
  KeyW: "throttleUp", KeyS: "throttleDown", KeyA: "yawLeft", KeyD: "yawRight",
  KeyC: "view", KeyR: "reset", Escape: "exit"
};

function aircraft() {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0xf2f1ec });
  const trim = new THREE.MeshLambertMaterial({ color: 0x15688f });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3c4249 });
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 7, 10), body);
  fuselage.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.4, 10), body);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -4.1;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.22, 1.7), body);
  wing.position.set(0, -0.15, 0.3);
  const tips = new THREE.Mesh(new THREE.BoxGeometry(11.9, 0.14, 0.45), trim);
  tips.position.set(0, -0.15, 1.05);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 1.05), body);
  tail.position.set(0, 0.15, 3.1);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.7, 1.2), trim);
  fin.position.set(0, 0.95, 3.2);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8), dark);
  canopy.scale.set(1, 0.72, 1.9); canopy.position.set(0, 0.42, -1.1);
  const prop = new THREE.Mesh(new THREE.CircleGeometry(1.25, 18),
    new THREE.MeshBasicMaterial({ color: 0x3c4249, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
  prop.position.z = -4.8;
  g.add(fuselage, nose, wing, tips, tail, fin, canopy, prop);
  g.userData.prop = prop;
  return g;
}

const HUD = `
<div class="fly-hud">
  <div class="fly-corner tl"><span class="v" data-k="spd">0</span><span class="u">km/h</span>
    <span class="v" data-k="alt">0</span><span class="u">m</span></div>
  <div class="fly-corner tr"><span class="v" data-k="hdg">0</span><span class="u">°</span></div>
  <div class="fly-horizon"><div class="ring"><div class="sky"><i></i></div></div><div class="wings"></div></div>
  <div class="fly-throttle"><div class="bar"><i></i></div><span>throttle</span></div>
  <div class="fly-warn" hidden>stall</div>
  <div class="fly-keys">↑↓ pitch · ←→ roll · A D rudder · W S throttle · C view · R reset · Esc land back in the map</div>
  <button type="button" class="fly-exit" title="Back to the map">✕</button>
</div>`;

export function createFlight(ctx) {
  const { scene, stage, camera, controls, manifest, dataUrl, onExit, onFrame } = ctx;
  const ground = manifest.ground_nap;
  let plane = null, hud = null, blocks = null, active = false;
  let vel = 0, throttle = 0.72, view = 3, crashed = 0, listeners = [];
  /* start south-west of the pier at 180 m, pointed north-east down its long axis */
  const spawn = { pos: new THREE.Vector3(-620, ground + 180, 620), yaw: -Math.PI / 4 };
  const held = new Set();
  const camPos = new THREE.Vector3(), camAim = new THREE.Vector3();
  const fwd = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function on(target, type, fn, opts) { target.addEventListener(type, fn, opts); listeners.push([target, type, fn]); }

  /* building footprints: rings in metres east/north of the local origin, plus a roof height */
  async function loadBlocks() {
    if (blocks) return blocks;
    const [outlines, buildings] = await Promise.all([
      fetch(dataUrl + "outlines.json").then((r) => r.json()),
      fetch(dataUrl + "buildings.json").then((r) => r.json())
    ]);
    blocks = outlines.outlines.map((o) => {
      const a = buildings.bag3d && buildings.bag3d[o.bag_id];
      const top = a && a.roof_max_nap ? a.roof_max_nap : ground + 18;
      const rings = o.rings.map((r) => r.map((p) => [p[0], -p[1]]));   /* east,north -> x,z */
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      rings.forEach((r) => r.forEach((p) => {
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
        z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
      }));
      return { rings, top, x0, x1, z0, z1 };
    });
    return blocks;
  }
  function inside(ring, x, z) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  }
  function roofUnder(x, z) {
    if (!blocks) return -Infinity;
    for (const b of blocks) {
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      for (const r of b.rings) if (inside(r, x, z)) return b.top;
    }
    return -Infinity;
  }

  function reset() {
    plane.position.copy(spawn.pos);
    plane.quaternion.identity();
    plane.rotateY(spawn.yaw);
    vel = 62; throttle = 0.72; crashed = 0;
    hud.querySelector(".fly-warn").hidden = true;
    stage.classList.remove("fly-crash");
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    if (crashed > 0) {
      crashed -= dt;
      if (crashed <= 0) reset();
      return;
    }
    /* controls soften as the air thins out over the wings */
    const auth = Math.min(1, vel / 45);
    if (held.has("pitchUp")) plane.rotateX(0.95 * auth * dt);
    if (held.has("pitchDown")) plane.rotateX(-0.95 * auth * dt);
    if (held.has("rollLeft")) plane.rotateZ(1.4 * auth * dt);
    if (held.has("rollRight")) plane.rotateZ(-1.4 * auth * dt);
    if (held.has("yawLeft")) plane.rotateY(0.5 * auth * dt);
    if (held.has("yawRight")) plane.rotateY(-0.5 * auth * dt);
    if (held.has("throttleUp")) throttle = Math.min(1, throttle + 0.6 * dt);
    if (held.has("throttleDown")) throttle = Math.max(0, throttle - 0.6 * dt);

    plane.updateMatrixWorld();
    fwd.set(0, 0, -1).applyQuaternion(plane.quaternion);
    up.set(0, 1, 0).applyQuaternion(plane.quaternion);
    right.set(1, 0, 0).applyQuaternion(plane.quaternion);

    /* a banked wing turns the aircraft without touching the rudder */
    const bank = Math.atan2(right.y, up.y);
    plane.rotateY((G / Math.max(vel, 18)) * Math.tan(THREE.MathUtils.clamp(bank, -1.2, 1.2)) * dt);
    /* let go of the stick and the wings find level again, as a stable aircraft would */
    if (!held.has("rollLeft") && !held.has("rollRight")) {
      plane.rotateZ(-THREE.MathUtils.clamp(bank, -1, 1) * 0.9 * auth * dt);
    }

    /* speed: thrust, quadratic drag, and the climb or dive paid for in airspeed */
    vel += (THRUST * throttle - DRAG * vel * vel - G * fwd.y) * dt;
    vel = Math.max(vel, 6);

    const stalling = vel < V_STALL;
    if (stalling) plane.rotateX(-0.8 * (1 - vel / V_STALL) * dt);
    hud.querySelector(".fly-warn").hidden = !stalling;

    plane.position.addScaledVector(fwd, vel * dt);
    if (stalling) plane.position.y -= (V_STALL - vel) * 0.55 * dt;
    plane.userData.prop.rotation.z += (6 + throttle * 30) * dt;

    /* collision: the roof under us, or the water */
    const floor = Math.max(roofUnder(plane.position.x, plane.position.z), ground);
    if (plane.position.y - 1.2 <= floor) {
      const gentle = Math.abs(bank) < 0.25 && fwd.y > -0.08 && vel < 55 && floor <= ground + 0.5;
      if (gentle) {                       /* a landing on the quay, not a crash */
        plane.position.y = floor + 1.2;
        vel = Math.max(6, vel - 26 * dt);
        throttle = Math.min(throttle, 0.25);
      } else {
        crashed = 1.3;
        stage.classList.add("fly-crash");
      }
    }
    if (plane.position.y > ground + 1400) plane.position.y = ground + 1400;

    /* camera: behind and above, or in the seat with the airframe out of the way */
    plane.visible = view === 3;
    if (view === 3) {
      tmp.set(0, 3.6, 17).applyQuaternion(plane.quaternion).add(plane.position);
      camPos.lerp(tmp, 1 - Math.pow(0.0016, dt));
      camAim.lerp(tmp.copy(plane.position).addScaledVector(fwd, 24), 1 - Math.pow(0.0009, dt));
    } else {
      tmp.set(0, 0.78, -1.15).applyQuaternion(plane.quaternion).add(plane.position);
      camPos.lerp(tmp, 1 - Math.pow(0.00002, dt));
      camAim.copy(plane.position).addScaledVector(fwd, 60).addScaledVector(up, 1.2);
    }
    camera.position.copy(camPos);
    camera.up.copy(up);
    camera.lookAt(camAim);

    /* HUD */
    const set = (k, v) => { const e = hud.querySelector(`[data-k="${k}"]`); if (e.textContent !== v) e.textContent = v; };
    set("spd", Math.round(vel * 3.6));
    set("alt", Math.round(plane.position.y - ground));
    let hdg = Math.round((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI);
    set("hdg", String((hdg + 360) % 360).padStart(3, "0"));
    hud.querySelector(".fly-throttle i").style.width = Math.round(throttle * 100) + "%";
    const pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
    hud.querySelector(".fly-horizon .ring").style.transform = `rotate(${(-bank * 180) / Math.PI}deg)`;
    hud.querySelector(".fly-horizon .sky").style.transform = `translateY(${THREE.MathUtils.clamp((pitch * 180) / Math.PI * 1.4, -46, 46)}%)`;
  }

  async function start() {
    if (active) return;
    await loadBlocks();
    plane = aircraft();
    scene.add(plane);
    /* somewhere to fly over once the little aerial photo runs out */
    const far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshLambertMaterial({ color: 0xd6dad3 }));
    far.rotation.x = -Math.PI / 2;
    far.position.y = ground - 0.6;
    scene.add(far);
    plane.userData.far = far;

    stage.insertAdjacentHTML("beforeend", HUD);
    hud = stage.querySelector(".fly-hud");
    hud.querySelector(".fly-exit").addEventListener("click", stop);

    controls.enabled = false;
    camera.near = 0.6; camera.far = 12000; camera.updateProjectionMatrix();
    reset();
    camPos.copy(plane.position).add(new THREE.Vector3(0, 6, 22));
    camAim.copy(plane.position);

    on(window, "keydown", (e) => {
      const a = KEYS[e.code];
      if (!a) return;
      e.preventDefault();
      if (a === "exit") return stop();
      if (a === "view") { view = view === 3 ? 1 : 3; return; }
      if (a === "reset") return reset();
      held.add(a);
    });
    on(window, "keyup", (e) => { const a = KEYS[e.code]; if (a) held.delete(a); });
    on(window, "blur", () => held.clear());
    active = true;
    stage.classList.add("flying");
    return true;
  }

  function stop() {
    if (!active) return;
    active = false;
    held.clear();
    listeners.forEach(([t, ty, fn]) => t.removeEventListener(ty, fn));
    listeners = [];
    scene.remove(plane.userData.far, plane);
    plane.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    plane.userData.far.geometry.dispose();
    plane = null;
    if (hud) hud.remove();
    hud = null;
    stage.classList.remove("flying", "fly-crash");
    camera.near = 1; camera.far = 6000; camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0);
    controls.enabled = true;
    if (onExit) onExit();
  }

  return { start, stop, update, get active() { return active; } };
}
