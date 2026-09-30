// Parkour step: 'stone' (chunky rock), 'slab' (thin), 'pillar' (tall ruin column).
// With `motion` it becomes a moving platform (bob / ferry / lift) instead of merged static geometry.
import * as THREE from 'three';
import { scene } from '../../core.js';
import { V3, rnd, rand } from '../../utils.js';
import { worldMat } from '../materials.js';
import { rockMass, shapeH, islandColor, P_STONE, P_SLAB, P_PILLAR } from '../geometry.js';
import { addCol, pushGeo, movers } from '../world.js';
import { grassDisc } from './grass.js';

// sandy, cracked stone: reads as "don't linger"
const crackedFn = pal => (cen, n, c) => {
  c.set('#b8a07c').lerp(pal.stone, 0.3).offsetHSL(0, 0, rand(-0.05, 0.04));
  if (n.y < 0.5 && rnd() < 0.25) c.multiplyScalar(0.7); else if (n.y > 0.6 && rnd() < 0.2) c.multiplyScalar(0.85);
};

export function addPlatform(x, y, z, r, style, pal, motion) {
  let geo, c;
  if (style === 'pillar') {
    const d = rand(2.2, 4), prof = P_PILLAR(d);
    geo = rockMass(r, null, prof, 8, (cen, n, col) => {
      col.copy(pal.stone).multiplyScalar(n.y > 0.6 ? 1.08 : rand(0.84, 0.97));
      if (cen.y > -0.34 && cen.y < -0.24) col.multiplyScalar(0.78);                 // carved groove under the capital
      if (n.y > 0.6 && rnd() < 0.45) col.lerp(pal.moss, 0.7);                        // moss on top
      else if (cen.y > -d * 0.3 && rnd() < 0.22) col.lerp(pal.moss, 0.5);            // moss creeping down the shaft
      if (cen.y < -d * 0.7 && rnd() < 0.5) col.lerp(pal.moss, 0.4);
      if (cen.y < -d) col.copy(pal.rock);
    });
    c = { r, prof, depth: d + 1.5 };
  } else {
    const slab = style === 'slab' || style === 'crumble', d = slab ? rand(1.2, 1.7) : rand(2.2, 3.4);
    const h = shapeH(0.8), prof = (slab ? P_SLAB : P_STONE)(d);
    geo = rockMass(r, h, prof, slab ? 8 : 9, style === 'crumble' ? crackedFn(pal) : islandColor(pal));
    c = { r, h, prof, depth: d };
  }
  c = addCol(Object.assign(c, { x, y, z, surface: style === 'crumble' ? 'sand' : style === 'pillar' || motion ? 'stone' : 'grass' }));
  if (motion) {
    const mesh = new THREE.Mesh(geo, worldMat);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    c.mover = { mesh, motion, base: new V3(x, y, z), delta: new V3() };
    movers.push(c);
  } else {
    pushGeo(geo, x, y, z);
    if (style !== 'pillar') grassDisc(x, y, z, r * 0.8, c.h, Math.round(r * r * 11), pal);
  }
  return c;
}
