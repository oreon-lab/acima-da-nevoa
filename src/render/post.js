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
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 1 }, uFadeCol: { value: new THREE.Color('#dfe6e6') } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uFade; uniform vec3 uFadeCol; varying vec2 vUv;
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    c.rgb = mix(vec3(l), c.rgb, 1.08);
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
