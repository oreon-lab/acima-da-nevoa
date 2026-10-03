// The trailer's clips. Each is { dur, shots, audio, grade, init } — see trailer.js.
import { game } from '../core.js';
import { settings, dev } from '../config.js';
import { V3, lerp } from '../utils.js';
import { player, requestAttack, toggleWeapons } from './player.js';
import { combat } from './combatRules.js';
import { enemies } from './combat.js';
import { resetCombat } from './combat.js';
import { islands, crossings, summit } from '../procedural/world.js';
import { updateBridges } from '../procedural/objects/bridge.js';
import { whale } from '../procedural/objects/whale.js';
import { carrierPoint, whalePose } from '../procedural/whaleRoute.js';
import { ease, seg, track, drift, setCamera, Puppet, stand, run, jump, glide, body, drive, plant, trailerSound } from './trailerKit.js';

const P = (x, y, z) => new V3(x, y, z);

// scout: a free camera set from outside (window.__pose), for finding shots
const scout = {
  dur: 600,
  shots: [{
    name: 'scout', at: 0, dur: 600,
    frame() {
      const p = window.__pose; if (!p) return;
      if (p.tod !== undefined) game.tod = p.tod;
      if (p.fog !== undefined) settings.fog = p.fog;
      if (p.rest !== undefined) game.restoration = p.rest;
      if (p.player) { player.pos.set(...p.player); player.grounded = true; }
      setCamera(new V3(...p.cam), new V3(...p.look), p.fov ?? 45);
    },
  }],
  captions: [],
};

// ============================================================ helpers
// shots are laid end to end: each one's `at` follows from the durations before it
function sequence(shots, t0 = 0) { let t = t0; for (const s of shots) { s.at = t; t += s.dur; } return t; }
const caption = (from, to, text, extra = {}) => ({ at: from, to, html: `<div class="l">${text}</div>`, bottom: '17%', ...extra });
// every shot sets its own light: time of day (0.25 noon, 0.5 sunset), mist level and how much of the lighthouse's clearing there is
const sky = (tod, fog = 1, rest = 0) => { game.tod = tod; settings.fog = fog; game.restoration = rest; };
// only the guards listed are visible (none: all hidden)
const guards = (...show) => enemies.forEach((e, i) => { e.root.visible = show.includes(i); e.bar.visible = false; });
// a camera that stays `back` behind and `up` above a moving subject (yaw = its heading), looking `ahead` in front of it
const chase = (s, back, up, ahead = 2, side = 0) => {
  const f = P(Math.sin(s.yaw), 0, Math.cos(s.yaw)), r = P(f.z, 0, -f.x);
  return { pos: P(s.pos.x - f.x * back + r.x * side, s.pos.y + up, s.pos.z - f.z * back + r.z * side), look: P(s.pos.x + f.x * ahead, s.pos.y + 0.8, s.pos.z + f.z * ahead) };
};
const GRADE = 'contrast(1.16) saturate(1.14) brightness(0.97)';

// ============================================================ Act I: the walker above the mist, and the first stones
const STONES0 = [[0, 0, -8.8], [0.6, 0.9, -11.7], [2.1, 1.7, -15.3], [3.7, 2.7, -18.7], [5.9, 3.7, -22.2], [7.9, 4.9, -25.6], [8.6, 6, -29.4], [9.6, 7, -33.1], [12.2, 7.6, -38.5]];
const HERO = P(0.3, 0, -7.4);
const hero = new Puppet(HERO, Math.PI).add(stand(HERO, Math.PI, 7.2));
const crossing0 = new Puppet(HERO, Math.PI).add(run(STONES0[0], 5.4));
for (let i = 1; i < STONES0.length; i++) crossing0.add(jump(STONES0[i], 0.58, 1.35));
crossing0.add(run([13.5, 7.6, -41], 5.4));

const rise = {
  name: 'rise', dur: 7.2,
  begin() { sky(0.45, 0, 0); guards(); },
  frame(u, dt) {
    body(hero, 0, dt);
    const pos = track([[0, [-9, -11, -17]], [2.0, [-10.5, -1.2, -15]], [3.8, [-9.2, 1.1, -11.5]], [7.2, [-4.6, 1.25, -3.6]]]);
    const look = track([[0, [-1, -3, -6]], [2.0, [-1, 0.6, -6]], [3.8, [0.1, 0.9, -7.2]], [7.2, [-0.2, 0.8, -8.6]]]);
    const fov = track([[0, 56], [3.8, 44], [7.2, 38]]);
    setCamera(pos(u).clone().add(drift(u, 0.025)), look(u), fov(u));
  },
};
const hop1 = {
  name: 'hop-side', dur: 2.0,
  begin() { sky(0.455, 0, 0.15); guards(); },
  frame(u, dt) {
    const s = body(crossing0, u, dt);
    setCamera(P(-3.6, 0.7, -13.5), P(s.pos.x + 0.7, s.pos.y + 1.0, s.pos.z), 42);
  },
};
const hop2 = {
  name: 'hop-chase', dur: 2.2,
  begin() { sky(0.455, 0, 0.15); guards(); },
  frame(u, dt) {
    const s = body(crossing0, u + hop1.dur, dt), c = chase(s, 4.6, 1.6, 1.8, 1.2);
    setCamera(c.pos, c.look, 48);
  },
  captions: [caption(0.2, 2.1, 'Um salto de cada vez.')],
};
const hop3 = {
  name: 'hop-wide', dur: 2.6,
  begin() { sky(0.46, 0, 0.15); guards(); },
  frame(u, dt) {
    const s = body(crossing0, u + hop1.dur + hop2.dur, dt);
    const az = lerp(0.2, 1.1, ease(u / 2.6));
    setCamera(P(s.pos.x + Math.sin(az) * 8, s.pos.y + 1.3, s.pos.z + Math.cos(az) * 8), P(s.pos.x, s.pos.y + 0.9, s.pos.z), 40);
  },
};

// ============================================================ Act II: the moss steps that fall away, the ruins, the first flight
const STONES2 = [[60.3, 13.1, -72.9], [64.7, 13.8, -74], [69.1, 14.2, -75.3], [73.3, 14.8, -76], [77.2, 15.3, -76.8], [81.1, 15.9, -78.2], [84.9, 16.5, -79.7]];
const crumble = new Puppet([55.0, 12.6, -72.0], 1.4).add(run([57.8, 12.6, -72.7], 5.4));
for (const s of STONES2) crumble.add(jump(s, 0.5, 1.2));
crumble.add(run([88.5, 16.9, -80.6], 5.4), run([96.0, 16.9, -76.0], 5.4));
const crumbleA = {
  name: 'crumble-front', dur: 2.4,
  begin() { sky(0.455, 0, 0.2); guards(); game.gameT = 100; },
  frame(u, dt) {
    const s = body(crumble, u + 0.2, dt);
    setCamera(P(s.pos.x + 7.5, s.pos.y + 0.6, s.pos.z + 5.2), P(s.pos.x - 0.5, s.pos.y + 0.9, s.pos.z), 40);
  },
};
const crumbleB = {
  name: 'crumble-side', dur: 2.4,
  begin() { sky(0.46, 0, 0.2); guards(); },
  frame(u, dt) {
    const s = body(crumble, u + 0.2 + crumbleA.dur, dt);
    setCamera(P(s.pos.x + 2.5, s.pos.y + 6.5, s.pos.z + 11), P(s.pos.x + 0.8, s.pos.y + 0.7, s.pos.z), 42);
  },
};

const RUINS = [[96.0, 16.9, -76.0], [101.3, 16.9, -73.6], [103.8, 17.4, -71.4], [107.4, 18, -68.6]];
const ruins = new Puppet([86.8, 16.5, -80.0], 1.2).add(run(RUINS[0], 5.4), run(RUINS[1], 5.4), jump(RUINS[2], 0.45, 0.9), jump(RUINS[3], 0.45, 0.9));
const ruinsShot = {
  name: 'ruins', dur: 3.0,
  begin() { sky(0.462, 0, 0.3); guards(); },
  frame(u, dt) {
    const s = body(ruins, u + 0.3, dt), c = chase(s, 5.2, 1.4, 1.2, -2.0);
    setCamera(c.pos, c.look, lerp(46, 40, ease(u / 3.0)));
  },
};

const flight = new Puppet([107.4, 18, -68.6], 0.7).add(
  jump([111, 18.6, -65.8], 0.42, 0.6, 0.02),
  glide([[112.2, 24.5, -64.6], [115.6, 26.2, -62.4], [120, 24.4, -59.4], [124.6, 22.6, -56.2], [129.2, 21.2, -51.8]], 4.0),
  glide([[130.4, 20.9, -48.4]], 0.5));
const glideShot = {
  name: 'glide', dur: 5.6,
  begin() { sky(0.465, 0, 0.3); guards(); },
  frame(u, dt) {
    const s = body(flight, u, dt);
    const az = lerp(2.9, 4.0, ease(u / 5.6)), d = lerp(4.5, 6.5, u / 5.6);
    setCamera(P(s.pos.x + Math.sin(az) * d, s.pos.y - lerp(1.6, 0.2, u / 5.6), s.pos.z + Math.cos(az) * d), P(s.pos.x, s.pos.y + 0.3, s.pos.z), 52);
  },
};

// ============================================================ the guard of the spiral island
// One continuous fight, cut three ways: the simulation (draw, approach, wind-up, strikes) is the game's own, driven by
// a fixed script of presses; only the camera changes between the cuts. F = seconds since the fight began.
const FA = P(130.4, 20.7, -48.4), fight = { drew: false, last: -9, deadAt: null, sheathed: false, armedAt: null, log: [] };
const guard = () => enemies[2];
const mark = (F, what) => fight.log.push(`${F.toFixed(2)} ${what}`);
function fightStep(F, dt) {
  const g = guard();
  plant(FA, dt);
  if (F >= 0.5 && !fight.drew) { fight.drew = true; toggleWeapons(); trailerSound.emit('draw'); mark(F, 'draw'); }
  if (combat.armed && fight.armedAt === null) { fight.armedAt = F; mark(F, 'armed'); }
  const dist = g.root.position.distanceTo(player.pos);
  // strike when the guard winds up (it glows red: the blow interrupts it); once stunned, finish it at once
  const ready = g.windup > 0.2 || (g.stun > 0 && dist < 1.95) || (fight.armedAt !== null && F - fight.armedAt > 3 && dist < 1.95);
  if (combat.armed && !combat.weaponTransition && !combat.attack && g.hp > 0 && ready && F - fight.last > 0.25 && requestAttack()) { fight.last = F; mark(F, `attack d=${dist.toFixed(2)} wind=${g.windup.toFixed(2)} hp=${g.hp}`); }
  if (g.hp <= 0 && fight.deadAt === null) { fight.deadAt = F; mark(F, 'dead'); trailerSound.emit('kill'); }
  if (fight.deadAt !== null && !fight.sheathed && F > fight.deadAt + 0.9 && combat.armed && !combat.weaponTransition && !combat.attack) { fight.sheathed = true; toggleWeapons(); mark(F, 'sheathe'); }
  window.__fightLog = fight.log;
}
const flat = (a, b) => { const d = P(b.x - a.x, 0, b.z - a.z); return d.lengthSq() > 1e-6 ? d.normalize() : P(0, 0, 1); };
const duelBegin = () => { sky(0.462, 0, 0.35); guards(2); dev.safe = true; };
// the killing blow lands as a white frame that falls away in a quarter second; `F0` is when the shot starts in fight time
const killFlash = F0 => o => { const x = fight.deadAt === null ? -1 : F0 + o - fight.deadAt; return { white: x >= 0 && x < 0.25 ? 0.6 * (1 - x / 0.25) : 0 }; };
const fightA = {
  name: 'fight-wide', dur: 2.2,
  begin() {
    duelBegin();
    player.pos.copy(FA); player.yaw = Math.atan2(guard().root.position.x - FA.x, guard().root.position.z - FA.z);
    Object.assign(fight, { drew: false, last: -9, deadAt: null, sheathed: false, armedAt: null, log: [] });
  },
  frame(u, dt) {
    fightStep(u, dt);
    const g = guard().root.position, n = player.pos, d = flat(n, g), perp = P(-d.z, 0, d.x), m = P((g.x + n.x) / 2, n.y, (g.z + n.z) / 2);
    const k = u / 2.2;
    setCamera(P(m.x + perp.x * lerp(7.5, 6, k), m.y + 2.2, m.z + perp.z * lerp(7.5, 6, k)), P(m.x, m.y + 0.6, m.z), 40);
  },
  fx: killFlash(0),
};
const fightB = {
  name: 'fight-shoulder', dur: 1.4,
  begin() { duelBegin(); },
  frame(u, dt) {
    const F = 2.2 + u;
    fightStep(F, dt);
    const g = guard().root.position, n = player.pos, d = flat(n, g), perp = P(-d.z, 0, d.x), back = lerp(3.5, 2.7, u / 1.4);
    setCamera(P(n.x - d.x * back + perp.x * 2.6, n.y + 1.6, n.z - d.z * back + perp.z * 2.6), P(g.x * 0.65 + n.x * 0.35, n.y + 0.5, g.z * 0.65 + n.z * 0.35), 40);
  },
  fx: killFlash(2.2),
};
const fightC = {
  name: 'fight-orbit', dur: 1.6,
  begin() { duelBegin(); },
  frame(u, dt) {
    const F = 3.6 + u;
    fightStep(F, dt);
    const g = guard().root.position, n = player.pos, m = P(n.x, n.y + 0.65, n.z), k = ease(u / 1.6);
    // Stay on the same side of the action axis as the wide and shoulder shots.
    const az = Math.atan2(g.x - n.x, g.z - n.z) - lerp(1.3, 1.0, k);
    setCamera(P(m.x + Math.sin(az) * 3.8, m.y + lerp(0.5, 1.0, k), m.z + Math.cos(az) * 3.8), m, 40);
  },
  fx: killFlash(3.6),
};

// ============================================================ the whale of mist: the ninja jumps aboard at the pier, and it swims out over the sea of clouds
const BOARD = [5.6, 0.1, 0];   // front of the centre lane, ahead of both crowns
const WHALE0 = 7.0;              // world time at the start of the boarding shot: the whale leaves its pier at 12
let boarding = null;
const heading = pose => Math.atan2(Math.cos(pose.yaw), Math.sin(pose.yaw));   // the whale's travel direction as a player yaw
const onDeck = (dt, along = BOARD[0], speed = 0) => {
  const w = whale.pose, d = carrierPoint(w, along, BOARD[1], BOARD[2]);
  drive({ pos: P(d.x, d.y, d.z), vel: P(Math.cos(w.yaw) * speed, 0, Math.sin(w.yaw) * speed), grounded: true, yaw: heading(w), jumping: false, gliding: false, k: 1 }, dt);
};
const whaleBoard = {
  name: 'whale-board', dur: 2.4,
  clock: o => WHALE0 + o,
  begin() {
    sky(0.462, 0, 0.35); guards(); dev.safe = false; game.gameT = WHALE0;
    const dock = whale.source, w = whalePose(WHALE0, whale.route);
    const near = carrierPoint(w, 0, 0.1, 0);
    const dx = near.x - dock.x, dz = near.z - dock.z, len = Math.hypot(dx, dz);
    const start = P(dock.x - dx / len * 1.2, dock.y, dock.z - dz / len * 1.2);
    const edge = P(dock.x + dx / len * 1.4, dock.y, dock.z + dz / len * 1.4);
    const landingTime = WHALE0 + start.distanceTo(edge) / 5.4 + 1.2;
    const d = carrierPoint(whalePose(landingTime, whale.route), ...BOARD);
    boarding = new Puppet(start, Math.atan2(dx, dz)).add(run(edge, 5.4), jump([d.x, d.y, d.z], 1.2, 2.8, 0));
  },
  frame(u, dt) {
    const s = u <= boarding.length ? body(boarding, u, dt) : (onDeck(dt), { pos: player.pos });
    const cam = carrierPoint(whale.pose, 10, 4, -8);
    setCamera(P(cam.x, cam.y, cam.z), P(s.pos.x, s.pos.y + 0.6, s.pos.z), 45);
  },
};
const whaleRide = {
  name: 'whale-ride', dur: 3,
  clock: o => WHALE0 + whaleBoard.dur + o,
  begin() { sky(0.468, 0, 0.35); guards(); },
  frame(u, dt) {
    onDeck(dt);
    const w = whale.pose, k = u / 3, f = P(Math.cos(w.yaw), 0, Math.sin(w.yaw)), r = P(-f.z, 0, f.x);
    const side = lerp(30, 22, ease(k)), fwd = lerp(16, 6, ease(k)), up = lerp(-5, 0.5, ease(k));
    setCamera(P(w.x - r.x * side + f.x * fwd, w.y + up, w.z - r.z * side + f.z * fwd), P(w.x, w.y - 2.0, w.z), lerp(44, 40, k));
  },
};

// ============================================================ the ascent: one direction, then one unanswered event
let ending = null;
function vista(name, index, dur, tod, start, end, text) {
  return {
    name, dur, actor: false, island: index,
    begin() { sky(tod, 0, 0.2); guards(); },
    frame(u, dt) {
      const is = islands[index], k = ease(u / dur), target = P(is.x, is.y + 2, is.z);
      plant(P(is.cp.x, is.y, is.cp.z), dt); game.trailerFocus = target;
      setCamera(P(is.x + lerp(start[0], end[0], k), is.y + lerp(start[1], end[1], k), is.z + lerp(start[2], end[2], k)), target, 43);
    },
    captions: text ? [caption(0.5, dur - 0.2, text)] : [],
  };
}
const opening = vista('the-light', 0, 3.6, 0.455, [-28, 8, 26], [-17, 4.5, 17], 'Há uma luz acima da névoa.');
opening.fx = o => ({ black: 1 - ease(seg(o, 0, 0.6)) });
const heroReveal = { ...rise, dur: 4.0, island: 0, frame(u, dt) { rise.frame(u + 3.2, dt); } };
const dew = vista('first-discovery', 1, 2.2, 0.455, [-15, 5, 12], [-11, 3.5, 9]);
const ruinsWide = vista('ruins-establish', 3, 1.8, 0.462, [-17, 6, 14], [-14, 5, 12]);
const camp = vista('pause-before-the-voyage', 5, 2.4, 0.465, [14, 5, 16], [11, 4, 13]);
const flightLaunch = {
  name: 'wind-launch', dur: 1.8, island: 3, speed: () => 0.35,
  begin() { sky(0.462, 0, 0.3); guards(); },
  frame(u, dt) {
    const s = body(flight, u, dt);
    setCamera(P(s.pos.x - 5, s.pos.y + 1.7, s.pos.z + 6), P(s.pos.x, s.pos.y + 0.7, s.pos.z), 36);
  },
};
const launchTime = flightLaunch.dur * 0.35;
const flightWide = {
  ...glideShot, name: 'wind-flight', dur: 3.6, island: 3,
  frame(u, dt) { glideShot.frame(u + launchTime, dt); },
  captions: [caption(0.4, 3.3, 'Confie no vento.')],
};
const flightLanding = {
  name: 'wind-landing', dur: 1.6, island: 4,
  begin() { sky(0.462, 0, 0.3); guards(); },
  frame(u, dt) {
    const s = body(flight, launchTime + flightWide.dur + u, dt), c = chase(s, 5.5, 2.6, 2, 1.8);
    setCamera(c.pos, c.look, 41);
  },
};
const opponent = {
  name: 'guard-reveal', dur: 1.8, island: 4,
  begin() { duelBegin(); resetCombat(); guards(2); this.face = guard().root.rotation.y; },
  frame(u, dt) {
    plant(FA, dt);
    // a slow push in on the guard's face, from in front of it (its heading when the shot starts, so a turn cannot whip the camera)
    const g = guard().root.position, f = P(Math.sin(this.face), 0, Math.cos(this.face)), r = P(f.z, 0, -f.x), k = ease(u / 1.8), d = lerp(4.2, 3.2, k);
    setCamera(P(g.x + f.x * d + r.x * 1.2, g.y + 1.0, g.z + f.z * d + r.z * 1.2), P(g.x, g.y + 0.65, g.z), 36);
  },
};
const whaleReveal = {
  name: 'whale-reveal', dur: 3.6, actor: false, island: 5, clock: () => WHALE0,
  begin() { sky(0.465, 0, 0.3); guards(); },
  frame(u, dt) {
    const w = whale.pose, k = ease(u / 3.6), f = P(Math.cos(w.yaw), 0, Math.sin(w.yaw)), r = P(-f.z, 0, f.x);
    plant(P(whale.source.x, whale.source.y, whale.source.z), dt);
    game.trailerFocus = P(w.x, w.y, w.z);
    setCamera(P(w.x - r.x * lerp(32, 28, k) + f.x * 14, w.y - 4, w.z - r.z * lerp(32, 28, k) + f.z * 14), P(w.x, w.y - 2.5, w.z), 44);
  },
  captions: [caption(0.5, 3.4, 'Você não viaja sozinho.')],
};
const whaleClose = {
  name: 'whale-front-deck', dur: 2.8, island: 5,
  clock: o => WHALE0 + whaleBoard.dur + whaleRide.dur + o,
  begin() { sky(0.468, 0, 0.35); guards(); },
  frame(u, dt) {
    onDeck(dt, 5.6);
    const w = whale.pose, k = ease(u / 2.8);
    const cam = carrierPoint(w, lerp(10.4, 9.5, k), 2.0, -3.0);
    // Both trees are behind the subject; this view never looks through either trunk or crown.
    setCamera(P(cam.x, cam.y, cam.z), P(player.pos.x, player.pos.y + 0.65, player.pos.z), 41);
    game.trailerFocus = player.pos.clone();
  },
};
const whaleHorizon = {
  name: 'whale-departure', dur: 2.2, island: 5,
  clock: o => WHALE0 + whaleBoard.dur + whaleRide.dur + whaleClose.dur + o,
  begin() { sky(0.47, 0, 0.35); guards(); },
  frame(u, dt) {
    onDeck(dt, 5.6);
    const w = whale.pose, cam = carrierPoint(w, 16, 6, -22);
    setCamera(P(cam.x, cam.y, cam.z), P(w.x, w.y, w.z), 43);
  },
};
let forestPath, bridgePath;
const forestWalk = {
  name: 'forest-ascent', dur: 2.6, island: 6,
  begin() {
    sky(0.47, 0, 0.35); guards(); const is = islands[6];
    const p = P(is.cp.x, is.y, is.cp.z);
    forestPath = new Puppet(p, -0.85).add(stand(p, -0.85, 2.6));
  },
  frame(u, dt) {
    const s = body(forestPath, u, dt), k = ease(u / 2.6);
    setCamera(P(s.pos.x + lerp(3.4, 2.2, k), s.pos.y + lerp(1.0, 1.5, k), s.pos.z - lerp(4.6, 3.0, k)), P(s.pos.x, s.pos.y + 0.8, s.pos.z), 45);
  },
};
const bridgeCrossing = {
  name: 'bridge-to-the-crown', dur: 3, island: 8, floor: 'wood',
  begin() {
    sky(0.475, 0, 0.4); guards(); updateBridges(8, 5);
    const [a, b] = [crossings[8].steps[1], crossings[8].steps[2]], d = flat(P(a.x, a.y, a.z), P(b.x, b.y, b.z));
    bridgePath = new Puppet([a.x + d.x * 0.8, a.y + 0.06, a.z + d.z * 0.8]).add(run([b.x - d.x * 1, b.y + 0.06, b.z - d.z * 1], 3.8));
  },
  frame(u, dt) {
    const s = body(bridgePath, u, dt), c = chase(s, 5.5, 2.4, 1.2, 3.2);
    setCamera(c.pos, c.look, 43);
  },
};
let finalWalk;
const farolApproach = {
  name: 'farol-approach', dur: 3, island: 10,
  begin() {
    sky(0.48, 0, 0.5); guards();
    const is = islands[10]; finalWalk = new Puppet([is.cp.x, is.y, is.cp.z]).add(run([41.2, is.y, -101.6], 2.4));
  },
  frame(u, dt) {
    const s = body(finalWalk, u, dt), k = ease(u / 3);
    setCamera(P(lerp(30, 32, k), s.pos.y + lerp(2.4, 3.2, k), lerp(-87, -90, k)), P(summit.pos.x, summit.pos.y + 0.4, summit.pos.z), lerp(52, 42, k));
  },
  captions: [caption(0.3, 2.9, 'Mas o que espera lá em cima?')],
};
const shell = {
  name: 'farol-shell', dur: 1.2, island: 10, actor: false,
  begin() { sky(0.48, 0, 0.5); guards(); },
  frame(u, dt) {
    body(finalWalk, 20, dt); game.trailerFocus = summit.pos.clone();
    setCamera(P(summit.pos.x - 5.8, summit.pos.y + 2.1, summit.pos.z + 6), P(summit.pos.x, summit.pos.y + 2.4, summit.pos.z), 40);
  },
};
const disturbance = {
  name: 'ending-interference-glimpse', dur: 0.5, island: 10, actor: false, teaser: true,
  begin() { ending.startCutscene(); ending.seekCutscene(0.59); },
};
const stillness = { name: 'ending-freeze-glimpse', dur: 0.3, actor: false, teaser: true };
const rift = {
  name: 'ending-rift-glimpse', dur: 0.8, actor: false, teaser: true,
  begin() { ending.seekCutscene(18.9); },
};
const silence = {
  name: 'unanswered-cut', dur: 1, card: '<div></div>', actor: false,
  begin() { ending.cutscene.on = false; game.timeScale = 1; },
};
const title = {
  name: 'title', dur: 6, actor: false,
  card: '<div><div class="a" style="text-transform:none;letter-spacing:.1em">Acima da</div><div class="b">Névoa</div><div class="rule"><i></i>◆<i></i></div><div class="s">Siga a luz.</div><div class="s" style="font-size:.62vw;opacity:.6;margin-top:3.4em">Música: Scott Buckley · CC BY 4.0<br>Efeitos: Kenney · CC0</div></div>',
  fx: o => ({ black: 1 - ease(seg(o, 0, 0.8)) + ease(seg(o, 5.2, 6)) }),
};
for (const s of [hop1, hop2, hop3]) s.island = 0;
for (const s of [crumbleA, crumbleB]) s.island = 2;
ruinsShot.island = 3;
for (const s of [fightA, fightB, fightC]) s.island = 4;
whaleBoard.island = whaleRide.island = 5;
const shots = [opening, heroReveal, hop1, hop2, hop3, dew, crumbleA, crumbleB, ruinsWide, ruinsShot,
  flightLaunch, flightWide, flightLanding, opponent, fightA, fightB, fightC, camp,
  whaleReveal, whaleBoard, whaleRide, whaleClose, whaleHorizon, forestWalk, bridgeCrossing,
  farolApproach, shell, disturbance, stillness, rift, silence, title];
const END = sequence(shots);
const journey = {
  dur: END, grade: GRADE, shots,
  async init() { ending = await import('./cutscene.js'); },
  audio(plan) {
    const at = name => plan.find(s => s.name === name).at;
    // Dynamics are the point: sound from frame one, a hard music cut into the action, a lull for the whale, one long
    // build from the forest to the glimpses, silence on black, and a title that resolves softer than the climax.
    const action = at('crumble-front'), voyage = at('pause-before-the-voyage'), whaleAt = at('whale-reveal'), ride = at('whale-ride');
    const reveal = at('guard-reveal'), ascent = at('forest-ascent');
    const glitch = at('ending-interference-glimpse'), hole = at('ending-rift-glimpse'), logo = at('title');
    const fx = (name, t, len, gain, mood) => ({ file:`trailer/audio/${name}`, at:t, to:Math.min(END, t + len), offset:0, gain, fadeIn:0.005, fadeOut:Math.min(0.5, len / 3), mood });
    const rise = Math.max(ascent, glitch - 12);
    return [
      { file:'trailer/audio/synth/wind.wav', at:0, to:action + 0.4, offset:0, gain:0.5, fadeIn:0.15, fadeOut:1.2, mood:'vento de abertura' },
      fx('synth/boom.wav', 0, 4, 0.8, 'abertura'),
      // Awakening from its swell, so the first act climbs into the action
      { file:'trailer/audio/awakening.mp3', at:0.2, to:action, offset:26, gain:0.62, fadeIn:1.2, fadeOut:0.3, mood:'curiosidade' },
      fx('synth/whoosh.wav', action - 0.9, 1.2, 1.2, 'puxada para a ação'),
      fx('synth/boom.wav', action, 3, 0.55, 'entrada da aventura'),
      { file:'trailer/audio/call-to-adventure.mp3', at:action, to:voyage + 1, offset:12, gain:1.05, fadeIn:0.03, fadeOut:1.6, mood:'aventura e coragem' },
      fx('synth/boom.wav', reveal, 2.5, 0.45, 'o guardião'),
      // Horizons lands its swell on the whale
      { file:'trailer/audio/horizons.mp3', at:voyage - 0.4, to:ascent + 0.6, offset:112 - (whaleAt - voyage + 0.4), gain:0.6, fadeIn:1.4, fadeOut:1.2, mood:'encontro e admiração' },
      fx('synth/whale.wav', whaleAt + 0.3, 5, 0.6, 'canto da baleia'),
      fx('synth/whale.wav', ride + 0.6, 5, 0.35, 'canto da baleia, distante'),
      { file:'trailer/audio/synth/wind.wav', at:ride, to:ascent, offset:6, gain:0.3, fadeIn:0.6, fadeOut:0.8, mood:'vento no convés' },
      // the ascent: The Long Dark's build and a riser, both cut dead on the first glimpse
      { file:'trailer/audio/the-long-dark.mp3', at:ascent - 0.3, to:glitch, offset:318, gain:1.15, fadeIn:0.6, fadeOut:0.04, mood:'pressentimento' },
      { file:'trailer/audio/synth/riser.wav', at:rise, to:glitch, offset:12 - (glitch - rise), gain:0.9, fadeIn:0.2, fadeOut:0.02, mood:'tensão' },
      fx('synth/boom.wav', glitch, 2.4, 1.1, 'interferência'),
      fx('kenney-impact/Audio/impactMetal_heavy_000.ogg', glitch, 0.65, 0.4, 'interferência'),
      fx('synth/hit.wav', hole, 1.2, 0.8, 'o vislumbre'),
      fx('kenney-impact/Audio/impactBell_heavy_000.ogg', hole, 0.8, 0.5, 'o vislumbre'),
      fx('synth/boom.wav', logo + 0.05, 4, 0.5, 'título'),
      // the very end of Horizons is its own cadence: the title resolves instead of peaking
      { file:'trailer/audio/horizons.mp3', at:logo + 0.2, to:END, offset:267, gain:0.42, fadeIn:0.4, fadeOut:1.8, mood:'assinatura' },
    ];
  },
};
export const CLIPS = { scout, journey };
