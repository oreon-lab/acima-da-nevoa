// Sky, fog, clouds and lighting. Fog, sky and clouds share one colour function so distant
// geometry dissolves exactly into the sky behind it.
import * as THREE from 'three';
import { renderer, scene, camera, U, game } from '../core.js';
import { WIND, FOG_LAYER, FOGS, settings } from '../config.js';
import { V3, TAU, clamp, lerp, smoothstep, rand, pick, f4, col3 } from '../utils.js';

export const NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; } return s; }`;

export const ATMOS_CORE = /* glsl */`
const vec2 ATM_WIND = vec2(${f4(WIND.x)}, ${f4(WIND.y)});
vec3 atmosColS(vec3 d, vec3 sunD){
  vec3 c = mix(${col3('#d6dcd4')}, ${col3('#4b76a5')}, pow(clamp(d.y, 0.0, 1.0), 0.5));
  c = mix(c, ${col3('#97a9b1')}, 1.0 - smoothstep(-0.4, 0.0, d.y));
  float s = max(dot(d, sunD), 0.0);
  c += ${col3('#ffc690')} * (pow(s, 5.0) * 0.42 + pow(s, 48.0) * 0.6);
  c += ${col3('#fff1dc')} * exp(-abs(d.y) * 12.0) * 0.1;
  return c;
}
float fogAmount(vec3 wp, float dens){
  float d = length(wp - cameraPosition);
  float hMin = min(wp.y, cameraPosition.y);
  float layer = 1.0 - smoothstep(${f4(FOG_LAYER - 34)}, ${f4(FOG_LAYER + 8)}, hMin);
  return 1.0 - exp(-d * (dens + 0.015 * layer));
}`;

// Custom shaders share one sun/moon direction and one sky tint (both change with the time of day).
// Built-in materials get the same look through the fog chunk below: light 0's direction and fogColor.
export const SKY = { uSunDir: { value: new V3(0, 1, 0) }, uSkyTint: { value: new THREE.Color(1, 1, 1) } };
const DISC = { uTrueSun: { value: new V3(0, 1, 0) }, uMoon: { value: new V3(0, 1, 0) }, uNight: { value: 0 } };
export const ATMOS = ATMOS_CORE + `
uniform vec3 uSunDir; uniform vec3 uSkyTint;
#define ATM_SUN uSunDir
vec3 atmosCol(vec3 d){ return atmosColS(d, uSunDir) * uSkyTint; }`;

export const WORLD_VS = `varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

// Replace three's fog with aerial perspective: fog takes the sky colour in the view direction,
// plus a height layer so everything below the mist sea sinks into it.
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\nvarying vec3 vFogWorldPos;\n#endif';
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vec4 fogWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    fogWp = instanceMatrix * fogWp;
  #endif
  vFogWorldPos = (modelMatrix * fogWp).xyz;
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
uniform vec3 fogColor; uniform float fogDensity; varying vec3 vFogWorldPos;
${ATMOS_CORE}
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  vec3 fogSun = vec3(0.0, 1.0, 0.0);
  #if NUM_DIR_LIGHTS > 0
    fogSun = transpose(mat3(viewMatrix)) * directionalLights[0].direction;   // world-space direction of the sun/moon light
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, atmosColS(normalize(vFogWorldPos - cameraPosition), fogSun) * fogColor, fogAmount(vFogWorldPos, fogDensity));
#endif`;

// ------------------------------------------------------------ sky dome
const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { uTime: U.time, ...SKY, ...DISC },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime, uNight; uniform vec3 uTrueSun, uMoon; varying vec3 vDir; ${NOISE} ${ATMOS}
  void main(){
    vec3 d = normalize(vDir);
    vec3 c = atmosCol(d);
    float s = max(dot(d, ATM_SUN), 0.0);
    c += vec3(1.0, 0.9, 0.75) * smoothstep(0.9992, 0.9997, max(dot(d, uTrueSun), 0.0)) * 2.5 * (1.0 - uNight);
    float md = max(dot(d, uMoon), 0.0);
    c += vec3(0.75, 0.82, 1.0) * smoothstep(0.9990, 0.9994, md) * 1.6 * uNight + vec3(0.6, 0.7, 1.0) * pow(md, 40.0) * 0.12 * uNight;
    if (d.y > 0.0) {   // stars: one jittered dot per cell, twinkling, fading out towards the horizon
      vec2 sp = d.xz / (d.y + 0.25) * 90.0; float h = hash12(floor(sp));
      float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
      c += vec3(0.9, 0.95, 1.0) * step(0.985, h) * smoothstep(0.42, 0.0, length(fract(sp) - 0.5)) * tw * uNight * smoothstep(0.05, 0.4, d.y) * 1.4;
    }
    if (d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.1) * 0.8 + ATM_WIND * uTime * 0.003;
      float n = fbm(uv), n2 = fbm(uv * 2.6 + 4.0 - ATM_WIND * uTime * 0.004);
      float cov = smoothstep(0.42, 0.75, n * 0.7 + n2 * 0.3) * smoothstep(0.0, 0.25, d.y);
      vec3 cc = mix(${col3('#aab6c2')}, ${col3('#fff5ea')}, smoothstep(0.35, 0.8, n2)) + ${col3('#ffc690')} * pow(s, 6.0) * 0.5;
      c = mix(c, cc * uSkyTint, cov * 0.7);
    }
    gl_FragColor = vec4(c, 1.0);
  }`,
}));
sky.renderOrder = -2;
sky.frustumCulled = false;
scene.add(sky);

// ------------------------------------------------------------ sea of clouds far below (two layers for parallax)
const seas = [[-42, 1.0, 0.007, 0.012], [-30, 0.45, 0.013, 0.02]].map(([y, a, s, sp]) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: U.time, uDensity: U.density, uA: { value: a }, uS: { value: s }, uSp: { value: sp }, ...SKY },
    vertexShader: WORLD_VS,
    fragmentShader: `uniform float uTime, uDensity, uA, uS, uSp; varying vec3 vW; ${NOISE} ${ATMOS}
    void main(){
      vec2 p = vW.xz * uS + ATM_WIND * uTime * uSp;
      float n = fbm(p) * 0.65 + fbm(p * 2.9 - ATM_WIND * uTime * uSp * 1.7) * 0.35;
      float lit = clamp((n - fbm(p + ATM_SUN.xz * 0.06) * 0.65 - 0.12) * 5.0 + 0.55, 0.0, 1.0);
      vec3 c = mix(${col3('#8a9ca8')}, ${col3('#fbf3e6')}, lit) * uSkyTint;
      vec3 v = vW - cameraPosition; float d = length(v);
      float f = min(fogAmount(vW, uDensity), mix(0.72, 1.0, smoothstep(150.0, 700.0, d)));
      c = mix(c, atmosCol(v / d), f);
      gl_FragColor = vec4(c, smoothstep(0.3, 0.62, n) * uA);
    }`,
  }));
  m.position.y = y; m.frustumCulled = false; m.renderOrder = -1;
  scene.add(m);
  return m;
});

// ------------------------------------------------------------ drifting cloud billboards around the path
const clouds = [];
export function createClouds(islands) {
  const geo = new THREE.PlaneGeometry(1, 1), top = islands[islands.length - 1].y;
  for (let i = 0; i < 34; i++) {
    const base = pick(islands), a = rand(0, Math.PI * 2), d = rand(28, 110), w = rand(28, 70);
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: U.time, uDensity: U.density, uSeed: { value: rand(0, 100) }, uOp: { value: rand(0.35, 0.7) }, ...SKY },
      vertexShader: WORLD_VS,
      fragmentShader: `uniform float uTime, uDensity, uSeed, uOp; varying vec2 vUv; varying vec3 vW; ${NOISE} ${ATMOS}
      void main(){
        vec2 p = vUv - 0.5;
        float n = fbm(vUv * 3.0 + uSeed + vec2(uTime * 0.01, 0.0));
        float m = 1.0 - smoothstep(0.1, 0.5, length(p * vec2(1.0, 1.8)) + (n - 0.5) * 0.45);
        vec3 c = mix(${col3('#a3b1bd')}, ${col3('#fff6ea')}, smoothstep(-0.25, 0.3, p.y + (n - 0.5) * 0.4)) * uSkyTint;
        vec3 v = vW - cameraPosition; float d = length(v);
        c = mix(c, atmosCol(v / d), fogAmount(vW, uDensity) * 0.85);
        gl_FragColor = vec4(c, m * uOp * smoothstep(12.0, 40.0, d));
      }`,
    }));
    m.scale.set(w, w * 0.5, 1);
    m.position.set(base.x + Math.cos(a) * d, clamp(base.y + rand(-22, 14), -24, top + 25), base.z + Math.sin(a) * d);
    m.frustumCulled = false;
    scene.add(m);
    clouds.push(m);
  }
}

// ------------------------------------------------------------ low mist hugging an island (flat, soft-edged, drifting)
export function addGroundMist(x, y, z, R, lift = 0.45) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.6, R * 2.6).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: U.time, uDensity: U.density, uSeed: { value: rand(0, 50) }, ...SKY },
    vertexShader: WORLD_VS,
    fragmentShader: `uniform float uTime, uDensity, uSeed; varying vec3 vW; varying vec2 vUv; ${NOISE} ${ATMOS}
    void main(){
      vec2 p = vW.xz * 0.16 + ATM_WIND * uTime * 0.02 + uSeed;
      float n = fbm(p) * 0.65 + fbm(p * 2.6 - ATM_WIND * uTime * 0.03) * 0.35;
      float rr = length(vUv - 0.5) * 2.0;
      float a = smoothstep(0.34, 0.74, n) * (1.0 - smoothstep(0.45, 1.0, rr)) * 0.55;
      vec3 v = vW - cameraPosition; float d = length(v);
      vec3 c = mix(${col3('#dde6ea')} * uSkyTint, atmosCol(v / d), fogAmount(vW, uDensity) * 0.6);
      gl_FragColor = vec4(c, a * smoothstep(1.5, 6.0, d));   // fades out next to the camera so it never blocks the view
    }`,
  }));
  m.position.set(x, y + lift, z); m.renderOrder = 2; m.frustumCulled = false;
  scene.add(m);
  return m;
}

// ------------------------------------------------------------ lights
export const hemi = new THREE.HemisphereLight('#d2e2ef', '#6a604f', 1.15);
export const sun = new THREE.DirectionalLight('#ffe0bb', 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 130 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(hemi, sun, sun.target);
export const applyShadows = () => { sun.castShadow = settings.shadows; };
applyShadows();

// Time of day: tod 0..1 is one full turn (0.25 noon, 0.75 midnight). The sun crosses the sky; at night a moon takes over
// the lighting. The sun/moon direction, sky tint, fog colour, light colours, exposure and stars all follow it.
const HX = -0.607, HZ = -0.795;   // horizontal direction the sun travels along (unit length)
const NIGHT = new THREE.Color(0.09, 0.12, 0.26), WHITE = new THREE.Color(1, 1, 1), DUSK = new THREE.Color(1, 0.6, 0.42);
const SUN_C = new THREE.Color('#ffe0bb'), SUN_LOW = new THREE.Color('#ff9d5c'), MOON_C = new THREE.Color('#9db4ff'), tmp = new THREE.Color();
const SKY_D = new THREE.Color('#d2e2ef'), SKY_N = new THREE.Color('#2a3558'), GND_D = new THREE.Color('#6a604f'), GND_N = new THREE.Color('#20242f');
const STORM = new THREE.Color(0.42, 0.45, 0.5), sunV = new V3(), moonV = new V3();

// wind gusts, slow light variation, altitude-dependent fog, time of day; returns normalised altitude
export function updateAtmosphere(t, dt, focus, top, tod = 0.08) {
  const wx = game.wx;
  U.gust.value = clamp(0.45 + 0.4 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1.3) + 0.2 * Math.sin(t * 0.53 + 2) + 0.3 * wx.rain, 0, 1);
  const alt = clamp(camera.position.y / top, 0, 1);
  const lv = 0.5 + 0.5 * Math.sin(t * 0.13) * Math.sin(t * 0.047 + 0.7);

  const s = Math.sin(tod * TAU), c0 = Math.cos(tod * TAU);
  sunV.set(HX * c0, s, HZ * c0);
  moonV.set(-HX * 0.9, 0.3 + 0.5 * Math.max(-s, 0), -HZ * 0.9).normalize();
  const day = smoothstep(s, -0.2, 0.3), warm = Math.exp(-((s / 0.22) ** 2));   // warm = 1 at the horizon
  game.day = day;
  SKY.uSunDir.value.copy(moonV).lerp(sunV, day).normalize();
  const tint = SKY.uSkyTint.value.copy(NIGHT).lerp(WHITE, day).lerp(DUSK, warm * 0.55);
  tint.lerp(tmp.copy(STORM).multiplyScalar(0.25 + 0.75 * day), 0.45 * wx.rain + 0.15 * wx.fog);   // overcast: grey and darker
  scene.fog.color.copy(tint);
  DISC.uTrueSun.value.copy(sunV); DISC.uMoon.value.copy(moonV); DISC.uNight.value = 1 - smoothstep(s, -0.1, 0.15);

  sun.color.copy(MOON_C).lerp(tmp.copy(SUN_C).lerp(SUN_LOW, warm), day);
  sun.intensity = lerp(0.65, 2.7 * (0.86 + 0.14 * lv), day) * (1 - 0.55 * wx.rain - 0.25 * wx.fog) + wx.flash * 2.5;
  hemi.color.copy(SKY_N).lerp(SKY_D, day); hemi.groundColor.copy(GND_N).lerp(GND_D, day);
  hemi.intensity = lerp(0.5, 1.1 + 0.08 * lv, day) + wx.flash * 1.5;
  renderer.toneMappingExposure = lerp(1.3, 1.05, day);

  scene.fog.density = U.density.value = lerp(0.0105, 0.0042, smoothstep(alt, 0, 1)) * (1 + 1.4 * wx.fog + 0.6 * wx.rain) * FOGS[settings.fog];
  sun.target.position.copy(focus);
  sun.position.copy(focus).addScaledVector(SKY.uSunDir.value, 60);
  sky.position.copy(camera.position);
  for (const s2 of seas) s2.position.set(camera.position.x, s2.position.y, camera.position.z);
  for (const c of clouds) {
    c.quaternion.copy(camera.quaternion);
    c.position.x += WIND.x * 0.5 * dt; c.position.z += WIND.y * 0.5 * dt;
  }
  return alt;
}
