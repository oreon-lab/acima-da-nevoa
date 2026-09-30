// One water look for the whole game: sky reflection with fresnel, ripples, sun glints and player rings.
// Ponds use it flat; streams scroll it along their length (uv.y) and add edge foam; waterfalls turn it into
// falling streaks with foam at the lip and a mist fade at the foot.
import * as THREE from 'three';
import { U } from '../../core.js';
import { col3 } from '../../utils.js';
import { NOISE, ATMOS, WORLD_VS, SKY } from '../../render/atmosphere.js';

export const waterWake = { value: 0 };   // 0..1, set by the player while moving in water

const COMMON = `uniform float uTime, uDensity, uWake; uniform vec3 uPlayer; varying vec3 vW; varying vec2 vUv; ${NOISE} ${ATMOS}
// p: ripple coordinates (world xz for a pond, flow-aligned for a stream); fres/ring are outputs
vec3 waterCol(vec3 vd, vec2 p, out float fres, out float ring){
  float n1 = fbm(p + vec2(uTime * 0.05, uTime * 0.03)), n2 = fbm(p * 2.3 - vec2(uTime * 0.04, -uTime * 0.06));
  vec3 nrm = normalize(vec3((n1 - 0.5) * 0.4 + (n2 - 0.5) * 0.2, 1.0, (n2 - 0.5) * 0.4 - (n1 - 0.5) * 0.2));
  vec2 pd = vW.xz - uPlayer.xz; float pl = length(pd);   // rings spreading from the player while wading / swimming
  ring = sin(pl * 11.0 - uTime * 7.0) * exp(-pl * 1.4) * uWake;
  nrm = normalize(nrm + vec3(pd.x, 0.0, pd.y) / max(pl, 0.01) * ring * 0.9);
  vec3 rf = reflect(vd, nrm); rf.y = abs(rf.y);
  fres = pow(1.0 - clamp(dot(-vd, nrm), 0.0, 1.0), 3.0);
  vec3 c = mix(${col3('#2a86a8')} * uSkyTint, atmosCol(rf), 0.2 + 0.6 * fres);
  c += vec3(1.0, 0.93, 0.8) * pow(max(dot(rf, ATM_SUN), 0.0), 240.0) * 3.0;   // sun glints
  return c;
}`;
const head = `vec3 v = vW - cameraPosition; float d = length(v); vec3 vd = v / d; float fres, ring;`;
const uni = () => ({ uTime: U.time, uDensity: U.density, uPlayer: U.player, uWake: waterWake, ...SKY });
const mk = (fragmentShader, uniforms, extra = {}) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: WORLD_VS, fragmentShader, uniforms: { ...uni(), ...uniforms }, ...extra });

export const pondMaterial = (depth, r) => mk(`uniform float uDepth, uR; ${COMMON}
  void main(){
    ${head}
    vec3 c = waterCol(vd, vW.xz * 1.7, fres, ring);
    float rr = length(vUv - 0.5) * 2.0, deep = smoothstep(0.0, 1.3, (1.0 - rr) * uR) * uDepth;   // same shelf as the lake bed
    c = mix(c, ${col3('#173c47')} * uSkyTint, deep * 0.6 * (1.0 - fres));                          // dark where it is deep
    c = mix(c, vec3(0.72, 0.84, 0.8) * uSkyTint, smoothstep(0.8, 1.0, rr) * 0.3);                 // pale shallows at the shore
    c += vec3(0.9, 0.97, 1.0) * smoothstep(0.55, 1.0, abs(ring)) * 0.25;                            // foam on the ring crests
    c = mix(c, atmosCol(vd), fogAmount(vW, uDensity));
    float a = mix(0.5, 0.95, clamp(deep * 1.6 + fres * 0.5, 0.0, 1.0));                            // see the mud in the shallows
    gl_FragColor = vec4(c, a * (1.0 - smoothstep(0.94, 1.0, rr)));
  }`, { uDepth: { value: depth }, uR: { value: r } });
