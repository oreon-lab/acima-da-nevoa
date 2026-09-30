import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { installHeadlessPresentation } from './helpers/headless.js';
installHeadlessPresentation();
const { cam, orbitCamera, updateCameraInput, resetCameraMotion, cameraClearance, updateCamera } = await import('../src/game/camera.js');
const { game, camera } = await import('../src/core.js');
const { addCol, buildGrid, islands } = await import('../src/procedural/world.js');
const { enemies, assistAttackYaw } = await import('../src/game/combat.js');

test('mouse look is applied 1:1 at any frame rate, spikes are clamped, and pause clears pending input', () => {
  for (const hz of [30, 60, 144]) {
    resetCameraMotion(); cam.yaw = 0; cam.pitch = 0; game.state = 'play';
    orbitCamera(0.1, 0.05); updateCameraInput(1 / hz);
    assert.ok(Math.abs(cam.yaw - 0.1) < 1e-8 && Math.abs(cam.pitch - 0.05) < 1e-8);
    updateCameraInput(1 / hz);   // nothing left over: no drift after the mouse stops
    assert.ok(Math.abs(cam.yaw - 0.1) < 1e-8);
  }
  resetCameraMotion(); cam.yaw = 0; orbitCamera(50, 0); updateCameraInput(1 / 60);
  assert.ok(cam.yaw <= 0.12 + 1e-8, 'a pointer-lock spike must not whip the camera');
  orbitCamera(0.1, 0); game.state = 'pause'; updateCameraInput(1 / 60);
  const yaw = cam.yaw; game.state = 'play'; updateCameraInput(1 / 60);
  assert.equal(cam.yaw, yaw);
});

test('camera retracts before a thin wall even when its destination is unobstructed', () => {
  addCol({ x: 0, z: 3, y: 3, thick: 3, rect: [2, 0.1, 0] }); buildGrid();
  const origin = new Vector3(0, 1, 0);
  const clearance = cameraClearance(origin, new Vector3(0, 1, 6));
  assert.ok(clearance > 2.4 && clearance < 2.8);
  assert.equal(cameraClearance(origin, new Vector3(6, 1, 0)), 6);
});

test('attack assistance follows a close forward target but rejects rear, distant and elevated targets', () => {
  const player = { pos: new Vector3() };
  const enemy = { hp: 3, root: { position: new Vector3(0.3, 0, 1.5) } };
  enemies.push(enemy);
  assert.ok(Math.abs(assistAttackYaw(player, 0) - Math.atan2(0.3, 1.5)) < 1e-8);
  for (const position of [[0.3, 0, -1.5], [0.3, 0, 4], [0.3, 2, 1.5]]) {
    enemy.root.position.fromArray(position); assert.equal(assistAttackYaw(player, 0), 0);
  }
  enemies.length = 0;
});


test('the camera follows hops smoothly (no mode switch or snap); climbs and long falls still follow', () => {
  islands.push({y:0});
  const player = { pos:new Vector3(50,0,50), lastGroundY:0, grounded:true, cp:0 };
  cam.follow.copy(player.pos);cam.yaw=0;cam.pitch=.36;cam.dist=6.6;cam.blend=1;resetCameraMotion();
  updateCamera(1/60,player);
  player.grounded=false;
  let prev=camera.position.y, peak=0;
  for(let i=0;i<45;i++) {
    player.pos.y=2.1*Math.sin(Math.PI*i/44);
    updateCamera(1/60,player);
    assert.ok(Math.abs(camera.position.y-prev)<.12,'Camera height must change gradually every frame');
    prev=camera.position.y; peak=Math.max(peak,cam.follow.y);
    const screen=player.pos.clone().add(new Vector3(0,.55,0)).project(camera);
    assert.ok(Math.abs(screen.y)<.95,'Player must stay visible throughout the jump');
  }
  assert.ok(peak>0.3,'The camera rises with the jump');
  player.pos.y=8;
  for(let i=0;i<120;i++)updateCamera(1/60,player);
  assert.ok(cam.follow.y>7.9 && cam.follow.y<8.1,'Follow wind-assisted climbs');
  player.pos.y=-6;
  for(let i=0;i<120;i++)updateCamera(1/60,player);
  assert.ok(cam.follow.y< -5,'Follow long falls instead of losing the player');
  player.grounded=true;player.pos.y=1;player.lastGroundY=1;
  for(let i=0;i<120;i++)updateCamera(1/60,player);
  assert.ok(Math.abs(cam.follow.y-1)<.001,'Settle smoothly at the new landing height');
});


test('glide descent follows past takeoff and far below the old checkpoint, including after releasing glide', () => {
  const player={pos:new Vector3(50,12,50),lastGroundY:12,grounded:false,gliding:true,cp:0};
  cam.follow.copy(player.pos);cam.pitch=.36;cam.dist=6.6;cam.blend=1;resetCameraMotion();
  for(let i=0;i<600;i++) {
    player.pos.y-=2.2/60;
    if(i===300)player.gliding=false;
    updateCamera(1/60,player);
    assert.ok(Math.abs(cam.follow.y-player.pos.y)<.4,'Camera must follow every frame of descent');
    const screen=player.pos.clone().add(new Vector3(0,.55,0)).project(camera);
    assert.ok(Math.abs(screen.y)<.9,'Keep the descending player on screen');
  }
  assert.ok(cam.follow.y< -9.5,'Do not freeze at the old checkpoint floor');
  player.grounded=true;player.lastGroundY=player.pos.y;
  for(let i=0;i<120;i++)updateCamera(1/60,player);
  for(let i=0;i<120;i++)updateCamera(1/60,player);
  assert.ok(Math.abs(cam.follow.y-player.pos.y)<.001,'Landing settles the camera on the ground');
});


test('fast freefall keeps the camera close enough to frame the player', () => {
  const player={pos:new Vector3(50,0,50),vel:new Vector3(0,-34,0),lastGroundY:2,grounded:false,gliding:false,cp:0};
  cam.follow.copy(player.pos);resetCameraMotion();
  for(let i=0;i<120;i++) {
    player.pos.y-=34/60;updateCamera(1/60,player);
    assert.ok(cam.follow.y-player.pos.y<1.3,'Fast falls need faster vertical tracking');
    const screen=player.pos.clone().add(new Vector3(0,.55,0)).project(camera);
    assert.ok(Math.abs(screen.y)<.9);
  }
});
