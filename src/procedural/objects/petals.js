// Fallen petals scattered on the ground (thousands of tiny flat diamonds merged into the world mesh).
import * as THREE from 'three';
import { TAU, rnd, rand, pick } from '../../utils.js';
import { bake, shapeAt } from '../geometry.js';
import { pushGeo } from '../world.js';

export function addPetals(isl, n, colors) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), r = isl.R * shapeAt(isl.h, a) * Math.sqrt(rnd()) * 0.92;
    const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
    if (isl.occ.some(o => o.solid && (o.x - x) ** 2 + (o.z - z) ** 2 < o.r * o.r)) continue;
    const g = new THREE.CircleGeometry(rand(0.045, 0.075), 4).scale(1, 1.6, 1).rotateX(-Math.PI / 2).rotateY(rand(0, TAU));
    const col = new THREE.Color(pick(colors));
    pushGeo(bake(g, (cen, nn, c) => c.copy(col).offsetHSL(0, 0, rand(-0.03, 0.04))), x, isl.y + 0.03 + rand(0, 0.03), z);
  }
}
