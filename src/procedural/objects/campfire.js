// Campfire: stone ring, leaning logs, ash bed, three flickering flame cones (additive shader), a warm point
// light and rising embers. The fire itself blocks the player a little so nobody walks through it.
import * as THREE from 'three';
import { scene, U } from '../../core.js';
import { TAU, rnd, rand } from '../../utils.js';
import { bake, jitter } from '../geometry.js';
import { addCol, pushGeo } from '../world.js';
import { sparks } from '../../fx/particles.js';

const EMBER = new THREE.Color('#ff9c4d');
const flameMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: U.time, uPh: { value: 0 } },
  vertexShader: `uniform float uTime, uPh; varying float vH;
  void main(){
    vec3 p = position;
    float h = clamp(p.y / 0.7, 0.0, 1.0); vH = h;
    p.x += sin(uTime * 9.0 + p.y * 8.0 + uPh) * 0.06 * h;
    p.z += cos(uTime * 7.0 + p.y * 7.0 + uPh * 1.7) * 0.06 * h;
    p.y *= 1.0 + 0.14 * sin(uTime * 13.0 + uPh);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`,
  fragmentShader: `varying float vH; void main(){
    vec3 c = mix(vec3(1.0, 0.95, 0.55), vec3(1.0, 0.4, 0.08), vH);
    gl_FragColor = vec4(c, pow(max(1.0 - vH, 0.0), 0.8) * 0.8);   // max(): vH can interpolate to 1.0000001 and pow(<0) is NaN
  }`,
});

const fires = [];

export function addCampfire(x, y, z, pal) {
  const wood = (cen, n, c) => c.set('#4a3524').offsetHSL(0, 0, rand(-0.03, 0.03) - Math.max(0, cen.y - 0.45) * 0.2);   // charred tips
  const ash = new THREE.CircleGeometry(0.55, 10).rotateX(-Math.PI / 2);
  pushGeo(bake(ash, (cen, n, c) => c.set('#2b2724').offsetHSL(0, 0, rand(-0.02, 0.02))), x, y + 0.035, z);
  for (let k = 0, n = 9; k < n; k++) {   // stone ring
    const a = k / n * TAU + rand(-0.12, 0.12), s = rand(0.12, 0.19);
    const g = jitter(new THREE.DodecahedronGeometry(s, 0), s * 0.2).scale(1.2, 0.8, 1);
    pushGeo(bake(g, (cen, nn, c) => c.copy(pal.rock).offsetHSL(0, 0, rand(-0.06, 0.04) - 0.05)), x + Math.cos(a) * 0.62, y + s * 0.3, z + Math.sin(a) * 0.62);
  }
  for (let k = 0, n = 4; k < n; k++) {   // logs leaning on each other
    const a = k / n * TAU + rand(-0.3, 0.3), g = jitter(new THREE.CylinderGeometry(0.07, 0.085, 0.8, 6), 0.01);
    g.translate(0, 0.4, 0).rotateZ(1.0).translate(0.5, 0.03, 0).rotateY(a);
    pushGeo(bake(g, wood), x, y, z);
  }
  const flames = [[0.22, 0.7, 0], [0.16, 0.5, 2.1], [0.11, 0.36, 4.2]].map(([r, h, ph]) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, 0.7, 7, 4, true).translate(0, 0.35, 0), flameMat.clone());
    m.scale.y = h / 0.7;   // scale the mesh, not the geometry: the shader fades by local height 0..0.7
    m.material.uniforms.uPh.value = ph;
    m.position.set(x + rand(-0.04, 0.04), y + 0.08, z + rand(-0.04, 0.04));
    m.rotation.y = rand(0, TAU); m.frustumCulled = false;
    scene.add(m);
    return m;
  });
  const light = new THREE.PointLight('#ff9a4a', 0, 9, 1.7);
  light.position.set(x, y + 0.7, z);
  scene.add(light);
  addCol({ x, z, y: y + 0.5, r: 0.7, thick: 0.6, ground: false, depth: 0 });
  fires.push({ x, y, z, light, ph: rand(0, TAU) });
}

export function updateCampfires(t, dt, emit) {
  for (const f of fires) {
    f.light.intensity = 2.6 + Math.sin(t * 11 + f.ph) * 0.35 + Math.sin(t * 23 + f.ph * 2) * 0.25;
    if (emit && rnd() < dt * 7) sparks.emit(f.x + rand(-0.12, 0.12), f.y + 0.5, f.z + rand(-0.12, 0.12), rand(-0.15, 0.15), rand(0.6, 1.3), rand(-0.15, 0.15), rand(1.2, 2.4), rand(0.03, 0.06), EMBER, 0.9);
  }
}
