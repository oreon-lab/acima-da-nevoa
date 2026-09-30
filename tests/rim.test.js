// Island rims: collision follows the rock the mesh is built from (widest ring on top, tapering sides), so the
// player neither falls short of the visible edge nor sinks through the rock body beside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installHeadlessPresentation } from './helpers/headless.js';

installHeadlessPresentation();
const { buildLevel } = await import('../src/procedural/level.js');
const world = await import('../src/procedural/world.js');
const { player, spawnAt, updatePlayer, fade } = await import('../src/game/player.js');
const { keys, game } = await import('../src/core.js');
const { settings, dev, PR } = await import('../src/config.js');
const { cam } = await import('../src/game/camera.js');
const { shapeAt, rockEnvelope, rockTwist, P_ISLAND, P_STONE, P_SLAB } = await import('../src/procedural/geometry.js');
buildLevel();

// mean outline of a rock, the shape its mesh is generated from: radius at depth `t` and angle `a`
function rockR(env, R, h, a, t) {
  let f = env[0][1];
  if (t > env[0][0]) {
    f = 0;
    for (let k = 1; k < env.length; k++) {
      const [d0, f0] = env[k - 1], [d1, f1] = env[k];
      if (t <= d1) { f = f0 + (f1 - f0) * (t - d0) / (d1 - d0); break; }
    }
  }
  return f > 0 ? R * shapeAt(h, a + rockTwist(t, R)) * f : 0;
}

function resetAt(i) {
  for (const k of Object.keys(keys)) delete keys[k];
  Object.assign(dev, { fly: false, safe: false, speed: 1, gravity: 1, jump: 1 });
  player.cp = i; spawnAt(i); fade.phase = 'none';
  player.coyote = 0.12; player.jumpBuf = 0; player.gliding = false;
  game.wx.rain = 0; game.day = 1;
}
const step = () => { game.gameT += 1 / 60; world.updateMovers(game.gameT); updatePlayer(1 / 60); };

// walk straight into the rock from just outside it, hovering at each depth (so the side wall is what it meets),
// and report every frame where the player's body ends up inside the visible rock
function sinkFrames(env, R, h, x, y, z, owner, depths, azimuth) {
  const hits = [];
  for (const depth of depths) {
    const visible = rockR(env, R, h, azimuth, depth);
    if (visible < 0.15) continue;                                // below the tip there is nothing to hit
    resetAt(owner);
    dev.gravity = 0;
    player.pos.set(x + Math.cos(azimuth) * (visible + 1.5), y - depth, z + Math.sin(azimuth) * (visible + 1.5));
    player.vel.set(0, 0, 0); player.grounded = false; player.ground = null;
    cam.yaw = Math.atan2(Math.cos(azimuth), Math.sin(azimuth));  // 'forward' walks into the rock
    keys[settings.binds.forward] = true;
    for (let k = 0; k < 180; k++) {
      step();
      const d = Math.hypot(player.pos.x - x, player.pos.z - z);
      const t = Math.max(y - player.pos.y, 0);
      const v = rockR(env, R, h, Math.atan2(player.pos.z - z, player.pos.x - x), t);
      if (v - (d - PR) > 0.05) hits.push(`depth ${t.toFixed(1)}: ${(v - (d - PR)).toFixed(2)} m inside the rock`);
    }
    keys[settings.binds.forward] = false;
  }
  return hits;
}

test('an island body is solid from the rim down to its tip', () => {
  const A = 0.6, A2 = 2.3, hits = [];
  for (const idx of [0, 5, 8, 9]) {
    const isl = world.islands[idx], env = rockEnvelope(P_ISLAND(isl.depth));
    for (const a of [A, A2]) {
      for (const h of sinkFrames(env, isl.R, isl.h, isl.x, isl.y, isl.z, idx, [0.5, 1, 2, 3.5, 5, 8], a))
        hits.push(`island ${idx} (R=${isl.R}) at angle ${a}: ${h}`);
    }
  }
  assert.deepEqual(hits, []);
});

test('walking off an island ends at its rock edge, not before it and not in the air past it', () => {
  const A = 0.6, off = [];
  for (const idx of [0, 8, 9]) {
    const isl = world.islands[idx], env = rockEnvelope(P_ISLAND(isl.depth));
    resetAt(idx);
    player.pos.set(isl.x, isl.y, isl.z); player.vel.set(0, 0, 0); player.grounded = true; player.ground = isl.col;
    cam.yaw = Math.atan2(-Math.cos(A), -Math.sin(A));            // 'forward' walks away from the centre
    keys[settings.binds.forward] = true;
    let fell = null;
    for (let k = 0; k < 60 * 20 && !fell; k++) { step(); if (!player.grounded) fell = player.pos.clone(); }
    keys[settings.binds.forward] = false;
    const d = Math.hypot(fell.x - isl.x, fell.z - isl.z), a = Math.atan2(fell.z - isl.z, fell.x - isl.x);
    const top = rockR(env, isl.R, isl.h, a, 0), rim = isl.R * shapeAt(isl.h, a) * Math.max(...env.map(k => k[1]));
    if (d < top) off.push(`island ${idx}: left the ground at ${d.toFixed(2)}, inside the top face edge ${top.toFixed(2)}`);
    if (d > rim + 0.3) off.push(`island ${idx}: left the ground at ${d.toFixed(2)}, past the rim ${rim.toFixed(2)}`);
  }
  assert.deepEqual(off, []);
});

test('a stone the player jumps between is solid below its top, not just for the first metre', () => {
  const A = 0.3, hits = [];
  // crossing 0 is 'stones' (P_STONE), crossing 2 is 'crumble' (P_SLAB); both keep their rock depth on the collider
  const stones = [[world.crossings[0].steps[2], P_STONE], [world.crossings[0].steps[4], P_STONE], [world.crossings[2].steps[3], P_SLAB]];
  for (const [plat, prof] of stones) {
    const env = rockEnvelope(prof(plat.depth));
    for (const h of sinkFrames(env, plat.r, plat.h, plat.x, plat.y, plat.z, 0, [1.2, 1.8, 2.1], A))
      hits.push(`stone at ${plat.x.toFixed(1)},${plat.z.toFixed(1)}: ${h}`);
  }
  assert.deepEqual(hits, []);
});
