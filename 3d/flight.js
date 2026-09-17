/* An easter egg: fly over Kop van Zuid as a gull.
   Loaded on demand, so the page pays nothing for it unless the bird icon is clicked.
   It borrows the scene, the renderer and the perspective camera that are already there,
   adds one bird and a HUD, and hands control back untouched on exit.

   Flight model: the wingbeat against quadratic drag, gravity along the flight path, a
   turn that follows the banked wings, and a stall that drops the head. Collision is
   done against the published building footprints, not the mesh, which is one
   point-in-polygon test per frame instead of a ray through 22 000 triangles. */

import * as THREE from "three";

const G = 9.81;
const POWER = 14;           // m/s^2 at a full wingbeat
const DRAG = 0.011;         // levels out near 36 m/s, about 130 km/h in a dive
const V_STALL = 8;          // m/s, below this the wings stop carrying
const KEYS = {
  ArrowUp: "pitchUp", ArrowDown: "pitchDown", ArrowLeft: "rollLeft", ArrowRight: "rollRight",
  KeyW: "beatUp", KeyS: "beatDown", KeyA: "yawLeft", KeyD: "yawRight",
  KeyC: "view", KeyR: "reset", Escape: "exit"
};

function gull() {
  const g = new THREE.Group();
  const pale = new THREE.MeshLambertMaterial({ color: 0xf4f3ef });
  const grey = new THREE.MeshLambertMaterial({ color: 0xc2c7cd });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3c4249 });
  const beak = new THREE.MeshLambertMaterial({ color: 0xd8a13a });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), pale);
  body.scale.set(1, 0.92, 3.1);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), pale);
  head.position.set(0, 0.2, -1.75);
  const bill = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.75, 8), beak);
  bill.rotation.x = -Math.PI / 2; bill.position.set(0, 0.14, -2.3);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), dark);
  eyeL.position.set(0.26, 0.3, -1.95);
  const eyeR = eyeL.clone(); eyeR.position.x = -0.26;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.7), pale);
  tail.position.set(0, 0.05, 2.35);
  const tailTip = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.35), dark);
  tailTip.position.set(0, 0.05, 3.1);

  /* one pivot per wing at the shoulder, so a rotation about z is a wingbeat */
  const wings = [1, -1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.3, 0.16, -0.35);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 1.5), pale);
    inner.position.set(side * 1.4, 0, 0.1);
    const outer = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 1.05), grey);
    outer.position.set(side * 3.8, 0, 0.5);
    outer.rotation.y = side * -0.12;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.7), dark);
    tip.position.set(side * 5.4, 0, 0.9);
    tip.rotation.y = side * -0.2;
    pivot.add(inner, outer, tip);
    g.add(pivot);
    return pivot;
  });

  g.add(body, head, bill, eyeL, eyeR, tail, tailTip);
  g.userData.wings = wings;
  g.userData.beat = 0;
  g.scale.setScalar(0.22);          /* built large for legible numbers, flown at gull size: 2 m across */
  return g;
}

const HUD = `
<div class="fly-hud">
  <div class="fly-corner tl"><span class="v" data-k="spd">0</span><span class="u">km/h</span>
    <span class="v" data-k="alt">0</span><span class="u">m</span></div>
  <div class="fly-corner tr"><span class="v" data-k="hdg">0</span><span class="u">°</span></div>
  <div class="fly-horizon"><div class="ring"><div class="sky"><i></i></div></div><div class="wings"></div></div>
  <div class="fly-effort"><div class="bar"><i></i></div><span>wingbeat</span></div>
  <div class="fly-warn" hidden>stall</div>
  <div class="fly-keys">↑↓ pitch · ←→ bank · A D tail · W S wingbeat · C view · R reset · Esc land back in the map</div>
  <button type="button" class="fly-exit" title="Back to the map">✕</button>
</div>`;

export function createFlight(ctx) {
  const { scene, stage, camera, controls, manifest, dataUrl, onExit, onFrame } = ctx;
  const ground = manifest.ground_nap;
  let bird = null, hud = null, blocks = null, active = false;
  let vel = 0, effort = 0.6, view = 3, crashed = 0, listeners = [];
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
    bird.position.copy(spawn.pos);
    bird.quaternion.identity();
    bird.rotateY(spawn.yaw);
    vel = 20; effort = 0.6; crashed = 0;
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
    const auth = Math.min(1, vel / 22);
    if (held.has("pitchUp")) bird.rotateX(0.95 * auth * dt);
    if (held.has("pitchDown")) bird.rotateX(-0.95 * auth * dt);
    if (held.has("rollLeft")) bird.rotateZ(1.4 * auth * dt);
    if (held.has("rollRight")) bird.rotateZ(-1.4 * auth * dt);
    if (held.has("yawLeft")) bird.rotateY(0.5 * auth * dt);
    if (held.has("yawRight")) bird.rotateY(-0.5 * auth * dt);
    if (held.has("beatUp")) effort = Math.min(1, effort + 0.6 * dt);
    if (held.has("beatDown")) effort = Math.max(0, effort - 0.6 * dt);

    bird.updateMatrixWorld();
    fwd.set(0, 0, -1).applyQuaternion(bird.quaternion);
    up.set(0, 1, 0).applyQuaternion(bird.quaternion);
    right.set(1, 0, 0).applyQuaternion(bird.quaternion);

    /* banked wings turn the bird without any help from the tail */
    const bank = Math.atan2(right.y, up.y);
    bird.rotateY((G / Math.max(vel, 10)) * Math.tan(THREE.MathUtils.clamp(bank, -1.2, 1.2)) * dt);
    /* let go and the wings find level again, the way a soaring bird does */
    if (!held.has("rollLeft") && !held.has("rollRight")) {
      bird.rotateZ(-THREE.MathUtils.clamp(bank, -1, 1) * 0.9 * auth * dt);
    }

    /* speed: the wingbeat, quadratic drag, and the climb or dive paid for in airspeed */
    vel += (POWER * effort - DRAG * vel * vel - G * fwd.y) * dt;
    vel = Math.max(vel, 4);

    const stalling = vel < V_STALL;
    if (stalling) bird.rotateX(-0.8 * (1 - vel / V_STALL) * dt);
    hud.querySelector(".fly-warn").hidden = !stalling;

    bird.position.addScaledVector(fwd, vel * dt);
    if (stalling) bird.position.y -= (V_STALL - vel) * 0.55 * dt;
    /* the wings beat harder the more effort is asked of them, and set when gliding */
    const bd = bird.userData;
    bd.beat += (1.6 + effort * 5.2) * dt;
    const swing = Math.sin(bd.beat) * (0.1 + effort * 0.62) + 0.12;
    bd.wings[0].rotation.z = swing;
    bd.wings[1].rotation.z = -swing;

    /* collision: the roof under us, or the water */
    const floor = Math.max(roofUnder(bird.position.x, bird.position.z), ground);
    if (bird.position.y - 0.35 <= floor) {
      const gentle = Math.abs(bank) < 0.25 && fwd.y > -0.08 && vel < 15 && floor <= ground + 0.5;
      if (gentle) {                       /* a landing on the quay, not a crash */
        bird.position.y = floor + 0.35;
        vel = Math.max(4, vel - 14 * dt);
        effort = Math.min(effort, 0.25);
      } else {
        crashed = 1.3;
        stage.classList.add("fly-crash");
      }
    }
    if (bird.position.y > ground + 1400) bird.position.y = ground + 1400;

    /* camera: behind and above, or at the bird's own eye with the body out of the way */
    bird.visible = view === 3;
    if (view === 3) {
      tmp.set(0, 1.1, 6.5).applyQuaternion(bird.quaternion).add(bird.position);
      camPos.lerp(tmp, 1 - Math.pow(0.0016, dt));
      camAim.lerp(tmp.copy(bird.position).addScaledVector(fwd, 24), 1 - Math.pow(0.0009, dt));
    } else {
      tmp.set(0, 0.12, -0.62).applyQuaternion(bird.quaternion).add(bird.position);
      camPos.lerp(tmp, 1 - Math.pow(0.00002, dt));
      camAim.copy(bird.position).addScaledVector(fwd, 60).addScaledVector(up, 1.2);
    }
    camera.position.copy(camPos);
    camera.up.copy(up);
    camera.lookAt(camAim);

    /* HUD */
    const set = (k, v) => { const e = hud.querySelector(`[data-k="${k}"]`); if (e.textContent !== v) e.textContent = v; };
    set("spd", Math.round(vel * 3.6));
    set("alt", Math.round(bird.position.y - ground));
    let hdg = Math.round((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI);
    set("hdg", String((hdg + 360) % 360).padStart(3, "0"));
    hud.querySelector(".fly-effort i").style.width = Math.round(effort * 100) + "%";
    const pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
    hud.querySelector(".fly-horizon .ring").style.transform = `rotate(${(-bank * 180) / Math.PI}deg)`;
    hud.querySelector(".fly-horizon .sky").style.transform = `translateY(${THREE.MathUtils.clamp((pitch * 180) / Math.PI * 1.4, -46, 46)}%)`;
  }

  async function start() {
    if (active) return;
    await loadBlocks();
    bird = gull();
    scene.add(bird);
    /* somewhere to fly over once the little aerial photo runs out */
    const far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshLambertMaterial({ color: 0xd6dad3 }));
    far.rotation.x = -Math.PI / 2;
    far.position.y = ground - 0.6;
    scene.add(far);
    bird.userData.far = far;

    stage.insertAdjacentHTML("beforeend", HUD);
    hud = stage.querySelector(".fly-hud");
    hud.querySelector(".fly-exit").addEventListener("click", stop);

    controls.enabled = false;
    camera.near = 0.2; camera.far = 12000; camera.updateProjectionMatrix();
    reset();
    camPos.copy(bird.position).add(new THREE.Vector3(0, 1.8, 8));
    camAim.copy(bird.position);

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
    scene.remove(bird.userData.far, bird);
    bird.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    bird.userData.far.geometry.dispose();
    bird = null;
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
