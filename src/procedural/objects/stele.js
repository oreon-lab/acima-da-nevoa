// Decorative carved stone: a leaning slab on a plinth with glowing runes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from '../../core.js';
import { rnd, rand } from '../../utils.js';
import { bake, jitter } from '../geometry.js';
import { addCol, pushGeo } from '../world.js';

export function addStele(x, y, z, face, pal) {
  const lean = rand(-0.06, 0.06);
  const stoneFn = (cen, n, c) => { c.copy(pal.stone).multiplyScalar(rand(0.8, 0.95)); if ((n.y > 0.5 || cen.y < 0.35) && rnd() < 0.5) c.lerp(pal.moss, 0.6); };
  const place = g => g.rotateZ(lean).rotateY(-face + Math.PI / 2);
  pushGeo(bake(new THREE.BoxGeometry(1.3, 0.22, 0.75).translate(0, 0.11, 0).rotateY(-face + Math.PI / 2), stoneFn), x, y, z);
  pushGeo(bake(place(jitter(new THREE.BoxGeometry(0.95, 2.0, 0.26, 2, 4, 1), 0.035).translate(0, 1.2, 0)), stoneFn), x, y, z);

  const runes = [];   // five rows of little carved marks on the side facing `face`
  for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) {
    if (rnd() < 0.2) continue;
    const w = rand(0.06, 0.12), h = rand(0.08, 0.16);
    runes.push(new THREE.BoxGeometry(w, h, 0.03).translate(-0.27 + k * 0.18 + rand(-0.02, 0.02), 1.75 - r * 0.26, 0.135));
  }
  const mat = new THREE.MeshStandardMaterial({ color: '#cfe0f2', emissive: '#7fb0e0', emissiveIntensity: 1.2, roughness: 0.4 });
  const m = new THREE.Mesh(place(mergeGeometries(runes)), mat);
  m.position.set(x, y, z);
  scene.add(m);
  addCol({ x, z, y: y + 2.2, r: 0.55, thick: 2.3, ground: false, depth: 0 });
}
