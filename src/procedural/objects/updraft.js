// Wind vent: a rising column of air that lifts whoever stands in it (the lift itself is in player.js, driven by
// world.updrafts). Drawn as a faint striped tube plus motes spiralling upwards, all in shaders.
import * as THREE from 'three';
import { scene, U } from '../../core.js';
import { TAU, rnd, rand } from '../../utils.js';
import { updrafts } from '../world.js';

const tubeMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: U.time, uH: { value: 9 } },
  vertexShader: `varying float vY; varying float vA; void main(){ vY = position.y; vA = atan(position.z, position.x); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime, uH; varying float vY; varying float vA;
  void main(){
    float band = 0.5 + 0.5 * sin(vY * 2.4 - uTime * 5.0 + vA * 3.0);
    float fade = smoothstep(0.0, 1.2, vY) * (1.0 - smoothstep(uH - 2.5, uH, vY));
    gl_FragColor = vec4(0.85, 0.95, 1.0, 0.15 * band * fade);
  }`,
});

export function addUpdraft(x, y, z, r, h) {
  updrafts.push({ x, y, z, r, h });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 16, 1, true).translate(0, h / 2, 0), tubeMat.clone());
  tube.material.uniforms.uH.value = h;
  tube.position.set(x, y, z); tube.frustumCulled = false;
  const n = 40, p = new Float32Array(n * 3), q = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { p.set([x, y, z], i * 3); q.set([rnd(), rnd(), rnd()], i * 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aRand', new THREE.BufferAttribute(q, 3));
  const motes = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.time, uScale: U.pscale, uR: { value: r }, uH: { value: h } },
    vertexShader: `uniform float uTime, uScale, uR, uH; attribute vec3 aRand; varying float vA;
    void main(){
      float u = fract(uTime * (0.12 + aRand.x * 0.1) + aRand.y);              // 0 at the bottom, 1 at the top
      float a = aRand.z * 6.2832 + u * 6.0, rr = uR * (0.25 + 0.7 * aRand.x);
      vec3 p = position + vec3(cos(a) * rr, u * uH, sin(a) * rr);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uScale * 0.07 / max(-mv.z, 0.1);
      vA = sin(u * 3.14159) * 0.8;
      gl_Position = projectionMatrix * mv;
    }`,
    fragmentShader: `varying float vA; void main(){ float a = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(0.9, 0.97, 1.0, a * a * vA); }`,
  }));
  motes.frustumCulled = false;
  scene.add(tube, motes);
}
