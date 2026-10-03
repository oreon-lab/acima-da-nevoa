// The hopping head: movement, collisions, animation, checkpoints, collectibles, respawn.
import * as THREE from 'three';
import { scene, U, keys, game } from '../core.js';
import { PR, PH, MAX_SPEED, JUMP_V, GRAV, WIND, dev, settings } from '../config.js';
import { swordGroups } from './characterAsset.js';
import { combat, beginAttack, advanceAttack, ATTACK_RATE, DRAW_RATE, IMPACTS } from './combatRules.js';
import { V3, clamp, damp, angDiff } from '../utils.js';
import { islands, secrets, counts, pickups, summit, updrafts, ponds, colR, groundUnder, near, inside, inHollow, toLocal, waterAt, waterFloor, streamAt } from '../procedural/world.js';
import { lightShrine, waterWake } from '../procedural/objects/index.js';
import { puff, burst, sparks, SPARK_W } from '../fx/particles.js';
import { grade } from '../render/post.js';
import { tone, playSample, stepSound, landSound, glideSound, swordWhoosh, dashSound } from './audio.js';
import { setCount, flashCount, areaTitle, toast } from './ui.js';
import { canCollect } from './journeyRules.js';
import { held, move, rumble } from './input.js';
import { save, persist, mark } from './progress.js';
import { cam, resetCameraMotion, dashFx } from './camera.js';

export const player = {
  pos: new V3(), vel: new V3(), grounded: false, ground: null, lastGroundY: 0, coyote: 0, jumpBuf: 0,
  jumping: false, jumpAnim: false, yaw: 0, sq: 0, sqV: 0, tilt: 0, cp: 0, idleT: 0, collected: 0,
  climbing: null, gliding: false, glideFrom: new V3(),
  dashT: 0, dashCd: 0, dashX: 0, dashZ: 0, airDashed: false,
};
export const setPlayerVisible = v => { root.visible = v; };   // the body is hidden in first person
export const hooks = { rift: null, finale: null, strike: null, aim: null, respawn: null };

// rig: position -> facing -> lean -> squash & stretch -> model
const root = new THREE.Group(), yawG = new THREE.Group(), tiltG = new THREE.Group(), sqG = new THREE.Group();
root.add(yawG); yawG.add(tiltG); tiltG.add(sqG);
scene.add(root);
export const rig = root;   // the rift cutscene moves the body directly
// contact shadow so the jump height always reads
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1b2430, transparent: true, opacity: 0.25, depthWrite: false, fog: false }));
scene.add(blob);

// ------------------------------------------------------------ character & animation
let mixer = null, curAnim = null, oneShot = null, lastWalkT = 0;
const actions = {};
let weapons = [];

function startWeaponTransition(toArmed, attackAfter = false) {
  const name = toArmed ? 'Draw' : 'Sheathe', action = actions[name];
  if (!action) return false;
  combat.weaponTransition = { name, toArmed, time: 0, duration: action.getClip().duration / DRAW_RATE };
  combat.pendingAttack = attackAfter;
  oneShot = null; player.idleT = 0;
  play(name, 0.06, DRAW_RATE, 0, true);
  playSample('draw', { vol: toArmed ? 0.4 : 0.25, jitter: 0.03, at: { x: player.pos.x, y: player.pos.y + 0.7, z: player.pos.z } });
  return true;
}

function attackDirection() {
  const { x, z } = move();
  return Math.hypot(x, z) > 0.15
    ? Math.atan2(-Math.sin(cam.yaw) * z + Math.cos(cam.yaw) * x, -Math.cos(cam.yaw) * z - Math.sin(cam.yaw) * x)
    : player.yaw;
}

export function requestAttack() {
  if (!actions.Attack || game.state !== 'play' || fade.phase !== 'none'
    || player.climbing || player.gliding || player.ground?.water || combat.hurt > 0 || dev.fly) return false;
  if (combat.weaponTransition) { combat.pendingAttack = true; return true; }
  if (!combat.armed) return startWeaponTransition(true, true);
  if (combat.attack) {
    if (combat.attack.duration - combat.attack.time < 0.3) combat.queued = true;
    return false;
  }
  oneShot = null; player.idleT = 0;
  const direction = attackDirection();
  beginAttack(combat, actions.Attack.getClip().duration / ATTACK_RATE);
  combat.attack.aimYaw = hooks.aim?.(player, direction) ?? direction;
  play('Attack', 0.08, ATTACK_RATE, 0, true);
  return true;
}

// ------------------------------------------------------------ dash
// A short burst along the input direction (or where you face): one on the ground, one more per airtime.
const DASH_TIME = 0.2, DASH_SPEED = 17, DASH_COOLDOWN = 0.55;
export function requestDash() {
  if (game.state !== 'play' || fade.phase !== 'none' || dev.fly || player.climbing || player.ground?.water
    || player.dashT > 0 || player.dashCd > 0 || combat.hurt > 0 || combat.weaponTransition) return false;
  if (!player.grounded && player.airDashed) return false;
  const { x, z } = move(), sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  let dx = -sy * z + cy * x, dz = -cy * z - sy * x;
  if (Math.hypot(dx, dz) < 0.15) { dx = Math.sin(player.yaw); dz = Math.cos(player.yaw); }
  const l = Math.hypot(dx, dz);
  player.dashX = dx / l; player.dashZ = dz / l; player.dashT = DASH_TIME; player.dashCd = DASH_COOLDOWN;
  if (!player.grounded) player.airDashed = true;
  player.gliding = false; player.jumping = false;
  combat.attack = null; combat.queued = false;
  player.yaw = Math.atan2(player.dashX, player.dashZ);
  player.sqV += 2;   // a slight stretch
  const p = player.pos;
  puff(p.x, p.y, p.z, 4, 1.4, 0.22, 0.22);
  dashSound();
  dashFx.start(); return true;
}
export function toggleWeapons() {
  if (game.state !== 'play' || fade.phase !== 'none' || player.climbing || dev.fly
    || combat.attack || combat.weaponTransition || combat.hurt > 0) return false;
  return startWeaponTransition(!combat.armed);
}

export function receiveHit() {
  combat.attack = null; combat.queued = false; combat.hurt = 0.35;
  combat.weaponTransition = null; combat.pendingAttack = false;
  oneShot = 'HitRecieve'; rumble(0.8, 180);
  play('HitRecieve', 0.05, 1, 0, true);
}

function play(name, fade = 0.15, ts = 1, t0 = 0, force = false) {
  if (combat.armed && actions[name + '_Armed']) name += '_Armed';
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
  weapons = swordGroups(fbx);
  fbx.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    const conv = m => rimify(new THREE.MeshStandardMaterial({ name: m.name, color: m.color, roughness: 0.6, ...LOOK[m.name] }));
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  sqG.add(fbx);
  mixer = new THREE.AnimationMixer(fbx);
  for (const clip of fbx.animations) actions[clip.name.split('|').pop()] = mixer.clipAction(clip);
  for (const n of ['Attack', 'Draw', 'Sheathe', 'Jump', 'Yes', 'No', 'HitRecieve', 'Death']) {
    for (const key of [n, n + '_Armed']) if (actions[key]) { actions[key].setLoop(THREE.LoopOnce); actions[key].clampWhenFinished = true; }
  }
  mixer.addEventListener('finished', e => { if (oneShot && (e.action === actions[oneShot] || e.action === actions[oneShot + '_Armed'])) oneShot = null; });
  play(combat.armed ? 'Idle_Attack' : 'Idle');
  for (const w of weapons) w.visible = true;
}

export function updateAnim(dt) {
  if (!mixer) return;
  let advanced = false;
  if (combat.weaponTransition) {
    if (fade.phase === 'out' || dev.fly) {
      combat.weaponTransition = null; combat.pendingAttack = false;
    } else {
      const transition = combat.weaponTransition;
      transition.time += dt; mixer.update(dt); advanced = true;
      if (transition.time < transition.duration) return;
      combat.armed = transition.toArmed; combat.weaponTransition = null;
      const attackAfter = combat.pendingAttack; combat.pendingAttack = false;
      if (attackAfter && requestAttack()) return;
    }
  }
  if (combat.attack && (fade.phase === 'out' || dev.fly)) { combat.attack = null; combat.queued = false; }
  const attacking = !!combat.attack;
  if (combat.attack) {
    const a = combat.attack;
    if (a.time < a.duration * 0.24) {
      player.yaw += clamp(angDiff(player.yaw, a.aimYaw ?? player.yaw), -20 * dt, 20 * dt);
      syncRig();
    }
    a.swish ??= 0;
    while (a.swish < IMPACTS.length && a.time + dt >= a.duration * IMPACTS[a.swish] - 0.065)
    { const side = a.swish % 2 ? -0.7 : 0.7, sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);   // each blade swings on its own side of the body
      swordWhoosh(a.swish++, { x: player.pos.x + cy * side + sy * 0.6, y: player.pos.y + 1, z: player.pos.z - sy * side + cy * 0.6 }); }
  }
  const result = advanceAttack(combat, dt);
  if (attacking) {
    if (!advanced) mixer.update(dt);
    advanced = true;
    for (const swing of result.strikes) hooks.strike?.(player, swing);
    for (const w of weapons) w.visible = true;
    if (result.finished && combat.queued) requestAttack();
    if (!result.finished || combat.attack) return;
  }
  const sp = Math.hypot(player.vel.x, player.vel.z);
  let want = combat.armed ? 'Idle_Attack' : 'Idle', ts = 1;
  if (!player.grounded) want = player.jumpAnim ? 'Jump' : 'Idle';
  else if (sp > 0.8) { want = 'Walk'; ts = 0.8 + sp / MAX_SPEED * 0.55; oneShot = null; player.idleT = 0; }
  else {
    player.idleT += dt;
    if (!combat.armed && player.idleT > 9 && !oneShot) { oneShot = 'No'; player.idleT = 0; }   // idle fidget
    if (oneShot) want = oneShot;
  }
  if (combat.hurt > 0 && actions.HitRecieve) want = 'HitRecieve';
  play(want, 0.14, ts);
  if (curAnim === 'Walk' || curAnim === 'Walk_Armed') {   // the walk cycle is a hop: each landing kicks a little dust
    const t = actions[curAnim].time;
    if (t < lastWalkT - 0.1) footstep();
    lastWalkT = t;
  }
  if (!advanced) mixer.update(dt);
}

// ------------------------------------------------------------ spawn / respawn
export function spawnAt(i) {
  const cp = islands[i].cp;
  player.pos.set(cp.x, cp.y, cp.z); player.vel.set(0, 0, 0);
  player.dashT = 0; player.dashCd = 0; player.climbing = null; player.gliding = false; player.jumping = false; player.jumpBuf = 0; oneShot = null;
  player.grounded = true; player.ground = islands[i].col; player.lastGroundY = cp.y;
  combat.attack = null; combat.queued = false; combat.hurt = 0;
  combat.armed = false; combat.weaponTransition = null; combat.pendingAttack = false;
  hooks.respawn?.(player);
  visit('i' + i);
  player.yaw = Math.atan2(Math.cos(cp.heading), Math.sin(cp.heading));
  yawG.rotation.y = player.yaw;
  cam.yaw = Math.atan2(-Math.cos(cp.heading), -Math.sin(cp.heading));
  cam.pitch = 0.36;
  cam.follow.copy(player.pos); resetCameraMotion();
  syncRig();
}

// quick fade into the mist and back
export const fade = { phase: 'in', t: 1 };
export function startRespawn(fell = false) {
  if (fade.phase !== 'none') return;
  fade.phase = 'out'; fade.t = 0;
  if (fell) { save.falls++; persist(); }
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
  if (streamAt(p.x, p.y, p.z)) return 'water';
  return g?.surface || (g && g.island !== undefined ? 'grass' : 'stone');
}
function dust(n, spd, size, alpha) {   // dust / blades / droplets, tinted by the surface
  const [c, lift] = SC[player.surface || 'stone'], p = player.pos;
  puff(p.x, p.y, p.z, n, spd, size, alpha, c, lift);
}
function footstep() {
  if (!player.grounded || Math.hypot(player.vel.x, player.vel.z) <= 0.8) return;
  const s = player.surface || 'stone';
  dust(s === 'water' ? 8 : s === 'sand' ? 5 : 4, s === 'water' ? 1.0 : 0.7, s === 'water' ? 0.2 : 0.24, s === 'water' ? 0.5 : 0.34);
  stepSound(s);
}

function onJump() {
  player.sqV += 3.2;
  player.jumpAnim = true;
  if (!combat.attack && !combat.weaponTransition) play('Jump', 0.08, 1.35, 0.12, true);
  dust(5, 1.2, 0.3, 0.3);
  const feet = { x: player.pos.x, y: player.pos.y + 0.2, z: player.pos.z };
  if (!playSample('cloth', { vol: 0.2, jitter: 0.05, at: feet }) && !playSample('jump', { vol: 3, jitter: 0.06, at: feet }))
    tone([180], { dur: 0.12, vol: 0.05, slide: 1.8, at: feet });
}
function onLand(impact) {
  player.sqV -= Math.min(impact * 0.22, 4.5);
  player.jumpAnim = false;
  dust(Math.round(clamp(impact * 0.9, 3, 16)), 0.8 + impact * 0.12, 0.35 + impact * 0.02, 0.45);
  landSound(player.surface, clamp(impact / 8, 0.7, 2));
  if (impact > 12) rumble(Math.min(impact / 30, 0.7), 100);
  if (impact > 12) tone([95], { dur: 0.16, vol: Math.min(0.03 + impact * 0.008, 0.14), slide: 0.55, at: player.pos });
}
function activateCheckpoint(i) {
  player.cp = save.cp = i;
  areaTitle(i, 'checkpoint');
  const c = lightShrine(i);
  burst(c.x, c.y, c.z, 26, 2.2);
  tone([392, 493.88, 587.33, 783.99], { dur: 2.6, vol: 0.05, attack: 0.25, gap: 0.12, at: c });
  oneShot = 'Yes';
  if (i >= 3 && !save.glide) {
    save.glide = true;
    toast('Nova habilidade · planar', 'Sua próxima travessia tem uma corrente de ar e uma pedra larga para praticar.', 'HABILIDADE');
  }
  persist();
}
function visit(key) { if (mark('visited', key)) return true; return false; }
function collect(k) {
  k.got = true;
  save.got.push(pickups.indexOf(k)); persist();
  setCount(++player.collected, pickups.length, true); flashCount();
  const p = k.g.position;
  burst(p.x, p.y, p.z, 22, 2.6);
  burst(p.x, p.y, p.z, 8, 1.2, SPARK_W);
  const base = [659.25, 783.99, 987.77, 1174.66][player.collected % 4];
  tone([base, base * 1.5], { dur: 1.1, vol: 0.06, gap: 0.09, at: p });
}
function finale() {
  summit.reached = true;
  oneShot = 'Dance';
  burst(summit.pos.x, summit.pos.y, summit.pos.z, 60, 4);
  tone([261.63, 329.63, 392, 523.25, 659.25], { dur: 4, vol: 0.05, attack: 0.4, gap: 0.18, at: summit.pos });
  hooks.finale?.();
}

// ------------------------------------------------------------ physics
const probe = new V3(), flyDir = new V3();
const GLIDE_SPEED = 7.5, GLIDE_SINK = 2;
// dev: free flight. W/S fly along where the camera looks (up or down included), A/D strafe, Space rises,
// Shift descends. Velocity eases in and out so it is easy to stop and to line up; nothing collides.
function fly(dt) {
  const p = player.pos, v = player.vel, sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  const { x: ix, z: iz } = move();
  const up = (held('jump') ? 1 : 0) - (keys.ShiftLeft || keys.ShiftRight ? 1 : 0);
  flyDir.set(-sy * iz + cy * ix, 0, -cy * iz - sy * ix);
  if (flyDir.lengthSq() > 1) flyDir.normalize();   // diagonals no faster; analog sticks keep partial speed
  flyDir.y = up * 0.8;
  const S = dev.flySpeed;
  v.x = damp(v.x, flyDir.x * S, 7, dt); v.y = damp(v.y, flyDir.y * S, 7, dt); v.z = damp(v.z, flyDir.z * S, 7, dt);
  p.addScaledVector(v, dt);
  const sh = Math.hypot(v.x, v.z);
  if (sh > 0.5) player.yaw += angDiff(player.yaw, Math.atan2(v.x, v.z)) * (1 - Math.exp(-10 * dt));
  player.tilt = damp(player.tilt, clamp(sh / S, 0, 1) * 0.5, 6, dt);
  player.grounded = false; player.ground = null; player.sq = 0; player.sqV = 0; player.gliding = false; player.jumpAnim = false;
  player.lastGroundY = p.y;
  if (cam.first && !combat.attack) player.yaw = cam.yaw + Math.PI;
  syncRig(); U.player.value.copy(p);
  probe.set(p.x, p.y + 0.55, p.z);
  for (const k of pickups) if (canCollect(k) && k.g.position.distanceToSquared(probe) < 0.95) collect(k);
}
export function collectAll() { for (const k of pickups) if (!k.got) collect(k); }

export function updatePlayer(dt) {
  if (dev.fly) return fly(dt);
  const p = player.pos, v = player.vel;
  if (player.grounded && player.ground?.mover) {
    const g = player.ground, m = g.mover;
    p.add(m.delta);
    if (m.yawDelta) {
      const x = p.x - g.x, z = p.z - g.z, co = Math.cos(m.yawDelta), si = Math.sin(m.yawDelta);
      p.x = g.x + x * co - z * si; p.z = g.z + x * si + z * co;
      player.yaw -= m.yawDelta; cam.yaw -= m.yawDelta;
    }
  }

  const canMove = fade.phase !== 'out';
  const sub = player.ground?.water ? clamp((player.ground.w.y - p.y) / 0.7, 0, 1) : 0;   // 0 dry .. 1 swimming (head above water)
  const mv = canMove ? move() : { x: 0, z: 0 }, ix = mv.x, iz = mv.z, moving = Math.hypot(ix, iz) > 0.05;
  let wx = 0, wz = 0;
  if (moving) {   // camera-relative; analog sticks give partial speed
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), s = MAX_SPEED * dev.speed * (player.gliding ? 1.2 : 1) * (1 - 0.5 * sub) * (player.grounded ? (combat.attack ? (combat.attack.time / combat.attack.duration < 0.62 ? 0.5 : 0.85) : combat.weaponTransition ? 0.75 : 1) : 1);
    wx = (-sy * iz + cy * ix) * s; wz = (-cy * iz - sy * ix) * s;
  }
  if (player.gliding && canMove) {
    // a glide always carries you forward: steer by input, otherwise keep the current heading (never stalls mid-air)
    const cs = Math.hypot(v.x, v.z), wl = Math.hypot(wx, wz);
    const hx = wl > 0 ? wx / wl : cs > 0.3 ? v.x / cs : Math.sin(player.yaw), hz = wl > 0 ? wz / wl : cs > 0.3 ? v.z / cs : Math.cos(player.yaw);
    v.x = damp(v.x, hx * GLIDE_SPEED, 3.5, dt); v.z = damp(v.z, hz * GLIDE_SPEED, 3.5, dt);
  } else {
    const acc = player.grounded ? (moving ? 42 : 34) : (moving ? 40 : 6);   // full steering in the air, and you can brake too
    const dx = wx - v.x, dz = wz - v.z, dl = Math.hypot(dx, dz), step = acc * dt;
    if (dl <= step) { v.x = wx; v.z = wz; } else { v.x += dx / dl * step; v.z += dz / dl * step; }
  }

  player.dashCd -= dt;
  if (player.grounded) player.airDashed = false;
  if (player.dashT > 0) {
    player.dashT -= dt;
    v.x = player.dashX * DASH_SPEED; v.z = player.dashZ * DASH_SPEED;
    if (!player.grounded) v.y = Math.max(v.y * 0.85, -1.5);   // barely falls while dashing through the air
    // streak of light along the path, and dust while it runs on the ground
    if (Math.random() < dt * 30) sparks.emit(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.3 + Math.random() * 0.6, p.z + (Math.random() - 0.5) * 0.3, -player.dashX * 0.8, 0.05, -player.dashZ * 0.8, 0.3, 0.06, SPARK_W, 0.35);
    if (player.grounded && Math.random() < dt * 12) puff(p.x, p.y, p.z, 1, 0.8, 0.2, 0.18);
    if (player.dashT <= 0) { v.x *= 0.45; v.z *= 0.45; }   // out of the dash with a little momentum left
  }

  // jump: coyote time + input buffer + variable height
  player.coyote = player.grounded ? 0.12 : player.coyote - dt;
  player.jumpBuf -= dt;
  if (player.jumpBuf > 0 && player.coyote > 0 && canMove) {
    v.y = JUMP_V * dev.jump * (1 - 0.6 * sub); player.grounded = false; player.ground = null; player.coyote = 0; player.jumpBuf = 0; player.jumping = true;
    onJump();
  }
  if (player.jumping && v.y > 0 && !held('jump')) { v.y *= 0.5; player.jumping = false; }
  if (v.y <= 0) player.jumping = false;
  // glide (learned at Ruínas do Vento): in the air press jump again and hold it. Close to the ground the press
  // stays buffered as a normal jump for the landing instead.
  if (!player.gliding && player.jumpBuf > 0 && !player.grounded && player.coyote <= 0 && save.glide && canMove && v.y < 3
    && p.y - groundUnder(p.x, p.z, p.y + 0.05) > 1.3) {
    player.gliding = true; player.jumping = false; player.jumpBuf = 0; player.glideFrom.copy(p);
  }
  if (player.gliding && (player.grounded || !held('jump') || !canMove)) player.gliding = false;
  if (player.gliding) {
    v.y = v.y > -GLIDE_SINK ? Math.max(v.y - GRAV * 0.5 * dev.gravity * dt, -GLIDE_SINK) : damp(v.y, -GLIDE_SINK, 5, dt);   // soft catch, then a steady sink
  } else v.y = Math.max(v.y - (v.y > 0 ? GRAV : GRAV * 1.4) * dev.gravity * dt, -34);
  for (const u of updrafts) {   // wind vents lift you (and lift-off works even while standing on the vent stone); gliding rides them higher
    const ux = p.x - u.x, uz = p.z - u.z;
    if (ux * ux + uz * uz < u.r * u.r && p.y > u.y - 0.3 && p.y < u.y + u.h) { v.y = Math.min(v.y + (player.gliding ? 90 : 70) * dt, player.gliding ? 10 : 7.5); player.jumping = false; }
  }

  // climbing: pushing into a `climb` wall carries you up; near the top you mantle onto it
  const prevClimb = player.climbing; player.climbing = null;
  if (prevClimb && p.y >= prevClimb.y - 0.45) {
    const cx = p.x - prevClimb.x, cz = p.z - prevClimb.z, k = prevClimb.r * 0.55 / (Math.hypot(cx, cz) || 1);
    p.x = prevClimb.x + cx * k; p.z = prevClimb.z + cz * k; p.y = prevClimb.y; v.y = 0; v.x *= 0.2; v.z *= 0.2;
  }

  // storms: a crosswind pushes you while you are in the air (much more when gliding)
  const storm = clamp((game.wx.rain - 0.55) / 0.4, 0, 1);
  if (storm > 0 && !player.grounded) {
    const k = storm * (0.6 + 0.8 * U.gust.value) * (player.gliding ? 3 : 1.2);
    p.x += WIND.x * k * dt; p.z += WIND.y * k * dt;
  }

  // horizontal move + walls. In a lake the island's own top (at water level) is not there: you go down into it.
  p.x += v.x * dt; p.z += v.z * dt;
  const cur = player.grounded ? streamAt(p.x, p.y, p.z) : null;   // running water carries you downstream
  if (cur) { p.x += cur[0] * dt; p.z += cur[1] * dt; }
  const water = waterAt(p.x, p.z), under = c => water && !c.mover && Math.abs(c.y - water.y) < 0.02;
  for (const c of near(p.x, p.z)) {
    if (c.gone || under(c) || p.y >= c.y - 0.33 || p.y + PH <= c.y - c.thick) continue;   // gone = a crumbled platform; 0.33 = what the step-up climbs
    const ddx = p.x - c.x, ddz = p.z - c.z, d2 = ddx * ddx + ddz * ddz, rm = c.rMax + PR;
    if (d2 > rm * rm) continue;
    let nx, nz, push;
    if (c.rect) {   // box: push out from the closest point of the rectangle
      const [lx, lz] = toLocal(c, p.x, p.z), [hw, hd, rot] = c.rect;
      const ex = lx - clamp(lx, -hw, hw), ez = lz - clamp(lz, -hd, hd), d = Math.hypot(ex, ez);
      if (d >= PR) continue;
      let ax = 0, az = 0;
      if (d > 1e-4) { ax = ex / d; az = ez / d; push = PR - d; }
      else if (hw - Math.abs(lx) < hd - Math.abs(lz)) { ax = Math.sign(lx) || 1; push = hw - Math.abs(lx) + PR; }   // centre inside: nearest face
      else { az = Math.sign(lz) || 1; push = hd - Math.abs(lz) + PR; }
      nx = ax * Math.cos(rot) - az * Math.sin(rot); nz = ax * Math.sin(rot) + az * Math.cos(rot);
    } else {
      const d = Math.sqrt(d2), rr = colR(c, Math.atan2(ddz, ddx), Math.max(c.y - p.y - PH, 0), Math.max(c.y - p.y, 0)) + PR;
      if (d >= rr || ((c.inner || c.cut) && inHollow(c, p.x, p.z))) continue;   // empty middle / bite: no wall, you just fall
      nx = d > 1e-4 ? ddx / d : 1; nz = d > 1e-4 ? ddz / d : 0; push = rr - d;
    }
    if (v.y > 0 && p.y + PH < c.y - c.thick + 0.35) { p.y = c.y - c.thick - PH; v.y = 0; player.jumping = false; continue; }  // head bump
    p.x += nx * push; p.z += nz * push;
    if (c.climb && wx * nx + wz * nz < -2) { player.climbing = c; v.y = 3.6; player.jumping = false; }
    const vn = v.x * nx + v.z * nz;
    if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
  }

  // vertical + ground (auto step-up of 0.3 while walking)
  const prevY = p.y;
  p.y += v.y * dt;
  let best = null, bestY = -Infinity;
  const stepUp = player.grounded ? 0.32 : 0.06;
  for (const c of near(p.x, p.z)) {
    if (!c.ground || c.y <= bestY || under(c)) continue;
    const ddx = p.x - c.x, ddz = p.z - c.z, d2 = ddx * ddx + ddz * ddz;
    if (d2 > (c.rMax + 0.15) ** 2 || !inside(c, p.x, p.z, 0.12)) continue;
    if (c.y > prevY + stepUp + (c.mover ? Math.max(c.mover.delta.y, 0) : 0)) continue;
    best = c; bestY = c.y;
  }
  if (water) {   // the lake bed (you stand on it, or float at swimming depth) competes with stones in the water
    const fy = Math.max(waterFloor(water, p.x, p.z), water.y - 0.7);   // deeper than that you swim, head above water
    if (fy > bestY && fy <= prevY + stepUp) { best = Object.assign(water.col, { y: fy, w: water }); bestY = fy; }
  }
  if (best && v.y <= 0 && p.y <= bestY + (player.grounded ? 0.3 : 0)) {
    const impact = -v.y;
    p.y = bestY; v.y = 0;
    player.ground = best; player.surface = surfaceAt(best);
    if (!player.grounded) onLand(impact);
    player.grounded = true; player.lastGroundY = bestY; if (!best.mover && !best.water) (player.safePos ??= new V3()).copy(p); best.stood = game.gameT;
  } else { player.grounded = false; player.ground = null; }

  // Falling into the void resets you, but walking or falling down onto a lower island never does: the checkpoint
  // only counts when nothing is left underneath you (or you are below every island).
  if (p.y < islands[player.cp].y - 26 && (groundUnder(p.x, p.z, p.y + 0.05) === -Infinity || p.y < Math.min(...islands.map(i => i.y)) - 26)) {
    if (dev.safe && player.safePos) { p.copy(player.safePos); v.set(0, 0, 0); } else if (!dev.safe) startRespawn(true);   // dev: falling puts you back where you last stood
  }

  // gameplay triggers
  if (player.grounded) {
    const g = player.ground;
    if (g.island !== undefined) {
      if (g.island > player.cp) { activateCheckpoint(g.island); if (g.island === islands.length - 1) hooks.rift?.(); }   // first step on the last island: the rift
      visit('i' + g.island);
    }
    if (g.secret !== undefined) visit('s' + g.secret);
    if (g.detour !== undefined) mark('detours', g.detour);
    if (g.goal && !summit.reached) finale();
  }
  probe.set(p.x, p.y + 0.55, p.z);
  for (const k of pickups) if (canCollect(k) && k.g.position.distanceToSquared(probe) < 0.95) collect(k);

  // visuals: facing, lean, squash & stretch
  const sp = Math.hypot(v.x, v.z);
  glideSound(player.gliding ? clamp(sp / 6, 0.4, 1) : 0);
  waterWake.value = damp(waterWake.value, player.ground?.water || (player.grounded && player.surface === 'water') ? 0.35 + clamp(sp / 4, 0, 0.65) : 0, 4, dt);
  if (player.gliding && Math.random() < dt * 14) sparks.emit(p.x + Math.random() - 0.5, p.y + 0.7, p.z + Math.random() - 0.5, -v.x * 0.3, 0.2, -v.z * 0.3, 0.8, 0.05, SPARK_W, 0.5);
  if (combat.attack && combat.attack.time < combat.attack.duration * 0.24 && moving) {
    const target = attackDirection();
    combat.attack.aimYaw = hooks.aim?.(player, target) ?? target;
  }
  if (!combat.attack && sp > 0.3 && (moving || !player.grounded)) player.yaw += angDiff(player.yaw, Math.atan2(player.grounded && moving ? wx : v.x, player.grounded && moving ? wz : v.z)) * (1 - Math.exp(-18 * dt));
  if (cam.first && !combat.attack) player.yaw = cam.yaw + Math.PI;   // first person: the body always faces where you look
  player.tilt = damp(player.tilt, player.dashT > 0 ? 0.28 : player.gliding ? 0.32 : player.grounded ? sp / MAX_SPEED * 0.12 : clamp(-v.y * 0.01, -0.1, 0.12), 8, dt);
  const sqT = player.gliding ? -0.1 : player.grounded ? 0 : clamp(v.y * 0.012, -0.08, 0.12);
  player.sqV += (-(player.sq - sqT) * 240 - player.sqV * 13) * dt;
  player.sq = clamp(player.sq + player.sqV * dt, -0.45, 0.45);
  syncRig();
  U.player.value.copy(p);
}

export function syncRig() {
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

// the trailer director (game/trailer.js) moves the body itself and borrows the game's own jump and landing reactions
export const puppet = { jump: () => onJump(), land: impact => onLand(impact) };
