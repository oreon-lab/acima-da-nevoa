// Weather: clear -> mist -> light rain -> (rarely) storm, changing every minute or two while playing and blending
// smoothly. It only writes game.wx = { fog, rain, flash } (0..1); the atmosphere thickens the fog and darkens the sky,
// the audio adds rain noise, and this file draws the rain and triggers lightning + thunder.
import * as THREE from 'three';
import { scene, camera, U, game } from '../core.js';
import { WIND, settings, dev } from '../config.js';
import { damp, rnd, rand, f4 } from '../utils.js';
import { thunder } from '../game/audio.js';

const wx = game.wx;
const PLANS = [   // [chance, fog, rain, min seconds, max seconds]
  [0.40, 0.0, 0.0, 70, 130],   // clear
  [0.25, 1.0, 0.0, 50, 90],    // mist
  [0.25, 0.5, 0.6, 50, 90],    // light rain
  [0.10, 0.7, 1.0, 40, 70],    // storm
];
let target = { fog: 0, rain: 0 }, timer = 45, cleared = true, nextFlash = 6;

function pickPlan() {
  let plan = PLANS[0];
  if (!cleared && rnd() < 0.6) cleared = true;                                  // after bad weather, usually clear up
  else { let r = rnd(), acc = 0; for (const p of PLANS) { acc += p[0]; if (r < acc) { plan = p; break; } } cleared = plan === PLANS[0]; }
  target = { fog: plan[1], rain: plan[2] };
  timer = rand(plan[3], plan[4]);
}

// rain: thin streaks that fall (slanted by the wind) inside a box that follows the camera; all animated in the shader
const N = 1400, BOX = [36, 26, 36];
const geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 6), rnd4 = new Float32Array(N * 8), end = new Float32Array(N * 2);
for (let i = 0; i < N; i++) {
  const p = [rand(0, BOX[0]), rand(0, BOX[1]), rand(0, BOX[2])], r = [rnd(), rnd(), rnd(), rnd()];
  for (let e = 0; e < 2; e++) { pos.set(p, i * 6 + e * 3); rnd4.set(r, i * 8 + e * 4); end[i * 2 + e] = e; }
}
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('aRand', new THREE.BufferAttribute(rnd4, 4));
geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
const rainMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTime: U.time, uCam: { value: camera.position }, uRain: { value: 0 } },
  vertexShader: `uniform float uTime, uRain; uniform vec3 uCam; attribute vec4 aRand; attribute float aEnd; varying float vA;
  const vec3 BOX = vec3(${BOX.map(f4).join(',')}); const vec2 WIND = vec2(${f4(WIND.x)}, ${f4(WIND.y)});
  void main(){
    float speed = 15.0 + aRand.x * 6.0;
    vec3 p = position;
    p.y -= uTime * speed;
    p.xz += WIND * uTime * speed * 0.16;                              // slanted fall
    p = mod(p - uCam + BOX * 0.5, BOX) - BOX * 0.5 + uCam;
    p.y += aEnd * 0.55; p.xz -= WIND * 0.09 * aEnd;                     // the streak's tail
    vec3 r = abs(p - uCam) / (BOX * 0.5);
    float edge = 1.0 - smoothstep(0.65, 1.0, max(r.x, max(r.y, r.z)));
    vA = uRain * (0.12 + aRand.y * 0.22) * edge * (1.0 - aEnd * 0.6);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`,
  fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.82, 0.88, 0.95, vA); }`,
});
const rain = new THREE.LineSegments(geo, rainMat);
rain.frustumCulled = false; rain.visible = false;
scene.add(rain);

// dev: force a weather (0 = back to automatic, 1 clear, 2 mist, 3 rain, 4 storm)
export function forceWeather(i) {
  if (i === 0) { timer = 5; return; }
  const p = PLANS[i - 1];
  target = { fog: p[1], rain: p[2] }; timer = 1e9; cleared = i === 1;
}

export function updateWeather(dt, playing) {
  if (settings.weather && !dev.forced) { target = { fog: 0, rain: 0 }; timer = 45; }   // weather switched off: everything clears up
  if (playing) {
    timer -= dt;
    if (timer <= 0) pickPlan();
    if (wx.rain > 0.85 && (nextFlash -= dt) <= 0) {   // storm: lightning, then thunder a moment later
      wx.flash = 1; thunder(rand(0.6, 2.4)); nextFlash = rand(7, 20);
    }
  }
  wx.fog = damp(wx.fog, target.fog, 0.25, dt);
  wx.rain = damp(wx.rain, target.rain, 0.3, dt);
  wx.flash = damp(wx.flash, 0, 7, dt);
  rain.visible = wx.rain > 0.03;
  rainMat.uniforms.uRain.value = wx.rain;
}
