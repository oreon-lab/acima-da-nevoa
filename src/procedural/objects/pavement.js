// Worn flagstone floor filling a circle: jittered tiles of uneven height, some missing, some mossy.
import * as THREE from 'three';
import { rnd, rand } from '../../utils.js';
import { bake } from '../geometry.js';
import { pushGeo } from '../world.js';

export function addPavement(cx, y, cz, r, pal, cell = 0.95) {
  for (let gx = -r; gx <= r; gx += cell) for (let gz = -r; gz <= r; gz += cell) {
    const px = gx + rand(-0.06, 0.06), pz = gz + rand(-0.06, 0.06);
    if (Math.hypot(px, pz) > r - rand(0, 0.5) || rnd() < 0.12) continue;
    const h = rand(0.05, 0.12);
    const g = new THREE.BoxGeometry(cell * rand(0.8, 0.93), h, cell * rand(0.8, 0.93)).rotateY(rand(-0.15, 0.15)).translate(px, h / 2, pz);
    const worn = rand(0.86, 1.05);
    pushGeo(bake(g, (cen, n, c) => { c.copy(pal.stone).multiplyScalar(worn); if (n.y > 0.6 && rnd() < 0.3) c.lerp(pal.moss, 0.45); }), cx, y, cz);
  }
}
