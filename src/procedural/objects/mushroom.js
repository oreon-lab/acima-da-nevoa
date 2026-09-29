// Small cluster of mushrooms: bent stalk, domed cap with a pale underside and spots.
import * as THREE from 'three';
import { TAU, rnd, rand, pick } from '../../utils.js';
import { bake } from '../geometry.js';
import { pushGeo } from '../world.js';

const CAPS = ['#c8462f', '#d98a2e', '#e6dcc4', '#9a72c8', '#d95f7f'];

export function addMushroom(x, y, z, scale = 1) {
  const cap = pick(CAPS);
  for (let k = 0, n = 2 + (rnd() * 4 | 0); k < n; k++) {
    const s = rand(0.55, 1) * scale * (k ? 0.8 : 1.15), a = rand(0, TAU), d = k ? rand(0.12, 0.34) : 0;
    const h = rand(0.16, 0.3) * s * 2, r = rand(0.13, 0.19) * s * 1.6, lean = rand(-0.05, 0.05);
    const ox = x + Math.cos(a) * d, oz = z + Math.sin(a) * d;
    const stalk = new THREE.CylinderGeometry(0.03 * s * 1.6, 0.05 * s * 1.6, h, 6, 2).translate(0, h / 2, 0);
    const p = stalk.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + lean * (p.getY(i) / h) ** 2 * 3);
    pushGeo(bake(stalk, (cen, n2, c) => c.set('#e9e1cf').offsetHSL(0, 0, rand(-0.03, 0.02) - (1 - cen.y / h) * 0.05)), ox, y, oz);
    const dome = new THREE.SphereGeometry(r, 8, 4, 0, TAU, 0, Math.PI / 2).scale(1, 0.62, 1).translate(lean * 3, h, 0);
    const col = new THREE.Color(cap);
    pushGeo(bake(dome, (cen, n2, c) => c.copy(col).offsetHSL(rand(-0.01, 0.01), 0, n2.y * 0.06 - 0.03 + rand(-0.02, 0.02))), ox, y, oz);
    pushGeo(bake(new THREE.CircleGeometry(r * 0.98, 8).rotateX(Math.PI / 2).translate(lean * 3, h - 0.004, 0), (cen, n2, c) => c.set('#d8c9a8')), ox, y, oz);   // gills
    for (let m = 0, sp = 3 + (rnd() * 4 | 0); m < sp; m++) {   // spots on the dome
      const th = rand(0.25, 1.0), ph = rand(0, TAU), q = r * 0.96;
      const g = new THREE.OctahedronGeometry(r * rand(0.1, 0.16), 0).scale(1, 0.4, 1)
        .translate(Math.sin(th) * Math.cos(ph) * q + lean * 3, h + Math.cos(th) * q * 0.62, Math.sin(th) * Math.sin(ph) * q);
      pushGeo(bake(g, (cen, n2, c) => c.set('#f6f0e0')), ox, y, oz);
    }
  }
}
