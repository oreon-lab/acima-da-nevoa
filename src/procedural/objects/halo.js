// Soft additive glow billboard shared by collectibles, shrines, crystals and the beacon.
import * as THREE from 'three';

export const haloGeo = new THREE.PlaneGeometry(1, 1);
export const haloMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uColor: { value: new THREE.Color('#ffd9a0') } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uColor; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.2); gl_FragColor = vec4(uColor, a * 0.55); }`,
});

const tinted = {};   // one material per colour
export function makeHalo(size, color) {
  let mat = haloMat;
  if (color) { mat = tinted[color] ??= haloMat.clone(); mat.uniforms.uColor.value.set(color); }
  const m = new THREE.Mesh(haloGeo, mat);
  m.scale.setScalar(size);
  return m;
}
