import test from 'node:test';
import assert from 'node:assert/strict';
import { whalePose, carrierPoint, WHALE_PERIOD } from '../src/procedural/whaleRoute.js';
const route = { nx: 1, nz: 0, radius: 20, center: { x: 0, z: 0 }, y: 10 };
test('the whale waits at both piers and completes a continuous forward circuit', () => {
  assert.equal(whalePose(3, route).dock, 'source');
  assert.equal(whalePose(49, route).dock, 'destination');
  assert.equal(whalePose(24, route).dock, null);
  for (const t of [12, 48, 60, WHALE_PERIOD]) {
    const a = whalePose(t - 1e-5, route), b = whalePose(t + 1e-5, route);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-4);
    assert.ok(Math.abs(Math.atan2(Math.sin(a.yaw - b.yaw), Math.cos(a.yaw - b.yaw))) < 1e-4);
  }
  const point = carrierPoint(whalePose(49, route), 3, 1, 0);
  assert.ok(Math.abs(point.x - 20) < 1e-6);
});
