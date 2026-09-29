// Summit beacon: a large crystal with a bright core, orbiting shards and rings, and a tall light beam
// that can be seen from every island.
import * as THREE from 'three';
import { scene, camera, U } from '../../core.js';
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
const halo = makeHalo(9);
beacon.add(crystal, core, shards, ...rings);
scene.add(beacon, halo);

const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 440, 24, 1, true).translate(0, 220, 0), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: U.time },
  vertexShader: `varying vec3 vN, vW; varying float vY; void main(){ vY = position.y; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uTime; varying vec3 vN, vW; varying float vY;
  void main(){
    vec3 v = normalize(cameraPosition - vW);
    float f = pow(abs(dot(normalize(vN), v)), 2.5);
    float h = (1.0 - smoothstep(0.0, 430.0, vY)) * smoothstep(0.0, 5.0, vY);
    float band = 0.75 + 0.25 * sin(vY * 0.06 - uTime * 1.2);
    gl_FragColor = vec4(${col3('#ffe2b0')}, f * h * band * 0.45);
  }`,
}));
beam.frustumCulled = false;
scene.add(beam);

let emberT = 0;
export function updateBeacon(t, dt, emit) {
  beam.position.copy(summit.pos);
  beacon.position.copy(summit.pos); beacon.position.y += Math.sin(t * 0.8) * 0.2;
  crystal.rotation.y = t * 0.4; core.rotation.set(t * 0.9, t * 1.3, 0);
  shards.rotation.y = -t * 0.35;
  rings[0].rotation.z = t * 0.25; rings[1].rotation.z = -t * 0.18;
  halo.position.copy(beacon.position); halo.quaternion.copy(camera.quaternion);
  halo.scale.setScalar(8 + Math.sin(t * 1.1) * 0.8);
  if (!emit) return;
  emberT += dt;
  if (emberT > 0.18) {
    emberT = 0;
    const s = summit.pos;
    sparks.emit(s.x + rand(-1, 1), s.y + rand(-1, 1), s.z + rand(-1, 1), 0, rand(0.3, 0.8), 0, 3, 0.12, SPARK, 0.9);
  }
}
