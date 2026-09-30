// Grass blades and flowers: thousands of instances drawn in one call each.
import * as THREE from 'three';
import { scene } from '../../core.js';
import { TAU, rnd, rand, pick } from '../../utils.js';
import { grassMat } from '../materials.js';
import { shapeAt } from '../geometry.js';
import { grassI, flowerI } from '../world.js';

const dummy = new THREE.Object3D();
const DENSITY = 0.42;   // instances per requested count: each one is now a 5-blade clump

export function addFlower(x, y, z, color, h = rand(0.25, 0.42)) {
  dummy.position.set(x, y, z); dummy.rotation.set(0, rand(0, TAU), 0); dummy.scale.set(1, h, 1); dummy.updateMatrix();
  flowerI.push([dummy.matrix.clone(), new THREE.Color(color)]);
}

export function addGrass(x, y, z, pal, hs = 1) {
  dummy.position.set(x, y, z); dummy.rotation.set(0, rand(0, TAU), 0);
  const s = rand(0.8, 1.25);
  dummy.scale.set(s, hs * rand(0.3, 0.52), s); dummy.updateMatrix();
  grassI.push([dummy.matrix.clone(), pal.tip.clone().offsetHSL(rand(-0.02, 0.02), rand(-0.08, 0.04), rand(-0.07, 0.03))]);
  if (rnd() < 0.04) addFlower(x, y, z, pick(pal.flowers));
}

// scatter over an island top, skipping `solid` occupied circles
export function grassDisc(cx, y, cz, R0, h, count, pal, occ = []) {
  for (let i = 0, n = Math.round(count * DENSITY); i < n; i++) {
    const a = rand(0, TAU), r = R0 * shapeAt(h, a) * Math.sqrt(rnd()) * 0.93;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (occ.some(o => o.solid && (o.x - x) ** 2 + (o.z - z) ** 2 < o.r * o.r)) continue;
    const n = Math.sin(x * 0.7) * Math.sin(z * 0.6) + Math.sin(x * 0.23 + z * 0.31);   // clumps
    if (n < -0.8 && rnd() < 0.75) continue;
    addGrass(x, y, z, pal, 1 + n * 0.22);
  }
}

// one instance = a clump of curved blades (dark at the root, light at the tip) leaning outwards
function bladeGeo() {
  const pos = [], idx = [], col = [], BLADES = 5;
  for (let b = 0; b < BLADES; b++) {
    const ang = b / BLADES * TAU + rand(-0.4, 0.4), h = rand(0.65, 1), w = rand(0.045, 0.07), lean = rand(0.15, 0.55);
    const ox = Math.cos(ang) * rand(0.02, 0.09), oz = Math.sin(ang) * rand(0.02, 0.09), ca = Math.cos(ang), sa = Math.sin(ang), base = pos.length / 3;
    const rows = [0, 0.35, 0.7, 1];
    rows.forEach((f, r) => {
      const y = h * f, fwd = lean * h * f * f, half = r === 3 ? 0 : w * (1 - f * 0.75), k = 0.4 + 0.6 * f + rand(-0.04, 0.04);
      for (const sgn of r === 3 ? [0] : [-1, 1]) {   // local frame: x = across the blade, z = lean direction
        pos.push(ox + sgn * half * -sa + fwd * ca, y, oz + sgn * half * ca + fwd * sa);
        col.push(k, k, k);
      }
    });
    for (let r = 0; r < 2; r++) { const i = base + r * 2; idx.push(i, i + 1, i + 3, i, i + 3, i + 2); }
    idx.push(base + 4, base + 5, base + 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// flower = thin stem (own mesh, always green) + a cupped six-petal head with a yellow eye (tinted per instance)
function flowerHeadGeo() {
  const pos = [0, 0.985, 0], col = [1, 0.82, 0.3], idx = [], N = 6;
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU;
    pos.push(Math.cos(a) * 0.05, 1.0, Math.sin(a) * 0.05, Math.cos(a) * 0.115, 1.03, Math.sin(a) * 0.115);
    col.push(1, 1, 1, 1, 1, 1);
  }
  for (let i = 0; i < N; i++) {   // eye ring -> petal tips
    const i0 = 1 + i * 2, j0 = 1 + ((i + 1) % N) * 2;
    idx.push(0, i0, j0, i0, i0 + 1, j0 + 1, i0, j0 + 1, j0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
function stemGeo() {
  const g = new THREE.BufferGeometry(), w = 0.012, pos = [-w, 0, 0, w, 0, 0, -w * 0.7, 0.5, 0.01, w * 0.7, 0.5, 0.01, -w * 0.5, 1, 0.02, w * 0.5, 1, 0.02];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(pos.map(() => 1), 3));
  g.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4]);
  return g;
}

function instanced(geo, list, parent = scene) {
  const m = new THREE.InstancedMesh(geo, grassMat, list.length);
  list.forEach(([mat, c], i) => { m.setMatrixAt(i, mat); m.setColorAt(i, c); });
  m.receiveShadow = true; m.frustumCulled = false;
  parent.add(m);
}

// call once, after every grassDisc()
export function buildVegetation(parent = scene, grasses = grassI, flowers = flowerI) {
  instanced(bladeGeo(), grasses, parent);
  instanced(flowerHeadGeo(), flowers, parent);
  const green = new THREE.Color('#5f8a3c');
  instanced(stemGeo(), flowers.map(([m]) => [m, green]), parent);
}
