// Summit altar under the beacon crystal; standing on it finishes the game (collider.goal).
// Body is a stepped stone drum with a slightly sunken top; a glowing rune ring pulses on it.
import * as THREE from 'three';
import { scene, U } from '../../core.js';
import { rnd, rand, col3 } from '../../utils.js';
import { rockMass } from '../geometry.js';
import { addCol, pushGeo } from '../world.js';

const ringMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: U.time },
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime; varying vec2 vP;
  void main(){
    float a = atan(vP.y, vP.x), r = length(vP);
    float runes = step(0.0, sin(a * 24.0)) * 0.55 + 0.45;            // notched ring
    float pulse = 0.65 + 0.35 * sin(uTime * 1.3 - r * 3.0);
    gl_FragColor = vec4(${col3('#ffcf85')} * runes * pulse, 0.85);
  }`,
});

export function addAltar(x, y, z, pal) {
  const stone = (cen, n, c) => {
    c.copy(pal.stone).multiplyScalar(n.y > 0.6 ? 1.06 : rand(0.8, 0.92));
    if (cen.y < -0.25 && rnd() < 0.3) c.lerp(pal.moss, 0.5);
  };
  // top at local 0 (= y + 0.45): sunken centre, raised rim, two steps down
  pushGeo(rockMass(2.4, null, [[0, -0.05, 0], [0.62, -0.05, 0], [0.66, 0, 0], [0.94, 0, 0], [0.98, -0.06, 0], [0.98, -0.2, 0], [1.05, -0.24, 0], [1.05, -0.45, 0], [1.02, -0.6, 0], [0, -0.6, 0]], 14, stone), x, y + 0.45, z);
  addCol({ x, z, y: y + 0.45, r: 2.3, thick: 0.9, depth: 1, goal: true });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.55, 48), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.42, z);   // just above the sunken top
  scene.add(ring);
}
