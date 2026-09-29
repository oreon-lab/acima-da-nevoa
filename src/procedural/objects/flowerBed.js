// Round garden bed: dark soil mound, ring of edging stones, dense flowers with some greenery.
import * as THREE from 'three';
import { TAU, rnd, rand, pick } from '../../utils.js';
import { bake, jitter } from '../geometry.js';
import { pushGeo } from '../world.js';
import { addFlower, addGrass } from './grass.js';

export function addFlowerBed(x, y, z, r, pal) {
  const soil = new THREE.CylinderGeometry(r, r * 1.06, 0.14, 14, 1).translate(0, 0.07, 0);
  pushGeo(bake(soil, (cen, n, c) => c.set('#4a3a2c').offsetHSL(0, 0, rand(-0.02, 0.03) + n.y * 0.03)), x, y, z);
  for (let k = 0, n = Math.round(r * 10); k < n; k++) {   // edging stones
    const a = k / n * TAU + rand(-0.05, 0.05), s = rand(0.11, 0.17);
    const g = jitter(new THREE.DodecahedronGeometry(s, 0), s * 0.2).scale(1.3, 0.75, 1).rotateY(a);
    pushGeo(bake(g, (cen, nn, c) => c.copy(pal.stone).multiplyScalar(rand(0.85, 1.05))), x + Math.cos(a) * r * 1.04, y + s * 0.35, z + Math.sin(a) * r * 1.04);
  }
  const colors = pal.flowers, tone = pick(colors);   // each bed leans towards one colour
  for (let i = 0, n = Math.round(r * r * 26); i < n; i++) {
    const a = rand(0, TAU), d = r * Math.sqrt(rnd()) * 0.93, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (rnd() < 0.3) addGrass(px, y + 0.13, pz, pal, 0.8);
    else addFlower(px, y + 0.13, pz, rnd() < 0.6 ? tone : pick(colors), rand(0.32, 0.62));
  }
}
