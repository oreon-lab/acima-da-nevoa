// Ruin column of height `hh` you can jump onto (returns its collider): square plinth, fluted shaft, and for tall
// ones a capital; the top is broken and slanted, with a fallen drum lying beside it.
import * as THREE from 'three';
import { TAU, rnd, rand } from '../../utils.js';
import { bake, jitter } from '../geometry.js';
import { addCol, pushGeo } from '../world.js';

export function addColumn(x, y, z, pal, hh) {
  const plinth = hh > 0.7 ? 0.18 : 0, capital = hh > 1.5 && rnd() < 0.55;   // a capital means an intact top
  const drums = Math.max(2, Math.round((hh - plinth) / 0.45)), drumH = (hh - plinth) / drums;   // stacked drums
  const stone = (cen, n, c) => {
    c.copy(pal.stone).multiplyScalar(rand(0.88, 1.03) * (Math.floor((cen.y - plinth) / drumH) % 2 ? 0.92 : 1));
    if ((n.y > 0.6 || cen.y < 0.35) && rnd() < 0.55) c.lerp(pal.moss, 0.6);
  };
  // shaft: 10 sides, alternate vertices pushed in -> flutes; slight entasis (thicker mid-way)
  const g = new THREE.CylinderGeometry(0.33, 0.4, hh - plinth, 10, drums);
  const p = g.attributes.position, tilt = capital ? 0 : rand(-0.12, 0.12), ang = rand(0, TAU);
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / (hh - plinth) + 0.5, side = Math.round((Math.atan2(p.getZ(i), p.getX(i)) + Math.PI) / (TAU / 10));
    const seam = t > 0.01 && t < 0.99 && Math.abs(t * drums - Math.round(t * drums)) < 1e-3 ? 0.95 : 1;   // groove between drums
    const k = (side % 2 ? 0.93 : 1) * (1 + 0.05 * Math.sin(t * Math.PI)) * seam;
    let py = p.getY(i);
    if (t > 0.99 && !capital) py += tilt * (p.getX(i) * Math.cos(ang) + p.getZ(i) * Math.sin(ang)) + rand(-0.03, 0.03);   // broken slant
    p.setXYZ(i, p.getX(i) * k, py + (hh - plinth) / 2 + plinth, p.getZ(i) * k);
  }
  pushGeo(bake(jitter(g, 0.008), stone), x, y, z);
  if (plinth) pushGeo(bake(new THREE.BoxGeometry(0.8, plinth, 0.8).translate(0, plinth / 2, 0).rotateY(ang), stone), x, y, z);
  if (capital) {   // two stacked slabs
    for (const [w, hgt, off] of [[0.86, 0.1, 0], [0.7, 0.1, -0.1]]) {
      const cap = new THREE.BoxGeometry(w, hgt, w).translate(0, hh - 0.02 + off, 0).rotateY(ang);
      pushGeo(bake(cap, stone), x, y, z);
    }
  }
  if (hh > 1.2 && rnd() < 0.7) {   // fallen drum
    const a = rand(0, TAU), d = 0.9 + rand(0, 0.3), len = rand(0.35, 0.6);
    const drum = new THREE.CylinderGeometry(0.32, 0.34, len, 10).rotateZ(Math.PI / 2).rotateY(rand(0, TAU)).translate(Math.cos(a) * d, 0.32, Math.sin(a) * d);
    pushGeo(bake(jitter(drum, 0.008), stone), x, y, z);
  }
  return addCol({ x, z, y: y + hh - 0.02, r: 0.37, thick: hh + 0.2, depth: hh });
}
