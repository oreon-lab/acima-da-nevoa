// The hopping head: movement, collisions, animation, checkpoints, collectibles, respawn.
import * as THREE from 'three';
import { scene, U, keys, game } from '../core.js';
import { S_CHAR, PR, PH, MAX_SPEED, JUMP_V, GRAV, dev } from '../config.js';
import { V3, clamp, damp, angDiff } from '../utils.js';
import { colliders, islands, pickups, summit, updrafts, ponds, colR, groundUnder } from '../procedural/world.js';
import { lightShrine } from '../procedural/objects/index.js';
import { puff, burst, SPARK_W } from '../fx/particles.js';
import { grade } from '../render/post.js';
import { tone, playSample, stepSound } from './audio.js';
import { setCount, flashCount, areaTitle, message } from './ui.js';
import { cam } from './camera.js';

export const player = {
  pos: new V3(), vel: new V3(), grounded: false, ground: null, lastGroundY: 0, coyote: 0, jumpBuf: 0,
  jumping: false, jumpAnim: false, yaw: 0, sq: 0, sqV: 0, tilt: 0, cp: 0, idleT: 0, collected: 0,
};

// rig: position -> facing -> lean -> squash & stretch -> model
const root = new THREE.Group(), yawG = new THREE.Group(), tiltG = new THREE.Group(), sqG = new THREE.Group();
root.add(yawG); yawG.add(tiltG); tiltG.add(sqG);
scene.add(root);
// contact shadow so the jump height always reads
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1b2430, transparent: true, opacity: 0.25, depthWrite: false, fog: false }));
scene.add(blob);

// ------------------------------------------------------------ character & animation
let mixer = null, curAnim = null, oneShot = null, lastWalkT = 0;
const actions = {};

function play(name, fade = 0.15, ts = 1, t0 = 0, force = false) {
  const a = actions[name]; if (!a) return;
  a.timeScale = ts;
  if (curAnim === name && !force) return;
  const prev = actions[curAnim];
  a.reset(); a.time = t0; a.play();
  if (prev && prev !== a) a.crossFadeFrom(prev, fade, false);
  curAnim = name;
}
// The fbx colours are near-black / dull grey, which the lighting can't shape, so they are remapped.
const LOOK = {
  Ninja_Main: { color: '#373c4b', roughness: 0.55 },
  Ninja_Secondary: { color: '#8a5530', roughness: 0.6 },
  Eye_Black: { color: '#0c0d12', roughness: 0.12 },
  Eye_White: { color: '#d5d8e0', roughness: 0.3, emissive: '#e8eaf0', emissiveIntensity: 0.14 },   // also the katana blades
  Gold: { color: '#c8801a', roughness: 0.35, metalness: 0.35 },
};
// warm rim light only on the side facing the sun, so the silhouette reads without a hazy halo
function rimify(mat) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      #if NUM_DIR_LIGHTS > 0
        float rim = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.5);
        outgoingLight += directionalLights[0].color * rim * smoothstep(-0.2, 0.7, dot(normal, directionalLights[0].direction)) * 0.16;
      #endif
      #include <opaque_fragment>`);
  };
  return mat;
}
export function attachCharacter(fbx) {
  fbx.scale.setScalar(S_CHAR);
  fbx.position.y = 20 * S_CHAR;
  fbx.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    const conv = m => rimify(new THREE.MeshStandardMaterial({ name: m.name, color: m.color, roughness: 0.6, ...LOOK[m.name] }));
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  sqG.add(fbx);
  mixer = new THREE.AnimationMixer(fbx);
  for (const clip of fbx.animations) actions[clip.name.split('|').pop()] = mixer.clipAction(clip);
  for (const n of ['Jump', 'Yes', 'No', 'HitRecieve', 'Death']) if (actions[n]) { actions[n].setLoop(THREE.LoopOnce); actions[n].clampWhenFinished = true; }
  mixer.addEventListener('finished', e => { if (oneShot && e.action === actions[oneShot]) oneShot = null; });
  play('Idle');
}

export function updateAnim(dt) {
  if (!mixer) return;
  const sp = Math.hypot(player.vel.x, player.vel.z);
  let want = 'Idle', ts = 1;
  if (!player.grounded) want = player.jumpAnim ? 'Jump' : 'Idle';
  else if (sp > 0.8) { want = 'Walk'; ts = 0.8 + sp / MAX_SPEED * 0.55; oneShot = null; player.idleT = 0; }
  else {
    player.idleT += dt;
    if (player.idleT > 9 && !oneShot) { oneShot = 'No'; player.idleT = 0; }   // idle fidget
    if (oneShot) want = oneShot;
  }
  play(want, 0.14, ts);
  if (curAnim === 'Walk') {   // the walk cycle is a hop: each landing kicks a little dust
    const t = actions.Walk.time;
    if (t < lastWalkT - 0.1) footstep();
    lastWalkT = t;
  }
  mixer.update(dt);
}

// ------------------------------------------------------------ spawn / respawn
export function spawnAt(i) {
  const cp = islands[i].cp;
  player.pos.set(cp.x, cp.y, cp.z); player.vel.set(0, 0, 0);
  player.grounded = true; player.ground = islands[i].col; player.lastGroundY = cp.y;
  player.yaw = Math.atan2(Math.cos(cp.heading), Math.sin(cp.heading));
  yawG.rotation.y = player.yaw;
  cam.yaw = Math.atan2(-Math.cos(cp.heading), -Math.sin(cp.heading));
  cam.pitch = 0.36;
  cam.follow.copy(player.pos);
  syncRig();
}

// quick fade into the mist and back
export const fade = { phase: 'in', t: 1 };
export function startRespawn() {
  if (fade.phase !== 'none') return;
  fade.phase = 'out'; fade.t = 0;
  playSample('return', { vol: 0.4, single: true });
}
export function updateFade(dt) {
  if (fade.phase === 'out') {
    fade.t += dt / 0.35;
    if (fade.t >= 1) { spawnAt(player.cp); player.sqV = 5; fade.phase = 'in'; fade.t = 1; }
  } else if (fade.phase === 'in') {
    fade.t -= dt / 0.6;
    if (fade.t <= 0) { fade.t = 0; fade.phase = 'none'; }
  }
  grade.uniforms.uFade.value = fade.t * fade.t * (3 - 2 * fade.t);
}

// ------------------------------------------------------------ events
// what is underfoot: pond water, a platform's own surface, otherwise grass on islands and stone elsewhere
const SURF = { grass: ['#a9c47a', 1], stone: ['#cfcac0', 1], sand: ['#d9c39a', 1.3], water: ['#e3f3f7', 1.7] };
const SC = Object.fromEntries(Object.entries(SURF).map(([k, [c, l]]) => [k, [new THREE.Color(c), l]]));
function surfaceAt(g) {
  const p = player.pos;
  for (const w of ponds) if (Math.hypot(p.x - w.x, p.z - w.z) < w.r && Math.abs(p.y - w.y) < 0.4) return 'water';
  return g?.surface || (g && g.island !== undefined ? 'grass' : 'stone');
}
function dust(n, spd, size, alpha) {   // dust / blades / droplets, tinted by the surface
  const [c, lift] = SC[player.surface || 'stone'], p = player.pos;
  puff(p.x, p.y, p.z, n, spd, size, alpha, c, lift);
}
function footstep() {
  const s = player.surface || 'stone';
  dust(s === 'water' ? 8 : s === 'sand' ? 5 : 4, s === 'water' ? 1.0 : 0.7, s === 'water' ? 0.2 : 0.24, s === 'water' ? 0.5 : 0.34);
  stepSound(s);
}

function onJump() {
  player.sqV += 3.2;
  player.jumpAnim = true;
  play('Jump', 0.08, 1.35, 0.12, true);
  dust(5, 1.2, 0.3, 0.3);
  if (!playSample('jump', { vol: 3, jitter: 0.06 })) tone([180], { dur: 0.12, vol: 0.05, slide: 1.8 });
}
function onLand(impact) {
  player.sqV -= Math.min(impact * 0.22, 4.5);
  player.jumpAnim = false;
  dust(Math.round(clamp(impact * 0.9, 3, 16)), 0.8 + impact * 0.12, 0.35 + impact * 0.02, 0.45);
  stepSound(player.surface, clamp(impact / 8, 0.7, 2));
  if (impact > 4) tone([95], { dur: 0.16, vol: Math.min(0.03 + impact * 0.008, 0.14), slide: 0.55 });
}
function activateCheckpoint(i) {
  player.cp = i;
  areaTitle(i, 'checkpoint');
  const c = lightShrine(i);
  burst(c.x, c.y, c.z, 26, 2.2);
  tone([392, 493.88, 587.33, 783.99], { dur: 2.6, vol: 0.05, attack: 0.25, gap: 0.12 });
  oneShot = 'Yes';
}
function collect(k) {
  k.got = true;
  setCount(++player.collected, pickups.length, true); flashCount();
  const p = k.g.position;
  burst(p.x, p.y, p.z, 22, 2.6);
  burst(p.x, p.y, p.z, 8, 1.2, SPARK_W);
  const base = [659.25, 783.99, 987.77, 1174.66][player.collected % 4];
  tone([base, base * 1.5], { dur: 1.1, vol: 0.06, gap: 0.09 });
}
function finale() {
  summit.reached = true;
  oneShot = 'Dance';
  message(`<b>acima da névoa</b><br>fragmentos de luz  ${player.collected} / ${pickups.length}`, 7000);
  flashCount(7000);
  burst(summit.pos.x, summit.pos.y, summit.pos.z, 60, 4);
  tone([261.63, 329.63, 392, 523.25, 659.25], { dur: 4, vol: 0.05, attack: 0.4, gap: 0.18 });
}

// ------------------------------------------------------------ physics
const probe = new V3();
// dev: free flight. WASD moves along the camera's heading (looking up or down does not tilt the flight path),
// Space rises, Shift descends; velocity eases in and out so it is easy to stop and to line up.
function fly(dt) {
  const p = player.pos, v = player.vel, sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  const ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const up = (keys.Space ? 1 : 0) - (keys.ShiftLeft || keys.ShiftRight ? 1 : 0);
  let tx = -sy * iz + cy * ix, tz = -cy * iz - sy * ix;
  const l = Math.hypot(tx, tz); if (l > 0) { tx /= l; tz /= l; }
  const S = dev.flySpeed;
  v.x = damp(v.x, tx * S, 7, dt); v.z = damp(v.z, tz * S, 7, dt); v.y = damp(v.y, up * S * 0.8, 7, dt);
  p.addScaledVector(v, dt);
  if (l > 0) player.yaw += angDiff(player.yaw, Math.atan2(tx, tz)) * (1 - Math.exp(-10 * dt));
  player.grounded = false; player.ground = null; player.sq = 0; player.sqV = 0;
  syncRig(); U.player.value.copy(p);
  probe.set(p.x, p.y + 0.55, p.z);
  for (const k of pickups) if (!k.got && k.g.position.distanceToSquared(probe) < 0.95) collect(k);
}
export function collectAll() { for (const k of pickups) if (!k.got) collect(k); }

export function updatePlayer(dt) {
  if (dev.fly) return fly(dt);
  const p = player.pos, v = player.vel;
  if (player.grounded && player.ground?.mover) p.add(player.ground.mover.delta);   // ride platforms

  const canMove = fade.phase !== 'out';
  const ix = canMove ? (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) : 0;
  const iz = canMove ? (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) : 0;
  let wx = 0, wz = 0;
  if (ix || iz) {   // camera-relative
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    wx = -sy * iz + cy * ix; wz = -cy * iz - sy * ix;
    const l = Math.hypot(wx, wz); wx *= MAX_SPEED * dev.speed / l; wz *= MAX_SPEED * dev.speed / l;
  }
  const acc = player.grounded ? (ix || iz ? 42 : 34) : (ix || iz ? 40 : 6);   // full steering in the air, and you can brake too
  const dx = wx - v.x, dz = wz - v.z, dl = Math.hypot(dx, dz), step = acc * dt;
  if (dl <= step) { v.x = wx; v.z = wz; } else { v.x += dx / dl * step; v.z += dz / dl * step; }

  // jump: coyote time + input buffer + variable height
  player.coyote = player.grounded ? 0.12 : player.coyote - dt;
  player.jumpBuf -= dt;
  if (player.jumpBuf > 0 && player.coyote > 0 && canMove) {
    v.y = JUMP_V * dev.jump; player.grounded = false; player.ground = null; player.coyote = 0; player.jumpBuf = 0; player.jumping = true;
    onJump();
  }
  if (player.jumping && v.y > 0 && !keys.Space) { v.y *= 0.5; player.jumping = false; }
  if (v.y <= 0) player.jumping = false;
  v.y = Math.max(v.y - (v.y > 0 ? GRAV : GRAV * 1.4) * dev.gravity * dt, -34);
  for (const u of updrafts) {   // wind vents lift you (and lift-off works even while standing on the vent stone)
    const ux = p.x - u.x, uz = p.z - u.z;
    if (ux * ux + uz * uz < u.r * u.r && p.y > u.y - 0.3 && p.y < u.y + u.h) { v.y = Math.min(v.y + 70 * dt, 7.5); player.jumping = false; }
  }

  // climbing: pushing into a `climb` wall carries you up; near the top you mantle onto it
  const prevClimb = player.climbing; player.climbing = null;
  if (prevClimb && p.y >= prevClimb.y - 0.45) {
    const cx = p.x - prevClimb.x, cz = p.z - prevClimb.z, k = prevClimb.r * 0.55 / (Math.hypot(cx, cz) || 1);
    p.x = prevClimb.x + cx * k; p.z = prevClimb.z + cz * k; p.y = prevClimb.y; v.y = 0; v.x *= 0.2; v.z *= 0.2;
  }

  // horizontal move + cylinder walls
  p.x += v.x * dt; p.z += v.z * dt;
  for (const c of colliders) {
    if (p.y >= c.y - 0.3 || p.y + PH <= c.y - c.thick) continue;
    const ddx = p.x - c.x, ddz = p.z - c.z, d2 = ddx * ddx + ddz * ddz, rm = c.rMax + PR;
    if (d2 > rm * rm) continue;
    const d = Math.sqrt(d2), rr = colR(c, Math.atan2(ddz, ddx)) + PR;
    if (d >= rr) continue;
    if (v.y > 0 && p.y + PH < c.y - c.thick + 0.35) { p.y = c.y - c.thick - PH; v.y = 0; player.jumping = false; continue; }  // head bump
    const nx = d > 1e-4 ? ddx / d : 1, nz = d > 1e-4 ? ddz / d : 0;
    p.x = c.x + nx * rr; p.z = c.z + nz * rr;
    if (c.climb && wx * nx + wz * nz < -2) { player.climbing = c; v.y = 3.6; player.jumping = false; }
    const vn = v.x * nx + v.z * nz;
    if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
  }

  // vertical + ground (auto step-up of 0.3 while walking)
  const prevY = p.y;
  p.y += v.y * dt;
  let best = null, bestY = -Infinity;
  const stepUp = player.grounded ? 0.32 : 0.06;
  for (const c of colliders) {
    if (!c.ground || c.y <= bestY) continue;
    const ddx = p.x - c.x, ddz = p.z - c.z, d2 = ddx * ddx + ddz * ddz;
    if (d2 > (c.rMax + 0.15) ** 2) continue;
    const rr = colR(c, Math.atan2(ddz, ddx)) + 0.12;
    if (d2 > rr * rr) continue;
    if (c.y > prevY + stepUp + (c.mover ? Math.max(c.mover.delta.y, 0) : 0)) continue;
    best = c; bestY = c.y;
  }
  if (best && v.y <= 0 && p.y <= bestY + (player.grounded ? 0.3 : 0)) {
    const impact = -v.y;
    p.y = bestY; v.y = 0;
    player.ground = best; player.surface = surfaceAt(best);
    if (!player.grounded) onLand(impact);
    player.grounded = true; player.lastGroundY = bestY; if (!best.mover) (player.safePos ??= new V3()).copy(p); best.stood = game.gameT;
  } else { player.grounded = false; player.ground = null; }

  if (p.y < islands[player.cp].y - 26) {
    if (dev.safe && player.safePos) { p.copy(player.safePos); v.set(0, 0, 0); } else if (!dev.safe) startRespawn();   // dev: falling puts you back where you last stood
  }

  // gameplay triggers
  if (player.grounded) {
    const isl = player.ground.island;
    if (isl !== undefined && isl > player.cp) activateCheckpoint(isl);
    if (player.ground.goal && !summit.reached) finale();
  }
  probe.set(p.x, p.y + 0.55, p.z);
  for (const k of pickups) if (!k.got && k.g.position.distanceToSquared(probe) < 0.95) collect(k);

  // visuals: facing, lean, squash & stretch
  const sp = Math.hypot(v.x, v.z);
  if (sp > 0.3 && (ix || iz || !player.grounded)) player.yaw += angDiff(player.yaw, Math.atan2(v.x, v.z)) * (1 - Math.exp(-14 * dt));
  player.tilt = damp(player.tilt, player.grounded ? sp / MAX_SPEED * 0.12 : clamp(-v.y * 0.01, -0.1, 0.12), 8, dt);
  const sqT = player.grounded ? 0 : clamp(v.y * 0.012, -0.08, 0.12);
  player.sqV += (-(player.sq - sqT) * 240 - player.sqV * 13) * dt;
  player.sq = clamp(player.sq + player.sqV * dt, -0.45, 0.45);
  syncRig();
  U.player.value.copy(p);
}

function syncRig() {
  const p = player.pos;
  root.position.copy(p); yawG.rotation.y = player.yaw; tiltG.rotation.x = player.tilt;
  const s = 1 + player.sq, sx = 1 / Math.sqrt(s);
  sqG.scale.set(sx, s, sx);
  const gy = groundUnder(p.x, p.z, p.y + 0.05);
  blob.visible = gy > -Infinity && p.y - gy < 12;
  if (blob.visible) {
    blob.position.set(p.x, gy + 0.03, p.z);
    const k = clamp(1 - (p.y - gy) / 8, 0.25, 1);
    blob.scale.setScalar(0.6 + 0.4 * k); blob.material.opacity = 0.28 * k;
  }
}
