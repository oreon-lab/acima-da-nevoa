// Cluster of leafy blobs (darker underneath) sprinkled with tiny flowers.
import * as THREE from 'three';
import { TAU, rnd, rand, pick } from '../../utils.js';
import { bake, jitter } from '../geometry.js';
import { pushGeo } from '../world.js';

export function addBush(x, y, z, pal) {
  const base = pal.bush.clone().lerp(new THREE.Color(pick(pal.leaf)), 0.3), parts = [];
  for (let k = 0, n = 2 + (rnd() * 2 | 0); k < n; k++) {
    const r = rand(0.28, 0.5) * (k ? 0.8 : 1), a = rand(0, TAU), d = k ? rand(0.25, 0.4) : 0;
    const g = jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.14);
    g.scale(1.1, 0.75, 1.1); g.translate(Math.cos(a) * d, r * 0.4, Math.sin(a) * d);
    const col = base.clone().offsetHSL(rand(-0.015, 0.015), 0, rand(-0.03, 0.03));
    pushGeo(bake(g, (cen, nn, c) => c.copy(col).offsetHSL(0, 0, nn.y * 0.08 - 0.04 + rand(-0.025, 0.025)), (px, py) => Math.max(py, 0) * 0.09), x, y, z);
    parts.push([Math.cos(a) * d, r, Math.sin(a) * d, r]);
  }
  if (rnd() < 0.7) {   // flowers/berries on the crowns
    const c = new THREE.Color(pick(pal.flowers));
    for (const [px, py, pz, r] of parts) for (let f = 0, m = 2 + (rnd() * 3 | 0); f < m; f++) {
      const a = rand(0, TAU), e = rand(0.2, 1.0), s = rand(0.035, 0.06);
      const g = new THREE.OctahedronGeometry(s, 0);
      g.translate(px + Math.cos(a) * r * 0.85 * Math.cos(e), py * 0.65 + r * 0.55 * Math.sin(e), pz + Math.sin(a) * r * 0.85 * Math.cos(e));
      pushGeo(bake(g, (cen, nn, cc) => cc.copy(c).offsetHSL(0, 0, rand(-0.04, 0.04))), x, y, z);
    }
  }
}
