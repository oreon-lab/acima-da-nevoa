// Toolkit for the trailer clips: easing, camera paths, and the character as a puppet (see trailer.js).
import * as THREE from 'three';
import { camera, U, game } from '../core.js';
import { V3, clamp, lerp, smoothstep } from '../utils.js';
import { player, syncRig, puppet } from './player.js';
import { groundUnder, near, inside } from '../procedural/world.js';

// ------------------------------------------------------------ easing
export const ease = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
export const easeOut = x => 1 - (1 - clamp(x, 0, 1)) ** 3;
export const easeIn = x => clamp(x, 0, 1) ** 3;
export const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);   // 0..1 progress of u inside [a, b]
export const v3 = a => (a.isVector3 ? a : new V3(a[0], a[1], a[2]));

// Catmull-Rom through keys [[t, [x, y, z] | number], ...] (times ascending); clamps outside. Smooth in position and speed.
export function track(keys) {
  const vec = typeof keys[0][1] !== 'number';
  const P = keys.map(k => (vec ? v3(k[1]) : k[1])), T = keys.map(k => k[0]), out = vec ? new V3() : 0;
  const hermite = (p0, p1, m0, m1, s) => {
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
  };
  const tan = (i, c) => {   // finite-difference tangent (per second) of component c at key i
    const a = Math.max(i - 1, 0), b = Math.min(i + 1, P.length - 1);
    if (a === b) return 0;
    const pa = vec ? P[a].getComponent(c) : P[a], pb = vec ? P[b].getComponent(c) : P[b];
    return (pb - pa) / (T[b] - T[a]);
  };
  return u => {
    if (u <= T[0]) return vec ? out.copy(P[0]) : P[0];
    if (u >= T[T.length - 1]) return vec ? out.copy(P[P.length - 1]) : P[P.length - 1];
    let i = 0; while (u > T[i + 1]) i++;
    const h = T[i + 1] - T[i], s = (u - T[i]) / h;
    if (!vec) return hermite(P[i], P[i + 1], tan(i, 0) * h, tan(i + 1, 0) * h, s);
    for (let c = 0; c < 3; c++) out.setComponent(c, hermite(P[i].getComponent(c), P[i + 1].getComponent(c), tan(i, c) * h, tan(i + 1, c) * h, s));
    return out;
  };
}

// slow, never-repeating handheld drift (a few sines) so locked-off shots still breathe
export const drift = (t, amp = 0.05, seed = 0) => new V3(
  Math.sin(t * 0.71 + seed) + 0.5 * Math.sin(t * 1.93 + seed * 2.1),
  Math.sin(t * 0.83 + seed * 1.3) * 0.7 + 0.4 * Math.sin(t * 2.17 + seed),
  Math.sin(t * 0.57 + seed * 0.7) + 0.5 * Math.sin(t * 1.71 + seed * 1.7)).multiplyScalar(amp);

const _up = new V3(0, 1, 0), _m = new THREE.Matrix4(), _r = new THREE.Quaternion(), _z = new V3(0, 0, 1);
// the one place a clip touches the camera
export function setCamera(pos, look, fov = 45, roll = 0) {
  camera.position.copy(pos);
  _m.lookAt(pos, look, _up); camera.quaternion.setFromRotationMatrix(_m);
  if (roll) camera.quaternion.multiply(_r.setFromAxisAngle(_z, roll));
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ------------------------------------------------------------ the character as a puppet
// A path is a list of pieces evaluated by time: run / jump / glide / stand. The real animation mixer still plays
// (walk, jump, idle), driven by the velocity and grounded flags set here, so the character moves like in the game.
export const stand = (at, yaw, dur = 99) => ({ type: 'stand', at: v3(at).clone(), yaw, dur });
export const run = (to, speed = 5.4) => ({ type: 'run', to: v3(to).clone(), speed });
// air: seconds in the air; dwell: seconds standing on the landing (so crumbling stones feel the step)
export const jump = (to, air = 0.75, apex = 1.6, dwell = 0.05) => ({ type: 'jump', to: v3(to).clone(), dur: air + dwell, air, apex });
// a glide through waypoints (the last is where it ends), `dur` seconds in the air
export const glide = (pts, dur) => { const a = pts.map(p => v3(p).clone()); return { type: 'glide', via: a, to: a[a.length - 1], dur, air: dur }; };
export const wait = dur => ({ type: 'wait', dur });
const _a = new V3(), _b = new V3(), _c = new V3();

export class Puppet {
  constructor(start, yaw = 0) { this.pieces = []; this.start = v3(start).clone(); this.yaw0 = yaw; }
  add(...p) { this.pieces.push(...p); return this; }
  // total length in seconds
  get length() {
    let pos = this.start, t = 0;
    for (const p of this.pieces) { t += p.type === 'run' ? pos.distanceTo(p.to) / p.speed : p.dur; if (p.to) pos = p.to; else if (p.at) pos = p.at; }
    return t;
  }
  // sample the path at local time u: { pos, vel, grounded, yaw, jumping, gliding, piece, k }
  at(u) {
    let pos = this.start.clone(), yaw = this.yaw0, t = u;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i], last = i === this.pieces.length - 1;
      const dur = p.type === 'run' ? pos.distanceTo(p.to) / p.speed : p.dur;
      const from = pos.clone();
      if (t <= dur || last) {
        const out = { pos: new V3(), vel: new V3(), grounded: true, yaw, jumping: false, gliding: false, piece: p.type, k: 0 };
        if (p.type === 'run') {
          const k = out.k = dur > 0 ? clamp(t / dur, 0, 1) : 1;
          out.pos.lerpVectors(from, p.to, k);
          out.vel.copy(p.to).sub(from).setY(0).setLength(k < 1 ? p.speed : 0);
          if (from.distanceToSquared(p.to) > 1e-6) out.yaw = Math.atan2(p.to.x - from.x, p.to.z - from.z);
        } else if (p.type === 'jump') {
          const k = out.k = clamp(t / p.air, 0, 1), flat = _a.copy(p.to).sub(from).setY(0);
          out.pos.lerpVectors(from, p.to, k);
          out.pos.y = lerp(from.y, p.to.y, k) + 4 * p.apex * k * (1 - k);
          out.vel.copy(flat).divideScalar(p.air);
          out.jumping = k < 1;
          out.grounded = !out.jumping;
          out.vel.y = out.jumping ? (p.to.y - from.y) / p.air + 4 * p.apex * (1 - 2 * k) / p.air : 0;
          if (!out.jumping) out.vel.set(0, 0, 0);
          if (flat.lengthSq() > 1e-6) out.yaw = Math.atan2(flat.x, flat.z);
        } else if (p.type === 'glide') {
          const k = out.k = clamp(t / p.dur, 0, 1), pts = [from, ...p.via], n = pts.length - 1;
          const f = k * n, j = Math.min(Math.floor(f), n - 1), s = f - j;   // Catmull-Rom through the waypoints
          const p0 = pts[Math.max(j - 1, 0)], p1 = pts[j], p2 = pts[j + 1], p3 = pts[Math.min(j + 2, n)];
          const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s * s + (-a + 3 * b - 3 * c + d) * s * s * s);
          out.pos.set(cr(p0.x, p1.x, p2.x, p3.x), cr(p0.y, p1.y, p2.y, p3.y), cr(p0.z, p1.z, p2.z, p3.z));
          const e = 0.02, k2 = Math.min(k + e, 1), f2 = k2 * n, j2 = Math.min(Math.floor(f2), n - 1), s2 = f2 - j2;
          const q0 = pts[Math.max(j2 - 1, 0)], q1 = pts[j2], q2 = pts[j2 + 1], q3 = pts[Math.min(j2 + 2, n)];
          const cr2 = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * s2 + (2 * a - 5 * b + 4 * c - d) * s2 * s2 + (-a + 3 * b - 3 * c + d) * s2 * s2 * s2);
          _c.set(cr2(q0.x, q1.x, q2.x, q3.x), cr2(q0.y, q1.y, q2.y, q3.y), cr2(q0.z, q1.z, q2.z, q3.z));
          const dtk = (k2 - k) * p.dur || 1;
          out.vel.copy(_c).sub(out.pos).divideScalar(dtk);
          out.gliding = k < 1; out.grounded = k >= 1;
          if (out.vel.x * out.vel.x + out.vel.z * out.vel.z > 1e-6) out.yaw = Math.atan2(out.vel.x, out.vel.z);
        } else if (p.type === 'stand') {
          out.pos.copy(p.at); out.yaw = p.yaw;
        } else out.pos.copy(from);
        return out;
      }
      t -= dur;
      if (p.type === 'stand') { pos = p.at.clone(); yaw = p.yaw; }
      else if (p.type !== 'wait') {
        const ref = p.type === 'glide' && p.via.length > 1 ? p.via[p.via.length - 2] : from;
        pos = p.to.clone(); _b.copy(p.to).sub(ref);
        if (_b.x * _b.x + _b.z * _b.z > 1e-6) yaw = Math.atan2(_b.x, _b.z);
      }
    }
    return { pos, vel: new V3(), grounded: true, yaw, jumping: false, gliding: false, piece: 'end', k: 1 };
  }
}

export const trailerSound = { emit() {} };
let prevJump = false, prevGlide = false, yawS = 0, started = false, lastVy = 0, stride = 0;
export const resetDrive = () => { prevJump = prevGlide = false; started = false; lastVy = 0; stride = 0; };
// put a sampled state into the player and let the rig catch up (squash, lean) like updatePlayer does
export function drive(s, dt) {
  const p = player.pos, v = player.vel;
  p.copy(s.pos); v.copy(s.vel); player.grounded = s.grounded; player.gliding = s.gliding;
  const air = s.jumping || s.gliding;
  if (air && !prevJump && !prevGlide) { puppet.jump(); if (started) trailerSound.emit('cloth'); }
  if (s.gliding && !prevGlide) trailerSound.emit('wind');
  if (!air && (prevJump || prevGlide)) { puppet.land(clamp(-lastVy, 3, 9)); trailerSound.emit('land'); }
  prevJump = s.jumping; prevGlide = s.gliding; lastVy = s.vel.y;
  if (!started) { yawS = s.yaw; started = true; }
  yawS += Math.atan2(Math.sin(s.yaw - yawS), Math.cos(s.yaw - yawS)) * (1 - Math.exp(-14 * dt));
  player.yaw = yawS;
  const sp = Math.hypot(v.x, v.z);
  if (s.grounded && sp > 0.8) {
    stride += sp * dt;
    if (stride >= 1.35) { stride %= 1.35; trailerSound.emit('step'); }
  }
  player.tilt += ((s.gliding ? 0.32 : s.grounded ? sp / 5.4 * 0.12 : clamp(-v.y * 0.01, -0.1, 0.12)) - player.tilt) * (1 - Math.exp(-8 * dt));
  const sqT = s.gliding ? -0.1 : s.grounded ? 0 : clamp(v.y * 0.012, -0.08, 0.12);
  player.sqV += (-(player.sq - sqT) * 240 - player.sqV * 13) * dt;
  player.sq = clamp(player.sq + player.sqV * dt, -0.45, 0.45);
  U.player.value.copy(p);
  syncRig();
}

// Sample a puppet at local time u and drive the player with it. While grounded the feet snap to whatever is really
// underneath (bobbing stones, carriers), and a crumbling stone is told it was stepped on, like updatePlayer does.
export function body(pup, u, dt) {
  const s = pup.at(u), p = s.pos;
  const k = s.jumping || s.gliding ? smoothstep(s.k, 0.9, 1) : 1;   // a landing eases onto the real ground; the air leaves it alone
  if (s.grounded || k > 0) {
    const g = groundUnder(p.x, p.z, p.y + 0.9);
    if (g > -Infinity && Math.abs(g - p.y) < 1.2) p.y = lerp(p.y, g, k);
  }
  if (s.grounded) for (const c of near(p.x, p.z)) if (c.ground && c.mover && Math.abs(c.y - p.y) < 0.4 && inside(c, p.x, p.z, 0.1)) c.stood = game.gameT;
  drive(s, dt);
  return s;
}

// stand the player on a spot without touching its heading (combat owns the yaw: attacks turn towards the target)
export function plant(pos, dt) {
  player.pos.copy(pos); player.vel.set(0, 0, 0); player.grounded = true; player.gliding = false;
  player.tilt -= player.tilt * (1 - Math.exp(-8 * dt));
  player.sqV += (-player.sq * 240 - player.sqV * 13) * dt;
  player.sq = clamp(player.sq + player.sqV * dt, -0.45, 0.45);
  U.player.value.copy(pos);
  syncRig();
}
