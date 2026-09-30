// Summit beacon: a large crystal with a bright core, orbiting shards and rings, and a tall light beam
// that can be seen from every island.
import * as THREE from 'three';
import { scene, camera, U, game } from '../../core.js';
import { TAU, rand, col3 } from '../../utils.js';
import { crystalGeo } from '../geometry.js';
import { summit } from '../world.js';
import { sparks, SPARK } from '../../fx/particles.js';
import { makeHalo } from './halo.js';

const glow = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffcf85', emissiveIntensity: 2.6, roughness: 0.2, flatShading: true });
const bright = new THREE.MeshBasicMaterial({ color: '#fffaf0', fog: false });
const ringM = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

const beacon = new THREE.Group();
const crystal = new THREE.Mesh(crystalGeo(0.42, 1.0), glow);
const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), bright);
const shards = new THREE.Group(), rings = [0.9, 1.35].map((r, i) => new THREE.Mesh(new THREE.TorusGeometry(1.25 + r * 0.35, 0.014, 6, 72), ringM));
for (let i = 0; i < 6; i++) {
  const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0).scale(0.7, 1.4, 0.7), glow), a = i / 6 * TAU;
  s.position.set(Math.cos(a) * 1.5, Math.sin(a * 3) * 0.35, Math.sin(a) * 1.5);
  s.rotation.set(rand(0, 1), rand(0, TAU), rand(0, 1));
  shards.add(s);
}
rings[0].rotation.x = 1.2; rings[1].rotation.set(0.5, 0, 0.9);
// A Dyson sphere around the crystal: hexagonal panels drift in from afar and close into a shell as the lighthouse
// is restored (game.restoration 0..1), inside three slowly turning gold rings.
const PANELS = 84, panelDirs = [];
for (let i = 0; i < PANELS; i++) {   // even spread over the sphere (Fibonacci lattice)
  const y = 1 - (i + 0.5) / PANELS * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
  panelDirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
}
const panelMat = new THREE.MeshStandardMaterial({ color: '#26313c', emissive: '#ffb45a', emissiveIntensity: 0.1, metalness: 0.65, roughness: 0.35, flatShading: true });
const edgeMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const panels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 6), panelMat, PANELS);
const edges = new THREE.InstancedMesh(new THREE.TorusGeometry(0.6, 0.012, 4, 6).rotateX(Math.PI / 2), edgeMat, PANELS);
panels.frustumCulled = edges.frustumCulled = false; panels.castShadow = true;
const armillary = [3.75, 3.5, 3.25].map((r, i) => new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 96), ringM));
armillary[0].rotation.set(1.2, 0, 0); armillary[1].rotation.set(0.4, 0, 1.1); armillary[2].rotation.set(-0.7, 0, -0.5);
const dyson = new THREE.Group(); dyson.add(panels, edges, ...armillary);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), UPV = new THREE.Vector3(0, 1, 0);
const halo = makeHalo(9);
beacon.add(crystal, core, shards, ...rings);
scene.add(beacon, halo, dyson);

const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 440, 24, 1, true).translate(0, 220, 0), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: U.time, uStrength: { value: 0.25 } },
  vertexShader: `varying vec3 vN, vW; varying float vY; void main(){ vY = position.y; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uTime, uStrength; varying vec3 vN, vW; varying float vY;
  void main(){
    vec3 v = normalize(cameraPosition - vW);
    float f = pow(abs(dot(normalize(vN), v)), 2.5);
    float h = (1.0 - smoothstep(0.0, 430.0, vY)) * smoothstep(0.0, 5.0, vY);
    float band = 0.75 + 0.25 * sin(vY * 0.06 - uTime * 1.2);
    gl_FragColor = vec4(${col3('#ffe2b0')}, f * h * band * 0.45 * uStrength);
  }`,
}));
beam.frustumCulled = false;
scene.add(beam);
const wave = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 96), new THREE.MeshBasicMaterial({ color: '#ffe4ae', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
wave.rotation.x = -Math.PI / 2; scene.add(wave);
let waveAge = 0, wasReached = false;

let emberT = 0;
export function updateBeacon(t, dt, emit) {
  const strength = 0.25 + game.restoration * 0.75;
  beam.material.uniforms.uStrength.value = strength;
  glow.emissiveIntensity = 0.8 + game.restoration * 3.4;
  ringM.opacity = 0.08 + game.restoration * 0.65;
  shards.scale.setScalar(0.7 + game.restoration * 0.3);
  if (summit.reached && !wasReached) waveAge = 0;
  wasReached = summit.reached;
  if (summit.reached) waveAge += dt; else waveAge = 0;
  wave.position.set(summit.pos.x, summit.pos.y - 2.75, summit.pos.z);
  wave.scale.setScalar(2 + waveAge * 13);
  wave.material.opacity = summit.reached && waveAge < 6 ? Math.sin(Math.min(waveAge / 6, 1) * Math.PI) * 0.5 : 0;
  beam.position.copy(summit.pos);
  beacon.position.copy(summit.pos); beacon.position.y += Math.sin(t * 0.8) * 0.2;
  crystal.rotation.y = t * 0.4; core.rotation.set(t * 0.9, t * 1.3, 0);
  shards.rotation.y = -t * 0.35;
  rings[0].rotation.z = t * 0.25; rings[1].rotation.z = -t * 0.18;
  // the shell: scattered and far at first, tight and whole when the light is back
  const k = game.restoration, close = 1 - (1 - k) * (1 - k);
  for (let i = 0; i < PANELS; i++) {
    const d = panelDirs[i], loose = 1 - close, ph = i * 1.7;
    const r = THREE.MathUtils.lerp(7.5, 3.4, close) + Math.sin(t * 0.6 + ph) * (0.1 + 0.9 * loose);
    _p.copy(d).multiplyScalar(r); _p.x += Math.sin(t * 0.3 + ph) * loose * 1.2; _p.z += Math.cos(t * 0.27 + ph) * loose * 1.2;
    _q.setFromUnitVectors(UPV, d);
    const s2 = 0.55 + 0.45 * close; _s.set(s2, 1, s2);
    _m.compose(_p, _q, _s); panels.setMatrixAt(i, _m); edges.setMatrixAt(i, _m);
  }
  panels.instanceMatrix.needsUpdate = edges.instanceMatrix.needsUpdate = true;
  panelMat.emissiveIntensity = 0.1 + k * 1.3; edgeMat.opacity = 0.15 + k * 0.6;
  dyson.position.copy(summit.pos); dyson.position.y += 0.5;
  dyson.rotation.y = t * 0.1; dyson.rotation.x = 0.35;   // the whole shell turns slowly
  armillary[0].rotation.z = t * 0.22; armillary[1].rotation.y = -t * 0.17; armillary[2].rotation.x = t * 0.13;
  halo.position.copy(beacon.position); halo.quaternion.copy(camera.quaternion);
  halo.scale.setScalar(4 + game.restoration * 7 + Math.sin(t * 1.1) * 0.5);
  if (!emit) return;
  emberT += dt;
  if (emberT > 0.18) {
    emberT = 0;
    const s = summit.pos;
    sparks.emit(s.x + rand(-1, 1), s.y + rand(-1, 1), s.z + rand(-1, 1), 0, rand(0.3, 0.8), 0, 3, 0.12, SPARK, 0.9);
  }
}
