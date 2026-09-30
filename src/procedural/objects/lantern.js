// Path lantern: a short stone post with a small roof and a warm glowing window. Lines the long paths on the big
// islands; the bloom makes them read at night.
import * as THREE from 'three';
import { scene, game } from '../../core.js';
import { rnd, rand } from '../../utils.js';
import { bake } from '../geometry.js';
import { addCol, pushGeo } from '../world.js';

const glowGeo = new THREE.BoxGeometry(0.17, 0.2, 0.17);
const glowMat = new THREE.MeshStandardMaterial({ color: '#fff1d8', emissive: '#ffbf6e', emissiveIntensity: 1.8, roughness: 0.4 });
export function updateLanterns() { glowMat.emissiveIntensity = 1.2 + game.restoration * 2.5; }

export function addLantern(x, y, z, pal) {
  const stone = (cen, n, c) => { c.copy(pal.stone).multiplyScalar(rand(0.8, 0.95)); if (n.y > 0.6 && rnd() < 0.45) c.lerp(pal.moss, 0.5); };
  const parts = [
    new THREE.BoxGeometry(0.42, 0.14, 0.42).translate(0, 0.07, 0),
    new THREE.CylinderGeometry(0.08, 0.11, 0.9, 6).translate(0, 0.59, 0),
    new THREE.BoxGeometry(0.34, 0.06, 0.34).translate(0, 1.07, 0),
    new THREE.BoxGeometry(0.34, 0.05, 0.34).translate(0, 1.34, 0),
    new THREE.CylinderGeometry(0.03, 0.3, 0.18, 4).rotateY(Math.PI / 4).translate(0, 1.45, 0),
  ];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(new THREE.BoxGeometry(0.04, 0.26, 0.04).translate(sx * 0.13, 1.2, sz * 0.13));
  const rot = rand(0, Math.PI);
  for (const g of parts) pushGeo(bake(g.rotateY(rot), stone), x, y, z);
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(x, y + 1.2, z); glow.rotation.y = rot;
  scene.add(glow);
  addCol({ x, z, y: y + 1.5, r: 0.25, thick: 1.6, ground: false, depth: 0 });
}
