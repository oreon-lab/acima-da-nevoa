// Summit beacon: a large crystal with a bright core, orbiting shards and rings, and a tall light beam
// that can be seen from every island.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
// The lantern ring round the crystal: paper lanterns ride three slowly turning gold rings. While the lighthouse is out
// they drift dark and scattered far around it; as it is restored (game.restoration 0..1) they gather onto the rings
// and light one after another. Someone lit these lanterns so no one would cross the mist alone.
const RINGS = [3.75, 3.5, 3.25], PER = 12, LANTERNS = RINGS.length * PER;
const armillary = RINGS.map(r => new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 96), ringM));
armillary[0].rotation.set(1.2, 0, 0); armillary[1].rotation.set(0.4, 0, 1.1); armillary[2].rotation.set(-0.7, 0, -0.5);
const shadeGeo = new THREE.CylinderGeometry(0.17, 0.15, 0.36, 8).toNonIndexed();   // the glowing paper
const frameGeo = mergeGeometries([   // dark wood: lid with a knob, base, four ribs
  new THREE.CylinderGeometry(0.07, 0.2, 0.09, 8).translate(0, 0.22, 0), new THREE.SphereGeometry(0.035, 6, 4).translate(0, 0.29, 0),
  new THREE.CylinderGeometry(0.19, 0.13, 0.06, 8).translate(0, -0.21, 0),
  ...[0, 1, 2, 3].map(i => new THREE.BoxGeometry(0.022, 0.36, 0.022).translate(0.165, 0, 0).rotateY(i * TAU / 4 + TAU / 16)),
].map(g => (g.index ? g.toNonIndexed() : g)));
const shades = new THREE.InstancedMesh(shadeGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }), LANTERNS);
const frames = new THREE.InstancedMesh(frameGeo, new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.8, flatShading: true }), LANTERNS);
shades.frustumCulled = frames.frustumCulled = false; frames.castShadow = true;
const lantern = Array.from({ length: LANTERNS }, (_, i) => ({
  ring: i % RINGS.length, a: Math.floor(i / RINGS.length) / PER * TAU + (i % RINGS.length) * 0.7,
  order: ((i * 7) % LANTERNS) / LANTERNS,   // when it lights, spread round the rings rather than one ring at a time
  far: new THREE.Vector3(rand(-1, 1), rand(-0.6, 0.8), rand(-1, 1)).normalize().multiplyScalar(rand(6.5, 9)), ph: rand(0, TAU), lit: 0,
}));
const DARK = new THREE.Color('#2b211c'), WARM = new THREE.Color(2.3, 1.25, 0.45), FLARE = new THREE.Color(3, 2.6, 2.2), _c = new THREE.Color();
const dyson = new THREE.Group(); dyson.add(shades, frames, ...armillary);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
// the rings' rotation; the rift cutscene takes hold of it (stops it, then spins it backwards) and makes the lanterns flare
export const dysonSpin = { angle: 0, hold: false, flare: 0 };
export { beam };
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
  // the lanterns: scattered and dark at first, on the rings and lit when the light is back
  const k = game.restoration, close = 1 - (1 - k) * (1 - k);
  dyson.position.copy(summit.pos); dyson.position.y += 0.5;
  if (!dysonSpin.hold) dysonSpin.angle += dt * 0.1;
  const sa = dysonSpin.angle;
  dyson.rotation.y = sa; dyson.rotation.x = 0.35;   // the whole ring set turns slowly
  armillary[0].rotation.z = sa * 2.2; armillary[1].rotation.y = -sa * 1.7; armillary[2].rotation.x = sa * 1.3;
  dyson.updateMatrixWorld();
  _q.copy(dyson.quaternion).invert();   // lanterns hang upright whatever the rings do
  for (let i = 0; i < LANTERNS; i++) {
    const L = lantern[i], ring = armillary[L.ring], r = RINGS[L.ring];
    _p.set(Math.cos(L.a) * r, Math.sin(L.a) * r, 0).applyQuaternion(ring.quaternion);
    _p.lerp(L.far, 1 - close);
    _p.y += Math.sin(t * 0.9 + L.ph) * (0.06 + 0.5 * (1 - close));   // bobbing on the air
    L.lit += ((k > L.order * 0.95 ? 1 : 0) - L.lit) * Math.min(1, dt * 2.5);
    _m.compose(_p, _q, _s.setScalar(0.9 + 0.2 * L.lit)); shades.setMatrixAt(i, _m); frames.setMatrixAt(i, _m);
    const flicker = 0.9 + 0.1 * Math.sin(t * 7 + L.ph * 3) * Math.sin(t * 3.1 + L.ph);
    _c.copy(DARK).lerp(WARM, L.lit * flicker).lerp(FLARE, Math.min(1, dysonSpin.flare)); shades.setColorAt(i, _c);
  }
  shades.instanceMatrix.needsUpdate = frames.instanceMatrix.needsUpdate = shades.instanceColor.needsUpdate = true;
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
