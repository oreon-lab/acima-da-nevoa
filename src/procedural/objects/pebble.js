// Small cluster of 1-3 flat stones, moss on top. Decoration only.
import * as THREE from 'three';
import { TAU, rnd, rand } from '../../utils.js';
import { bake, jitter } from '../geometry.js';
import { pushGeo } from '../world.js';

export function addPebble(x, y, z, pal, s0 = rand(0.18, 0.4)) {
  for (let k = 0, n = 1 + (rnd() * 3 | 0); k < n; k++) {
    const s = k ? s0 * rand(0.4, 0.75) : s0, a = rand(0, TAU), d = k ? s0 * rand(1.0, 1.6) : 0;
    const g = jitter(new THREE.DodecahedronGeometry(s, 0), s * 0.2);
    g.scale(rand(0.9, 1.3), rand(0.5, 0.7), rand(0.9, 1.3)); g.rotateY(rand(0, TAU));
    pushGeo(bake(g, (cen, nn, c) => { c.copy(pal.rock).offsetHSL(0, 0, rand(-0.04, 0.05) + nn.y * 0.03); if (nn.y > 0.55 && rnd() < 0.7) c.lerp(pal.moss, 0.5); }),
      x + Math.cos(a) * d, y + s * 0.12, z + Math.sin(a) * d);
  }
}
