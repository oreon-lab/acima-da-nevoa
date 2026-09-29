// Collectible light fragment: a faceted crystal with a bright core, three tiny shards orbiting it and a soft halo.
import * as THREE from 'three';
import { scene, camera } from '../../core.js';
import { TAU, rand } from '../../utils.js';
import { crystalGeo } from '../geometry.js';
import { pickups } from '../world.js';
import { makeHalo } from './halo.js';

const crystalG = crystalGeo(0.085, 0.21), coreG = new THREE.OctahedronGeometry(0.055, 0), shardG = new THREE.OctahedronGeometry(0.026, 0);
const crystalM = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffcf7a', emissiveIntensity: 1.6, roughness: 0.25, flatShading: true });
const coreM = new THREE.MeshBasicMaterial({ color: '#fffaf0', fog: false });
const shardM = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd58a', emissiveIntensity: 2.6, flatShading: true });

export function addPickup(x, y, z) {
  const g = new THREE.Group(), mesh = new THREE.Mesh(crystalG, crystalM), core = new THREE.Mesh(coreG, coreM), orbit = new THREE.Group(), halo = makeHalo(1.5);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(shardG, shardM), a = i / 3 * TAU;
    s.position.set(Math.cos(a) * 0.3, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.3);
    orbit.add(s);
  }
  orbit.rotation.x = 0.5;
  g.add(mesh, core, orbit, halo); g.position.set(x, y, z);
  scene.add(g);
  pickups.push({ g, mesh, core, orbit, halo, base: y, got: false, anim: 0, ph: rand(0, TAU) });
}

export function updatePickups(t, dt) {
  for (const k of pickups) {
    if (k.got) {   // collected: shrink and float away
      if (k.g.visible) { k.anim += dt * 3; k.g.scale.setScalar(Math.max(0, 1 - k.anim)); k.g.position.y += dt * 2; if (k.anim >= 1) k.g.visible = false; }
      continue;
    }
    k.g.position.y = k.base + Math.sin(t * 1.8 + k.ph) * 0.12;
    k.mesh.rotation.y = t * 1.6 + k.ph;
    k.core.rotation.set(t * 2.1, -t * 1.7, 0);
    k.orbit.rotation.y = t * 1.3 + k.ph;
    k.halo.quaternion.copy(camera.quaternion);
    k.halo.scale.setScalar(1.35 + 0.18 * Math.sin(t * 3 + k.ph));
  }
}
