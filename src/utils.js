import * as THREE from 'three';

export const V3 = THREE.Vector3, TAU = Math.PI * 2;
export const $ = s => document.querySelector(s);
export const { clamp, lerp, smoothstep } = THREE.MathUtils;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// seeded rng (mulberry32) so the world is the same every run
let seed = 7;
export const reseed = s => { seed = s; };   // buildLevel reseeds, so module-load rand() calls can't shift the world
export const rnd = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const rand = (a, b) => a + (b - a) * rnd();
export const pick = a => a[(rnd() * a.length) | 0];

// GLSL literal helpers (colours are converted to linear space)
export const f4 = v => v.toFixed(4);
export const col3 = hex => { const c = new THREE.Color(hex); return `vec3(${f4(c.r)},${f4(c.g)},${f4(c.b)})`; };
