// O Instante: the other side of the rift is the moment the world was torn apart, stopped. The pieces of the journey
// hang where the pull left them — broken islands, uprooted trees, a bridge blown into planks, a waterfall caught
// mid-fall, rain that never lands, a current of rocks pouring into little black holes — all in grey. Only round
// the character does time still move, and there it has colour: a bubble.
//
// Two powers, learned in order:
//   rewind (hold interact, R / B): time in the bubble runs backwards, fast; what the pull took flies home.
//   stop (hold attack, J / X / left mouse; from A Cachoeira Parada on): time in the bubble stops. What is stopped is
//   solid — the falling water becomes a path — and nothing drifts, flows or carries you while you hold it.
// Inside the bubble, otherwise, time runs on slowly: what you mended comes apart again.
// Every loose piece has its own moment τ (0 = where it belonged, 1 = as far as the pull took it). A piece whose home
// is near you counts as near, so you can call back what was blown out of reach.
//   I   O Instante          rewind the blown-up bridge, cross before it drifts apart
//   II  A Ilha Partida      bring the fallen rocks back up into a stair and climb it
//   III O Jardim Suspenso   let time run: a rock still falling carries you across the void
//   IV  A Cachoeira Parada  learn to stop: the waterfall is only a path while you hold time still
//   V   A Corrente          a current of rocks pours into the hole: hop across it, stop it, or rewind it
//   VI  O Farol Parado      rewind the lighthouse. Its light comes back, the colour floods out, time starts again.
// Three stopped pocket watches (lore) and seven fragments are hidden along the way.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, camera, game, U } from '../core.js';
import { V3, TAU, clamp, lerp, damp, smoothstep, rand, rnd, reseed, pick } from '../utils.js';
import { settings } from '../config.js';
import { islands, colliders, worldGeos, grassI, flowerI, pickups, summit, addCol, pushGeo, buildGrid } from './world.js';
import { bake, jitter, rockMass, shapeH, palette, islandColor, P_ISLAND, P_SLAB } from './geometry.js';
import { worldMat } from './materials.js';
import { addShrine, addPickup, addTree, addLantern, addBoulder, grassDisc, buildVegetation } from './objects/index.js';
import { updateBeacon } from './objects/beacon.js';
import { makeHalo } from './objects/halo.js';
import { placeHole, updateHole } from '../fx/blackhole.js';
import { burst, sparks, puff } from '../fx/particles.js';
import { seas } from '../render/atmosphere.js';
import { grade, bloom } from '../render/post.js';
import { player } from '../game/player.js';
import { held, pad, keyName } from '../game/input.js';
import { tone, playCine, cineReady } from '../game/audio.js';
import { save, persist } from '../game/progress.js';
import { toast } from '../game/ui.js';

const BUBBLE = 5.5, REWIND = 0.75, FROZEN_T = 37.3, STOP_FROM = 3;   // bubble (m), rewind (τ/s), stopped clock, stop is learned at IV
// gray: how grey the world outside the bubble is (the crossing keeps it 0 in the tunnel)
export const instante = { pieces: [], tower: [], water: [], lanes: [], clocks: [], exit: new V3(-18, 34, -30), holeAge: 30,
  rewinding: false, stopping: false, mouseStop: false, flow: 0, stream: 0, clock: 0, end: null, thawed: false, radius: BUBBLE,
  gray: 1, taught: false, onEnd: null };
const UPV = new V3(0, 1, 0), _v = new V3(), _w = new V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new V3(1, 1, 1);
const VIOLET = new THREE.Color('#9d6bff'), TIME_BLUE = new THREE.Color('#9fd8ff'), WARM = new THREE.Color('#ffe2b0'), STILL = new THREE.Color('#eef3ff');

// ---- the stopped world: pieces of the journey, frozen mid-flight (visual only unless they are a piece)
// a broken island: flat top, rock underneath. amp: how ragged its outline is (the route islands stay near round, so
// their rims — and the walls under them — are where the route expects)
function chunk(x, y, z, R, pal, tag = {}, depthF = rand(0.9, 1.2), amp = 1.3) {
  const h = shapeH(amp), depth = R * depthF, prof = P_ISLAND(depth);
  pushGeo(rockMass(R, h, prof, 26, islandColor(pal)), x, y, z);
  const col = addCol({ x, z, y, r: R, h, prof, depth, ...tag });
  return { x, y, z, R, h, depth, pal, occ: [], col };
}
// whatever fn builds, tilted and lifted by `m` and kept only as scenery (no collision): debris hanging in the air
function airborne(m, fn) {
  const g0 = worldGeos.length, gr0 = grassI.length, fl0 = flowerI.length, c0 = colliders.length;
  fn();
  colliders.length = c0;
  for (const g of worldGeos.slice(g0)) g.applyMatrix4(m);
  for (const [mm] of [...grassI.slice(gr0), ...flowerI.slice(fl0)]) mm.premultiply(m);
}
const tiltAt = (x, y, z, ax, az) => new THREE.Matrix4().makeTranslation(x, y, z)
  .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax, rand(0, TAU), az))).multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));

// a checkpoint island: a chunk that stayed where it was, with its shrine
function checkpoint(idx, x, y, z, R, t, cx, cz) {
  const pal = palette(t), is = chunk(x, y, z, R, pal, { island: idx }, rand(0.9, 1.2), 0.25);
  Object.assign(is, { idx, cp: { x: cx, y, z: cz, heading: 0 } });
  islands[idx] = is;
  addShrine(is, cx - 1.2, cz + 1.6);
  is.occ.push({ x: cx - 1.2, z: cz + 1.6, r: 1, solid: true });
  grassDisc(x, y, z, R, is.h, R * R * 3.2, pal, is.occ);
  return is;
}

// ---- pieces: things with a moment. kind 'plank' tumbles (walkable only when home), 'slab' stays level (always
// walkable: a lift or a ferry when time runs), 'block' is scenery (the lighthouse's stones).
// home: where it belonged (top of its walking face); away: where the pull took it at τ = 1; tau: where it stopped.
// ride: its time only runs on while you stand on it (the ferry), though it still rewinds when you are near.
function piece(kind, mesh, home, away, { tau = 0.7, drift = 0.012, spin = 0, arc = 0, yaw = 0, col = null, T = 0.3, ride = false } = {}) {
  scene.add(mesh);
  const p = { kind, mesh, home, away, tau, tau0: tau, drift, spin, arc, yaw, T, ride, axis: new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), col, prev: new V3(NaN), r: 1 };
  if (col) {
    p.c = addCol({ ...col, x: home.x, z: home.z, y: home.y, thick: T, depth: T, mover: { delta: new V3(), motion: { type: 'instante' } } });
    p.r = col.r ?? Math.hypot(col.rect[0], col.rect[1]);
  }
  instante.pieces.push(p);
  return p;
}
const plankMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
function plank(x, y, z, hw, hd, away, tau) {
  const wood = new THREE.Color('#8a6a4a'), geo = bake(new THREE.BoxGeometry(hw * 2, 0.3, hd * 2).translate(0, -0.15, 0), (c, n, o) => o.copy(wood).offsetHSL(0, rand(-0.05, 0.05), rand(-0.06, 0.04)));
  return piece('plank', new THREE.Mesh(geo, plankMat), new V3(x, y, z), away, { tau, spin: rand(3, 7), arc: rand(0.5, 2), col: { rect: [hw, hd, 0], surface: 'stone' } });
}
function slab(x, y, z, r, T, pal, away, opts = {}) {
  const geo = rockMass(r, shapeH(0.6), P_SLAB(T), 14, islandColor(pal));
  return piece('slab', new THREE.Mesh(geo, worldMat), new V3(x, y, z), away, { T, col: { r }, ...opts });
}

// ---- water caught mid-fall: a ribbon that flows while time runs near it, and turns to glass (and floor) when stopped
const waterMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uFlow: { value: 0 }, uSolid: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uFlow, uSolid; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  void main(){
    float u = vUv.x, v = vUv.y, edge = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.88, u);
    float lane = floor(u * 9.0), streak = smoothstep(0.55, 1.0, sin((v - uFlow * (2.0 + h(vec2(lane, 1.0)) * 2.0)) * 2.2 + h(vec2(lane, 3.0)) * 6.0));
    vec3 flowing = mix(vec3(0.16, 0.42, 0.62), vec3(0.75, 0.92, 1.0), streak * 0.8) + vec3(0.9) * (1.0 - edge) * 0.35;   // foam at the sides
    float crack = smoothstep(0.96, 1.0, abs(sin(v * 3.1 + u * 7.0)) * abs(sin(v * 1.3 - u * 11.0 + 1.7)));
    vec3 glass = mix(vec3(0.62, 0.8, 0.95), vec3(0.95, 0.98, 1.0), crack + (1.0 - edge) * 0.6);
    vec3 col = mix(flowing, glass, uSolid);
    gl_FragColor = vec4(col, mix(0.62, 0.9, uSolid) * (0.55 + 0.45 * edge));
  }`,
});
// a strip through points, `w` wide, its uv.y in metres along it (sideways: horizontal, square to the flow)
function ribbon(pts, w) {
  const pos = [], uv = [], idx = [], side = new V3(), t = new V3();
  let len = 0;
  pts.forEach((p, i) => {
    t.subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]).normalize();
    side.crossVectors(UPV, t); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize().multiplyScalar(w / 2);
    if (i) len += p.distanceTo(pts[i - 1]);
    pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
    uv.push(0, len, 1, len);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.Mesh(g, waterMat); m.frustumCulled = false; m.renderOrder = 1; scene.add(m);
  return m;
}
// a walkable stretch of falling water along f(t) (t 0..1): visual ribbon + a floor of short segments, solid only while stopped
function waterPath(f, n, w = 1.8) {
  const pts = Array.from({ length: n * 3 + 1 }, (_, i) => f(i / (n * 3)));
  ribbon(pts.map(p => p.clone().add(new V3(0, 0.03, 0))), w);
  for (let i = 0; i < n; i++) {
    const a = f(i / n), b = f((i + 1) / n), m = a.clone().lerp(b, 0.5), len = Math.hypot(b.x - a.x, b.z - a.z);
    const c = addCol({ x: m.x, z: m.z, y: Math.max(a.y, b.y) - Math.abs(a.y - b.y) / 2, rect: [len / 2 + 0.14, w / 2 - 0.08, Math.atan2(b.z - a.z, b.x - a.x)], thick: 0.3, depth: 0.3, surface: 'water', gone: true, ground: false });
    instante.water.push({ c, p: m });
  }
}

// ---- the current: rocks pouring across the route into little black holes; its own clock runs when you are near
const sinkMat = new THREE.MeshBasicMaterial({ color: '#000000' });
const ringMat = new THREE.MeshBasicMaterial({ color: '#b48cff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const STREAM = { x0: 100, x1: 121, z: -6, half: 11, top: 2.5 };
function lane(x, dir, speed, phase) {
  const L = 2 * STREAM.half, rocks = [];
  for (let k = 0; k < 3; k++) {
    const mesh = new THREE.Mesh(rockMass(1.1, shapeH(0.5), P_SLAB(0.9), 12, islandColor(palette(rand(0.3, 0.6)))), worldMat);
    mesh.castShadow = true; scene.add(mesh);
    const c = addCol({ x, z: STREAM.z, y: STREAM.top, r: 1.1, thick: 0.9, depth: 0.9, surface: 'stone', mover: { delta: new V3(), motion: { type: 'instante' } } });
    rocks.push({ mesh, c, off: phase + k * L / 3, prev: new V3(NaN), spin: rand(-0.4, 0.4) });
  }
  // the end it pours into: a small horizon with a ring of light; the end it comes from: a tear of light
  const sink = new THREE.Group(), z1 = STREAM.z + dir * (STREAM.half + 0.8);
  sink.add(new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 16), sinkMat));
  const r1 = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.9, 40), ringMat); r1.rotation.x = -Math.PI / 2 + 0.3; sink.add(r1);
  sink.position.set(x, STREAM.top - 0.4, z1); scene.add(sink);
  const tear = makeHalo(3.2, '#c8a6ff'); tear.position.set(x, STREAM.top - 0.3, STREAM.z - dir * (STREAM.half + 0.6)); scene.add(tear);
  instante.lanes.push({ x, dir, speed, rocks, sink, ring: r1, tear });
}
function placeLanes(dt) {
  const L = 2 * STREAM.half;
  for (const ln of instante.lanes) {
    ln.ring.rotation.z += dt * (instante.stopping ? 0 : 2) * ln.dir;
    ln.tear.quaternion.copy(camera.quaternion);
    for (const r of ln.rocks) {
      const s = ((((r.off + instante.stream * ln.speed) % L) + L) % L) - STREAM.half;   // -half..half, downstream
      const z = STREAM.z + ln.dir * s, edge = smoothstep(Math.abs(s), STREAM.half - 1.6, STREAM.half - 0.2);
      const fresh = s < -STREAM.half + 1.6;                    // just out of the tear
      const sc = 1 - (fresh ? smoothstep(-s, STREAM.half - 1.6, STREAM.half - 0.2) : edge);
      _w.set(ln.x, STREAM.top, z);
      r.mesh.position.copy(_w); r.mesh.position.y -= (1 - sc) * 1.2;
      r.mesh.scale.setScalar(Math.max(sc, 0.01)); r.mesh.rotation.y = s * r.spin;
      const c = r.c, wrapped = !Number.isNaN(r.prev.x) && Math.abs(_w.z - r.prev.z) > 3;
      if (Number.isNaN(r.prev.x) || wrapped) c.mover.delta.set(0, 0, 0); else c.mover.delta.subVectors(_w, r.prev);
      r.prev.copy(_w);
      c.x = _w.x; c.y = _w.y; c.z = _w.z; c.gone = sc < 0.85; c.ground = !c.gone;   // shrinking into the hole (or not out of the tear yet): no floor
    }
  }
}

// ---- stopped pocket watches: the lore. Each one shows the moment; touching it tells what it remembers.
const LORE = [
  ['11h47', 'O relógio parou às 11h47, o instante em que a casca do farol começou a girar ao contrário.'],
  ['A água', 'Do outro lado a névoa se partiu uma vez. Aqui ela está se partindo, sem parar, para sempre.'],
  ['A corrente', 'Tudo o que caiu corre para o buraco, menos o que alguém ainda lembra. Os ponteiros apontam para o farol.'],
];
const goldMat = new THREE.MeshStandardMaterial({ color: '#e8c27a', metalness: 0.9, roughness: 0.25, emissive: '#5a3a10', emissiveIntensity: 0.4 });
const faceMat = new THREE.MeshBasicMaterial({ color: '#f6efe0' }), handMat = new THREE.MeshBasicMaterial({ color: '#2a2230' });
function watch(x, y, z, i) {
  const g = new THREE.Group(), face = new THREE.Group();
  face.add(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 32), goldMat), new THREE.Mesh(new THREE.CircleGeometry(0.33, 32), faceMat));
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, t = new THREE.Mesh(new THREE.BoxGeometry(0.02, k % 3 ? 0.04 : 0.08, 0.01), handMat); t.position.set(Math.sin(a) * 0.27, Math.cos(a) * 0.27, 0.01); t.rotation.z = -a; face.add(t); }
  const hour = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.01).translate(0, 0.07, 0), handMat), min = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.24, 0.01).translate(0, 0.11, 0), handMat);
  const sec = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.26, 0.01).translate(0, 0.11, 0), new THREE.MeshBasicMaterial({ color: '#b04040' }));
  hour.position.z = min.position.z = sec.position.z = 0.02;
  hour.rotation.z = -(11 + 47 / 60) / 12 * TAU; min.rotation.z = -47 / 60 * TAU;
  face.add(hour, min, sec, new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 12).translate(0, 0.43, 0), goldMat));
  face.rotation.set(-0.25, rand(0, TAU), 0.15);
  const halo = makeHalo(1.6, '#ffe2b0');
  g.add(face, halo); g.position.set(x, y, z); scene.add(g);
  instante.clocks.push({ g, face, sec, halo, i, base: y, got: false, anim: 0 });
}

// ---------------------------------------------------------------- the level
const waterA = t => new V3(lerp(83.4, 96.3, t), lerp(4.5, 2.5, t), -6 + Math.sin(t * Math.PI) * 2.5);   // the waterfall's path
export function buildInstante() {
  reseed(7777);
  // I · O Instante: the bridge to II, blown into planks
  const I0 = checkpoint(0, 0, 0, 0, 7, 0.1, -4, 0);
  addTree(-3.5, 0, -3.8, I0.pal, 1, true); addLantern(5.5, 0, -2.2, I0.pal); addBoulder(2, 0, 4.2, I0.pal);
  addPickup(3.2, 1.1, 4.4);
  for (let i = 0; i < 10; i++) {
    const x = 7.5 + i * 1.18;
    plank(x, 0, 0, 0.57, 1.1, new V3(x + rand(-1, 4), rand(-1, 5.5), rand(-7, 7)), 0.72);
  }
  addPickup(14.6, 1.25, 0.8);                                  // over the middle of the bridge

  // II · A Ilha Partida: the stair up to III, rocks that fell a long way and stopped
  const I1 = checkpoint(1, 24, 0, 0, 5.5, 0.25, 20.3, 0);
  addTree(26, 0, 3, I1.pal, 1, true); addTree(27.5, 0, -2.8, I1.pal, 1, true);
  watch(25.6, 1.3, -3.4, 0);
  const steps = [[31, 1.6, 0.5], [33.4, 3.2, 2], [35.8, 4.8, 0.5], [38.2, 6.4, -1]];
  for (const [x, y, z] of steps) slab(x, y, z, 1.0, 0.8, palette(0.2), new V3(x + rand(-1, 1), y - rand(11, 16), z + rand(-1, 1)), { tau: 0.85, drift: 0.02 });
  addPickup(35.8, 6.95, 0.5);                                  // over the third step: jump for it

  // III · O Jardim Suspenso: the ferry, a rock still falling towards the hole
  const I2 = checkpoint(2, 46, 7.6, 0, 6, 0.4, 41.6, 0);     // one easy step (+1.2) above the last stone
  addTree(48, 7.6, 3.3, I2.pal, 1, true); addTree(49.5, 7.6, -3, I2.pal, 1, true); addLantern(50.8, 7.6, 3.4, I2.pal);
  slab(46, 7.3, -8.9, 1.1, 1, palette(0.4), new V3(47, -6, -12), { tau: 0.9, drift: 0.015 });   // a stray rock, with a fragment
  addPickup(46, 8.35, -8.9);
  slab(53.9, 7.3, 0, 1.8, 1.2, palette(0.45), new V3(66.8, 4.6, -4.8), { tau: 0, drift: 0.09, arc: 3, ride: true });
  addPickup(60.3, 9.7, -2.5);                                  // along the ride

  // IV · A Cachoeira Parada: a lake torn up into the sky pours its waterfall across the gap; stopped, it is a path
  const I3 = checkpoint(3, 77, 4.5, -6, 7, 0.55, 71.6, -5.2);
  addTree(74, 4.5, -11, I3.pal, 1, true); addTree(79, 4.5, -1, I3.pal, 1, true);
  airborne(new THREE.Matrix4(), () => chunk(78, 23, -17, 5, palette(0.5), {}, 0.7));
  const lake = new THREE.Mesh(new THREE.CircleGeometry(4.3, 32).rotateX(-Math.PI / 2), waterMat); lake.position.set(78, 23.05, -17); scene.add(lake);
  ribbon([new V3(81.6, 23, -14.2), new V3(83, 21, -12.6), new V3(84.2, 16, -10.4), new V3(84.4, 10, -8.2), new V3(84, 6.2, -6.6), new V3(83.6, 4.62, -6)], 2.2);
  waterPath(waterA, 22);
  addPickup(...waterA(0.3).add(new V3(0, 1.05, 0)).toArray());
  // a side branch of the falls to a lone islet with the second watch
  waterPath(t => new V3(lerp(89.85, 90.7, t), 3.5, lerp(-3.4, 2.7, t) + Math.sin(t * Math.PI) * 0.8), 9, 1.5);
  chunk(90.8, 3.5, 4.5, 1.9, palette(0.5), {}, 1, 0.3);
  watch(90.8, 4.6, 4.6, 1);

  // V · A Corrente: three lanes of rocks pouring into the hole, across the way to the lighthouse
  const I4 = checkpoint(4, 101.2, 2.5, -6, 5.5, 0.6, 97.8, -6);
  addTree(103, 2.5, -9.5, I4.pal, 1, true); addLantern(104.5, 2.5, -2.4, I4.pal);
  lane(109.1, 1, 2.0, 0); lane(112, -1, 2.6, 4.3); lane(114.9, 1, 2.2, 9.1);
  addPickup(112, 3.6, -6);                                     // over the middle lane
  chunk(117.8, 2.5, -14.6, 1.5, palette(0.6), {}, 1, 0.3);     // a ledge upstream of the last lane: the third watch
  watch(117.8, 3.6, -14.6, 2);

  // VI · O Farol Parado: its stones blown outwards; the crystal and its shell of little black holes hang above, dark
  const I5 = checkpoint(5, 125.2, 2.5, -6, 7, 0.75, 120.2, -6);
  addTree(122, 2.5, -11.5, I5.pal, 1, true); addTree(130.5, 2.5, -1.2, I5.pal, 1, true);
  const F = new V3(127.6, 2.5, -6.5), stone = palette(0.8).stone;
  pushGeo(bake(new THREE.CylinderGeometry(1.9, 2.1, 0.24, 14), (c, n, o) => o.copy(stone).multiplyScalar(0.8).offsetHSL(0, 0, rand(-0.03, 0.03))), F.x, F.y + 0.02, F.z);   // its foundation
  addCol({ x: F.x, z: F.z, y: F.y + 2.2, r: 1.75, thick: 2.2, ground: false, depth: 0 });
  for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 6; k++) {
    const a = k / 6 * TAU + ring * 0.5, r = 1.35 - ring * 0.18, home = new V3(F.x + Math.cos(a) * r, F.y + 0.26 + (ring + 1) * 0.7, F.z + Math.sin(a) * r);
    const geo = bake(jitter(new THREE.BoxGeometry(0.95, 0.7, 0.55), 0.04).translate(0, -0.35, 0), (c, n, o) => o.copy(stone).offsetHSL(0, 0, rand(-0.06, 0.03)));
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    instante.tower.push(piece('block', new THREE.Mesh(geo, plankMat), home, home.clone().addScaledVector(out, rand(4, 9)).add(new V3(0, rand(2, 7), 0)), { tau: 0.9, drift: 0.004, spin: rand(2, 5), arc: 1, yaw: -a + Math.PI / 2 }));
  }
  summit.pos.set(F.x, F.y + 4.2, F.z); summit.reached = false;

  scenery();
  const mesh = new THREE.Mesh(mergeGeometries(worldGeos), worldMat); worldGeos.length = 0;
  mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
  buildVegetation();
  rain();
  placeHole(instante.exit, 12);
  for (const p of instante.pieces) place(p);
  placeLanes(0);
  buildGrid();
  return { compatibleVersions: [] };
}

// the frozen explosion all around: chunks, trees, stones and lanterns hanging where the pull left them,
// streaming towards the hole, and a few bolts of lightning that never finished striking
const routeZ = x => (x > 62 ? -6 : 0);
function scenery() {
  const toHole = p => _v.copy(instante.exit).sub(p).normalize();
  for (let k = 0, made = 0; k < 500 && made < 56; k++) {
    const x = rand(-60, 170), z = rand(-90, 90), y = rand(-40, 45);
    if (Math.abs(z - routeZ(x)) < 16 && y > -16 && y < 28 && x > -14 && x < 140) continue;   // keep the route clear
    made++;
    const R = rand(1.2, 5), pal = palette(rand(0, 0.9)), m = tiltAt(x, y, z, rand(-0.9, 0.9), rand(-0.9, 0.9));
    airborne(m, () => {
      const c = chunk(x, y, z, R, pal, {}, rand(0.6, 1.1));
      if (R > 2.5) { grassDisc(x, y, z, R, c.h, R * R * 2, pal); if (rnd() < 0.6) addTree(x + rand(-R, R) * 0.4, y, z + rand(-R, R) * 0.4, pal, 1, true); }
      else if (rnd() < 0.4) addBoulder(x, y, z, pal);
    });
  }
  for (let k = 0; k < 18; k++) {                               // uprooted trees, alone in the air
    const x = rand(-30, 150), z = routeZ(x) + pick([-1, 1]) * rand(15, 40), y = rand(-6, 24);
    airborne(tiltAt(x, y, z, rand(-1.4, 1.4), rand(-1.4, 1.4)), () => addTree(x, y, z, palette(rand(0, 0.8)), 1, true));
  }
  for (let k = 0; k < 120; k++) {                              // small stones and clods, streaking in towards the hole
    const p = new V3(rand(-40, 160), rand(-25, 35), rand(-70, 70));
    if (Math.abs(p.z - routeZ(p.x)) < 11 && p.y > -8 && p.y < 18) continue;
    const r = rand(0.2, 0.8), d = toHole(p);
    pushGeo(bake(jitter(new THREE.IcosahedronGeometry(r, 0), r * 0.2).scale(1, 1, 1 + rand(0, 1.5)).applyQuaternion(_q.setFromUnitVectors(new V3(0, 0, 1), d)),
      (c, n, o) => o.copy(pick([palette(0.2).rock, palette(0.1).grass, palette(0.3).dirt])).offsetHSL(0, 0, rand(-0.05, 0.05))), p.x, p.y, p.z);
  }
  for (let k = 0; k < 10; k++) {                               // far-off islands caught in the same instant
    const a = rand(0, TAU), d = rand(150, 280), R0 = rand(8, 18), x = 60 + Math.cos(a) * d, z = Math.sin(a) * d, y = rand(-50, 60);
    airborne(tiltAt(x, y, z, rand(-0.6, 0.6), rand(-0.6, 0.6)), () => pushGeo(rockMass(R0, shapeH(), P_ISLAND(R0), 18, islandColor(palette(rand(0, 1)))), x, y, z));
  }
  const bolt = new THREE.MeshBasicMaterial({ color: '#f2eaff', toneMapped: false });
  for (let k = 0; k < 5; k++) {                                 // lightning, stopped halfway down
    let p = new V3(rand(-20, 150), rand(38, 50), pick([-1, 1]) * rand(30, 60));
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const q = p.clone().add(new V3(rand(-2.5, 2.5), -rand(2.5, 4.5), rand(-2.5, 2.5)));
      const d = q.clone().sub(p), len = d.length();
      parts.push(new THREE.CylinderGeometry(0.08, 0.12, len, 4).translate(0, len / 2, 0).applyQuaternion(_q.setFromUnitVectors(UPV, d.normalize())).translate(p.x, p.y, p.z));
      p = q;
    }
    const m = new THREE.Mesh(mergeGeometries(parts), bolt); scene.add(m);
    const h = makeHalo(26, '#c9b4ff'); h.position.copy(p); scene.add(h); bolts.push(h);
  }
}
const bolts = [];

// rain that stopped falling: drops everywhere along the way; near you they fall again
const DROPS = 900, drops = [];
let dropMesh = null;
function rain() {
  dropMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.018, 0.2, 2, 4), new THREE.MeshStandardMaterial({ color: '#cfe6ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.7 }), DROPS);
  for (let i = 0; i < DROPS; i++) {
    const x = rand(-10, 134), p = new V3(x, rand(-3, 16), routeZ(x) + rand(-12, 10));
    drops.push({ base: p.clone(), y: p.y + rand(0, 2.5) });
    dropMesh.setMatrixAt(i, _m.makeTranslation(p.x, drops[i].y, p.z));
  }
  dropMesh.frustumCulled = false; scene.add(dropMesh);
}

// ---------------------------------------------------------------- time
const _pos = new V3();
function poseOf(p, out) {   // where a piece is at its τ (home at 0, away at 1, arcing up a little on the way)
  const e = p.tau;
  out.lerpVectors(p.home, p.away, e); out.y += Math.sin(e * Math.PI) * p.arc;
  _q.setFromAxisAngle(UPV, p.yaw);
  if (p.spin) _q.premultiply(new THREE.Quaternion().setFromAxisAngle(p.axis, p.spin * e));
  return out;
}
function place(p) {
  poseOf(p, _pos);
  p.mesh.position.copy(_pos); p.mesh.quaternion.copy(_q);
  if (!p.c) return;
  const c = p.c, d = c.mover.delta;
  if (Number.isNaN(p.prev.x)) d.set(0, 0, 0); else d.subVectors(_pos, p.prev);
  p.prev.copy(_pos);
  c.x = _pos.x; c.y = _pos.y; c.z = _pos.z;
  c.gone = p.kind === 'plank' && p.tau > 0.1; c.ground = !c.gone;   // a plank is only a floor when it is (nearly) home
}
const nearYou = (p, c) => Math.min(p.mesh.position.distanceTo(c), p.home.distanceTo(c)) < instante.radius + p.r * 0.5;
const nearWater = c => instante.water.some(w => w.p.distanceTo(c) < 3.2);
const nearStream = c => c.x > STREAM.x0 - 2 && c.x < STREAM.x1 + 1 && Math.abs(c.z - STREAM.z) < 14 && Math.abs(c.y - STREAM.top) < 8;

// Pieces first (before the player moves, so a moving rock carries you).
export function updatePieces(dt) {
  const c = _v.set(player.pos.x, player.pos.y + 0.8, player.pos.z), end = instante.end, play = game.state === 'play' && !end;
  instante.stopping = play && player.cp >= STOP_FROM && (held('attack') || instante.mouseStop);
  instante.rewinding = play && !instante.stopping && held('interact');
  const still = instante.stopping;
  for (const p of instante.pieces) {
    const before = p.tau;
    if (end) p.tau = Math.max(0, p.tau - dt * 0.35);          // the lighthouse is lit: everything goes home
    else if (play && !still && nearYou(p, c)) {
      const run = p.ride && !instante.rewinding ? (player.grounded && player.ground === p.c ? p.drift : 0) : p.drift;
      p.tau = clamp(p.tau + (instante.rewinding ? -REWIND : run) * dt, 0, 1);
      if (instante.rewinding && p.tau < before && Math.random() < dt * 8) sparks.emit(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0, 0.3, 0, 0.6, 0.05, TIME_BLUE, 0.9);
    }
    place(p);
  }
  // the falls: they flow while time runs near them (backwards when rewinding); stopped, they are a floor
  const wet = nearWater(c);
  if (play && wet && !still) instante.flow += dt * (instante.rewinding ? -1.6 : 1);
  waterMat.uniforms.uFlow.value = instante.flow;
  waterMat.uniforms.uSolid.value = damp(waterMat.uniforms.uSolid.value, still ? 1 : 0, 14, dt);
  for (const w of instante.water) { w.c.gone = !still; w.c.ground = still; }
  // the current: its own clock, forwards near you, backwards when rewinding, not at all when stopped
  if (play && !still && nearStream(c)) instante.stream += dt * (instante.rewinding ? -1.6 : 1);
  placeLanes(dt);
  // the rain near you falls again (not while stopped)
  let moved = false;
  if (!still) for (let i = 0; i < DROPS; i++) {
    const d = drops[i];
    if (Math.abs(d.base.x - c.x) > instante.radius + 2 || Math.abs(d.base.z - c.z) > instante.radius + 2) continue;
    if (d.base.distanceTo(c) > instante.radius + 1.5) continue;
    d.y += (instante.rewinding ? 5 : -7) * dt;
    if (d.y < d.base.y - 3) d.y += 5.5; else if (d.y > d.base.y + 2.5) d.y -= 5.5;
    dropMesh.setMatrixAt(i, _m.makeTranslation(d.base.x, d.y, d.base.z)); moved = true;
  }
  if (moved) dropMesh.instanceMatrix.needsUpdate = true;
  // the watches: their second hand moves only near you (backwards when rewinding); touching one keeps it
  for (const w of instante.clocks) {
    if (w.got) { if (w.g.visible) { w.anim += dt * 2.5; w.g.scale.setScalar(Math.max(0, 1 - w.anim)); w.g.position.y += dt * 1.5; if (w.anim >= 1) w.g.visible = false; } continue; }
    const near = w.g.position.distanceTo(c) < instante.radius;
    if (near && play && !still) w.sec.rotation.z -= dt * (instante.rewinding ? -6 : 1) * TAU / 60;
    w.g.position.y = w.base; w.halo.quaternion.copy(camera.quaternion);
    if (play && w.g.position.distanceTo(c) < 1.2) collectWatch(w);
  }
}
function collectWatch(w) {
  w.got = true;
  if (!save.echoes.includes(w.i)) { save.echoes.push(w.i); persist(); }
  const p = w.g.position;
  burst(p.x, p.y, p.z, 30, 2.4, WARM);
  tone([523.25, 392, 329.63, 261.63], { dur: 2.4, vol: 0.05, attack: 0.05, gap: 0.22, at: p });   // a little falling chime
  const n = instante.clocks.filter(k => k.got).length;
  toast(`Relógio parado · ${LORE[w.i][0]}`, LORE[w.i][1], n === 3 ? 'TODOS OS RELÓGIOS' : `MEMÓRIA ${n} / 3`);
}

// ---------------------------------------------------------------- per frame: the bubble, the lighthouse, the end
const shellMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uCol: { value: WARM.clone() }, uK: { value: 0.5 }, uT: { value: 0 } },
  vertexShader: `varying vec3 vN, vV, vP; void main(){ vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uCol; uniform float uK, uT; varying vec3 vN, vV, vP;
    void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); float rip = 0.6 + 0.4 * sin(vP.y * 3.0 - uT * 4.0);
      gl_FragColor = vec4(uCol * f * rip * 0.35 * uK, 1.0); }`,
});
const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), shellMat);
let tick = 0, wasStopping = false;

export const welcome = ms => setTimeout(() => toast('O Instante', 'Do outro lado, o mundo parou no momento em que foi arrancado. Só perto de você o tempo ainda anda.', 'OUTRO LADO'), ms);
let hum = false;
export function startHum() { if (!hum && cineReady('hole')) { hum = true; playCine('hole', { loop: true, vol: 0.3, fadeIn: 4 }); } }
// a run (new or loaded): everything back where the pull stopped it, the watches already found kept
export function applyInstanteRun() {
  for (const p of instante.pieces) { p.tau = p.tau0; p.prev.set(NaN, NaN, NaN); place(p); }
  for (const w of instante.clocks) { w.got = save.echoes.includes(w.i); w.g.visible = !w.got; w.g.scale.setScalar(1); w.anim = 0; }
  instante.stream = 0; instante.flow = 0;
  for (const ln of instante.lanes) for (const r of ln.rocks) r.prev.set(NaN, NaN, NaN);
  instante.end = null; instante.thawed = false; summit.reached = false; instante.taught = save.cp >= STOP_FROM;
}

const towerHome = () => instante.tower.reduce((s, p) => s + (1 - p.tau / p.tau0), 0) / instante.tower.length;
const keyOf = a => (pad.active ? { interact: 'B', attack: 'X' }[a] : keyName(settings.binds[a]));
const HINTS = [
  ['A ponte partida', a => `Segure ${a.r} para rebobinar o tempo: as tábuas voltam a ser ponte. O tempo continua andando perto de você, então atravesse antes que elas se soltem de novo.`],
  ['As pedras que caíram', a => `Pare na borda e segure ${a.r} até as pedras subirem em escada. Continue segurando enquanto sobe: elas tornam a cair devagar.`],
  ['A pedra que ainda cai', a => 'A pedra à frente ainda está caindo em direção ao buraco. Suba nela e deixe o tempo andar: ela leva você. Se passar do ponto, rebobine.'],
  ['Parar o tempo', a => `Nova habilidade: segure ${a.s} e tudo à sua volta para. O que está parado é sólido: segure ${a.s} para andar sobre a cachoeira.`],
  ['A corrente', a => `As pedras correm para dentro do buraco. Pule de uma para a outra, segure ${a.s} para congelá-las no lugar, ou ${a.r} para fazê-las voltar.`],
  ['O farol parado', a => `Fique junto à torre e segure ${a.r}: as pedras do farol voltam ao lugar e a luz retorna.`],
];
export function instanteGoal() {
  const cp = player.cp, keys = { r: keyOf('interact'), s: keyOf('attack') };
  const next = ['Rebobine a ponte partida e atravesse', 'Traga as pedras caídas de volta e suba', 'Deixe o tempo andar: a pedra que cai leva você',
    'Pare o tempo e atravesse a cachoeira', 'Atravesse a corrente de pedras', 'Rebobine o farol'][cp] ?? '';
  const [title, text] = HINTS[cp] ?? HINTS[0];
  const near = player.grounded && player.ground?.island === undefined;   // on a piece, the water or a rock: mid-challenge
  const watches = instante.clocks.filter(k => k.got).length;
  return { title: 'Devolva o farol ao seu instante', next, light: `Fragmentos · ${player.collected} / ${pickups.length}  ·  Relógios · ${watches} / 3`,
    hint: { title, text: text(keys) }, near };
}
// the prompt under the character: { act, text } for what can be done right here
export function instantePrompt() {
  if (game.state !== 'play' || instante.end) return null;
  const c = _v.set(player.pos.x, player.pos.y + 0.8, player.pos.z);
  if (player.cp >= STOP_FROM && !instante.stopping) {
    const w = instante.water.find(w => w.p.distanceTo(c) < 3.2);
    if (w) return { act: 'attack', at: { x: w.p.x, y: w.p.y + 1.2, z: w.p.z }, text: 'parar o tempo (segure)' };
    if (nearStream(c)) return { act: 'attack', at: { x: c.x, y: c.y + 1.4, z: c.z }, text: 'parar o tempo (segure)' };
  }
  const piece = !instante.rewinding && instante.pieces.find(p => p.tau > 0.03 && !p.ride && nearYou(p, c));
  if (piece) { const q = piece.mesh.position; return { act: 'interact', at: { x: q.x, y: q.y + piece.r * 0.5 + 1, z: q.z }, text: 'rebobinar o tempo (segure)' }; }
  return null;
}

export function updateInstante(dt) {
  const k = (instante.clock += dt), g = grade.uniforms;
  // the stopped sky: a frozen sunset, no sea of cloud
  seas.forEach(s => { s.material.uniforms.uA.value = 0; });
  U.density.value = scene.fog.density = -0.011;               // a light haze, no low mist: the far debris stays readable
  bloom.strength = 0.45;
  instante.holeAge += dt;
  updateHole(instante.holeAge, FROZEN_T);                     // its disk does not turn
  if (game.state === 'play') startHum();
  for (const b of bolts) b.quaternion.copy(camera.quaternion);
  if (!instante.taught && player.cp >= STOP_FROM) {            // the second power
    instante.taught = true;
    toast('Nova habilidade · parar o tempo', `Segure ${keyOf('attack')} e tudo à sua volta para. O que está parado é sólido.`, 'HABILIDADE');
    tone([392, 587.33, 783.99, 1174.66], { dur: 2.6, vol: 0.05, attack: 0.2, gap: 0.12 });
  }
  // stopping: a low thud in, a soft release out, and a ring of light where you stand
  if (instante.stopping !== wasStopping) {
    wasStopping = instante.stopping;
    tone(instante.stopping ? [130.81, 196] : [196, 261.63], { dur: 0.6, vol: 0.05, attack: 0.01, gap: 0.04, slide: instante.stopping ? -0.15 : 0.15 });
    if (instante.stopping) burst(player.pos.x, player.pos.y + 0.8, player.pos.z, 16, 3, STILL);
  }
  // the bubble: colour inside, grey outside (grade pass), a faint shell round you
  instante.radius = instante.end ? BUBBLE + smoothstep(instante.end.t, 1, 6) * 400 : BUBBLE;
  if (!shell.parent) scene.add(shell);
  shell.position.set(player.pos.x, player.pos.y + 0.8, player.pos.z); shell.scale.setScalar(instante.radius);
  shellMat.uniforms.uT.value = instante.stopping ? shellMat.uniforms.uT.value : k;
  shellMat.uniforms.uCol.value.lerp(instante.stopping ? STILL : instante.rewinding ? TIME_BLUE : WARM, 1 - Math.exp(-8 * dt));
  const want = instante.stopping ? 2.2 : instante.rewinding ? 1.6 : 0.6;
  shellMat.uniforms.uK.value = damp(shellMat.uniforms.uK.value, want, 6, dt) * (instante.end ? 1 - smoothstep(instante.end.t, 1, 3) : 1);
  _v.set(player.pos.x, player.pos.y + 0.8, player.pos.z);
  const dist = _v.distanceTo(camera.position), ndc = _v.clone().project(camera);
  // the colour disc is a little tighter than the reach of time, so its rim reads as a rim, not the whole screen
  const r = 0.72 * instante.radius / (Math.max(dist, 0.5) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / 2;
  g.uBubble.value.set((ndc.x + 1) / 2, (ndc.y + 1) / 2, dist < instante.radius * 0.72 ? 10 : r, instante.gray);
  g.uAspect.value = camera.aspect;
  if (instante.rewinding && k - tick > 0.12) { tick = k; tone([1760 + Math.random() * 60], { dur: 0.05, vol: 0.02, attack: 0.002 }); }   // the clock, backwards
  if (instante.stopping && Math.random() < dt * 3) puff(player.pos.x + rand(-1, 1), player.pos.y + rand(0, 1.6), player.pos.z + rand(-1, 1), 1, 0.05, 0.12, 0.3, STILL, 0);   // dust hanging still
  // the lighthouse comes back as its stones do; complete, it lights and the instant ends
  const home = towerHome();
  game.restoration = instante.end ? Math.min(1, 0.85 + instante.end.t * 0.1) : home * 0.8;
  updateBeacon(k, dt, game.state === 'play');
  if (!instante.end && home > 0.985 && game.state === 'play') lightFarol();
  if (instante.end) updateEnd(dt);
}

function lightFarol() {
  instante.end = { t: 0 }; summit.reached = true;
  game.state = 'cutscene'; player.vel.set(0, 0, 0);
  const s = summit.pos;
  burst(s.x, s.y, s.z, 80, 5);
  burst(s.x, s.y, s.z, 40, 3, VIOLET);
  tone([261.63, 329.63, 392, 493.88, 587.33, 783.99], { dur: 5, vol: 0.05, attack: 0.3, gap: 0.14, at: s });
}
function updateEnd(dt) {
  const e = instante.end, g = grade.uniforms;
  e.t += dt;
  if (e.t > 2 && !e.thaw) { e.thaw = true; instante.thawed = true; }   // time starts again (main stops holding the clock)
  if (e.t > 0.6 && !e.bars) { e.bars = true; document.body.classList.add('cinema', 'bars'); }
  g.uFadeCol.value.set('#fff6e4').lerp(END_DARK, smoothstep(e.t, 8.5, 10));   // white-gold light, settling into night
  g.uFade.value = smoothstep(e.t, 6, 8.5);
  if (e.t > 9.8 && !e.done) { e.done = true; instante.onEnd?.(); }
}
const END_DARK = new THREE.Color('#150b26');
