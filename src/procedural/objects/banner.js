// Cloth banner on a pole, flying downwind. The waving is done in the vertex shader (uses the same time and
// gust uniforms as the vegetation), so there is no per-frame JS.
import * as THREE from 'three';
import { scene, U } from '../../core.js';
import { WIND } from '../../config.js';
import { rand } from '../../utils.js';
import { NOISE, ATMOS, SKY } from '../../render/atmosphere.js';
import { bake } from '../geometry.js';
import { pushGeo } from '../world.js';

const W = 1.0, H = 0.62;

export function addBanner(x, y, z, color = '#a8443c', h = 2.9) {
  const wood = () => (cen, n, c) => c.set('#6b5642').offsetHSL(0, 0, rand(-0.03, 0.03));
  pushGeo(bake(new THREE.CylinderGeometry(0.035, 0.055, h, 6).translate(0, h / 2, 0), wood()), x, y, z);
  pushGeo(bake(new THREE.IcosahedronGeometry(0.075, 0).translate(0, h + 0.05, 0), wood()), x, y, z);
  pushGeo(bake(new THREE.BoxGeometry(W + 0.1, 0.04, 0.04).translate(W / 2, h - 0.12, 0), wood()), x, y, z);   // boom the cloth hangs from

  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(W, H, 14, 4).translate(W / 2, 0, 0), new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY, uTime: U.time, uGust: U.gust, uDensity: U.density, uCol: { value: new THREE.Color(color) }, uPh: { value: rand(0, 6.28) } },
    vertexShader: `uniform float uTime, uGust, uPh; varying vec2 vUv; varying vec3 vW; varying float vShade;
    void main(){
      vUv = uv;
      vec3 p = position;
      float k = p.x / ${W.toFixed(2)};                       // 0 at the pole, 1 at the free end
      float w = uTime * (2.6 + uGust * 3.0) - k * 6.0 + uPh;
      p.z += sin(w) * 0.13 * k * (0.5 + uGust);
      p.y -= k * k * 0.05 + (0.5 - uv.y) * k * 0.05 * cos(w);
      vShade = 0.86 + 0.16 * cos(w) * k;
      vec4 wp = modelMatrix * vec4(p, 1.0); vW = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
    fragmentShader: `uniform float uDensity; uniform vec3 uCol; varying vec2 vUv; varying vec3 vW; varying float vShade; ${NOISE} ${ATMOS}
    void main(){
      float stripe = smoothstep(0.4, 0.46, vUv.y) * (1.0 - smoothstep(0.56, 0.62, vUv.y));
      vec3 c = mix(uCol, vec3(0.93, 0.88, 0.76), stripe) * vShade * uSkyTint;
      c *= 0.9 + 0.1 * vnoise(vUv * 30.0);                     // woven cloth
      vec3 v = vW - cameraPosition;
      c = mix(c, atmosCol(normalize(v)), fogAmount(vW, uDensity));
      gl_FragColor = vec4(c, 1.0);
    }`,
  }));
  cloth.position.set(x, y + h - 0.12 - H / 2 - 0.02, z);
  cloth.rotation.y = -Math.atan2(WIND.y, WIND.x) + rand(-0.25, 0.25);
  cloth.frustumCulled = false;
  scene.add(cloth);
}
