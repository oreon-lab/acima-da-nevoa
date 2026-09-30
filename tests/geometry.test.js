import test from 'node:test';
import assert from 'node:assert/strict';
import { rockMass, P_ISLAND, P_STONE, P_SLAB, P_PILLAR } from '../src/procedural/geometry.js';

test('rock layers stay below the layers above them at small and large sizes', () => {
  const segs = 12;
  for (const [radius, profile] of [
    [4.2, P_ISLAND(4.0)], [26, P_ISLAND(31)],
    [0.85, P_STONE(1.3)], [1.5, P_SLAB(1.2)], [1.1, P_PILLAR(2.2)],
  ]) {
    for (let trial = 0; trial < 20; trial++) {
      const geo = rockMass(radius, null, profile, segs, (_, __, color) => color.setRGB(1, 1, 1));
      const p = geo.getAttribute('position');
      for (let ring = 1; ring < profile.length - 2; ring++) {
        if (profile[ring + 1][1] >= 0) continue;
        const start = 3 * segs + (ring - 1) * 6 * segs;
        for (let s = 0; s < segs; s++) {
          const i = start + s * 6;
          const upper = Math.min(p.getY(i), p.getY(i + 1), p.getY(i + 3));
          const lower = Math.max(p.getY(i + 2), p.getY(i + 4), p.getY(i + 5));
          assert.ok(upper > lower, `folded layer ${ring} at radius ${radius}`);
        }
      }
      geo.dispose();
    }
  }
});
