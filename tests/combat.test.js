import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { installHeadlessPresentation } from './helpers/headless.js';
import { beginAttack, advanceAttack, inSwordReach, combat, ATTACK_RATE } from '../src/game/combatRules.js';

installHeadlessPresentation();
const { prepareCharacter, swordGroups } = await import('../src/game/characterAsset.js');
const { buildLevel } = await import('../src/procedural/level.js');
const { player, attachCharacter, updatePlayer, updateAnim, requestAttack, toggleWeapons, receiveHit, hooks, fade, spawnAt } = await import('../src/game/player.js');
const { buildCombat, enemies, swordStrike, updateCombat, resetCombat, respawnCombat } = await import('../src/game/combat.js');
const { game, keys } = await import('../src/core.js');
const bytes = fs.readFileSync(new URL('../assets/ninja.glb', import.meta.url));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const model = prepareCharacter(gltf.scene, gltf.animations);

function tipPosition(sword) {
  const origin = sword.getWorldPosition(new THREE.Vector3());
  let distance = 0, tip;
  sword.traverse(o => {
    if (!o.isMesh) return;
    const attr = o.geometry.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(o.matrixWorld);
      if (v.distanceTo(origin) > distance) { distance = v.distanceTo(origin); tip = v; }
    }
  });
  return tip;
}

function tipDirection(sword) {
  return tipPosition(sword).sub(sword.getWorldPosition(new THREE.Vector3())).normalize();
}

test('exported ninja has game scale, forward swords, matching grips and all gameplay clips', () => {
  const bounds = new THREE.Box3().setFromObject(model.getObjectByName('Ninja_Blob001'));
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - 1.05) < 1e-5);
  assert.ok(Math.abs(bounds.min.y) < 1e-5);
  for (const name of ['Idle', 'Idle_Attack', 'Attack', 'Draw', 'Sheathe', 'Walk', 'Jump', 'HitRecieve']) assert.ok(gltf.animations.some(c => c.name.endsWith('|' + name)));
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(gltf.animations.find(c => c.name.endsWith('|Idle_Attack'))).play();
  mixer.update(1 / 30); model.updateMatrixWorld(true);
  const swords = swordGroups(model);
  assert.equal(swords.length, 2);
  assert.deepEqual(swords.map(s => s.parent.name), ['SwordR', 'SwordL']);
  for (const sword of swords) {
    const direction = tipDirection(sword);
    assert.ok(direction.z > 0.99, `Sword must face +Z: ${direction.toArray()}`);
    assert.ok(Math.abs(direction.x) < 0.01);
  }
  assert.ok(Math.abs(swords[0].getWorldPosition(new THREE.Vector3()).y - swords[1].getWorldPosition(new THREE.Vector3()).y) < 1e-5);
  mixer.stopAllAction();
});

test('fast inward cuts contact the centre in front of the ninja and return to guard', () => {
  const clip = gltf.animations.find(c => c.name.endsWith('|Attack'));
  assert.ok(clip.duration / ATTACK_RATE < 0.75, 'The full double attack should take about 0.7 seconds');
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce); action.clampWhenFinished = true; action.play();
  for (const [frame, name, inwardSign] of [[9, 'Espada1', -1], [16, 'Espada2', 1]]) {
    mixer.setTime(frame / 30); model.updateMatrixWorld(true);
    const sword = model.getObjectByName(name), tip = tipPosition(sword), direction = tipDirection(sword);
    assert.ok(direction.x * inwardSign > 0.3, `${name} must sweep inward`);
    assert.ok(Math.abs(tip.x) < 0.15, `${name} must hit the centre, received ${tip.x}`);
    assert.ok(tip.z > 1.5, 'Contact must be in front of the face');
    assert.ok(tip.y > 0.35 && tip.y < 0.65, 'Contact should be at the middle of the target');
  }
  mixer.setTime(clip.duration); model.updateMatrixWorld(true);
  for (const sword of swordGroups(model)) assert.ok(tipDirection(sword).z > 0.99);
  mixer.stopAllAction();
});

test('melee hits only targets in front and at the same height', () => {
  const p = { x: 0, y: 0, z: 0 };
  assert.equal(inSwordReach(p, 0, { x: 0, y: 0, z: 1.5 }), true);
  assert.equal(inSwordReach(p, 0, { x: 0, y: 0, z: -1 }), false);
  assert.equal(inSwordReach(p, 0, { x: 2, y: 0, z: 0.5 }), false);
  assert.equal(inSwordReach(p, 0, { x: 0, y: 2, z: 1 }), false);
  assert.equal(inSwordReach(p, Math.PI / 2, { x: 1.5, y: 0, z: 0 }), true);
});

test('sheathed swords cross behind the head and stay attached during walking and jumping', () => {
  const mixer = new THREE.AnimationMixer(model), head = model.getObjectByName('Head');
  const swords = swordGroups(model);
  const relative = () => swords.map(s => head.matrixWorld.clone().invert().multiply(s.matrixWorld));
  mixer.clipAction(gltf.animations.find(c => c.name.endsWith('|Idle'))).play();
  mixer.setTime(1 / 30); model.updateMatrixWorld(true);
  const reference = relative();
  for (const sword of swords) {
    const grip = sword.getWorldPosition(new THREE.Vector3()), tip = tipPosition(sword);
    assert.ok(grip.z < -0.35 && tip.z < -0.35, 'Both blade and handle must stay behind the head');
    assert.ok(grip.y > 1.05, 'Handles should show above the head as in the reference');
    assert.ok(grip.x * tip.x < 0, 'The stowed blades must cross');
  }
  mixer.stopAllAction();
  for (const name of ['Walk', 'Jump', 'HitRecieve']) {
    const clip = gltf.animations.find(c => c.name.endsWith('|' + name));
    mixer.clipAction(clip).play();
    for (const fraction of [0.1, 0.4, 0.8]) {
      mixer.setTime(clip.duration * fraction); model.updateMatrixWorld(true);
      relative().forEach((matrix, i) => matrix.elements.forEach((value, j) => assert.ok(Math.abs(value - reference[i].elements[j]) < 1e-4)));
    }
    mixer.stopAllAction();
  }
});

test('draw and sheathe connect back and guard poses without teleporting and keep the blades outside the head', () => {
  const mixer = new THREE.AnimationMixer(model), swords = swordGroups(model);
  function sample(name, time) {
    mixer.stopAllAction();
    const clip = gltf.animations.find(c => c.name.endsWith('|' + name));
    const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce); action.clampWhenFinished = true; action.play();
    mixer.setTime(time ?? clip.duration); model.updateMatrixWorld(true);
    return swords.map(s => s.matrixWorld.clone());
  }
  const compare = (a, b) => a.forEach((matrix, i) => matrix.elements.forEach((v, j) => assert.ok(Math.abs(v - b[i].elements[j]) < 1e-4)));
  compare(sample('Idle', 1 / 30), sample('Draw', 1 / 30));
  compare(sample('Idle_Attack', 1 / 30), sample('Draw'));
  compare(sample('Idle', 1 / 30), sample('Sheathe'));
  compare(sample('Idle_Attack', 1 / 30), sample('Sheathe', 1 / 30));
  const middle = sample('Draw', 10 / 30);
  for (const m of middle) assert.ok(Math.abs(m.elements[12]) > 0.85, 'The swords should go around the sides of the head');
  let previous = null;
  for (let frame = 0; frame <= 84; frame++) {
    const current = sample('Draw', frame / 120).map(m => new THREE.Vector3().setFromMatrixPosition(m));
    if (previous) current.forEach((p, i) => assert.ok(p.distanceTo(previous[i]) < 0.15));
    previous = current;
  }
  mixer.stopAllAction();
});

test('both impacts fire exactly once even when a frame crosses both timing points', () => {
  const state = {};
  beginAttack(state, 1);
  assert.deepEqual(advanceAttack(state, 0.3).strikes, []);
  assert.deepEqual(advanceAttack(state, 0.4).strikes, [0, 1]);
  assert.deepEqual(advanceAttack(state, 0.4), { strikes: [], finished: true });
  assert.deepEqual(advanceAttack(state, 0.4).strikes, []);
});

test('draw-before-attack, armed locomotion, sheath, damage interruption and respawn keep weapon state consistent', () => {
  buildLevel(); attachCharacter(model);
  let received = 0;
  buildCombat(model, () => { received++; receiveHit(); }, () => {});
  assert.equal(enemies.length, 5);
  hooks.strike = swordStrike; hooks.respawn = respawnCombat;
  spawnAt(0); game.state = 'play'; fade.phase = 'none';
  const enemy = enemies[0];
  player.pos.copy(enemy.home); player.pos.z -= 1.25;
  player.yaw = 0; player.vel.set(0, 0, 0); player.grounded = true;
  const tick = n => { for (let i = 0; i < n; i++) { updateAnim(1 / 60); updateCombat(1 / 60, player, 'none'); } };
  assert.equal(combat.armed, false);
  assert.equal(requestAttack(), true);
  assert.equal(combat.weaponTransition.name, 'Draw');
  assert.equal(combat.attack, null);
  tick(12);
  assert.equal(enemy.hp, 3, 'Drawing a sword must not deal damage');
  const drawTime = combat.weaponTransition.time;
  assert.equal(requestAttack(), true);
  assert.equal(combat.weaponTransition.time, drawTime, 'Repeated attack input must not restart the draw');
  tick(24);
  assert.equal(combat.armed, true);
  assert.ok(combat.attack);
  assert.equal(requestAttack(), false);
  tick(42);
  assert.equal(enemy.hp, 1);
  assert.equal(combat.attack, null);
  assert.ok(swordGroups(model).every(s => s.visible));
  player.vel.z = 3; tick(12);
  assert.ok(swordGroups(model).every(s => s.visible));
  player.vel.z = 0;
  assert.equal(requestAttack(), true); tick(75);
  assert.equal(enemy.hp, 0); assert.equal(combat.defeated, 1);
  assert.equal(toggleWeapons(), true); assert.equal(combat.weaponTransition.name, 'Sheathe'); tick(40);
  assert.equal(combat.armed, false);
  assert.ok(swordGroups(model).every(s => s.visible));
  resetCombat(); received = 0; combat.invulnerable = 0; tick(200);
  assert.equal(received, 0, 'Sheathed exploration must not trigger enemies');
  assert.ok(swordGroups(model).every(s => s.visible));
  assert.equal(toggleWeapons(), true); tick(8); receiveHit();
  assert.equal(combat.weaponTransition, null); assert.equal(combat.pendingAttack, false);
  tick(30);
  toggleWeapons(); tick(170);
  assert.ok(received > 0, 'An armed nearby guard must deal damage');
  assert.ok(combat.hp < 3);
  spawnAt(0); assert.equal(combat.hp, 3); assert.equal(combat.attack, null);
  assert.equal(combat.armed, false); assert.equal(combat.weaponTransition, null);
});


test('jump and attack work in either order, including drawing in the air and landing mid-combo', () => {
  const originalStrike = hooks.strike;
  let strikes = [];
  hooks.strike = (_player, swing) => strikes.push(swing);
  const tick = n => { for (let i = 0; i < n; i++) { updatePlayer(1 / 60); updateAnim(1 / 60); } };
  try {
    spawnAt(0); game.state = 'play'; fade.phase = 'none'; keys.Space = true;
    combat.armed = true;
    player.jumpBuf = 0.14;
    assert.equal(requestAttack(), true);
    assert.ok(player.jumpBuf > 0, 'Attack input must preserve a simultaneous jump');
    tick(1);
    assert.equal(player.grounded, false);
    assert.ok(player.vel.y > 0);
    assert.ok(combat.attack, 'Takeoff must preserve the attack');
    tick(50);
    assert.deepEqual(strikes, [0, 1]);

    spawnAt(0); fade.phase = 'none'; strikes = [];
    player.jumpBuf = 0.14; tick(1);
    assert.equal(player.grounded, false);
    assert.equal(requestAttack(), true);
    assert.equal(combat.weaponTransition.name, 'Draw');
    tick(35);
    assert.equal(combat.armed, true);
    assert.ok(combat.attack, 'Drawing while airborne must proceed into the requested attack');
    tick(50);
    assert.deepEqual(strikes, [0, 1], 'Landing must not cancel either cut');
    assert.equal(player.grounded, true);

    // A jump during the draw keeps the same animation and queued attack.
    spawnAt(0); fade.phase = 'none'; strikes = [];
    assert.equal(requestAttack(), true);
    player.jumpBuf = 0.14; tick(1);
    assert.equal(player.grounded, false);
    assert.equal(combat.weaponTransition.name, 'Draw');
    assert.equal(combat.pendingAttack, true);
    tick(85);
    assert.deepEqual(strikes, [0, 1]);
  } finally { delete keys.Space; hooks.strike = originalStrike; spawnAt(0); }
});
