// Glowing crystal cluster growing from the ground (blue / violet / teal), with a tinted halo. The emissive
// material lets the bloom pick it up. Solid, so it can't be walked through.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, camera } from '../../core.js';
import { TAU, rnd, rand, pick } from '../../utils.js';
import { crystalGeo } from '../geometry.js';
import { addCol } from '../world.js';
import { makeHalo } from './halo.js';
import { addPebble } from './pebble.js';

const TINTS = ['#7fb4ff', '#b58cff', '#7fe3d0'];
const mats = Object.fromEntries(TINTS.map(c => [c, new THREE.MeshStandardMaterial({ color: '#e9f2ff', emissive: c, emissiveIntensity: 0.95, roughness: 0.15, flatShading: true })]));
const halos = [];

export function addCrystalCluster(x, y, z, s = 1, pal) {
  const tint = pick(TINTS), parts = [];
  let top = 0, reach = 0;
  for (let k = 0, n = 4 + (rnd() * 3 | 0); k < n; k++) {
    const h = rand(0.7, 1.9) * s * (k ? 0.75 : 1.25), r = h * rand(0.13, 0.2);
    const ox = rand(-0.5, 0.5) * s, oz = rand(-0.5, 0.5) * s;
    const g = crystalGeo(r, h).translate(0, h * 0.85, 0).rotateZ(rand(-0.5, 0.5) * (k ? 1 : 0.3)).rotateY(rand(0, TAU)).translate(ox, 0, oz);
    reach = Math.max(reach, Math.hypot(ox, oz) + r * 1.2 + h * 0.25);   // how far the cluster really extends
    g.deleteAttribute('uv');
    parts.push(g);
    top = Math.max(top, h * 1.85);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), mats[tint]);
  mesh.position.set(x, y, z); mesh.castShadow = true;
  const halo = makeHalo(3.4 * s, tint);
  halo.position.set(x, y + top * 0.45, z);
  scene.add(mesh, halo);
  halos.push(halo);
  for (let k = 0; k < 3; k++) { const a = rand(0, TAU); addPebble(x + Math.cos(a) * 0.7 * s, y, z + Math.sin(a) * 0.7 * s, pal, rand(0.1, 0.22)); }
  addCol({ x, z, y: y + top * 0.85, r: reach, thick: top, ground: false, depth: 0 });   // as tall and as wide as the crystals
}

export function updateCrystals() {
  for (const h of halos) h.quaternion.copy(camera.quaternion);
}
