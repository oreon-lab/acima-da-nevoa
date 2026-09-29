// Air motes, dust/spark pools and wind streaks.
import * as THREE from 'three';
import { scene, camera, U } from '../core.js';
import { WIND, settings } from '../config.js';
import { V3, TAU, rnd, rand, f4, col3 } from '../utils.js';

const tmp = new V3(), UP = new V3(0, 1, 0);

// ------------------------------------------------------------ floating motes, wrapped in a box around the camera
{
  const N = 900, g = new THREE.BufferGeometry(), p = new Float32Array(N * 3), r = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { p.set([rand(0, 70), rand(0, 36), rand(0, 70)], i * 3); r.set([rnd(), rnd(), rnd(), rnd()], i * 4); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(r, 4));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.time, uCam: { value: camera.position }, uScale: U.pscale },
    vertexShader: `uniform float uTime, uScale; uniform vec3 uCam; attribute vec4 aRand; varying float vA;
    const vec3 BOX = vec3(70.0, 36.0, 70.0);
    void main(){
      vec3 p = position;
      p.xz += vec2(${f4(WIND.x)}, ${f4(WIND.y)}) * uTime * (0.4 + aRand.x * 0.8);
      p.y += uTime * (0.05 + aRand.z * 0.12) + sin(uTime * 0.6 + aRand.y * 6.28) * 0.5;
      p.x += sin(uTime * 0.8 + aRand.w * 6.28) * 0.35;
      p = mod(p - uCam + BOX * 0.5, BOX) - BOX * 0.5 + uCam;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float d = -mv.z;
      gl_PointSize = uScale * (0.02 + aRand.w * 0.035) / max(d, 0.1);
      vec3 r = abs(p - uCam) / (BOX * 0.5);
      float edge = 1.0 - smoothstep(0.6, 1.0, max(r.x, max(r.y, r.z)));
      vA = edge * smoothstep(2.5, 6.0, d) * (0.55 + 0.45 * sin(uTime * (0.7 + aRand.x * 1.5) + aRand.z * 30.0));
      gl_Position = projectionMatrix * mv;
    }`,
    fragmentShader: `varying float vA; void main(){ float a = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(${col3('#fff1d6')} * 1.4, a * a * vA * 0.8); }`,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
}

// ------------------------------------------------------------ CPU particle pool
class Pool {
  constructor(n, additive, drag, grav) {
    Object.assign(this, { n, drag, grav, i: 0 });
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.s0 = new Float32Array(n); this.a0 = new Float32Array(n);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    const pts = new THREE.Points(this.geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: U.pscale },
      vertexShader: `attribute float aSize, aAlpha; attribute vec3 aColor; uniform float uScale; varying float vA; varying vec3 vC;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(-mv.z, 0.1); vA = aAlpha; vC = aColor; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ float a = (1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5))) * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC, a); }`,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
  }
  emit(x, y, z, vx, vy, vz, life, size, color, alpha = 1) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.col.set([color.r, color.g, color.b], i * 3);
    this.life[i] = this.max[i] = life; this.s0[i] = size; this.a0[i] = alpha;
  }
  update(dt) {
    const dr = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = 1 - Math.max(this.life[i], 0) / this.max[i], j = i * 3;
      this.v[j] *= dr; this.v[j + 1] = this.v[j + 1] * dr + this.grav * dt; this.v[j + 2] *= dr;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      this.size[i] = this.s0[i] * (1 + k * 1.3);
      this.alpha[i] = this.a0[i] * Math.min(1, k * 10) * (1 - k) ** 1.4;
    }
    for (const a of ['position', 'aSize', 'aAlpha', 'aColor']) this.geo.attributes[a].needsUpdate = true;
  }
}
const dust = new Pool(300, false, 3.2, -0.6);
export const sparks = new Pool(300, true, 2.2, 0.5);
export const SPARK = new THREE.Color('#ffd79a'), SPARK_W = new THREE.Color('#fff3dc');
const DUST = new THREE.Color('#e3d8c2');

export function puff(x, y, z, n, spd, size, alpha = 0.4, color = DUST, lift = 1) {
  n = Math.ceil(n * (settings.particles ? 1 : 0.3));
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = spd * rand(0.4, 1);
    dust.emit(x + Math.cos(a) * 0.25, y + 0.06, z + Math.sin(a) * 0.25, Math.cos(a) * s, rand(0.3, 1.0) * lift, Math.sin(a) * s, rand(0.6, 1.1), size * rand(0.7, 1.3), color, alpha);
  }
}
export function burst(x, y, z, n, spd, color = SPARK) {
  n = Math.ceil(n * (settings.particles ? 1 : 0.3));
  for (let i = 0; i < n; i++) {
    const v = tmp.set(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize().multiplyScalar(spd * rand(0.5, 1));
    sparks.emit(x, y, z, v.x, v.y, v.z, rand(0.7, 1.5), rand(0.06, 0.13), color, 1);
  }
}

// ------------------------------------------------------------ wind streaks: thin curling ribbons during gusts
const streakGeo = new THREE.PlaneGeometry(1, 1, 60, 1);
const streaks = Array.from({ length: 7 }, () => {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uStart: { value: new V3() }, uDir: { value: new V3(1, 0, 0) }, uLife: { value: 0 }, uLen: { value: 5 }, uPh: { value: 0 }, uAmp: { value: 0.4 } },
    vertexShader: `uniform vec3 uStart, uDir; uniform float uLife, uLen, uPh, uAmp; varying float vA;
    void main(){
      float s = position.x + 0.5;
      vec3 side = normalize(cross(uDir, vec3(0.0, 1.0, 0.0)));
      vec3 p = uStart + uDir * (uLife * uLen * 2.2 + s * uLen);
      float w = s * 6.0 + uPh + uLife * 5.0;
      p += vec3(0.0, sin(w) * uAmp, 0.0) + side * cos(w * 0.7) * uAmp * 0.8;
      p.y += position.y * 0.035 * sin(3.14159 * s);
      vA = sin(3.14159 * s) * sin(3.14159 * uLife);
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
    fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(1.0, 0.98, 0.94, vA * 0.22); }`,
  });
  const mesh = new THREE.Mesh(streakGeo, m);
  mesh.frustumCulled = false; mesh.visible = false;
  scene.add(mesh);
  return { mesh, u: m.uniforms, life: 1, dur: 2, wait: rand(0, 3) };
});

export function updateFx(dt, focus) {
  dust.update(dt); sparks.update(dt);
  for (const s of streaks) {
    if (s.life < 1) { s.life += dt / s.dur; s.u.uLife.value = Math.min(s.life, 1); if (s.life >= 1) s.mesh.visible = false; continue; }
    s.wait -= dt * (0.3 + U.gust.value);
    if (s.wait > 0) continue;
    const a = rand(0, TAU), d = rand(3, 13), len = rand(3, 7);
    s.u.uDir.value.set(WIND.x, rand(-0.04, 0.08), WIND.y).applyAxisAngle(UP, rand(-0.3, 0.3)).normalize();
    s.u.uStart.value.set(focus.x + Math.cos(a) * d, focus.y + rand(0.3, 3.5), focus.z + Math.sin(a) * d).addScaledVector(s.u.uDir.value, -len * 1.6);
    s.u.uLen.value = len; s.u.uPh.value = rand(0, TAU); s.u.uAmp.value = rand(0.15, 0.55);
    s.life = 0; s.dur = rand(1.8, 3); s.wait = rand(1, 4); s.mesh.visible = true;
  }
}
