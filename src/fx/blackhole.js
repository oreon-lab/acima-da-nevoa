// The black hole of the rift cutscene: a pitch-black horizon, a blazing accretion disk that swirls faster towards
// the centre (brighter on the side turning towards you), a photon ring with the disk's light bent over the top and
// bottom, and a flash when it tears open. Screen-space lensing is done in the grade pass (post.js).
import * as THREE from 'three';
import { scene, camera } from '../core.js';
import { NOISE } from '../render/atmosphere.js';

export const hole = { group: new THREE.Group(), pos: new THREE.Vector3(), R: 22, k: 0 };
const U = { uTime: { value: 0 }, uK: { value: 0 } };

const horizon = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshBasicMaterial({ color: '#000000', fog: false }));

const disk = new THREE.Mesh(new THREE.RingGeometry(1.35, 6.5, 192, 12), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: U,
  vertexShader: `varying vec2 vL; varying vec3 vW, vTan;
  void main(){ vL = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
    vTan = normalize(mat3(modelMatrix) * vec3(-position.y, position.x, 0.0)); gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uTime, uK; varying vec2 vL; varying vec3 vW, vTan; ${NOISE}
  void main(){
    float r = length(vL);
    float th = uTime * 2.4 / pow(r, 1.5), c = cos(th), s = sin(th);
    vec2 p = mat2(c, -s, s, c) * vL;                     // inner rings turn much faster: the texture shears into spiral streaks
    float n = fbm(p * 1.3) * 0.6 + fbm(vec2(r * 9.0, 0.0) + p * 3.5) * 0.4;
    float heat = 1.0 - smoothstep(1.4, 6.2, r);
    vec3 col = mix(vec3(0.2, 0.03, 0.36), vec3(0.72, 0.22, 0.95), smoothstep(0.0, 0.55, heat));   // deep purple out, violet, lilac-white in
    col = mix(col, vec3(1.0, 0.86, 1.0), smoothstep(0.72, 1.0, heat));
    float dop = 1.0 + 0.75 * dot(vTan, normalize(cameraPosition - vW));   // the side coming at you burns brighter
    float b = (0.25 + 1.6 * n * n) * smoothstep(1.35, 1.75, r) * (1.0 - smoothstep(4.6, 6.5, r)) * dop;
    float vein = pow(1.0 - abs(fbm(p * 2.2 + vec2(uTime * 0.35, -uTime * 0.2)) * 2.0 - 1.0), 18.0);   // violet energy crackling through it
    float rim = exp(-pow((r - 5.0) / 0.55, 2.0)) * (0.4 + n);
    col = col * b + vec3(0.62, 0.35, 1.0) * (vein * 1.4 * smoothstep(1.4, 2.2, r) * (1.0 - smoothstep(4.8, 6.4, r)) + rim * 0.5);
    gl_FragColor = vec4(col * 1.05 * uK, 1.0);   // kept mostly below the bloom threshold, or the glow floods the horizon
  }`,
}));
disk.rotation.x = -Math.PI / 2 + 0.32;   // tilted towards the world above

// camera-facing: the photon ring, a halo, and the far side of the disk bent up over the top and down under the bottom
const ring = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime, uK; varying vec2 vP; ${NOISE}
  void main(){
    float r = length(vP); vec2 d = vP / max(r, 1e-3);
    float photon = exp(-pow((r - 1.08) / 0.035, 2.0)) * 1.6;
    float glow = exp(-(r - 1.0) * 2.2) * 0.2 * step(1.0, r);
    float ca = cos(uTime * 1.3), sa = sin(uTime * 1.3);
    float n = fbm(mat2(ca, -sa, sa, ca) * vP * 2.5 + uTime * 0.3);
    float crawl = pow(1.0 - abs(fbm(mat2(ca, sa, -sa, ca) * d * 4.0 + vec2(uTime * 0.9, r * 3.0)) * 2.0 - 1.0), 14.0) * exp(-pow((r - 1.14) / 0.13, 2.0));   // energy running along the edge
    float arc = exp(-pow((r - 1.45) / 0.28, 2.0)) * pow(abs(d.y), 1.6) * (d.y > 0.0 ? 1.0 : 0.55) * (0.5 + n);
    vec3 col = vec3(0.92, 0.82, 1.0) * photon + vec3(0.55, 0.22, 1.0) * (glow + arc * 0.8) + vec3(0.75, 0.5, 1.0) * crawl * 2.2;
    gl_FragColor = vec4(col * uK * (1.0 - smoothstep(4.5, 7.0, r)), 1.0);
  }`,
}));

// the tear: a white-hot point that swells and fades as the hole opens
const flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy * 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uA; varying vec2 vP; void main(){ float r = length(vP); gl_FragColor = vec4(vec3(0.9, 0.82, 1.0) * (exp(-r * 5.0) * 4.0 + exp(-r * 1.6)) * uA * (1.0 - smoothstep(0.8, 1.0, r)), 1.0); }`,
}));
flash.renderOrder = 5;

hole.group.add(horizon, disk, ring);
hole.group.visible = flash.visible = false;
hole.group.userData.rift = flash.userData.rift = true;   // never pulled into itself
scene.add(hole.group, flash);

export function placeHole(pos, R) { hole.pos.copy(pos); hole.R = R; hole.group.position.copy(pos); flash.position.copy(pos); }

// age: seconds since the hole began to open (< 0 = not yet)
export function updateHole(age, time) {
  const on = age >= 0;
  hole.group.visible = flash.visible = on;
  if (!on) return;
  const open = 1 - Math.pow(1 - Math.min(age / 2.6, 1), 3);            // ease-out: it unfurls fast, then settles
  hole.k = open;
  U.uTime.value = time; U.uK.value = open;
  horizon.scale.setScalar(hole.R * Math.min(1, Math.max(0, (age - 0.25) / 1.4)) ** 0.5);
  disk.scale.setScalar(hole.R * (0.2 + 0.8 * open));
  ring.scale.setScalar(hole.R * open);
  ring.quaternion.copy(camera.quaternion);
  disk.rotation.z = -time * 0.05;
  const fa = age < 0.35 ? age / 0.35 : Math.max(0, 1 - (age - 0.35) / 0.9);
  flash.material.uniforms.uA.value = fa;
  flash.scale.setScalar(hole.R * (1.5 + age * 7));
  flash.quaternion.copy(camera.quaternion);
}
