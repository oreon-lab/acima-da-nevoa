import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { renderer, scene, camera, U } from '../core.js';
import { settings } from '../config.js';

const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
export const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));

// A single NaN/Inf pixel (e.g. pow of a negative number in some shader) is spread by the bloom's blur into a big
// black rectangle. Replace such pixels and cap absurdly bright ones before the bloom sees them.
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    bool ok = c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 && c.r < 1000.0 && c.g < 1000.0 && c.b < 1000.0;   // false for NaN too
    gl_FragColor = ok ? vec4(min(c.rgb, vec3(64.0)), c.a) : vec4(0.0, 0.0, 0.0, 1.0);
  }`,
}));
export const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 0.92);
composer.addPass(bloom);

// light grade: saturation, vignette, grain, and the fade-to-mist used on respawn
export const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 1 }, uFadeCol: { value: new THREE.Color('#dfe6e6') },
    uGlitch: { value: 0 }, uGray: { value: 0 }, uGT: { value: 0 }, uLens: { value: 0 }, uAspect: { value: 1 }, uHole: { value: new THREE.Vector3() },   // rift cutscene
    uBubble: { value: new THREE.Vector4(0, 0, 0, 0) } },   // O Instante: screen centre, radius (of the screen height) and strength of the grey outside (0 = off)
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uFade, uGlitch, uGray, uGT, uLens, uAspect; uniform vec3 uFadeCol, uHole; uniform vec4 uBubble; varying vec2 vUv;
  float hash(float x){ return fract(sin(x * 91.7) * 43758.5453); }
  void main(){
    vec2 uv = vUv;
    if (uLens > 0.0) {   // light bends around the black hole (uHole: screen position, radius of its horizon)
      vec2 d = (uv - uHole.xy) * vec2(uAspect, 1.0); float r = length(d) + 1e-5;
      uv -= d / r * min(uLens * uHole.z * uHole.z / r, r) / vec2(uAspect, 1.0);
    }
    float fr = floor(uGT * 60.0), line = floor(vUv.y * 220.0), blk = floor(vUv.y * 14.0);
    if (uGlitch > 0.0) {   // hairline tears + a few broken blocks, reshuffled every frame
      float h1 = hash(line + fr * 13.1), h2 = hash(blk * 7.3 + fr * 3.7);
      uv.x += (h1 - 0.5) * 0.06 * uGlitch * step(0.72, h1) + (h2 - 0.5) * 0.22 * uGlitch * step(0.86 - 0.25 * uGlitch, h2);
      if (hash(blk + fr * 1.7) > 0.9 - 0.2 * uGlitch) uv = (floor(uv * vec2(96.0, 54.0)) + 0.5) / vec2(96.0, 54.0);   // pixelated slabs
    }
    vec4 c = texture2D(tDiffuse, uv);
    if (uGlitch > 0.0) {
      float s = 0.006 * uGlitch * (hash(blk + fr) > 0.5 ? 1.0 : -1.0);
      c.r = texture2D(tDiffuse, uv + vec2(s, 0.0)).r; c.b = texture2D(tDiffuse, uv - vec2(s, 0.0)).b;
      c.rgb *= 1.0 - 0.4 * uGlitch * step(0.5, fract(gl_FragCoord.y * 0.5));                 // 1 px scanlines
      if (hash(line * 3.1 + fr) > 1.0 - 0.05 * uGlitch) c.rgb = 1.0 - c.rgb;                 // hairlines flash inverted
      if (hash(line * 5.7 + fr * 2.3) > 1.0 - 0.03 * uGlitch) c.rgb = vec3(step(0.5, hash(floor(vUv.x * 300.0) + fr)));   // dead pixels
    }
    float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    c.rgb = mix(vec3(l), c.rgb, 1.08);
    c.rgb = mix(c.rgb, vec3(smoothstep(0.02, 0.95, l)), uGray);   // the rift's freeze: black and white, harsher
    if (uBubble.w > 0.0) {   // O Instante: colour only inside the bubble of time round the character, a cold grey outside
      float bd = length((vUv - uBubble.xy) * vec2(uAspect, 1.0)), inside = 1.0 - smoothstep(uBubble.z * 0.8, uBubble.z * 1.05, bd);
      vec3 still = vec3(smoothstep(0.0, 1.0, l)) * vec3(0.93, 0.95, 1.02);
      c.rgb = mix(c.rgb, still, uBubble.w * (1.0 - inside));
      c.rgb += vec3(1.0, 0.85, 0.6) * 0.06 * uBubble.w * inside * smoothstep(uBubble.z * 0.55, uBubble.z, bd);   // a warm rim at the edge of time
    }
    float v = 1.0 - smoothstep(0.25, 0.9, length((vUv - 0.5) * vec2(1.15, 1.0)));
    c.rgb *= mix(0.7, 1.0, v);
    float g = fract(sin(dot(vUv * 1000.0 + fract(uTime) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
    c.rgb += (g - 0.5) * 0.02 * (0.25 + l);
    c.rgb = mix(c.rgb, uFadeCol, uFade);
    gl_FragColor = c;
  }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.fov = settings.fov; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  U.pscale.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}
export function applyQuality() {
  const pr = [1, Math.min(devicePixelRatio, 1.5), Math.min(devicePixelRatio, 2)][settings.quality];
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
  bloom.enabled = settings.quality > 0 && settings.bloom;
  onResize();
}
addEventListener('resize', onResize);
applyQuality();
