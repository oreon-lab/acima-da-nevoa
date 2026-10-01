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
// A Dyson sphere around the crystal: hexagonal panels drift in from afar and close into a shell as the lighthouse
// is restored (game.restoration 0..1), inside three slowly turning gold rings.
const PANELS = 84, panelDirs = [];
for (let i = 0; i < PANELS; i++) {   // even spread over the sphere (Fibonacci lattice)
  const y = 1 - (i + 0.5) / PANELS * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
  panelDirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
}
const panelMat = new THREE.MeshStandardMaterial({ color: '#15121f', emissive: '#8f5bff', emissiveIntensity: 0.03, metalness: 0.95, roughness: 0.18, flatShading: true, side: THREE.DoubleSide });
const edgeMat = new THREE.MeshBasicMaterial({ color: '#c3a0ff', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
// A panel is a small black hole caught in a frame: an obsidian hexagon (a Y-shaped strut and hub behind it) holding a
// pitch-black horizon, a thin photon ring, and an accretion disk of violet and gold streaks swirling round it, brighter
// on the side turning towards you. Dark and slow while the lighthouse is out; as it is restored the disks heat up,
// spin faster and the ring flares. Violet studs at the six corners. One matrix per panel, shared.
const R_OUT = 0.62, R_IN = 0.565;
const hexPts = r => Array.from({ length: 6 }, (_, i) => new THREE.Vector2(Math.cos(i * TAU / 6) * r, Math.sin(i * TAU / 6) * r));
const hexShape = (r, hole = 0) => { const s = new THREE.Shape(hexPts(r)); if (hole) s.holes.push(new THREE.Path(hexPts(hole))); return s; };
const frameGeo = (() => {
  const parts = [new THREE.ExtrudeGeometry(hexShape(R_OUT, R_IN), { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 2 })
    .rotateX(-Math.PI / 2).translate(0, -0.025, 0)];
  for (let i = 0; i < 3; i++) {   // the strut behind: three arms from a hub to alternate corners
    const a = i * TAU / 3;
    parts.push(new THREE.BoxGeometry(R_IN, 0.035, 0.05).translate(R_IN / 2, -0.055, 0).rotateY(-a));
  }
  parts.push(new THREE.CylinderGeometry(0.09, 0.12, 0.08, 6).translate(0, -0.07, 0));
  return mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)));
})();
const cellMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide, uniforms: { uSpin: { value: 0 }, uK: { value: 0 }, uFlare: { value: 0 } },
  vertexShader: `varying vec2 vP; varying vec3 vN, vW; varying float vId;
  void main(){ vP = position.xz; mat4 m = modelMatrix * instanceMatrix; vec4 w = m * vec4(position, 1.0); vW = w.xyz;
    vN = normalize(mat3(m) * normal); vId = float(gl_InstanceID); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uSpin, uK, uFlare; varying vec2 vP; varying vec3 vN, vW; varying float vId;
  float h1(float n){ return fract(sin(n * 12.9898 + vId * 7.13) * 43758.5453); }
  void main(){
    vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
    float f = 1.0 - abs(dot(n, v)), d = length(vP) / ${R_IN.toFixed(3)}, a = atan(vP.y, vP.x);
    if (!gl_FrontFacing) {   // the back: brushed obsidian
      gl_FragColor = vec4(vec3(0.05, 0.04, 0.08) * (0.7 + 0.3 * sin(vP.x * 60.0)) + vec3(0.2, 0.1, 0.35) * f * 0.2, 1.0); return;
    }
    float heat = 0.25 + 0.75 * uK + uFlare, spin = uSpin + h1(1.0) * 6.2831;
    // the disk: log-spiral streaks that turn faster towards the middle
    float sw = a + spin / max(d, 0.18) * 0.35 + log(max(d, 0.01)) * 3.0;
    float streak = 0.5 + 0.5 * sin(sw * 5.0 + h1(2.0) * 9.0) * sin(sw * 3.0 - d * 9.0);
    float band = smoothstep(0.24, 0.34, d) * (1.0 - smoothstep(0.78, 0.98, d));
    float dop = 0.65 + 0.55 * sin(a + h1(3.0) * 6.2831);                          // one side burns brighter
    vec3 hot = mix(vec3(0.42, 0.14, 0.85), vec3(1.0, 0.78, 0.45), smoothstep(0.75, 0.3, d));
    vec3 col = vec3(0.012, 0.008, 0.025) + vec3(0.18, 0.1, 0.32) * f * 0.35;      // the obsidian face
    col += hot * band * (0.15 + 0.85 * streak) * dop * heat * 0.9;
    float photon = exp(-pow((d - 0.27) / 0.02, 2.0));                              // the photon ring
    col += vec3(0.95, 0.85, 1.0) * photon * (0.4 + 1.4 * heat);
    col *= smoothstep(0.2, 0.245, d);                                             // the horizon: nothing comes back
    col += vec3(0.55, 0.3, 1.0) * smoothstep(0.86, 1.0, d) * (0.12 + 0.5 * uK + uFlare);   // violet glow at the rim
    gl_FragColor = vec4(col, 1.0);
  }`,
});
const studGeo = (() => {
  const parts = [new THREE.CylinderGeometry(R_OUT * 1.01, R_OUT * 1.01, 0.018, 6, 1, true).rotateY(Math.PI / 6)];   // a thin line of light round the rim
  for (const p of hexPts(R_OUT)) parts.push(new THREE.OctahedronGeometry(0.035, 0).translate(p.x, 0.04, -p.y));
  return mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)));
})();
const panels = new THREE.InstancedMesh(frameGeo, panelMat, PANELS);
const windows = new THREE.InstancedMesh(new THREE.ShapeGeometry(hexShape(R_IN * 1.02)).rotateX(-Math.PI / 2).translate(0, 0.012, 0), cellMat, PANELS);
const edges = new THREE.InstancedMesh(studGeo, edgeMat, PANELS);
panels.frustumCulled = windows.frustumCulled = edges.frustumCulled = false; panels.castShadow = panels.receiveShadow = true;
const armillary = [3.75, 3.5, 3.25].map((r, i) => new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 96), ringM));
armillary[0].rotation.set(1.2, 0, 0); armillary[1].rotation.set(0.4, 0, 1.1); armillary[2].rotation.set(-0.7, 0, -0.5);
const dyson = new THREE.Group(); dyson.add(panels, windows, edges, ...armillary);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), UPV = new THREE.Vector3(0, 1, 0);
// the shell's rotation; the rift cutscene takes hold of it (stops it, then spins it backwards) and makes it flare
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
  // the shell: scattered and far at first, tight and whole when the light is back
  const k = game.restoration, close = 1 - (1 - k) * (1 - k);
  for (let i = 0; i < PANELS; i++) {
    const d = panelDirs[i], loose = 1 - close, ph = i * 1.7;
    const r = THREE.MathUtils.lerp(7.5, 3.4, close) + Math.sin(t * 0.6 + ph) * (0.1 + 0.9 * loose);
    _p.copy(d).multiplyScalar(r); _p.x += Math.sin(t * 0.3 + ph) * loose * 1.2; _p.z += Math.cos(t * 0.27 + ph) * loose * 1.2;
    _q.setFromUnitVectors(UPV, d);
    const s2 = 0.55 + 0.45 * close; _s.set(s2, 1, s2);
    _m.compose(_p, _q, _s); panels.setMatrixAt(i, _m); windows.setMatrixAt(i, _m); edges.setMatrixAt(i, _m);
  }
  panels.instanceMatrix.needsUpdate = windows.instanceMatrix.needsUpdate = edges.instanceMatrix.needsUpdate = true;
  panelMat.emissiveIntensity = 0.03 + k * 0.12 + dysonSpin.flare * 0.8;   // the obsidian only warms up: the light is in the disks
  cellMat.uniforms.uK.value = k; cellMat.uniforms.uFlare.value = dysonSpin.flare;
  cellMat.uniforms.uSpin.value += dt * (0.4 + 1.6 * k + 3 * dysonSpin.flare);   // each little disk turns faster as it heats up
  edgeMat.opacity = Math.min(1, 0.15 + k * 0.6 + dysonSpin.flare);
  dyson.position.copy(summit.pos); dyson.position.y += 0.5;
  if (!dysonSpin.hold) dysonSpin.angle += dt * 0.1;
  const sa = dysonSpin.angle;
  dyson.rotation.y = sa; dyson.rotation.x = 0.35;   // the whole shell turns slowly
  armillary[0].rotation.z = sa * 2.2; armillary[1].rotation.y = -sa * 1.7; armillary[2].rotation.x = sa * 1.3;
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
