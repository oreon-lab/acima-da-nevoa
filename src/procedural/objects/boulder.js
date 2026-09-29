// Mossy boulder you can jump onto (returns its collider) with a couple of small rocks leaning against it.
import * as THREE from 'three';
import { TAU, rnd, rand } from '../../utils.js';
import { bake, jitter, rockMass, shapeH } from '../geometry.js';
import { addCol, pushGeo } from '../world.js';

export function addBoulder(x, y, z, pal) {
  const r = rand(0.8, 1.2), hh = rand(0.55, 1.05), h = shapeH(0.8);
  const prof = [[0, 0.02, 0], [0.5, 0.02, 0.05], [0.85, -0.03, 0.05], [1, -0.16, 0.05], [1.08, -hh * 0.45, 0.07], [1.0, -hh * 0.8, 0.07], [1.05, -hh - 0.25, 0.08], [0, -hh - 0.5, 0]];
  pushGeo(rockMass(r, h, prof, 10, (cen, n, c) => {
    c.copy(pal.rock).offsetHSL(0, 0, rand(-0.04, 0.04) + (cen.y > -hh * 0.3 ? 0.02 : -0.02));
    if (n.y > 0.55) c.lerp(pal.moss, 0.7);                    // moss cap
    else if (n.y > 0.15 && rnd() < 0.35) c.lerp(pal.moss, 0.35);   // moss on ledges
  }), x, y + hh, z);
  for (let k = 0, m = 1 + (rnd() * 2 | 0); k < m; k++) {   // companions, kept clear of the collider
    const s = rand(0.16, 0.34), a = rand(0, TAU), d = r * 1.35 + s;
    const g = jitter(new THREE.DodecahedronGeometry(s, 0), s * 0.2);
    g.scale(rand(0.9, 1.3), rand(0.6, 0.9), rand(0.9, 1.3)); g.rotateY(rand(0, TAU));
    pushGeo(bake(g, (cen, nn, c) => { c.copy(pal.rock).offsetHSL(0, 0, rand(-0.04, 0.04)); if (nn.y > 0.5) c.lerp(pal.moss, 0.55); }),
      x + Math.cos(a) * d, y + s * 0.2, z + Math.sin(a) * d);
  }
  return addCol({ x, z, y: y + hh, r: r * 0.95, h, thick: hh + 0.4, depth: hh });
}
