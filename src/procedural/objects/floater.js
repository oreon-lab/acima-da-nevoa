// Small visual-only rock that bobs slowly in the air around the islands; bigger ones grow a crystal cluster.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from '../../core.js';
import { TAU, rand, rnd, pick } from '../../utils.js';
import { worldMat } from '../materials.js';
import { bake, rockMass, shapeH, islandColor, crystalGeo, P_STONE } from '../geometry.js';
import { floaters } from '../world.js';

const CRYSTALS = ['#bfe0f2', '#d6e6f7', '#cfeadf', '#e6d8f2'];

function crystalCluster(r) {
  const parts = [];
  const tint = new THREE.Color(pick(CRYSTALS));
  for (let k = 0, n = 2 + (r > 1.3 ? 2 : 0); k < n; k++) {
    const h = rand(0.25, 0.6) * Math.min(r, 1.6), g = crystalGeo(h * 0.32, h);
    g.translate(0, h * 0.8, 0);
    g.rotateZ(rand(-0.4, 0.4)); g.rotateY(rand(0, TAU));
    g.translate(rand(-0.35, 0.35) * r, 0, rand(-0.35, 0.35) * r);
    parts.push(bake(g, (cen, n2, c) => c.copy(tint).multiplyScalar(0.85 + n2.y * 0.2 + rand(-0.04, 0.04))));
  }
  return parts;
}

export function addFloater(x, y, z, r, pal) {
  let geo = rockMass(r, shapeH(), P_STONE(r * rand(1.5, 2.5)), 9, islandColor(pal));
  if (r > 0.9 && rnd() < 0.6) geo = mergeGeometries([geo, ...crystalCluster(r)]);
  const m = new THREE.Mesh(geo, worldMat);
  m.position.set(x, y, z); m.castShadow = true;
  scene.add(m);
  floaters.push({ m, y, amp: rand(0.25, 0.6), spd: rand(0.25, 0.5), ph: rand(0, TAU), rot: rand(-0.05, 0.05) });
}

export function updateFloaters(t, dt) {
  for (const f of floaters) { f.m.position.y = f.y + Math.sin(t * f.spd + f.ph) * f.amp; f.m.rotation.y += f.rot * dt; }
}
