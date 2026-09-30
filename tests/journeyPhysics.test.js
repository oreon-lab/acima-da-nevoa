import test from 'node:test';
import assert from 'node:assert/strict';
import { installHeadlessPresentation } from './helpers/headless.js';

const storage = installHeadlessPresentation();
const { buildLevel } = await import('../src/procedural/level.js');
const world = await import('../src/procedural/world.js');
const { player, spawnAt, updatePlayer, fade } = await import('../src/game/player.js');
const { setRuinsSolved, ruinsPuzzle, rotateRuinsMirror, animateObjects } = await import('../src/procedural/objects/index.js');
const { save, loadSave, newRun } = await import('../src/game/progress.js');
const { keys, game } = await import('../src/core.js');
const { settings, dev } = await import('../src/config.js');
const { cam } = await import('../src/game/camera.js');
const level = buildLevel();
const { whale } = await import('../src/procedural/objects/whale.js');
const { carrierPoint } = await import('../src/procedural/whaleRoute.js');

function resetAt(cp = 0) {
  for (const k of Object.keys(keys)) delete keys[k];
  Object.assign(dev, { fly: false, safe: false, speed: 1, gravity: 1, jump: 1 });
  player.cp = save.cp = cp; spawnAt(cp); fade.phase = 'none';
  player.coyote = 0.12; player.jumpBuf = 0; player.gliding = false;
  game.wx.rain = 0; game.day = 1;
}
function step() { game.gameT += 1 / 60; world.updateMovers(game.gameT); updatePlayer(1 / 60); }
function aimAt(c) {
  cam.yaw = Math.atan2(player.pos.x - c.x, player.pos.z - c.z);
  keys[settings.binds.forward] = true;
}
function jumpBetween(from, target, owner, fraction = 0.8, wind = false) {
  resetAt(owner); save.glide = owner >= 3;
  const a = Math.atan2(target.z - from.z, target.x - from.x), r = wind ? 0 : world.colR(from, a) * fraction;
  player.pos.set(from.x + Math.cos(a) * r, from.y, from.z + Math.sin(a) * r);
  player.ground = from; player.lastGroundY = from.y;
  if (wind) {
    const u = world.updrafts.find(u => Math.hypot(u.x - from.x, u.z - from.z) < 0.1);
    for (let i = 0; i < 180 && player.pos.y < from.y + u.h - 1; i++) step();
  } else {
    player.vel.set(Math.cos(a) * 5.4, 0, Math.sin(a) * 5.4);
    keys[settings.binds.jump] = true; player.jumpBuf = 0.14;
  }
  for (let i = 0; i < 420; i++) {
    aimAt(target);
    if (wind && player.vel.y < 2.8 && !player.gliding && !player.grounded) {
      keys[settings.binds.jump] = true; player.jumpBuf = 0.14;
    }
    step();
    if (player.grounded && player.ground === target) return true;
    // A vent starts lifting before a conventional landing event; reaching its centre is the success condition.
    if (target.routeKind === 'wind' && world.inside(target, player.pos.x, player.pos.z) && player.pos.y >= target.y && player.pos.y < target.y + 2.5) return true;
    if (fade.phase === 'out' || player.pos.y < target.y - 5) return false;
  }
  return false;
}

test('the generated course has eleven ascending islands, broad practice landings and enough memory rewards', () => {
  assert.equal(world.islands.length, 11);
  assert.equal(world.crossings.length, 10);
  world.islands.slice(1).forEach((is, i) => assert.ok(is.y > world.islands[i].y));
  assert.ok(world.crossings[3].steps.some(c => c.r >= 2.7));
  assert.ok(world.pickups.length >= 24);
  assert.ok(world.crossings.at(-1).steps.every(c => !c.climb));
});

test('a real jump cannot collect the unsolved mirror reward; solving and reloading releases it', () => {
  resetAt(3); setRuinsSolved(false);
  const k = ruinsPuzzle.reward;
  player.pos.set(k.g.position.x, world.islands[3].y, k.g.position.z);
  player.ground = world.islands[3].col;
  keys[settings.binds.jump] = true; player.jumpBuf = 0.14;
  for (let i = 0; i < 80; i++) step();
  assert.equal(k.got, false); assert.equal(k.available, false);
  for (const m of ruinsPuzzle.mirrors) while (m.dir !== m.target) rotateRuinsMirror({ x: m.x, y: m.y, z: m.z });
  assert.equal(ruinsPuzzle.solved, true); assert.equal(k.available, true);
  setRuinsSolved(true);
  assert.equal(k.g.visible, true);
  resetAt(3);
  player.pos.set(k.g.position.x, world.islands[3].y, k.g.position.z);
  keys[settings.binds.jump] = true; player.jumpBuf = 0.14;
  for (let i = 0; i < 80; i++) step();
  assert.equal(k.got, true);
});

test('phase stones stay solid while the player crosses through a day/night change', () => {
  const c = world.crossings[7].steps.find(c => c.phase === 'day');
  game.day = 1; animateObjects(0, 0, 7, false, c);
  assert.equal(c.ground, true);
  game.day = 0; animateObjects(1, 0, 7, false, c);
  assert.equal(c.ground, true);
  animateObjects(2, 0, 7, false, world.islands[0]);
  assert.equal(c.ground, false);
});

test('ordinary main-route jumps are reachable with the actual controller', () => {
  const missed = [];
  for (const crossing of world.crossings) {
    if (crossing.type === 'twin' || crossing.type === 'vents') continue;
    for (let i = 0; i < crossing.steps.length - 1; i++) {
      const from = crossing.steps[i], target = crossing.steps[i + 1];
      if (from.routeKind === 'wind' || from.climb || target.climb || from.mover || target.mover) continue;
      if (crossing.type === 'bridge' && Math.hypot(target.x - from.x, target.z - from.z) > 8) continue;
      const reachable = [0.7, 0.85, 0.93].some(f => jumpBetween(from, target, crossing.owner, f));
      if (!reachable) missed.push(`${crossing.type} ${i}→${i + 1}`);
    }
  }
  assert.deepEqual(missed, []);
});

test('each crossing can be entered from its island and exited onto the next checkpoint', () => {
  const missed = [];
  for (const crossing of world.crossings) {
    const owner = crossing.owner, steps = crossing.steps;
    const enter = [0.88, 0.94, 0.97].some(f => jumpBetween(world.islands[owner].col, steps[0], owner, f));
    const exit = [0.7, 0.85, 0.93].some(f => jumpBetween(steps.at(-1), world.islands[owner + 1].col, owner, f));
    if (!enter || !exit) missed.push(`${crossing.type}: enter ${enter}, exit ${exit}`);
  }
  assert.deepEqual(missed, []);
});

test('bobbing stones can be crossed at different moments of their motion', () => {
  const steps = world.crossings[1].steps;
  for (const time of [0, 1.5, 3]) {
    game.gameT = time; world.updateMovers(time);
    for (let i = 0; i < steps.length - 1; i++) {
      assert.ok([0.7, 0.85, 0.93].some(f => jumpBetween(steps[i], steps[i + 1], 1, f)), `moving ${i} at ${time}`);
    }
  }
});

test('practice and final glides reach their wide landings using real updraft physics', () => {
  for (const owner of [3, 9]) {
    const steps = world.crossings[owner].steps;
    for (let i = 0; i < steps.length - 1; i++) if (steps[i].routeKind === 'wind') {
      assert.ok(jumpBetween(steps[i], steps[i + 1], owner, 0, true), `${owner}: vent ${i} cannot reach its landing`);
    }
  }
});

test('both day and night lanes can be traversed with normal jumps', () => {
  for (const kind of ['day', 'night']) {
    const steps = world.crossings[7].steps;
    const lane = [steps[0], ...steps.filter(c => c.phase === kind), ...steps.slice(-2)];
    game.day = kind === 'day' ? 1 : 0;
    animateObjects(0, 0, 7, false, world.islands[0]);
    for (let i = 0; i < lane.length - 1; i++) {
      assert.ok([0.7, 0.85, 0.93].some(f => jumpBetween(lane[i], lane[i + 1], 7, f)), `${kind}: ${i}`);
    }
  }
});

test('the chain of three updrafts supports a continuous glide to the landing', () => {
  const steps = world.crossings[6].steps, from = steps[1], target = steps[2];
  const vents = world.updrafts.filter(u => u.h === 11 && Math.hypot(u.x - from.x, u.z - from.z) < 30)
    .sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
  assert.equal(vents.length, 3);
  resetAt(6); save.glide = true;
  const a = Math.atan2(vents[0].z - from.z, vents[0].x - from.x), r = world.colR(from, a) * 0.85;
  player.pos.set(from.x + Math.cos(a) * r, from.y, from.z + Math.sin(a) * r);
  player.ground = from; player.lastGroundY = from.y;
  player.vel.set(Math.cos(a) * 5.4, 0, Math.sin(a) * 5.4);
  keys[settings.binds.jump] = true; player.jumpBuf = 0.14;
  let next = 0, landed = false;
  for (let i = 0; i < 1200; i++) {
    const vent = vents[next];
    if (vent && Math.hypot(player.pos.x - vent.x, player.pos.z - vent.z) < vent.r && player.pos.y >= vent.y + vent.h - 1) next++;
    aimAt(vents[next] ?? target);
    if (player.vel.y < 2.8 && !player.gliding && !player.grounded) player.jumpBuf = 0.14;
    step();
    if (player.ground === target) { landed = true; break; }
    if (fade.phase === 'out') break;
  }
  assert.equal(next, 3); assert.equal(landed, true);
});

test('the moss wall can be climbed before the final crossing', () => {
  const wall = world.crossings[5].steps.find(c => c.climb);
  resetAt(5);
  const a = world.islands[5].exit + Math.PI;
  player.pos.set(wall.x + Math.cos(a) * (wall.r + 0.5), wall.y - 5.6, wall.z + Math.sin(a) * (wall.r + 0.5));
  player.grounded = false; player.ground = null;
  let climbed = false;
  for (let i = 0; i < 240; i++) { aimAt(wall); step(); if (player.ground === wall) { climbed = true; break; } }
  assert.equal(climbed, true);
});

test('the restored bridge can be walked from its first stone to its far landing', () => {
  const steps = world.crossings[8].steps, from = steps[1], target = steps[2];
  resetAt(8); animateObjects(0, 5, 8, false, player.pos);
  player.pos.set(from.x, from.y, from.z); player.ground = from; player.lastGroundY = from.y;
  let crossed = false;
  for (let i = 0; i < 320; i++) { aimAt(target); step(); if (player.ground === target) { crossed = true; break; } }
  assert.equal(crossed, true);
});

test('a layout update keeps permanent discoveries and the old record, but starts a compatible run', () => {
  newRun();
  storage.set('nevoa-save', JSON.stringify({ ver: 'old-world', cp: 7, got: [1, 2], runT: 30, best: 320, glide: true, memories: ['spark'], album: ['ninho'], ach: { photo: 1 } }));
  loadSave('new-world', 11, 37);
  assert.equal(save.cp, 0); assert.deepEqual(save.got, []);
  assert.equal(save.best, null); assert.equal(save.records['old-world'], 320);
  assert.equal(save.glide, true); assert.deepEqual(save.memories, ['spark']); assert.deepEqual(save.album, ['ninho']);
  newRun(); assert.deepEqual(save.memories, ['spark']);
});

test('the whale piers, back and sanctuary can be reached with ordinary jumps in both directions', () => {
  game.gameT = 2; world.updateMovers(game.gameT);
  const owner = whale.route.owner;
  assert.equal(owner, 5);
  assert.ok(jumpBetween(world.islands[owner].col, whale.source.col, owner, 0.96), 'island to source pier');
  assert.ok(jumpBetween(whale.source.col, whale.deck, owner, 0.9), 'board from source');
  game.gameT = 49; world.updateMovers(game.gameT);
  assert.ok(jumpBetween(whale.deck, whale.destination.col, owner, 0.9), 'disembark at far pier');
  assert.ok(jumpBetween(whale.destination.col, whale.sanctuary.col, owner, 0.8), 'reach sanctuary');
  assert.ok(jumpBetween(whale.sanctuary.col, whale.destination.col, owner, 0.9), 'return to far pier');
  game.gameT = 50; world.updateMovers(game.gameT);
  assert.ok(jumpBetween(whale.destination.col, whale.deck, owner, 0.9), 'board for return');
  game.gameT = 98; world.updateMovers(game.gameT);
  assert.ok(jumpBetween(whale.deck, whale.source.col, owner, 0.9), 'return to source');
});

test('the rotating whale carries the actual player through its entire circuit without drift or falls', () => {
  game.gameT = 0; world.updateMovers(0); resetAt(whale.route.owner);
  const local = [3, 0.1, 0.5], initial = carrierPoint(whale.pose, ...local);
  player.pos.set(initial.x, initial.y, initial.z); player.ground = whale.deck;
  player.grounded = true; player.vel.set(0, 0, 0); player.lastGroundY = initial.y;
  for (let i = 0; i < 96 * 60; i++) {
    step();
    const expected = carrierPoint(whale.pose, ...local);
    assert.equal(player.ground, whale.deck, `ground at ${game.gameT}`);
    assert.ok(Math.hypot(player.pos.x - expected.x, player.pos.z - expected.z) < 0.02);
    assert.ok(Math.abs(player.pos.y - expected.y) < 0.01);
  }
  assert.ok(save.ach.whale);
});

test('fragments stay attached to the moving back and can be collected during the voyage', () => {
  for (const cargo of whale.cargo) {
    game.gameT = 24; world.updateMovers(game.gameT); resetAt(whale.route.owner);
    cargo.pickup.got = false; cargo.pickup.g.visible = true;
    const point = carrierPoint(whale.pose, cargo.local[0], 0.1, cargo.local[2]);
    player.pos.set(point.x, point.y, point.z); player.ground = whale.deck;
    player.grounded = true; player.vel.set(0, 0, 0); player.lastGroundY = point.y;
    step();
    assert.equal(cargo.pickup.got, true);
    assert.equal(player.ground, whale.deck);
  }
});

test('new whale content preserves the previous journey, fragment IDs and record', () => {
  newRun();
  const ver = level.compatibleVersions[0];
  storage.set('nevoa-save', JSON.stringify({ ver, cp: 7, got: [1, 12, 20], runT: 300, best: 430, glide: true, done: true }));
  loadSave('whale-world', 11, world.pickups.length, -1, level.compatibleVersions);
  assert.equal(save.cp, 7); assert.deepEqual(save.got, [1, 12, 20]);
  assert.equal(save.runT, 300); assert.equal(save.best, 430); assert.equal(save.done, true);
});
