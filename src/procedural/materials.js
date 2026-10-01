// Shared materials. Wind is applied in world space inside the vertex shader, so one
// merged mesh / one instanced mesh can sway everywhere at once.
import * as THREE from 'three';
import { U } from '../core.js';
import { WIND } from '../config.js';
import { f4 } from '../utils.js';

// The rift cutscene pulls the world apart into a black hole. It tears loose in slabs: blocks of ground a few metres
// across (grass, trees and props ride their slab) that strain, rip up from rest, hang, tip towards the hole, and
// break into their blocks as they spiral in. A piece is marked by `aChunk` (xyz = its block's centre, |w| = seconds
// of flight; w < 0: an underside slab, which drops out towards the hole instead of lifting) and `aSlab` (xyz = the
// slab's pivot, w = when it lets go, in seconds of the pull); anything without them is never touched.
// uPull: xyz = hole, w = seconds since the pull begins (may be negative: the world already quakes; < -100: off).
// uPullP: x/y = nearest/farthest piece distance, z = span of the release wave (s), w = quake strength before pieces let go.
// cutscene.js mirrors this maths on the CPU for the separate objects (slabPose / focusPose): keep the two in step.
// uFocus: a chunk of the first island (xyz = pivot on its rim, w = radius; 0 = none) that gives way on its own first.
// uFocusP: x = strain 0..1, y = lift 0..1, z = seconds since it was dragged off (< 0: not yet).
export const PULL = { uPull: { value: new THREE.Vector4(0, 0, 0, -1000) }, uPullP: { value: new THREE.Vector4(60, 230, 22, 0) },
  uFocus: { value: new THREE.Vector4() }, uFocusP: { value: new THREE.Vector4(0, 0, -1, 0) } };
// the slab timeline (seconds after it lets go): lifted LIFT_H over LIFT, the spiral starts at HANG, it tips TILT
// radians and then tumbles at SPIN rad/s; its blocks start to come apart a quarter of the way down
export const SLAB_MOTION = { LIFT: 1.2, LIFT_H: 2.2, HANG: 0.6, TILT: 0.45, SPIN: 0.7 };
const M = SLAB_MOTION;
const PULL_GLSL = `
uniform vec4 uPull, uPullP, uFocus, uFocusP; attribute vec4 aChunk, aSlab;
vec3 rotAxis(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
vec3 rotY(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(v.x * c - v.z * s, v.y, v.x * s + v.z * c); }
// radians turned after spinning up from rest for a seconds (full speed after 1.5 s)
float spinUp(float a){ return a < 1.5 ? a * a / 3.0 : a - 0.75; }
// the swirl round the hole at f (0..1 of the flight): from rest, faster and faster as the radius closes
float swirl(float f){ float e = f * f; return e * (1.2 + 3.0 * e); }
vec3 spiral(vec3 p, vec3 h, float f){ return h + rotY(p - h, swirl(f)) * (1.0 - f * f); }
// the rim chunk: it strains and creaks, cracks open, tips towards the hole, is torn up, hangs, then is dragged in whole
vec3 focusPos(vec3 p, vec3 c){
  vec3 piv = uFocus.xyz, h = uPull.xyz; float T = uPull.w, k = uFocusP.x, l = uFocusP.y, a = uFocusP.z;
  vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(vec3(h.x - piv.x, 0.0, h.z - piv.z))));
  float ls = l * l * (3.0 - 2.0 * l);
  float ang = 0.18 * pow(k, 1.6) + (sin(T * 7.3) * 0.035 + sin(T * 2.1) * 0.02) * k + 0.5 * ls;
  vec3 cc = c - piv;
  vec3 q = rotAxis(p - piv, ax, ang) + normalize(cc + 1e-4) * 0.08 * k;   // it splits: gaps open between the pieces
  q += vec3(sin(T * 43.0), abs(sin(T * 37.0)) * 0.5, sin(T * 51.0)) * (0.015 + 0.08 * k * k + 0.05 * l);
  vec3 lifted = piv + vec3(0.0, 2.6 * ls, 0.0);
  if (a <= 0.0) return lifted + q;
  float f = clamp(a / 5.0, 0.0, 1.0);
  return spiral(lifted, h, f) + rotY(rotAxis(q, ax, spinUp(a) * 0.9), swirl(f)) * (1.0 - smoothstep(0.85, 1.0, f));
}
vec3 pullPos(vec3 p, vec3 c){
  vec3 h = uPull.xyz; float t = uPull.w;
  if (uFocus.w > 0.0 && length(c - uFocus.xyz) < uFocus.w) return focusPos(p, c);
  vec3 K = aSlab.xyz, cK = c - K; float a = t - aSlab.w, flight = abs(aChunk.w), hk = fract(aSlab.w * 7.31);
  vec3 jit = vec3(sin(t * 57.0 + hk * 9.0), sin(t * 61.0 + hk * 5.0), sin(t * 53.0 + hk * 7.0));   // per slab: it shakes as one
  if (a < -2.0) return p + jit * uPullP.w * (1.0 - clamp((length(K - h) - uPullP.x) / (uPullP.y - uPullP.x), 0.0, 1.0));   // the whole world quakes, nearest most
  if (a < 0.0) { float s = (a + 2.0) * 0.5; return p + jit * 0.09 * s - cK * 0.04 * s; }   // it strains, the seams round it opening
  float hs = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float s = smoothstep(0.0, ${f4(M.LIFT)}, a), f = clamp((a - ${f4(M.HANG)}) / flight, 0.0, 1.0);
  vec3 toH = vec3(h.x - K.x, 0.0, h.z - K.z); toH = dot(toH, toH) > 1e-6 ? normalize(toH) : vec3(1.0, 0.0, 0.0);
  vec3 lift = aChunk.w > 0.0 ? vec3(0.0, 1.0, 0.0) : normalize(h - K);
  vec3 sp = spiral(K + lift * ${f4(M.LIFT_H)} * s, h, f);                                       // the slab: torn up, then drawn in
  vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), toH) + (vec3(fract(aSlab.w * 13.1), fract(aSlab.w * 7.7), fract(aSlab.w * 3.3)) - 0.5) * 0.6);
  float rs = ${f4(M.TILT)} * s + ${f4(M.SPIN)} * (0.5 + fract(aSlab.w * 5.9)) * spinUp(max(a - ${f4(M.LIFT / 2)}, 0.0));   // tips over towards it, then tumbles
  float ac = max(a - ${f4(M.HANG)} - 0.25 * flight, 0.0), dr = smoothstep(0.0, 2.0, ac);   // it breaks up into its blocks
  vec3 ch = vec3(hs - 0.5, fract(hs * 7.0) - 0.5, fract(hs * 13.0) - 0.5);
  vec3 w = rotAxis(p - c, normalize(ch + vec3(0.0, 0.3, 0.0)), spinUp(ac) * (1.5 + hs * 2.0));
  vec3 off = rotY(rotAxis(cK * (0.96 + 0.6 * dr) + ch * 2.5 * dr + w, ax, rs), swirl(f));
  vec3 dh = normalize(h - sp + 1e-4); float st = smoothstep(0.55, 1.0, f), along = dot(off, dh);
  off = (off - dh * along) * (1.0 - 0.6 * st) + dh * along * (1.0 + 1.6 * st);   // stretched towards the hole
  return sp + off * (1.0 - smoothstep(0.9, 1.0, f));
}`;

function addWind(mat, weight, decl = '', push = false) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTime: U.time, uGust: U.gust, uPlayer: U.player }, PULL);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uGust; uniform vec3 uPlayer; ${decl} ${PULL_GLSL}
        const vec2 WIND = vec2(${f4(WIND.x)}, ${f4(WIND.y)});`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wPos = modelMatrix * mvPosition;
        float wWeight = ${weight};
        float wv = sin(uTime * 1.4 + wPos.x * 0.21 + wPos.z * 0.17) * 0.55 + sin(uTime * 2.9 + wPos.x * 0.83 - wPos.z * 0.61) * 0.22;
        vec2 wd = WIND * (wv * (0.45 + uGust * 0.6) + uGust * 0.7);
        ${push ? `vec2 pd = wPos.xz - uPlayer.xz; float pl = length(pd);
        wd += pd / max(pl, 0.001) * (1.0 - smoothstep(0.2, 1.1, pl)) * step(abs(wPos.y - uPlayer.y), 0.8) * 1.8;` : ''}
        wPos.xz += wd * wWeight;
        wPos.y -= dot(wd, wd) * wWeight * 0.25;
        if (abs(aChunk.w) > 1.5 && uPull.w > -100.0) wPos.xyz = pullPos(wPos.xyz, aChunk.xyz);
        mvPosition = viewMatrix * wPos;
        gl_Position = projectionMatrix * mvPosition;`);
  };
}

// terrain, rocks, trees, props: flat-shaded vertex colours, per-vertex sway weight
export const worldMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.93 });
addWind(worldMat, 'aSway', 'attribute float aSway;');
{ // in the rift the cutscene turns on DoubleSide: a torn chunk's inside reads as dark rock, not as a hole
  const w = worldMat.onBeforeCompile;
  worldMat.onBeforeCompile = sh => { w(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <tonemapping_fragment>', `
    if (!gl_FrontFacing) gl_FragColor.rgb = vColor.rgb * 0.08 + vec3(0.035, 0.02, 0.05);
    #include <tonemapping_fragment>`); };
}

// grass & flowers: bend with height and get pushed away by the player
export const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
addWind(grassMat, 'position.y * position.y * 0.32', '', true);
{ // blades keep their up-facing normal on both sides, so the back never goes dark
  const w = grassMat.onBeforeCompile;
  grassMat.onBeforeCompile = sh => { w(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')); };
}
