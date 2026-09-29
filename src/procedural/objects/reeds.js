// Clump of curved reeds, some topped with cattails. Sways with the wind.
import * as THREE from 'three';
import { TAU, rnd, rand } from '../../utils.js';
import { bake } from '../geometry.js';
import { pushGeo } from '../world.js';

export function addReeds(x, y, z, pal) {
  for (let k = 0, n = 5 + (rnd() * 5 | 0); k < n; k++) {
    const h = rand(0.9, 1.8), a = rand(0, TAU), lean = rand(0.05, 0.32);
    const bend = (g, top) => {   // curve the stalk over towards `a`
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const t = Math.max(p.getY(i), 0) / top; p.setX(i, p.getX(i) + Math.cos(a) * lean * t * t); p.setZ(i, p.getZ(i) + Math.sin(a) * lean * t * t); }
      return g;
    };
    const ox = x + rand(-0.35, 0.35), oz = z + rand(-0.35, 0.35), sway = (px, py) => py * 0.16;
    const stalk = bend(new THREE.ConeGeometry(0.024, h, 3, 4, true).translate(0, h / 2, 0), h);
    pushGeo(bake(stalk, (cen, nn, c) => c.copy(pal.moss).offsetHSL(0.02, 0, rand(0, 0.09) + cen.y * 0.03), sway), ox, y, oz);
    if (rnd() < 0.45) {   // cattail
      const head = bend(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 5).translate(0, h * 0.88, 0), h);
      pushGeo(bake(head, (cen, nn, c) => c.set('#6b4a2f').offsetHSL(0, 0, rand(-0.03, 0.03)), sway), ox, y, oz);
    }
  }
}
