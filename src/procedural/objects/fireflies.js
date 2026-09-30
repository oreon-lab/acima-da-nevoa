// Fireflies: soft points that drift lazily and blink, all animated in the vertex shader.
import * as THREE from 'three';
import { scene, U } from '../../core.js';
import { TAU, rnd, rand, col3 } from '../../utils.js';

export function addFireflies(isl, n = 36) {
  const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), r = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), d = isl.R * Math.sqrt(rnd()) * 0.88;
    p.set([isl.x + Math.cos(a) * d, isl.y + rand(0.5, 2.6), isl.z + Math.sin(a) * d], i * 3);
    r.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(r, 4));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.time, uScale: U.pscale, uNight: U.night },
    vertexShader: `uniform float uTime, uScale, uNight; attribute vec4 aRand; varying float vA;
    void main(){
      vec3 p = position;
      p.x += sin(uTime * 0.4 + aRand.x * 6.28) * 0.9;
      p.z += cos(uTime * 0.35 + aRand.y * 6.28) * 0.9;
      p.y += sin(uTime * 0.6 + aRand.z * 6.28) * 0.35;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uScale * 0.07 / max(-mv.z, 0.1);
      vA = pow(max(sin(uTime * (0.7 + aRand.w * 0.9) + aRand.x * 20.0), 0.0), 3.0) * mix(0.3, 1.0, uNight);   // slow blink, brighter at night
      gl_Position = projectionMatrix * mv;
    }`,
    fragmentShader: `varying float vA; void main(){ float a = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(${col3('#e6ff8c')} * 1.6, a * a * vA); }`,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
}
