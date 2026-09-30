// Pond / lake with real water (the player wades or swims in it; see world.waterFloor): a surface that reflects
// the sky with ripples and sun glints, clear over the muddy shallows and dark where it is deep, rings spreading
// around you while you are in it; a mud bed, stones on the rim and a few lily pads.
import * as THREE from 'three';
import { scene } from '../../core.js';
import { TAU, rnd, rand } from '../../utils.js';
import { pondMaterial } from './water.js';
import { bake } from '../geometry.js';
import { pushGeo, ponds } from '../world.js';
import { addPebble } from './pebble.js';

function lily(x, y, z, pal) {
  const s = rand(0.18, 0.32);
  const g = new THREE.CircleGeometry(s, 8, rand(0, TAU), TAU * 0.88).rotateX(-Math.PI / 2);
  pushGeo(bake(g, (cen, n, c) => c.copy(pal.moss).offsetHSL(0, 0.05, rand(-0.02, 0.06))), x, y, z);
  if (rnd() < 0.4) {   // a pink bloom
    const f = new THREE.OctahedronGeometry(0.07, 0).scale(1, 0.7, 1);
    pushGeo(bake(f, (cen, n, c) => c.set('#f4b6cc').offsetHSL(0, 0, rand(-0.03, 0.05))), x, y + 0.05, z);
  }
}

export { waterWake } from './water.js';
export function addPond(x, y, z, r, pal, depth = 0.5) {
  const mat = pondMaterial(depth, r);
  const water = new THREE.Mesh(new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2), mat);
  water.position.set(x, y + 0.07, z); water.renderOrder = 1;
  ponds.push({ x, y, z, r, depth, col: { water: true, ground: true, surface: 'water', y } });
  scene.add(water);
  const wet = new THREE.Color('#3f3b30'), bed = new THREE.Color('#2a2a22');
  const shore = new THREE.RingGeometry(0.001, r + 0.55, 40, 6).rotateX(-Math.PI / 2);   // wet mud shore and the darker bed under the water
  pushGeo(bake(shore, (cen, n, c) => { const d = Math.hypot(cen.x, cen.z); c.copy(pal.dirt).lerp(wet, THREE.MathUtils.smoothstep(r + 0.2 - d, 0, 0.6)).lerp(bed, THREE.MathUtils.smoothstep(r - d, 0.3, 1.6)).offsetHSL(0, 0, rand(-0.02, 0.02)); }), x, y + 0.03, z);
  for (let k = 0, n = Math.round(r * 5); k < n; k++) {
    const a = rand(0, TAU), rr = r + rand(0.05, 0.5);
    addPebble(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, pal, rand(0.1, 0.26));
  }
  for (let k = 0, n = 4 + (rnd() * 4 | 0); k < n; k++) {
    const a = rand(0, TAU), rr = r * Math.sqrt(rnd()) * 0.8;
    lily(x + Math.cos(a) * rr, y + 0.08, z + Math.sin(a) * rr, pal);
  }
}
