// Checkpoint shrine: a stepped stone lantern with a hexagonal roof and a crystal that lights up when reached.
import * as THREE from 'three';
import { scene, camera, game } from '../../core.js';
import { rnd, rand, damp } from '../../utils.js';
import { bake, crystalGeo } from '../geometry.js';
import { addCol, pushGeo, shrines } from '../world.js';
import { sparks, SPARK } from '../../fx/particles.js';
import { makeHalo } from './halo.js';

export const cpLight = new THREE.PointLight('#ffc27a', 0, 10, 1.6);   // follows the active shrine
scene.add(cpLight);

const CRYSTAL_Y = 1.46;

export function addShrine(isl, x, z) {
  const y = isl.y, pal = isl.pal;
  const stoneFn = (cen, n, c) => { c.copy(pal.stone).multiplyScalar(rand(0.82, 0.98)); if ((n.y > 0.6 || cen.y < 0.3) && rnd() < 0.4) c.lerp(pal.moss, 0.55); };
  const darkFn = (cen, n, c) => { stoneFn(cen, n, c); c.multiplyScalar(0.8); };   // roof / bands read a bit darker
  const at = (g, py) => g.translate(0, py, 0);
  const parts = [
    [at(new THREE.BoxGeometry(1.0, 0.16, 1.0), 0.08), stoneFn],
    [at(new THREE.BoxGeometry(0.78, 0.16, 0.78), 0.24), stoneFn],
    [at(new THREE.CylinderGeometry(0.18, 0.24, 0.8, 6), 0.72), stoneFn],                 // pedestal
    [at(new THREE.CylinderGeometry(0.27, 0.27, 0.07, 6), 0.62), darkFn],                 // band
    [at(new THREE.CylinderGeometry(0.4, 0.3, 0.12, 6), 1.18), stoneFn],                  // lantern floor
    [at(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 6), 1.7), stoneFn],                 // lantern ceiling
    [at(new THREE.CylinderGeometry(0.16, 0.6, 0.24, 6), 1.85), darkFn],                  // flared roof
    [at(new THREE.CylinderGeometry(0.04, 0.09, 0.2, 6), 2.07), stoneFn],                 // finial stem
    [at(new THREE.IcosahedronGeometry(0.075, 0), 2.19), stoneFn],                        // finial ball
  ];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push([new THREE.BoxGeometry(0.05, 0.46, 0.05).translate(sx * 0.22, 1.47, sz * 0.22), stoneFn]);
  for (const [g, fn] of parts) pushGeo(bake(g, fn), x, y, z);

  const mat = new THREE.MeshStandardMaterial({ color: '#dfe6f2', emissive: '#8fa6c4', emissiveIntensity: 0.25, roughness: 0.2, flatShading: true });
  const crystal = new THREE.Mesh(crystalGeo(0.1, 0.23), mat);
  crystal.position.set(x, y + CRYSTAL_Y, z);
  const halo = makeHalo(1.6);
  halo.position.copy(crystal.position); halo.visible = false;
  scene.add(crystal, halo);
  addCol({ x, z, y: y + 2.2, r: 0.5, thick: 2.4, ground: false, depth: 0 });
  shrines[isl.idx] = { crystal, mat, halo, baseY: crystal.position.y };
}

// warm up shrine i and move the light to it; returns the crystal position (for effects)
export function lightShrine(i) {
  const s = shrines[i];
  s.mat.color.set('#fff1d8'); s.mat.emissive.set('#ffbf6e');
  cpLight.position.copy(s.crystal.position);
  return s.crystal.position;
}

// back to all unlit (new journey)
export function resetShrines() { for (const s of shrines) { s.mat.color.set('#dfe6f2'); s.mat.emissive.set('#8fa6c4'); } }

let emberT = 0;
export function updateShrines(t, dt, cp, emit) {
  shrines.forEach((s, i) => {
    const on = i <= cp;
    s.crystal.rotation.y = t * 0.9 + i;
    s.crystal.position.y = s.baseY + Math.sin(t * 1.4 + i) * 0.03;   // gentle float
    s.mat.emissiveIntensity = on ? 2.2 + game.restoration * 1.2 + Math.sin(t * 2 + i) * 0.4 : 0.25;
    s.halo.visible = on;
    if (on) { s.halo.quaternion.copy(camera.quaternion); s.halo.scale.setScalar(1.5 + 0.2 * Math.sin(t * 2 + i)); s.halo.position.copy(s.crystal.position); }
  });
  cpLight.intensity = damp(cpLight.intensity, 2.2 + Math.sin(t * 2) * 0.3, 2, dt);
  if (!emit) return;
  emberT += dt;
  if (emberT > 0.18) {   // embers drifting up from the active shrine
    emberT = 0;
    const c = shrines[cp].crystal.position;
    sparks.emit(c.x + rand(-0.3, 0.3), c.y + rand(-0.2, 0.2), c.z + rand(-0.3, 0.3), rand(-0.1, 0.1), rand(0.2, 0.5), rand(-0.1, 0.1), rand(1.5, 2.5), rand(0.04, 0.08), SPARK, 0.8);
  }
}
