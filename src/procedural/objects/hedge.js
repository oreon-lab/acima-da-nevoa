// Trimmed hedge along an arc of an island: a row of clipped green blocks (lighter on top), each one a low wall
// the player can jump over. Segments too close to a reserved spot (path, spawn, shrine) are skipped.
import * as THREE from 'three';
import { rand } from '../../utils.js';
import { bake, jitter } from '../geometry.js';
import { addCol, pushGeo } from '../world.js';

export function addHedge(isl, a0, a1, f, pal) {
  const step = 1.15 / (isl.R * f), base = pal.bush.clone().offsetHSL(0, 0.03, -0.03);
  for (let a = a0; a <= a1; a += step) {
    const x = isl.x + Math.cos(a) * isl.R * f, z = isl.z + Math.sin(a) * isl.R * f;
    if (isl.occ.some(o => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + 0.7) ** 2)) continue;
    const h = rand(0.68, 0.84), col = base.clone().offsetHSL(rand(-0.01, 0.01), 0, rand(-0.02, 0.03));
    const g = jitter(new THREE.BoxGeometry(1.25, h, 0.72, 2, 1, 1), 0.035).translate(0, h / 2, 0).rotateY(-a + Math.PI / 2);
    pushGeo(bake(g, (cen, n, c) => c.copy(col).offsetHSL(0, 0, n.y * 0.09 - 0.03 + rand(-0.02, 0.02)), (px, py) => Math.max(py - 0.3, 0) * 0.1), x, isl.y, z);
    addCol({ x, z, y: isl.y + h, r: 0.62, thick: h + 0.2, ground: false, depth: 0 });
  }
}
