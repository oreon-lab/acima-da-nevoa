// Plank bridge that assembles itself once the shrine of island `owner` is lit: the planks rise out of the mist one
// after another and lock into place (each becomes walkable as it arrives). Rope posts every few planks.
import * as THREE from 'three';
import { scene } from '../../core.js';
import { rand } from '../../utils.js';
import { bake } from '../geometry.js';
import { addCol } from '../world.js';

const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
const bridges = [];

// from (x, y, z) along `dir` for `len` metres, climbing `rise`; returns the far end
export function addBridge(x, y, z, dir, len, rise, owner) {
  const n = Math.round(len / 0.72), step = len / n, cs = Math.cos(dir), sn = Math.sin(dir), planks = [];
  for (let k = 0; k < n; k++) {
    const f = (k + 0.5) / n, px = x + cs * step * (k + 0.5), pz = z + sn * step * (k + 0.5), py = y + rise * f - Math.sin(f * Math.PI) * 0.35;   // a slight sag
    const g = bake(new THREE.BoxGeometry(0.62, 0.12, 1.7), (cen, nn, c) => c.set('#8a6a48').offsetHSL(0, 0, rand(-0.05, 0.04)));
    const post = k % 4 === 0 || k === n - 1;
    const parts = [g];
    if (post) for (const s of [-1, 1]) parts.push(bake(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 5).translate(0, 0.45, s * 0.85), (cen, nn, c) => c.set('#6b5238')));
    const mesh = new THREE.Group();
    for (const p of parts) mesh.add(new THREE.Mesh(p, woodMat));
    mesh.children.forEach(m => { m.castShadow = true; m.receiveShadow = true; });
    mesh.rotation.y = -dir; mesh.position.set(px, py - 12, pz); mesh.visible = false;
    scene.add(mesh);
    const col = addCol({ x: px, y: py + 0.06, z: pz, rect: [step / 2 + 0.02, 0.85, dir], thick: 0.3, depth: 0.3, surface: 'stone', ground: false, gone: true });
    planks.push({ mesh, col, y: py, t0: k * 0.07, tw: rand(-1, 1) });
  }
  bridges.push({ owner, planks, t: -1 });
  return { x: x + cs * len, y: y + rise, z: z + sn * len };
}

// cp = lit checkpoint; a new journey (cp back below owner) takes the bridge down again
export function updateBridges(cp, dt) {
  for (const b of bridges) {
    if (cp < b.owner) { if (b.t >= 0) { b.t = -1; for (const p of b.planks) { p.mesh.visible = false; p.col.ground = false; p.col.gone = true; } } continue; }
    if (b.t >= 0 && b.t > 4) continue;
    b.t = Math.max(b.t, 0) + dt;
    for (const p of b.planks) {
      const k = Math.min(Math.max((b.t - p.t0) / 0.7, 0), 1), e = 1 - (1 - k) ** 3;
      p.mesh.visible = k > 0;
      p.mesh.position.y = p.y - 12 * (1 - e);
      p.mesh.rotation.z = p.tw * (1 - e) * 2;
      if (k >= 1 && p.col.gone) { p.col.ground = true; p.col.gone = false; }
    }
  }
}
