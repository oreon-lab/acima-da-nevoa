// Life in the air: flocks of small birds circling the islands by day, and pale sky-fish swimming in the mist
// below the islands, breaching now and then (they glow faintly at night). Wing flaps and tail sway are in the
// vertex shader; the paths are simple circles updated on the CPU.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, U, game } from '../core.js';
import { V3, TAU, rand, pick, smoothstep } from '../utils.js';

const dummy = new THREE.Object3D(), ahead = new V3();

// a material that bends vertices by `bend` (glsl, in local space) with a per-instance phase aPhase
function bendMat(params, bend) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aPhase;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${bend}`);
  };
  return m;
}
function instanced(geo, mat, n) {
  const ph = new Float32Array(n).map(() => rand(0, TAU));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false;
  scene.add(m);
  return m;
}

// ------------------------------------------------------------ birds
const birdGeo = new THREE.BufferGeometry();
birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, 0.2, 0.045, 0, -0.1, -0.045, 0, -0.1,           // body
  0, 0, -0.08, 0.07, 0, -0.26, -0.07, 0, -0.26,         // tail
  0, 0, 0.07, -0.34, 0, -0.03, 0, 0, -0.06,             // left wing
  0, 0, 0.07, 0, 0, -0.06, 0.34, 0, -0.03,              // right wing
], 3));
birdGeo.computeVertexNormals();
const birdMat = bendMat({ color: '#3b4049', roughness: 0.9, side: THREE.DoubleSide },
  'transformed.y += abs(position.x) * sin(uTime * 11.0 + aPhase) * 1.3;');
const flocks = [];
let birds = null;

// ------------------------------------------------------------ sky-fish
function fishGeo() {
  const body = new THREE.LatheGeometry([[0, -1.5], [0.2, -1.2], [0.4, -0.5], [0.42, 0.2], [0.3, 0.8], [0.12, 1.25], [0, 1.4]].map(([x, y]) => new THREE.Vector2(x, y)), 9)
    .rotateX(Math.PI / 2).toNonIndexed();
  body.deleteAttribute('uv');
  const fins = new THREE.BufferGeometry();
  fins.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -1.3, 0.8, 0, -2.1, 0, 0, -1.8,   0, 0, -1.3, 0, 0, -1.8, -0.8, 0, -2.1,   // tail flukes
    0.35, 0, 0.4, 1.1, -0.1, -0.2, 0.35, 0, -0.2,   -0.35, 0, 0.4, -0.35, 0, -0.2, -1.1, -0.1, -0.2,   // side fins
  ], 3));
  fins.computeVertexNormals(); body.computeVertexNormals();
  return mergeGeometries([body, fins]);
}
const fishMat = bendMat({ color: '#dfe7ee', emissive: '#9fc4e8', emissiveIntensity: 0.05, roughness: 0.6, flatShading: true, side: THREE.DoubleSide },
  'transformed.x += sin(position.z * 1.3 - uTime * 1.8 + aPhase) * 0.18 * (1.0 - smoothstep(-2.2, 1.0, position.z));');
const swimmers = [];
let fish = null;

export function createFauna(islands) {
  for (let f = 0; f < 7; f++) {
    const is = pick(islands);
    flocks.push({ c: new V3(is.x, is.y + rand(7, 16), is.z), R: rand(10, 22), w: rand(0.12, 0.2) * (rand(0, 1) < 0.5 ? 1 : -1), a0: rand(0, TAU),
      m: Array.from({ length: 7 }, () => ({ off: new V3(rand(-2.5, 2.5), rand(-1, 1), rand(-2.5, 2.5)), ph: rand(0, TAU) })) });
  }
  birds = instanced(birdGeo, birdMat, flocks.length * 7);
  for (let k = 0; k < 9; k++) {
    const is = pick(islands);
    swimmers.push({ cx: is.x, cz: is.z, y: is.y - rand(20, 30), R: rand(18, 45), w: rand(0.05, 0.09) * (rand(0, 1) < 0.5 ? 1 : -1), a0: rand(0, TAU),
      A: rand(4, 8), bw: rand(0.12, 0.2), s: rand(2.5, 4) });
  }
  fish = instanced(fishGeo(), fishMat, swimmers.length);
}

const bpos = (f, b, t, out) => {
  const a = f.a0 + t * f.w;
  return out.set(f.c.x + Math.cos(a) * f.R + b.off.x, f.c.y + b.off.y + Math.sin(t * 0.7 + b.ph) * 0.4, f.c.z + Math.sin(a) * f.R + b.off.z);
};
const fpos = (s, t, out) => {
  const a = s.a0 + t * s.w;
  return out.set(s.cx + Math.cos(a) * s.R, s.y + Math.sin(t * s.bw + s.a0) * s.A, s.cz + Math.sin(a) * s.R);
};

export function updateFauna(t) {
  if (!birds) return;
  const day = smoothstep(game.day, 0.15, 0.45);
  birds.visible = day > 0.01;
  let i = 0;
  if (birds.visible) for (const f of flocks) for (const b of f.m) {
    bpos(f, b, t, dummy.position); bpos(f, b, t + 0.1, ahead);
    dummy.lookAt(ahead); dummy.rotateZ(-Math.sign(f.w) * 0.35);
    dummy.scale.setScalar(day * 1.6);
    dummy.updateMatrix(); birds.setMatrixAt(i++, dummy.matrix);
  }
  birds.instanceMatrix.needsUpdate = true;
  fishMat.emissiveIntensity = 0.05 + 0.6 * U.night.value;
  swimmers.forEach((s, k) => {
    fpos(s, t, dummy.position); fpos(s, t + 0.2, ahead);
    dummy.lookAt(ahead); dummy.scale.setScalar(s.s);
    dummy.updateMatrix(); fish.setMatrixAt(k, dummy.matrix);
  });
  fish.instanceMatrix.needsUpdate = true;
}
