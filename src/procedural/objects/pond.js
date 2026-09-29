// Shallow pond (walkable): a water disc that reflects the sky with ripples and sun glints, a wet-mud shore,
// stones on the rim and a few lily pads.
import * as THREE from 'three';
import { scene, U } from '../../core.js';
import { TAU, rnd, rand, col3 } from '../../utils.js';
import { NOISE, ATMOS, WORLD_VS, SKY } from '../../render/atmosphere.js';
import { bake } from '../geometry.js';
import { pushGeo, ponds } from '../world.js';
import { addPebble } from './pebble.js';

const waterMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTime: U.time, uDensity: U.density, ...SKY },
  vertexShader: WORLD_VS,
  fragmentShader: `uniform float uTime, uDensity; varying vec3 vW; varying vec2 vUv; ${NOISE} ${ATMOS}
  void main(){
    vec3 v = vW - cameraPosition; float d = length(v); vec3 vd = v / d;
    vec2 p = vW.xz * 1.7;
    float n1 = fbm(p + vec2(uTime * 0.05, uTime * 0.03)), n2 = fbm(p * 2.3 - vec2(uTime * 0.04, -uTime * 0.06));
    vec3 nrm = normalize(vec3((n1 - 0.5) * 0.4 + (n2 - 0.5) * 0.2, 1.0, (n2 - 0.5) * 0.4 - (n1 - 0.5) * 0.2));
    vec3 rf = reflect(vd, nrm); rf.y = abs(rf.y);
    float fres = pow(1.0 - clamp(dot(-vd, nrm), 0.0, 1.0), 3.0);
    vec3 c = mix(${col3('#3a6c76')} * uSkyTint, atmosCol(rf), 0.28 + 0.62 * fres);
    c += vec3(1.0, 0.93, 0.8) * pow(max(dot(rf, ATM_SUN), 0.0), 240.0) * 3.0;   // sun glints
    float rr = length(vUv - 0.5) * 2.0;
    c = mix(c, vec3(0.72, 0.84, 0.8) * uSkyTint, smoothstep(0.8, 1.0, rr) * 0.35);          // pale shallows at the shore
    c = mix(c, atmosCol(vd), fogAmount(vW, uDensity));
    gl_FragColor = vec4(c, 0.9 * (1.0 - smoothstep(0.94, 1.0, rr)));
  }`,
});

function lily(x, y, z, pal) {
  const s = rand(0.18, 0.32);
  const g = new THREE.CircleGeometry(s, 8, rand(0, TAU), TAU * 0.88).rotateX(-Math.PI / 2);
  pushGeo(bake(g, (cen, n, c) => c.copy(pal.moss).offsetHSL(0, 0.05, rand(-0.02, 0.06))), x, y, z);
  if (rnd() < 0.4) {   // a pink bloom
    const f = new THREE.OctahedronGeometry(0.07, 0).scale(1, 0.7, 1);
    pushGeo(bake(f, (cen, n, c) => c.set('#f4b6cc').offsetHSL(0, 0, rand(-0.03, 0.05))), x, y + 0.05, z);
  }
}

export function addPond(x, y, z, r, pal) {
  const water = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), waterMat);
  water.position.set(x, y + 0.07, z); water.renderOrder = 1;
  ponds.push({ x, y, z, r });
  scene.add(water);
  const wet = new THREE.Color('#3f3b30');
  const shore = new THREE.RingGeometry(r * 0.9, r + 0.55, 40, 1).rotateX(-Math.PI / 2);
  pushGeo(bake(shore, (cen, n, c) => c.copy(pal.dirt).lerp(wet, THREE.MathUtils.smoothstep(r + 0.2 - Math.hypot(cen.x, cen.z), 0, 0.6)).offsetHSL(0, 0, rand(-0.02, 0.02))), x, y + 0.03, z);
  for (let k = 0, n = Math.round(r * 5); k < n; k++) {
    const a = rand(0, TAU), rr = r + rand(0.05, 0.5);
    addPebble(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, pal, rand(0.1, 0.26));
  }
  for (let k = 0, n = 4 + (rnd() * 4 | 0); k < n; k++) {
    const a = rand(0, TAU), rr = r * Math.sqrt(rnd()) * 0.8;
    lily(x + Math.cos(a) * rr, y + 0.08, z + Math.sin(a) * rr, pal);
  }
}
