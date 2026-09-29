// Roots and vines dangling under an island's rim: curved tendrils that sway more toward the tip,
// some carrying a few leaves.
import * as THREE from 'three';
import { TAU, rnd, rand } from '../../utils.js';
import { bake, jitter, shapeAt } from '../geometry.js';
import { pushGeo } from '../world.js';

export function addRoots(isl) {
  const leafy = isl.pal.t < 0.7;
  for (let k = 0; k < isl.R * 2; k++) {
    const a = rand(0, TAU), rr = isl.R * shapeAt(isl.h, a) * rand(0.72, 0.97), len = rand(0.8, 3.6), thick = rand(0.04, 0.1);
    const g = new THREE.ConeGeometry(thick, len, 5, 6, true);
    g.rotateX(Math.PI); g.translate(0, -len / 2, 0);
    const p = g.attributes.position, bx = rand(-0.5, 0.5), bz = rand(-0.5, 0.5), out = Math.cos(a), outz = Math.sin(a);
    for (let i = 0; i < p.count; i++) {   // S-curve, drifting outwards a little
      const t = -p.getY(i) / len;
      p.setX(i, p.getX(i) + (Math.sin(t * 3.2) * bx * 0.35 + out * t * t * 0.3) * (len / 2));
      p.setZ(i, p.getZ(i) + (Math.sin(t * 3.2 + 1) * bz * 0.35 + outz * t * t * 0.3) * (len / 2));
    }
    const base = rnd() < 0.55 ? isl.pal.bark : isl.pal.moss;
    const ox = isl.x + Math.cos(a) * rr, oy = isl.y - 0.4, oz = isl.z + Math.sin(a) * rr;
    pushGeo(bake(jitter(g, 0.012), (cen, n, c) => c.copy(base).offsetHSL(0, 0, rand(-0.03, 0.03) + cen.y * 0.01)), ox, oy, oz);
    if (leafy && len > 1.6 && rnd() < 0.5) {   // a few leaves along the lower half
      for (let l = 0, m = 2 + (rnd() * 3 | 0); l < m; l++) {
        const t = rand(0.45, 0.95), s = rand(0.07, 0.13);
        const lf = new THREE.OctahedronGeometry(s, 0).scale(1, 0.4, 1.7).rotateY(rand(0, TAU));
        lf.translate(Math.sin(t * 3.2) * bx * 0.35 * (len / 2) + out * t * t * 0.3 * (len / 2) + rand(-0.06, 0.06), -t * len, Math.sin(t * 3.2 + 1) * bz * 0.35 * (len / 2) + outz * t * t * 0.3 * (len / 2));
        pushGeo(bake(lf, (cen, n, c) => c.copy(isl.pal.moss).offsetHSL(rand(-0.02, 0.02), 0.05, rand(0, 0.08)), (px, py) => 0.3), ox, oy, oz);
      }
    }
  }
}
