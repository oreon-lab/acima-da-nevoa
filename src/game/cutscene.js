// The rift: stepping onto the last island, the black hole's interference freezes the world; the Dyson shell spins
// backwards, the hole tears open far below the first island and pulls everything in, slab by slab, the character last.
// Its hum plays from the first frame to the last.
// Transition: 0 controls + HUD gone · 0.6 glitch (synced to glith.mp3) · 1.05 everything freezes, in black and white · 2.1 colour returns
// (still frozen) · 2.8 the letterbox bars slide in · 3.9 the cutscene proper.
// Then: 9 the shell reverses, riser · 17.15 the riser's cut: black · 18.15 tension, the hole opens · then every cut lands on
// one of tension-scapes' hits (beat(n)): 28.8 close on a structure giving way · 34.15 it tears loose · 36.65 the pull
// spreads · 59.5 the character's island crumbles in from its edges · 70.15 their own slab goes, with them · 77 the
// camera follows them through the horizon into black, and crossing.js carries on from there without a cut.
import * as THREE from 'three';
import { scene, camera, renderer, U, game } from '../core.js';
import { V3, clamp, lerp, smoothstep, rand } from '../utils.js';
import { islands, summit, colR } from '../procedural/world.js';
import { bake } from '../procedural/geometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { worldMat, grassMat, PULL, SLAB_MOTION } from '../procedural/materials.js';
import { SKY, sun, hemi, seas } from '../render/atmosphere.js';
import { grade, bloom } from '../render/post.js';
import { dysonSpin, beam } from '../procedural/objects/beacon.js';
import { hole, placeHole, updateHole } from '../fx/blackhole.js';
import { puff, burst } from '../fx/particles.js';
import { audioMood, playCine, thunder, rockBreak, creak, debrisWhoosh, quakeBed } from './audio.js';
import { player, rig } from './player.js';
import { cineCam } from './camera.js';

const T_GLITCH = 0.6, GLITCH = 0.45, T_FREEZE = T_GLITCH + GLITCH, T_COLOR = 2.1, T_BARS = 2.8, T_MAIN = 3.9;
// measured: riser-cutcine.mp3 cuts dead 8.15 s in; tension-scapes.mp3 hits at these seconds and loops every 21.42 s
const T_REV = 9, T_CUT = T_REV + 8.15, T_HOLE = T_CUT + 1;
const HITS = [0.08, 5.41, 10.74, 16.08], LOOP = 21.42, TENSION_OFF = HITS[0];   // started TENSION_OFF in: its first hit = T_HOLE
export const beat = n => T_HOLE - TENSION_OFF + HITS[n % 4] + Math.floor(n / 4) * LOOP;   // the n-th cut, in seconds (dev: dbg.cutscene.beat)
const T_FOCUS = beat(2), T_TEAR = beat(3), T_FLY = T_TEAR + 2, T_PULL = T_TEAR + 2.5, SPAN = 30;
const T_PLAYER = T_PULL + SPAN + 3.5, T_END = beat(11), PLAYER_FLIGHT = T_END - T_PLAYER, CELL = 2.4;   // black on a hit
// The score after the hole opens, layered (all measured): tension-scapes from the hole to the tear, the drone under it
// all (its first swell 15.2 s in = the hole opening), buildup from the tear peaking (293.3 s in) as apocalypse comes in,
// and apocalypse's big entry (129.9 s in) = the moment the character is torn away.
const T_APO = beat(7), DRONE_OFF = 15.2, BUILD_OFF = 293.3 - (T_APO - T_TEAR), APO_OFF = 129.9 - (T_PLAYER - T_APO);
const KICKS = [0, 1, 2, 3, 4].map(beat).concat(T_APO, T_PLAYER);   // camera jolts: the audible tension hits, then the music's
export const cutscene = { on: false, done: false, t: 0, cs: null, onThrough: null };   // onThrough: the horizon is crossed
const cs = { pieces: [], focusPieces: [], slabs: new Map(), hideAtHole: [], seaA: [], stops: [], fired: new Set() };
const ease = x => x * x * (3 - 2 * x), VOID = new THREE.Color(0.12, 0.06, 0.2), GLOW = new THREE.Color('#8f5bff');
cutscene.cs = cs;   // for dev inspection
// glith.mp3: loudness every 50 ms from 0.65 s into the file (measured); the picture tears along with it
const GLITCH_OFF = 0.62, GLITCH_ENV = [0.04, 0.75, 1, 0.38, 0.07, 0.06, 0.24, 0.2, 0.02];
function glitchEnv(t) {
  const x = (t - T_GLITCH + GLITCH_OFF - 0.65) / 0.05, i = Math.floor(x);
  if (i < 0 || i >= GLITCH_ENV.length - 1) return 0;
  return lerp(GLITCH_ENV[i], GLITCH_ENV[i + 1], x - i);
}
const once = (key, at) => cutscene.t >= at && !cs.fired.has(key) && cs.fired.add(key);
// Every cue in this file goes through here, so a fast-forward (seekCutscene, dev) drops the cues it steps over
// instead of stacking a wall of sound: `cue` hands back the stop function playCine returns, or a no-op.
let mute = false;
const cue = (fn, ...a) => (mute ? () => {} : fn(...a));
const bed = () => (mute ? { level() {}, stop() {} } : quakeBed());

export function startCutscene() {
  Object.assign(cutscene, { on: true, done: false, t: 0 });
  cs.fired.clear();
  document.body.classList.add('cinema');                     // controls are already gone (state 'cutscene'); now the HUD
  cineCam.on = true; dysonSpin.hold = true; cs.spin = 0.1;
  cs.c0 = camera.position.clone(); cs.l0 = camera.position.clone().add(camera.getWorldDirection(new V3()).multiplyScalar(10));
  cs.P0 = player.pos.clone(); cs.S = summit.pos.clone();
  cs.u = new V3(cs.P0.x - cs.S.x, 0, cs.P0.z - cs.S.z); if (cs.u.lengthSq() < 0.01) cs.u.set(1, 0, 0); cs.u.normalize();
  cs.side = new V3(-cs.u.z, 0, cs.u.x);
  // the hole: far below the first island, on the side away from the rest of the world
  const mid = new V3(); for (const is of islands) mid.add(new V3(is.x, is.y, is.z)); mid.divideScalar(islands.length);
  const I0 = islands[0], away = new V3(I0.x - mid.x, 0, I0.z - mid.z).normalize();
  cs.H = new V3(I0.x, I0.y, I0.z).addScaledVector(away, 35).add(new V3(0, -70, 0));
  cs.mid = mid; cs.wOut = away.clone().negate(); cs.sideW = new V3(-cs.wOut.z, 0, cs.wOut.x);
  placeHole(cs.H, 22);
  let dMin = Infinity, dMax = 0;
  for (const is of islands) { const d = cs.H.distanceTo(new V3(is.x, is.y, is.z)); dMin = Math.min(dMin, d - is.R); dMax = Math.max(dMax, d + is.R); }
  cs.dMin = dMin; cs.dMax = dMax;
  PULL.uPull.value.set(cs.H.x, cs.H.y, cs.H.z, -1000); PULL.uPullP.value.set(dMin, dMax, SPAN, 0);
  cs.stops.push(cue(playCine, 'hole', { loop: true, vol: 1.1 }));  // its hum: from the first frame, without a break
}

// ------------------------------------------------------------ the pull
// The big merged world mesh and the vegetation are pulled in their vertex shader (materials.js); every other object,
// and each instance of the instanced props, is a piece moved here with the same maths. The world tears loose in slabs
// (SLAB across, SLAB_Y deep, layered down from each island's top): everything in a slab lets go at once and moves as
// one — ground, grass, trees — until it breaks up on the way in.
const SLAB = CELL * 3, SLAB_Y = CELL * 2;
const { LIFT, LIFT_H, HANG, TILT, SPIN } = SLAB_MOTION;
function preparePull() {
  // the character's own slab goes last, and takes them with it; the rest of their island is torn away round them first
  const ps = slabOf(new V3(cs.P0.x, cs.P0.y - 0.3, cs.P0.z));
  Object.assign(ps, { rel: T_PLAYER - T_PULL, flight: PLAYER_FLIGHT - HANG, down: false });
  cs.home = ps.isle;
  cs.player = { c: cs.P0.clone(), slab: ps, drift: new V3(0, 0.4, 0), axis: new V3(0.3, 0.2, 1).normalize(), spin: 2.2, q0: rig.quaternion.clone() };
  pickFocus();                                                // first: the pieces standing on the rim chunk go with it
  for (const o of [...scene.children]) {
    if (o.material === worldMat && o.geometry?.attributes.position.count > 100000) { chunkWorld(o); continue; }
    if (o.isInstancedMesh && o.material === grassMat) { chunkGrass(o); continue; }
    if (o === rig || o.userData.rift || o.isLight || o.isPoints || o.isLineSegments || o.type === 'Object3D') continue;
    const box = new THREE.Box3().setFromObject(o);
    if (box.isEmpty()) continue;
    const r = box.getSize(new V3()).length() / 2;
    if (r > 500) continue;                                    // sky and the sea of clouds: they stay (and fade)
    if (r > 150 || o === beam) { cs.hideAtHole.push(o); continue; }
    const centre = box.getCenter(new V3());
    if (o.isInstancedMesh) { instancePieces(o); continue; }
    if (o.children.length > 1 && r > 25 && centre.distanceTo(o.position) > 15) {   // a group spread over the world: its children
      for (const c of o.children) addObject(c, c.getWorldPosition(new V3()), o.position);
      continue;
    }
    addObject(o, o.position.clone(), null, box);
  }
  fillIslands();
  // each island's own breaking-up, when the release wave reaches it (the world mesh has no CPU pieces to listen to)
  cs.isles = islands.map((is, i) => { const c = new V3(is.x, is.y - 1, is.z);
    return { c, rel: i === cs.home ? T_CLOSE0 - T_PULL : clamp((c.distanceTo(cs.H) - is.R * 0.6 - cs.dMin) / (cs.dMax - cs.dMin), 0, 1) * SPAN }; });
}
// preparePull walks the scene and chunks the whole world: queued just after the frame that goes black is presented, it
// costs that black frame nothing (the screen stays black until T_HOLE anyway); run once, and never twice (a dev seek
// may have done it already).
const prepare = () => { if (cs.prepared) return; cs.prepared = true; preparePull(); };
const idle = fn => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 250 }) : setTimeout(fn, 0));
// The slab a point belongs to: { K: pivot, rel: when it lets go (s into the pull), flight (s), down: an underside
// slab, which drops out towards the hole rather than lifting, isle }. Off the islands a point is a slab of its own.
// The release wave runs outwards from the hole, so each island crumbles from beneath before its top gives way —
// except the character's island, which is torn away from its edges inwards, closing in on them (T_CLOSE0..1).
const T_CLOSE0 = beat(8) - 1.5, T_CLOSE1 = T_PLAYER - 0.8;
function slabOf(c) {
  let best = null, bd = 1.5, bi = -1;
  islands.forEach((is, i) => {
    const d = Math.hypot(c.x - is.x, c.z - is.z) / is.R;
    if (d < bd && c.y < is.y + 12 && c.y > is.y - is.depth - 3) { bd = d; best = is; bi = i; }
  });
  const ix = Math.floor(c.x / SLAB), iz = Math.floor(c.z / SLAB), layer = best ? Math.max(0, Math.floor((best.y - c.y) / SLAB_Y)) : 0;
  const key = best && `${bi}:${ix}:${iz}:${layer}`;
  if (key && cs.slabs.has(key)) return cs.slabs.get(key);
  const K = best ? new V3((ix + 0.5) * SLAB, best.y - (layer + 0.5) * SLAB_Y, (iz + 0.5) * SLAB) : c.clone(), d = K.distanceTo(cs.H);
  const rel = best && bi === cs.home
    ? T_CLOSE1 - T_PULL - (T_CLOSE1 - T_CLOSE0) * clamp(Math.hypot(K.x - cs.P0.x, K.z - cs.P0.z) / (best.R * 1.1), 0, 1) - (layer > 0 ? 1.5 : 0) + Math.random() * 0.8
    : clamp((d - cs.dMin) / (cs.dMax - cs.dMin), 0, 1) * SPAN + Math.random() * 1.6;
  const s = { K, rel, flight: 3.5 + d / 50, down: layer > 0, isle: bi };
  if (key) cs.slabs.set(key, s);
  return s;
}
const rnd3 = () => new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
// a separate object or instance: rides its slab (or the rim chunk), then drifts and tumbles on its own
function addPiece(pc) {
  Object.assign(pc, { slab: slabOf(pc.c), drift: rnd3(), axis: new V3(Math.random() - 0.5, 0.7, Math.random() - 0.5).normalize(), spin: 1.5 + Math.random() * 2 });
  (pc.c.distanceTo(cs.focus.c) < cs.focus.R ? cs.focusPieces : cs.pieces).push(pc);
}
function addObject(obj, c, parentPos = null, box = null) {
  if (obj.isInstancedMesh) return instancePieces(obj);
  const size = box ? clamp(box.getSize(new V3()).length() / 12, 0.15, 1) : 0.3;
  addPiece({ obj, c, parentPos, size, q0: obj.quaternion.clone(), s0: obj.scale.clone() });
}
function instancePieces(mesh) {
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    const p0 = new V3(), q0 = new THREE.Quaternion(), s0 = new V3();
    m.decompose(p0, q0, s0);
    addPiece({ mesh, i, c: p0.applyMatrix4(mesh.matrixWorld), q0, s0, size: 0.2 });
  }
}

// The structure the camera watches give way: a chunk of the first island's rim, on the side facing the hole.
// It is moved in the vertex shader (materials.js focusPos); here only its pivot, dust and the camera's target.
function pickFocus() {
  const I0 = islands[0], toH = new V3(cs.H.x - I0.x, 0, cs.H.z - I0.z).normalize();
  const c = new V3(I0.x, I0.y, I0.z).addScaledVector(toH, I0.R * 0.72);
  cs.focus = { c, base: c.clone(), height: 3, R: 3.8, toH, axis: new V3().crossVectors(new V3(0, 1, 0), toH).normalize() };
  PULL.uFocus.value.set(c.x, c.y, c.z, cs.focus.R);
}

// aChunk = the block's centre + its slab's flight (negative: an underside slab); aSlab = the slab's pivot + release
const chunkAttr = (c, s) => [c.x, c.y, c.z, s.down ? -s.flight : s.flight];
const slabAttr = s => [s.K.x, s.K.y, s.K.z, s.rel];
function chunkWorld(mesh) {   // each triangle belongs to the CELL-sized block its centre falls in
  const pos = mesh.geometry.attributes.position, n = pos.count, a = new Float32Array(n * 4), b = new Float32Array(n * 4), v = new V3();
  mesh.updateMatrixWorld();
  for (let i = 0; i + 2 < n; i += 3) {
    v.set((pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3).applyMatrix4(mesh.matrixWorld);
    v.set((Math.floor(v.x / CELL) + 0.5) * CELL, (Math.floor(v.y / CELL) + 0.5) * CELL, (Math.floor(v.z / CELL) + 0.5) * CELL);
    const s = slabOf(v), ca = chunkAttr(v, s), sa = slabAttr(s);
    for (let k = 0; k < 3; k++) { a.set(ca, (i + k) * 4); b.set(sa, (i + k) * 4); }
  }
  mesh.geometry.setAttribute('aChunk', new THREE.BufferAttribute(a, 4));
  mesh.geometry.setAttribute('aSlab', new THREE.BufferAttribute(b, 4));
}
// The world mesh is only a skin: fill each island's body with rock blocks on the same CELL grid, each tagged with
// its block and slab, so a slab that tears loose flies off solid instead of as a hollow shell. Back faces of the skin
// are drawn as dark rock too (materials.js), for the cells along the surface the blocks can't reach.
function fillIslands() {
  const geos = [], dark = new THREE.Color(), h = CELL / 2, c = new V3();
  const solid = (is, x, y, z) => { const t = is.y - y, dx = x - is.x, dz = z - is.z;
    return t > 0.3 && dx * dx + dz * dz < (colR(is.col, Math.atan2(dz, dx), t, t) - 0.15) ** 2; };
  for (const is of islands) {
    const r = is.R * 1.4, g = i => Math.floor(i / CELL);
    for (let x = g(is.x - r); x <= g(is.x + r); x++) for (let z = g(is.z - r); z <= g(is.z + r); z++)
      for (let y = g(is.y - is.depth); y <= g(is.y); y++) {
        const cx = (x + 0.5) * CELL, cy = (y + 0.5) * CELL, cz = (z + 0.5) * CELL;
        let ok = true;
        for (let k = 0; k < 8 && ok; k++) ok = solid(is, cx + (k & 1 ? h : -h), cy + (k & 2 ? h : -h), cz + (k & 4 ? h : -h));
        if (!ok) continue;
        dark.copy(is.pal.rock).multiplyScalar(rand(0.4, 0.6));
        const b = bake(new THREE.BoxGeometry(CELL, CELL, CELL), (c, n, col) => col.copy(dark)).translate(cx, cy, cz);
        const s = slabOf(c.set(cx, cy, cz)), ca = chunkAttr(c, s), sa = slabAttr(s), n = b.attributes.position.count;
        b.setAttribute('aChunk', new THREE.BufferAttribute(new Float32Array(n * 4).map((_, i) => ca[i % 4]), 4));
        b.setAttribute('aSlab', new THREE.BufferAttribute(new Float32Array(n * 4).map((_, i) => sa[i % 4]), 4));
        geos.push(b);
      }
  }
  if (geos.length) { const m = new THREE.Mesh(mergeGeometries(geos), worldMat); m.frustumCulled = false; scene.add(m); }
  worldMat.side = THREE.DoubleSide; worldMat.needsUpdate = true;
}
function chunkGrass(mesh) {   // each blade / flower is its own block, riding the slab under it
  const a = new Float32Array(mesh.count * 4), b = new Float32Array(mesh.count * 4), m = new THREE.Matrix4(), v = new V3();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(mesh.matrixWorld);
    const s = slabOf(v); a.set(chunkAttr(v, s), i * 4); b.set(slabAttr(s), i * 4);
  }
  mesh.geometry.setAttribute('aChunk', new THREE.InstancedBufferAttribute(a, 4));
  mesh.geometry.setAttribute('aSlab', new THREE.InstancedBufferAttribute(b, 4));
  mesh.frustumCulled = false;
}

// ---- the same motion as materials.js pullPos / focusPos, for whole pieces: position in `out`, rotation in _q
// (multiply by the piece's own), returns its scale (0 = gone)
const UP = new V3(0, 1, 0), fract = x => x - Math.floor(x);
const spinUp = a => (a < 1.5 ? a * a / 3 : a - 0.75);
const swirl = f => { const e = f * f; return e * (1.2 + 3 * e); };
const spiral = (p, f, out) => out.copy(p).sub(cs.H).applyAxisAngle(UP, -swirl(f)).multiplyScalar(1 - f * f).add(cs.H);
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _v = new V3(), _ax = new V3(), _off = new V3(), _dh = new V3();
function slabPose(pc, pt, out) {
  const sl = pc.slab, K = sl.K, H = cs.H, rel = sl.rel, a = pt - rel;
  if (a < 0) {   // straining: the slab shakes as one, its seams opening
    const s = (a + 2) / 2, hk = fract(rel * 7.31), j = 0.09 * s;
    out.set(Math.sin(pt * 57 + hk * 9) * j, Math.sin(pt * 61 + hk * 5) * j, Math.sin(pt * 53 + hk * 7) * j).add(pc.c).addScaledVector(_v.copy(pc.c).sub(K), -0.04 * s);
    _q.identity(); return 1;
  }
  const s = smoothstep(a, 0, LIFT), f = clamp((a - HANG) / sl.flight, 0, 1);
  (sl.down ? _v.copy(H).sub(K).normalize() : _v.copy(UP)).multiplyScalar(LIFT_H * s).add(K);
  spiral(_v, f, out);                                         // the slab: torn up, then drawn in
  _dh.set(H.x - K.x, 0, H.z - K.z); if (_dh.lengthSq() < 1e-6) _dh.set(1, 0, 0);
  _ax.crossVectors(UP, _dh.normalize()).add(_v.set(fract(rel * 13.1) - 0.5, fract(rel * 7.7) - 0.5, fract(rel * 3.3) - 0.5).multiplyScalar(0.6)).normalize();
  const rs = TILT * s + SPIN * (0.5 + fract(rel * 5.9)) * spinUp(Math.max(a - LIFT / 2, 0));
  const ac = Math.max(a - HANG - 0.25 * sl.flight, 0), dr = smoothstep(ac, 0, 2);
  _qa.setFromAxisAngle(UP, -swirl(f)).multiply(_q.setFromAxisAngle(_ax, rs));   // the slab's turn
  _off.copy(pc.c).sub(K).multiplyScalar(0.96 + 0.6 * dr).addScaledVector(pc.drift, 2.5 * dr).applyQuaternion(_qa);
  _dh.copy(H).sub(out).normalize();
  const st = smoothstep(f, 0.55, 1), along = _off.dot(_dh);
  _off.addScaledVector(_dh, -along).multiplyScalar(1 - 0.6 * st).addScaledVector(_dh, along * (1 + 1.6 * st));   // stretched towards the hole
  const k = 1 - smoothstep(f, 0.9, 1);
  out.addScaledVector(_off, k);
  _q.setFromAxisAngle(pc.axis, spinUp(ac) * pc.spin).premultiply(_qa);   // and once it breaks up, its own tumble
  return f >= 1 ? 0 : k;
}
// a piece standing on the rim chunk: tipped and lifted with it, then dragged in whole (without the shader's shudder)
function focusPose(pc, t, out) {
  const f = cs.focus, k = clamp((t - T_FOCUS) / (T_TEAR - T_FOCUS), 0, 1), ls = ease(clamp((t - T_TEAR) / (T_FLY - T_TEAR), 0, 1));
  const a = t - T_FLY, ff = clamp(a / 5, 0, 1), sc = a <= 0 ? 1 : 1 - smoothstep(ff, 0.85, 1);
  _q.setFromAxisAngle(f.axis, 0.18 * k ** 1.6 + 0.5 * ls + (a > 0 ? spinUp(a) * 0.9 : 0));   // tipped, then tumbling
  if (a > 0) _q.premultiply(_qa.setFromAxisAngle(UP, -swirl(ff)));
  _off.copy(pc.c).sub(f.c).applyQuaternion(_q);
  _v.copy(f.c); _v.y += 2.6 * ls;
  if (a <= 0) out.copy(_v); else spiral(_v, ff, out);
  out.addScaledVector(_off, sc);
  return ff >= 1 ? 0 : sc;
}
const _p = new V3(), _m = new THREE.Matrix4(), _s = new V3(), _qq = new THREE.Quaternion(), dirty = new Set();
function place(pc, sc) {
  if (pc.mesh) {
    _s.copy(pc.s0).multiplyScalar(Math.max(sc, 1e-4));
    _m.compose(_p, _qq, _s); pc.mesh.setMatrixAt(pc.i, _m); dirty.add(pc.mesh);
  } else {
    if (pc.parentPos) _p.sub(pc.parentPos);
    pc.obj.position.copy(_p); pc.obj.quaternion.copy(_qq); pc.obj.scale.copy(pc.s0).multiplyScalar(sc);
    if (sc === 0) pc.obj.visible = false;
  }
}
function updatePieces(t) {
  const pt = t - T_PULL;
  giveWay(t);
  if (t >= T_FOCUS) for (const pc of cs.focusPieces) {
    if (pc.gone) continue;
    const sc = focusPose(pc, t, _p);
    _qq.copy(_q).multiply(pc.q0); place(pc, sc);
    if (sc === 0) pc.gone = true;
  }
  let brk = null, brkD = 3600, wh = null;                    // the nearest piece letting go / flying past, this frame
  if (pt >= -2) for (const pc of cs.pieces) {
    if (pc.gone) continue;
    const a = pt - pc.slab.rel;
    if (a < -2) continue;                                     // not yet: its own animation keeps running
    const sc = slabPose(pc, pt, _p);
    if (a >= 0 && !pc.snd) { pc.snd = true; const d = pc.c.distanceToSquared(camera.position); if (d < brkD) { brkD = d; brk = pc; } }
    if (a > 0.3 && !pc.wh && _p.distanceToSquared(camera.position) < 64) { pc.wh = true; wh = { p: _p.clone(), size: pc.size }; }
    _qq.copy(_q).multiply(pc.q0);
    place(pc, sc);
    if (sc === 0) pc.gone = true;
  }
  for (const m of dirty) m.instanceMatrix.needsUpdate = true;
  dirty.clear();
  debrisSounds(t, pt, brk, wh);
}
// rate-limited, so hundreds of pieces letting go at once stay a crumble rather than a wall of noise
function debrisSounds(t, pt, brk, wh) {
  if (brk && t - (cs.brkT ?? 0) > 0.09) { cs.brkT = t; cue(rockBreak, brk.c, brk.size); }
  if (wh && t - (cs.whT ?? 0) > 0.3) { cs.whT = t; cue(debrisWhoosh, wh.p, wh.size); }
  for (const is of cs.isles ?? []) if (!is.snd && pt >= is.rel) { is.snd = true; cue(rockBreak, is.c, 1); cue(creak, is.c, 0.2); }
  if (t >= T_FOCUS) {                                         // the ground's roar: straining, then the whole world going
    cs.quake ??= (q => (cs.stops.push(q.stop), q))(bed());
    cs.quake.level(t < T_PULL ? 0.2 + 0.4 * smoothstep(t, T_FOCUS, T_TEAR) : 0.6 + 0.4 * smoothstep(t, T_PULL, T_PLAYER));
  }
  if (once('torn', T_PLAYER)) { cue(rockBreak, cs.P0, 0.9); cue(creak, cs.P0, 0.25); }
}

// The watched rim: strain builds, dust and grit pour from the crack, a burst when it rips out, then it is dragged off.
function giveWay(t) {
  const f = cs.focus;
  if (!f || t < T_FOCUS) return;
  const k = clamp((t - T_FOCUS) / (T_TEAR - T_FOCUS), 0, 1), l = clamp((t - T_TEAR) / (T_FLY - T_TEAR), 0, 1);
  PULL.uFocusP.value.set(k, l, t >= T_FLY ? t - T_FLY : -1, 0);
  f.dustT = (f.dustT ?? 0) + (t - (f.lastT ?? t)); f.lastT = t;
  if (f.dustT > 0.3 - 0.2 * k && t < T_FLY + 1) {             // along the crack: the arc where the chunk meets the island
    f.dustT = 0;
    const a = (Math.random() - 0.5) * 2.2, dir = f.toH.clone().negate().applyAxisAngle(new V3(0, 1, 0), a);
    const p = f.c.clone().addScaledVector(dir, f.R * 0.95);
    puff(p.x, p.y, p.z, 2 + Math.round(k * 5), 0.5 + k, 0.3 + 0.2 * k, 0.45);
    if (k > 0.3 && Math.random() < 0.45) cue(rockBreak, p, 0.08 + 0.12 * k);   // grit cracking off
    if (k > 0.5) burst(p.x, p.y + 0.2, p.z, 2, 1.2, GLOW);
  }
  if (t < T_TEAR && t - (f.creakT ?? 0) > 2.2 - 1.2 * k) { f.creakT = t; cue(creak, f.c, 0.1 + 0.15 * k); }   // it groans
  if (once('tear', T_TEAR)) { cue(rockBreak, f.c, 1); puff(f.c.x, f.c.y, f.c.z, 30, 3, 0.6, 0.6); burst(f.c.x, f.c.y + 0.5, f.c.z, 34, 3.5, GLOW); cue(thunder, 0); }
}
// where the rim chunk's pivot is (for the camera)
function focusNow(t) {
  const f = cs.focus, lifted = f.c.clone().add(new V3(0, 2.6 * ease(clamp((t - T_TEAR) / (T_FLY - T_TEAR), 0, 1)), 0));
  return t < T_FLY ? lifted : spiral(lifted, clamp((t - T_FLY) / 5, 0, 1), new V3());
}

// ------------------------------------------------------------ camera
// Every shot returns pos / look / fov, plus sh (impact shake) and roll (dutch tilt, radians). Hard cuts between shots;
// crash zooms and FOV punches on the beats (the reversal, the hole opening, the tear).
const shakeV = new V3(), hand = new V3();
const dolly = (fov0, d0, d) => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov0 / 2)) * d0 / d));
function shot(t) {
  const P0 = cs.P0, S = cs.S, u = cs.u, side = cs.side, H = cs.H, R = hole.R, I0 = islands[0], L = islands.at(-1);
  const at = (is, dy = 0) => new V3(is.x, is.y + dy, is.z);
  const E = (a, b) => ease(clamp((t - a) / (b - a), 0, 1)), up = y => new V3(0, y, 0);
  const c1 = cs.c0.clone().lerp(cs.l0, 0.15);
  let pos, look, fov = 55, sh = 0, roll = 0;
  if (t < T_FREEZE) {                                         // the glitch: the view jolts, broken
    pos = cs.c0.clone(); look = cs.l0; sh = t >= T_GLITCH ? 0.35 : 0; roll = t >= T_GLITCH ? (Math.random() - 0.5) * 0.08 : 0;
  } else if (t < T_MAIN) {                                    // time has stopped; only the camera creeps forward
    const k = E(T_FREEZE, T_MAIN);
    pos = cs.c0.clone().lerp(c1, k); look = cs.l0; fov = lerp(55, 46, k);
  } else if (t < 6.4) {                                       // a swoop down and round, low behind the character, up at the shell
    const k = E(T_MAIN, 6.4);
    pos = c1.clone().lerp(P0.clone().addScaledVector(u, 3).addScaledVector(side, 1.4).add(up(0.5)), k).add(up(Math.sin(k * Math.PI) * 3));
    look = cs.l0.clone().lerp(S, k); fov = lerp(46, 58, k); roll = -0.12 * Math.sin(k * Math.PI);
  } else if (t < T_REV) {                                     // circling the frozen shell, closer and lower
    const k = E(6.4, T_REV), a = Math.atan2(u.z, u.x) + 0.3 + k * 1.4, r = lerp(10, 6.5, k);
    pos = S.clone().add(new V3(Math.cos(a) * r, lerp(3.5, 0.6, k), Math.sin(a) * r)); look = S; fov = 44; roll = 0.05;
  } else if (t < 13) {                                        // it reverses: an FOV punch, worm's-eye from the character's feet
    const k = (t - T_REV) / 4;
    pos = P0.clone().addScaledVector(u, 2).addScaledVector(side, -1).add(up(0.4)).lerp(S, 0.1 * k);
    look = S.clone().add(up(1.2)); fov = lerp(78, 60, E(T_REV, T_REV + 0.6));
    sh = 0.05 + 0.15 * k + (t < T_REV + 0.3 ? 0.5 : 0); roll = 0.14 * k * Math.sin((t - T_REV) * 1.3);
  } else if (t < T_HOLE) {                                    // vertigo: rushing at the shell while the lens widens (then black)
    const k = E(13, T_CUT), d = lerp(24, 6.5, k), dir = u.clone().negate().addScaledVector(side, 0.45).normalize();
    pos = S.clone().addScaledVector(dir, d).add(up(lerp(4, 1.5, k))); look = S;
    fov = Math.min(dolly(28, 24, d), 95); sh = 0.1 + 0.35 * k; roll = 0.15 * k * Math.sin(t * 3);
  } else if (t < T_HOLE + 2.5) {                              // out of the black: a crash zoom onto the tear, far below
    const toH = new V3(H.x - L.x, 0, H.z - L.z).normalize(), k = E(T_HOLE, T_HOLE + 0.35);
    pos = at(L, 7).addScaledVector(toH, L.R * 0.9); look = H; fov = lerp(85, 30, k) - 4 * E(T_HOLE + 0.35, T_HOLE + 2.5);
    sh = 0.6 * (1 - (t - T_HOLE) / 2.5);
  } else if (t < beat(1)) {                              // right at it as it unfurls, sliding round its rim
    const k = E(T_HOLE + 2.5, beat(1)), dir = cs.wOut.clone().applyAxisAngle(new V3(0, 1, 0), -0.4 + 0.8 * k);
    pos = H.clone().addScaledVector(dir, R * lerp(4.4, 3.6, k)).add(up(R * 0.9)); look = H; fov = lerp(58, 70, k); sh = 0.35; roll = -0.12;
  } else if (t < T_FOCUS) {                                   // a crane up and back past the first island: how big it is
    const k = E(beat(1), T_FOCUS);
    pos = H.clone().addScaledVector(cs.wOut, R * 3).add(up(R * 0.5)).lerp(at(I0, 12).addScaledVector(cs.wOut, 30), k).add(up(Math.sin(k * Math.PI) * 25));
    look = H.clone().lerp(at(I0), 0.25 * k); fov = lerp(72, 50, k); sh = 0.15; roll = -0.12 * (1 - k);
  } else if (cs.focus && t < beat(4)) {                            // one structure giving way, then torn out
    const f = cs.focus, h = f.height, toH = f.toH, d = 9, cur = focusNow(t);
    if (t < T_TEAR - 2) {                                           // a slow push in, tilted, the hole glowing past it
      const k = E(T_FOCUS, T_TEAR - 2);
      pos = f.c.clone().addScaledVector(toH, -d * (1.3 - 0.45 * k)).addScaledVector(cs.sideW, d * 0.5).add(up(h * 0.5 + 1));
      look = f.c.clone().add(up(h * 0.45)).lerp(H, 0.04); fov = lerp(52, 42, k); sh = 0.05; roll = 0.1 * k;
    } else if (t < T_TEAR) {                                  // tight and low at its base: the ground cracking
      pos = f.base.clone().addScaledVector(cs.sideW, -d * 0.55).addScaledVector(toH, -d * 0.3).add(up(0.7));
      look = f.base.clone().add(up(h * 0.25)); fov = lerp(40, 34, E(T_TEAR - 2, T_TEAR)); sh = 0.12; roll = 0.06 * Math.sin(t * 1.7);
    } else {                                                  // it rips free: FOV punch, whip to follow it out over the void
      const k = E(T_TEAR, T_TEAR + 4.5);
      pos = f.c.clone().addScaledVector(cs.sideW, d * 1.3).addScaledVector(toH, d * 0.2).add(up(2 + 3 * k));
      look = f.c.clone().add(up(h * 0.5)).lerp(cur, 0.75 * E(T_TEAR, T_TEAR + 1.2));
      fov = lerp(75, 58, E(T_TEAR, T_TEAR + 0.5)) + 8 * k; sh = t < T_TEAR + 0.6 ? 0.5 : 0.14; roll = 0.2 * (1 - k);
    }
  } else if (t < beat(5)) {                                      // the first island comes apart: drifting in among the pieces
    const k = E(beat(4), beat(5));
    pos = at(I0, 5).addScaledVector(cs.sideW, lerp(22, 9, k)).addScaledVector(cs.wOut, 4 * k); look = at(I0).lerp(H, 0.3 + 0.2 * k);
    fov = 60; sh = 0.1; roll = 0.08;
  } else if (t < beat(6)) {                                        // carried along with the stream towards it, banking
    const I3 = islands[3], k = E(beat(5), beat(6)), p0 = at(I3, 5).addScaledVector(cs.sideW, 16);
    pos = p0.clone().lerp(H, 0.3 * k); look = H.clone().lerp(at(I3), 0.5 - 0.35 * k); fov = lerp(60, 74, k); sh = 0.1; roll = 0.18 * k;
  } else if (t < beat(7)) {                                        // wide and slow: the whole world draining into it
    const m = cs.mid.clone().lerp(H, 0.4), k = E(beat(6), beat(7)), a = Math.atan2(cs.sideW.z, cs.sideW.x) + 0.35 * k;
    pos = m.clone().add(new V3(Math.cos(a) * 190, 30 - 10 * k, Math.sin(a) * 190)); look = m; fov = 50; sh = 0.04;
  } else if (t < beat(8)) {                                        // from its rim, looking up as everything falls in, turning over
    const k = E(beat(7), beat(8)), dir = cs.wOut.clone().applyAxisAngle(new V3(0, 1, 0), 0.8 * k);
    pos = H.clone().addScaledVector(dir, R * 2.4).add(up(R * 1.8)); look = cs.mid; fov = 75; sh = 0.25; roll = 0.5 * k;
  } else if (t < beat(9)) {                                      // over the character's shoulder: their island crumbling in from its edges
    const k = E(beat(8), beat(9)), toH = new V3(H.x - P0.x, 0, H.z - P0.z).normalize(), perp = new V3(-toH.z, 0, toH.x);
    pos = P0.clone().addScaledVector(toH, lerp(-3.2, -2, k)).addScaledVector(perp, 0.9).add(up(2));
    look = P0.clone().addScaledVector(toH, 30).add(up(lerp(-4, -10, k)));   // out over the torn edge, then down after it
    fov = lerp(52, 40, k); sh = 0.12;
  } else if (t < T_PLAYER) {                                  // the ground tears away around them: circling in, low
    const k = E(beat(9), T_PLAYER), a = Math.atan2(u.z, u.x) + (t - beat(9)) * 0.7;
    pos = P0.clone().add(new V3(Math.cos(a) * lerp(5, 2.8, k), lerp(1.4, 0.7, k), Math.sin(a) * lerp(5, 2.8, k)));
    look = P0.clone().add(up(1)); fov = lerp(55, 45, k); sh = 0.2; roll = 0.1 * Math.sin(t * 1.1);
  } else {                                                    // chase: the character is the last thing to go, spinning in
    const pp = rig.position.clone().add(up(0.6)), dh = H.clone().sub(pp).normalize(), k = clamp((t - T_PLAYER) / PLAYER_FLIGHT, 0, 1);
    pos = pp.clone().addScaledVector(dh, -7 + 3 * k).add(up(2.5 - k));
    if (cs.chase) pos = cs.chase.lerp(pos, 0.15);
    cs.chase = pos.clone();
    pos.lerp(pp, 0.85 * smoothstep(t, T_END - 1.3, T_END));   // and in after them, through the horizon
    look = pp; fov = lerp(60, 100, k * k); sh = 0.15 + 0.4 * k; roll = 1.4 * k * k;
  }
  return { pos, look, fov, sh, roll };
}
function applyCamera(t) {
  let { pos, look, fov, sh, roll } = shot(t);
  const still = t >= T_FREEZE && t < T_MAIN ? 0 : 1;         // no shake at all while everything is locked
  if (t >= T_HOLE && t < T_END) {                            // each hit: a jolt and a lens punch
    const last = KICKS.findLast(k => k <= t) ?? -Infinity, kick = Math.exp(-(t - last) * 6);
    sh += 0.4 * kick; fov += 4 * kick;
  }
  shakeV.set(Math.sin(t * 37) + Math.sin(t * 23.1), Math.sin(t * 31.7) + Math.sin(t * 19.3), Math.sin(t * 41.3) + Math.sin(t * 17.9)).multiplyScalar(still * sh * 0.5);
  hand.set(Math.sin(t * 1.3) + Math.sin(t * 0.71), Math.sin(t * 1.1 + 2) + Math.sin(t * 0.53), Math.sin(t * 0.9 + 4)).multiplyScalar(still * 0.05);   // handheld drift
  camera.position.copy(pos).add(shakeV).add(hand);
  camera.lookAt(look);
  camera.rotateZ(roll + still * 0.012 * Math.sin(t * 0.8));
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ------------------------------------------------------------ per frame (after the atmosphere, before rendering)
const ndc = new V3(), fwd = new V3(), toHole = new V3();
export function updateCutscene(dt) {
  if (!cutscene.on) return;
  const t = (cutscene.t += dt);
  // the freeze: instant, right after the glitch; the world starts again when the hole opens
  const frozen = t >= T_FREEZE && t < T_HOLE;
  game.timeScale = frozen ? 0 : 1;
  audioMood.muffle = t < T_FREEZE ? 0 : t < T_HOLE ? 1 : 0.7;
  // the shell: locked with everything else, then it whips round the other way, burning brighter
  cs.spin = t < T_FREEZE ? 0.1 : t < T_REV ? 0 : -9 * ease(clamp((t - T_REV) / 2.5, 0, 1));
  dysonSpin.angle += dt * cs.spin;
  dysonSpin.flare = t > T_REV ? smoothstep(t, T_REV, T_CUT) * 1.2 : 0;
  // glitch → black and white → colour, the bars, and later the riser's cut to black
  const g = grade.uniforms;
  g.uGT.value = t;
  g.uGlitch.value = t >= T_GLITCH && t < T_FREEZE ? (0.3 + 0.7 * glitchEnv(t)) * (Math.random() < 0.8 ? 1 : 0.25) : 0;
  if (once('glitch', T_GLITCH)) cs.stops.push(cue(playCine, 'glitch', { offset: GLITCH_OFF, vol: 1.2 }));
  g.uGray.value = t < T_FREEZE ? 0 : t < T_COLOR ? 1 : Math.max(0, 1 - (t - T_COLOR) / 0.45);
  g.uFadeCol.value.setRGB(0, 0, 0);
  g.uFade.value = t >= T_CUT && t < T_HOLE ? 1 : smoothstep(t, T_END - 0.8, T_END);   // inside the horizon: black
  if (once('bars', T_BARS)) document.body.classList.add('bars');
  if (once('riser', T_REV)) cs.stops.push(cue(playCine, 'riser'));
  if (once('buildup', T_TEAR)) cs.buildup = cue(playCine, 'buildup', { offset: BUILD_OFF, vol: 0.8, fadeIn: 1.5 });
  if (once('tension-out', T_TEAR + 2)) cs.tension(6);         // the buildup takes over
  if (once('apocalypse', T_APO)) cs.stops.push(cue(playCine, 'apocalypse', { offset: APO_OFF, fadeIn: 1 }));
  if (once('buildup-out', T_APO + 0.5)) cs.buildup(2.5);
  if (once('prepare', T_CUT + 0.05)) idle(prepare);          // heavy, so it happens off the frame that goes black
  if (once('hole', T_HOLE)) {
    cs.tension = cue(playCine, 'tension', { loop: true, offset: TENSION_OFF });
    cs.stops.push(cue(playCine, 'drone', { offset: DRONE_OFF, vol: 0.9 }));
    cue(thunder, 0);
    for (const o of cs.hideAtHole) o.visible = false;
    scene.traverse(o => { o.castShadow = false; });           // shadows would stay where the pieces were
    cs.seaA = seas.map(s => s.material.uniforms.uA.value);
  }
  // the sky darkens the instant everything freezes and stays darker; when the hole opens it goes the rest of the way
  const dk = smoothstep(t, T_HOLE, T_HOLE + 4), sk = Math.max(0.85 * smoothstep(t, T_FREEZE, T_FREEZE + 0.12), dk);
  if (sk > 0) {
    SKY.uSkyTint.value.lerp(VOID, sk * 0.88); scene.fog.color.copy(SKY.uSkyTint.value);
    sun.intensity *= 1 - 0.8 * sk; hemi.intensity *= 1 - 0.35 * sk;
    renderer.toneMappingExposure *= 1 - 0.3 * sk;
  }
  if (dk > 0) {   // violet, lit from below by the disk; the mist clears so it can be seen from anywhere
    hemi.groundColor.lerp(GLOW, dk * 0.9); hemi.color.lerp(GLOW, dk * 0.25);
    U.density.value = scene.fog.density = -lerp(U.density.value, 0.0035, dk);
    seas.forEach((s, i) => { s.material.uniforms.uA.value = cs.seaA[i] * (1 - dk); });
  }
  updateHole(t - T_HOLE, t);
  if (t >= T_HOLE) bloom.strength = 0.18;                    // a soft bloom, so the horizon stays black
  // the pull: the world quakes while the structure gives way, then the pieces go
  PULL.uPull.value.w = t >= T_FOCUS ? t - T_PULL : -1000;
  PULL.uPullP.value.w = 0.1 * smoothstep(t, T_FOCUS, T_TEAR);
  updatePieces(t);
  pullPlayer(t);
  applyCamera(t);
  // lensing around the horizon, where it is on screen
  const inFront = camera.getWorldDirection(fwd).dot(toHole.copy(cs.H).sub(camera.position)) > 0;
  ndc.copy(cs.H).project(camera);
  g.uLens.value = inFront && hole.k > 0 ? hole.k * 0.55 : 0;
  g.uAspect.value = camera.aspect;
  g.uHole.value.set((ndc.x + 1) / 2, (ndc.y + 1) / 2, hole.R / (cs.H.distanceTo(camera.position) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / 2);
  // the end: inside the horizon. The score lets go, and the crossing takes over from this very frame.
  if (once('through', T_END)) {
    for (const stop of cs.stops) stop(1.5);
    audioMood.fade = 0; audioMood.muffle = 0; g.uLens.value = 0;
    cutscene.on = false;
    cutscene.onThrough?.();
  }
}

const _pp = new V3();
function pullPlayer(t) {   // they ride their slab up, are thrown off it as it breaks, and spin in last
  const pc = cs.player;
  if (!pc) return;
  const pt = t - T_PULL, a = pt - pc.slab.rel;
  if (a < -2) return;
  if (!pc.off && a >= HANG + 0.25 * pc.slab.flight) { pc.off = true; player.grounded = false; player.jumpAnim = true; }   // arms up: the falling pose
  const sc = slabPose(pc, pt, _pp);
  rig.position.copy(_pp); rig.quaternion.copy(_q).multiply(pc.q0); rig.scale.setScalar(Math.max(sc, 1e-4));
}

// ------------------------------------------------------------ dev: skip to a moment (dbg.cutscene.seek)
// Steps the timeline up to `n` in one go — plain 60 Hz frames, no rendering, cues off — so everything that accumulates
// (the shell's angle, the darkened sky, the pieces already let go, the camera's drift) lands where it would have after
// playing. Forward only: the pull mutates the world for good, so it cannot be rewound — reload to start over.
export function seekCutscene(n) {
  if (!cutscene.on) startCutscene();
  if (n <= cutscene.t) { console.warn(`cutscene: já está em ${cutscene.t.toFixed(1)}s (pedido: ${n.toFixed(1)}s)`); return cutscene.t; }
  mute = true;
  try {
    if (n >= T_CUT + 0.05) { cs.fired.add('prepare'); prepare(); }   // time-independent, and not on the clock
    const STEP = 1 / 60;
    while (cutscene.on && cutscene.t < n - STEP) updateCutscene(STEP);   // past the horizon the crossing takes over
    if (cutscene.on) updateCutscene(n - cutscene.t);
  } finally { mute = false; }
  return cutscene.t;
}
