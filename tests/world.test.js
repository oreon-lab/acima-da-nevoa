// node --test : the spatial grid must return every collider a brute-force scan finds, and bad saved settings
// must fall back to defaults.
import test from 'node:test';
import assert from 'node:assert/strict';
import { colliders, addCol, buildGrid, near, colR, inside } from '../src/procedural/world.js';
import { rand } from '../src/utils.js';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const { settings, loadSettings } = await import('../src/config.js');

test('grid finds every collider touching a point', () => {
  for (let i = 0; i < 400; i++) addCol({ x: rand(-200, 200), z: rand(-200, 200), y: rand(0, 50), r: rand(0.3, 12) });
  buildGrid();
  for (let k = 0; k < 3000; k++) {
    const x = rand(-210, 210), z = rand(-210, 210), got = new Set(near(x, z));
    for (const c of colliders) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d <= colR(c, Math.atan2(z - c.z, x - c.x)) + 0.5) assert.ok(got.has(c), `missed collider at ${c.x},${c.z}`);
    }
  }
});

test('invalid saved settings are ignored', () => {
  loadSettings(JSON.stringify({ quality: 7, fog: 'x', fov: NaN, sens: 3, camDist: 5.5, binds: { jump: 'KeyK', left: 5 } }));
  assert.equal(settings.quality, 2);
  assert.equal(settings.fog, 2);
  assert.equal(settings.fov, 60);
  assert.equal(settings.sens, 3);
  assert.equal(settings.camDist, 5.5);
  assert.equal(settings.binds.jump, 'KeyK');
  assert.equal(settings.binds.left, 'KeyA');
  loadSettings('{not json');
});

test('box colliders: inside() follows the rotated rectangle', () => {
  const c = addCol({ x: 10, z: 5, y: 0, rect: [2, 0.5, Math.PI / 6] });
  const pt = (lx, lz) => [10 + lx * Math.cos(Math.PI / 6) - lz * Math.sin(Math.PI / 6), 5 + lx * Math.sin(Math.PI / 6) + lz * Math.cos(Math.PI / 6)];
  assert.ok(inside(c, ...pt(1.9, 0.4)));
  assert.ok(!inside(c, ...pt(2.2, 0)));
  assert.ok(!inside(c, ...pt(0, 0.7)));
  assert.ok(inside(c, ...pt(0, 0.7), 0.25));
  assert.equal(c.rMax, Math.hypot(2, 0.5));
});
