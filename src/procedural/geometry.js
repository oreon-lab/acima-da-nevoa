// Low-poly geometry building blocks: floating rock masses, per-face colouring, palettes.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, TAU, rand } from '../utils.js';

// irregular outline: a few sine harmonics around the circle
export const shapeH = (amp = 1) => [rand(0.05, 0.12) * amp, rand(0, TAU), rand(0.03, 0.08) * amp, rand(0, TAU), rand(0.03, 0.09) * amp, rand(0, TAU)];
export const shapeAt = (h, a) => h ? 1 + h[0] * Math.sin(3 * a + h[1]) + h[2] * Math.sin(5 * a + h[3]) + h[4] * Math.sin(2 * a + h[5]) : 1;

// Non-indexed geometry with flat per-face colour and a per-vertex wind weight (aSway).
const tmp = new V3();
export function bake(geo, colorFn, swayFn) {
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
  const p = geo.attributes.position, n = p.count;
  const col = new Float32Array(n * 3), sw = new Float32Array(n);
  const a = new V3(), b = new V3(), c = new V3(), cen = new V3(), nrm = new V3(), color = new THREE.Color();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    cen.copy(a).add(b).add(c).divideScalar(3);
    nrm.subVectors(c, b).cross(tmp.subVectors(a, b)).normalize();
    colorFn(cen, nrm, color);
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = color.r; col[(i + k) * 3 + 1] = color.g; col[(i + k) * 3 + 2] = color.b;
      sw[i + k] = swayFn ? swayFn(p.getX(i + k), p.getY(i + k), p.getZ(i + k)) : 0;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  geo.computeVertexNormals();
  return geo;
}

export function jitter(geo, amt) {
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + rand(-amt, amt), p.getY(i) + rand(-amt, amt), p.getZ(i) + rand(-amt, amt));
  return geo;
}

// Lathe-like floating rock: profile = [[radiusFactor, y, jitter], ...] from top centre down to the tip.
export function rockMass(R0, h, prof, segs, colorFn) {
  const pos = [], idx = [], rings = [];
  for (const [rf, y, j = 0.05] of prof) {
    const ring = [];
    if (rf === 0) { ring.push(pos.length / 3); pos.push(0, y, 0); }
    else {
      const low = y < -0.8, aoff = low ? rand(0, 0.5) * TAU / segs : 0, tw = Math.max(0, -y - 1) / R0 * 0.5;
      for (let s = 0; s < segs; s++) {
        const a = s / segs * TAU + aoff;
        const r = R0 * rf * shapeAt(h, a + tw) * (1 + rand(-j, j));
        ring.push(pos.length / 3);
        pos.push(Math.cos(a) * r, y + (low ? rand(-1, 1) * j * R0 * 0.6 : rand(-0.012, 0.012)), Math.sin(a) * r);
      }
    }
    rings.push(ring);
  }
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let s = 0; s < segs; s++) {
      const s2 = (s + 1) % segs;
      if (A.length === 1) idx.push(A[0], B[s2], B[s]);
      else if (B.length === 1) idx.push(A[s], A[s2], B[0]);
      else idx.push(A[s], A[s2], B[s2], A[s], B[s2], B[s]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return bake(g, colorFn);
}
export const P_ISLAND = d => [[0, 0, 0], [0.34, 0, 0.05], [0.67, 0, 0.04], [0.93, 0, 0.025], [1, -0.06, 0.02], [1.035, -0.24, 0.03], [0.96, -0.5, 0.04], [0.99, -0.95, 0.06], [0.9, -1.7, 0.09], [0.78, -0.34 * d, 0.15], [0.62, -0.5 * d, 0.17], [0.42, -0.68 * d, 0.2], [0.22, -0.86 * d, 0.22], [0, -d, 0]];
export const P_STONE = d => [[0, 0, 0], [0.55, 0, 0.04], [0.95, 0, 0.03], [1, -0.06, 0.02], [1.05, -0.22, 0.03], [0.97, -0.5, 0.05], [0.9, -0.3 * d, 0.1], [0.68, -0.55 * d, 0.14], [0.36, -0.8 * d, 0.17], [0, -d, 0]];
export const P_SLAB = d => [[0, 0, 0], [0.75, 0, 0.03], [0.97, 0, 0.02], [1, -0.05, 0.02], [1.04, -0.2, 0.03], [0.96, -0.36, 0.03], [0.7, -0.6 * d, 0.12], [0, -d, 0]];
export const P_PILLAR = d => [[0, 0, 0], [0.9, 0, 0], [1.06, -0.05, 0], [1.06, -0.26, 0], [0.86, -0.32, 0], [0.86, -d * 0.55, 0.02], [0.93, -d * 0.58, 0.02], [0.93, -d * 0.7, 0.03], [0.82, -d, 0.05], [0.5, -d - 0.7, 0.14], [0, -d - 1.5, 0]];

// colours drift from lush green (low) to pale silver and blossom (high)
export function palette(t) {
  const L = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), t);
  return {
    t,
    grass: L('#5b7d3e', '#8d9d86'), tip: L('#b2cc70', '#e0e4cd'),
    dirt: L('#6b5842', '#857a6d'), rock: L('#716d67', '#9c9da5'),
    moss: L('#587a38', '#98a88e'), stone: L('#a29b8d', '#c7c5c1'), bark: L('#5a4636', '#6f655d'),
    bush: L('#4f7a36', '#8fa38a'),
    leaf: t < 0.3 ? ['#5c8c3a', '#6e9a44', '#4f7d35', '#7aa04a'] : t < 0.66 ? ['#c7913d', '#b36a33', '#8a9a3c', '#d4a64a', '#6e9444'] : ['#efd6de', '#e6c2cf', '#f5ebe6', '#d9dfcf'],
    flowers: t < 0.5 ? ['#ffffff', '#ffe27a', '#f3b7d0', '#c9b8f0'] : ['#ffffff', '#cfe0ff', '#f7d2e4'],
  };
}
export function islandColor(pal) {
  return (cen, n, c) => {
    if (cen.y > -0.17 || (n.y > 0.55 && cen.y > -0.35)) c.copy(pal.grass).offsetHSL(rand(-0.012, 0.012), rand(-0.04, 0.04), rand(-0.03, 0.03));
    else if (cen.y > -1.0) c.copy(pal.dirt).offsetHSL(0, 0, rand(-0.03, 0.03));
    else {
      const band = Math.sin(cen.y * 2.3) * 0.5 + Math.sin(cen.y * 0.9 + 1) * 0.5;
      c.copy(pal.rock).offsetHSL(band * 0.012, band * 0.03, band * 0.045 + rand(-0.025, 0.025));
      if (n.y > 0.25) c.lerp(pal.moss, 0.55);
    }
  };
}

export const crystalGeo = (r, h, seg = 6) => new THREE.LatheGeometry([[0, -h], [r, -h * 0.42], [r * 0.92, h * 0.5], [0, h]].map(([x, y]) => new THREE.Vector2(x, y)), seg);

// theme palette: '#hex' strings become colours; arrays (leaf, flowers) and other values are used as-is
export function themed(pal, over) {
  if (!over) return pal;
  const out = { ...pal };
  for (const [k, v] of Object.entries(over)) out[k] = typeof v === 'string' && v[0] === '#' ? new THREE.Color(v) : v;
  return out;
}
