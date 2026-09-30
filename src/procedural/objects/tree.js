// Low-poly trees, one builder per species. Every tree has a leaning, flared trunk; the broadleaf kinds grow real
// branches and carry a crown blob at each tip (flat underneath, lighter on top, with small leaf tufts).
//   oak / cherry  - default; cherry is the pale-blossom version used high up
//   pine          - tiered skirts, pale tips when high
//   birch         - slender white trunk with dark bands, airy pale crown
//   willow        - drooping strands (used by the pond island)      acacia - windswept umbrella (the ruins)
// Species come from pal.style (themes) or from altitude. Scaled-up background trees (scale != 1) use a light version.
import * as THREE from 'three';
import { TAU, rnd, rand, pick } from '../../utils.js';
import { WIND } from '../../config.js';
import { bake, jitter } from '../geometry.js';
import { addCol, pushGeo } from '../world.js';

const V = THREE.Vector3, UP = new V(0, 1, 0), Q = new THREE.Quaternion(), D = new V();

// tapered stick from a to b
function limb(a, b, r0, r1) {
  D.subVectors(b, a);
  const len = D.length(), g = new THREE.CylinderGeometry(r1, r0, len, 5, 1, true).translate(0, len / 2, 0);
  g.applyQuaternion(Q.setFromUnitVectors(UP, D.normalize()));
  return g.translate(a.x, a.y, a.z);
}

// tapered trunk with a flared foot, bending along `lean` (x/z offset reached at the top); at(t) = point on its axis
function trunk(h, r0, r1, lean) {
  const g = new THREE.CylinderGeometry(r1, r0, h + 0.3, 6, 6, true).translate(0, (h + 0.3) / 2 - 0.15, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(p.getY(i), 0) / h, f = 1 + 0.9 * (1 - Math.min(t * 4, 1)) ** 2;
    p.setXYZ(i, p.getX(i) * f + lean.x * t * t, p.getY(i), p.getZ(i) * f + lean.z * t * t);
  }
  return { geo: jitter(g, r0 * 0.06), at: t => new V(lean.x * t * t, h * t, lean.z * t * t) };
}

const bark = (pal, dark) => { const b = dark ? pal.bark.clone().multiplyScalar(0.8) : pal.bark; return (cen, n, c) => c.copy(b).offsetHSL(0, 0, rand(-0.03, 0.03) - Math.max(0, 0.45 - cen.y) * 0.07); };
const randLean = s => new V(rand(-0.14, 0.14) * s, 0, rand(-0.14, 0.14) * s);

// roots spreading over the ground around the foot
function buttresses({ scale: s, put, pal }) {
  for (let k = 0, n = 3 + (rnd() * 2 | 0); k < n; k++) {
    const a = rand(0, TAU), len = rand(0.25, 0.42) * s;
    const g = new THREE.ConeGeometry(0.06 * s, len, 4, 1, true).translate(0, len / 2, 0).rotateZ(1.25).rotateY(Math.PI - a).translate(Math.cos(a) * 0.06 * s, 0.02, Math.sin(a) * 0.06 * s);
    put(g, bark(pal), () => 0);
  }
}

// crown blob: flattened underneath, wider than tall; lighter on top and darker inside
function blob(s, x, y, z, base, sway, detail = 1, sx = 1.12, sy = 0.9) {
  const b = jitter(new THREE.IcosahedronGeometry(s, detail), s * 0.15), p = b.attributes.position;
  for (let i = 0; i < p.count; i++) { const py = p.getY(i); p.setXYZ(i, p.getX(i) * sx, (py < 0 ? py * 0.55 : py) * sy, p.getZ(i) * sx); }
  b.translate(x, y, z);
  return bake(b, (cen, n, c) => c.copy(base).offsetHSL(rand(-0.012, 0.012), rand(-0.02, 0.02), n.y * 0.1 - 0.04 + (cen.y - y) / s * 0.05 + rand(-0.03, 0.03)), sway);
}

// small pale leaf clusters on the upper half of a crown break up the smooth outline
function tufts({ push }, x, y, z, s, base, n) {
  const light = base.clone().offsetHSL(0, 0.02, 0.09);
  for (let k = 0; k < n; k++) {
    const a = rand(0, TAU), e = rand(0.15, 1.2), r = s * 1.08, ts = rand(0.05, 0.09) * Math.max(s, 0.6);
    const g = new THREE.OctahedronGeometry(ts, 0).scale(1, 0.6, 1.4).rotateY(rand(0, TAU)).translate(x + Math.cos(a) * Math.cos(e) * r, y + Math.sin(e) * r * 0.85, z + Math.sin(a) * Math.cos(e) * r);
    push(bake(g, (cen, n2, c) => c.copy(light).offsetHSL(rand(-0.01, 0.01), 0, rand(-0.03, 0.03)), () => 0.12));
  }
}

const crownSway = h => (px, py) => 0.05 + Math.max(py - h * 0.7, 0) * 0.045;

// ---------------------------------------------------------------- broadleaf: oak (compact) / cherry (wide, dark bark)
function broadleaf(c, o) {
  const { pal, scale: s, lod, put, push } = c, h = rand(o.h[0], o.h[1]) * s, tr = trunk(h, 0.2 * s, 0.075 * s, randLean(s));
  put(tr.geo, bark(pal, o.dark), (px, py) => Math.max(py, 0) / (h + 1) * 0.05);
  const leaf = new THREE.Color(pick(pal.leaf)).offsetHSL(0, o.sat || 0, 0), tips = [[tr.at(1), 0.74 * o.wide]];
  if (lod) for (let k = 0; k < 2; k++) tips.push([tr.at(0.9).add(new V(rand(-0.4, 0.4) * s, 0.15 * s, rand(-0.4, 0.4) * s)), 0.5 * o.wide]);
  else {
    buttresses(c);
    for (let k = 0, n = 3 + (rnd() * 2 | 0); k < n; k++) {   // branches spiral up the upper trunk, each carrying a crown
      const a = k * 2.4 + rand(0, 1), len = rand(0.45, 0.85) * s * o.wide, from = tr.at(0.5 + k * 0.1);
      const to = from.clone().add(new V(Math.cos(a) * len, len * o.rise, Math.sin(a) * len));
      put(limb(from, to, 0.06 * s, 0.022 * s), bark(pal, o.dark), () => 0.03);
      tips.push([to, rand(0.48, 0.66) * o.wide]);
    }
  }
  for (const [p, r] of tips) {
    const rr = r * s, col = leaf.clone().offsetHSL(rand(-0.02, 0.02), 0, rand(-0.03, 0.03)), cy = p.y + rr * 0.35;
    push(blob(rr, p.x, cy, p.z, col, crownSway(h), lod ? 0 : 1));
    if (!lod) tufts(c, p.x, cy, p.z, rr, col, 5);
  }
  return h;
}

// ---------------------------------------------------------------- pine: 5 wavy skirts, alternating twist
function pine(c) {
  const { pal, scale: s, lod, put } = c, h = rand(0.9, 1.4) * s, t = pal.t, tr = trunk(h, 0.13 * s, 0.05 * s, randLean(s * 0.5));
  put(tr.geo, bark(pal), (px, py) => Math.max(py, 0) / (h + 1) * 0.05);
  const leaf = new THREE.Color('#4d6e3a').lerp(pal.bush, 0.3), tip = new THREE.Color('#dfe8e4'), tiers = lod ? 3 : 5;
  let yy = h * 0.26, r = rand(1.0, 1.25) * s;
  for (let k = 0; k < tiers; k++) {
    const hgt = r * 1.25, cone = jitter(new THREE.ConeGeometry(r, hgt, 9, 1, true), 0.05 * s), p = cone.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) - Math.abs(Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 3 + k)) * r * 0.13);   // wavy skirt
    const ax = tr.at(Math.min(yy / h, 1));
    cone.rotateY(rand(0, TAU)).translate(ax.x, yy + hgt / 2, ax.z);
    const snow = t > 0.55 ? (k + 1) / (tiers * 2) : 0;
    put(cone, (cen, n, col) => col.copy(leaf).lerp(tip, snow * (n.y > 0.35 ? 1 : 0.2)).offsetHSL(0, 0, n.y * 0.09 - 0.06 + k / tiers * 0.05 + rand(-0.03, 0.03)), (px, py) => 0.03 + Math.max(py - h * 0.4, 0) * 0.03);
    yy += hgt * 0.55; r *= 0.76;
  }
  return h;
}

// ---------------------------------------------------------------- birch: white trunk, dark bands, one soft crown of overlapping blobs
function birch(c) {
  const { pal, scale: s, lod, put, push } = c, h = rand(1.9, 2.6) * s, tr = trunk(h, 0.1 * s, 0.045 * s, randLean(s)), ph = rand(0, TAU), mark = new THREE.Color('#38342f');
  put(tr.geo, (cen, n, col) => { col.copy(pal.bark).offsetHSL(0, 0, rand(-0.03, 0.03)); if (Math.sin(cen.y * 11 + ph) > 0.72 || rnd() < 0.05) col.lerp(mark, 0.85); }, (px, py) => Math.max(py, 0) / (h + 1) * 0.05);
  const side = () => (rnd() < 0.5 ? -1 : 1) * rand(0.35, 0.6) * s;   // spread sideways so the crown doesn't stack like a totem
  const tips = [[tr.at(1), 0.5], [tr.at(0.88).add(new V(side(), 0, side())), 0.42], [tr.at(0.74).add(new V(side(), 0, side())), 0.38]];
  if (!lod) for (let k = 0, n = 3 + (rnd() * 2 | 0); k < n; k++) {   // thin limbs with their own small crowns
    const a = k * 2.4 + rand(0, 1), len = rand(0.3, 0.5) * s, from = tr.at(0.5 + k * 0.08), to = from.clone().add(new V(Math.cos(a) * len, len * 0.6, Math.sin(a) * len));
    put(limb(from, to, 0.035 * s, 0.015 * s), (cen, n2, col) => col.copy(pal.bark).multiplyScalar(0.9), () => 0.05);
    tips.push([to, rand(0.3, 0.42)]);
  }
  const base = new THREE.Color(pick(pal.leaf)).offsetHSL(0, 0.12, 0.05);   // one colour per tree, a little brighter and pinker so it reads as blossom
  for (const [p, r] of tips) {
    const rr = r * s, col = base.clone().offsetHSL(rand(-0.02, 0.02), 0, rand(-0.04, 0.04)), cy = p.y + rr * 0.3;
    push(blob(rr, p.x, cy, p.z, col, crownSway(h), lod ? 0 : 1));
    if (!lod) tufts(c, p.x, cy, p.z, rr, col, 3);
  }
  return h;
}

// ---------------------------------------------------------------- willow: short thick trunk, dome crown, a dense curtain of swaying strands
function willow(c) {
  const { pal, scale: s, lod, put, push } = c, h = rand(1.0, 1.4) * s, tr = trunk(h, 0.26 * s, 0.13 * s, randLean(s * 1.6)), top = tr.at(1);
  put(tr.geo, bark(pal, true), (px, py) => Math.max(py, 0) / (h + 1) * 0.04);
  if (!lod) buttresses(c);
  const leaf = pal.tip.clone().lerp(pal.moss, 0.55).offsetHSL(0, -0.04, -0.02);   // muted yellow-green
  for (let k = 0; k < 2; k++) push(blob(rand(0.8, 1.0) * s, top.x + rand(-0.15, 0.15) * s, h + 0.3 * s + k * 0.12 * s, top.z + rand(-0.15, 0.15) * s, leaf, crownSway(h), lod ? 0 : 1, 1.25, 0.75));
  for (let i = 0, n = lod ? 12 : 36; i < n; i++) {   // hanging strands, bending away from the trunk
    const a = i / n * TAU + rand(-0.15, 0.15), rr = rand(0.7, 1.05) * s, len = Math.min(rand(0.8, 1.5) * s, h + 0.1 * s);
    const g = new THREE.ConeGeometry(0.06 * s, len, 3, 5, true).rotateX(Math.PI).translate(0, -len / 2, 0), p = g.attributes.position;
    for (let v = 0; v < p.count; v++) { const t = -p.getY(v) / len; p.setX(v, p.getX(v) + Math.cos(a) * t * t * 0.3 * s); p.setZ(v, p.getZ(v) + Math.sin(a) * t * t * 0.3 * s); }
    g.translate(top.x + Math.cos(a) * rr, h + 0.2 * s, top.z + Math.sin(a) * rr);
    push(bake(g, (cen, n2, col) => col.copy(leaf).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.04, 0.05) + (cen.y - h) / len * 0.08), (px, py) => Math.min((h + 0.2 * s - py) / len, 1) * 0.5));
  }
  return h;
}

// ---------------------------------------------------------------- acacia: thin trunk leaning downwind, flat layered crown
function acacia(c) {
  const { pal, scale: s, lod, put, push } = c, h = rand(1.5, 2.1) * s, lean = new V(WIND.x, 0, WIND.y).multiplyScalar(rand(0.5, 0.8) * s);
  const tr = trunk(h, 0.13 * s, 0.06 * s, lean), top = tr.at(1);
  put(tr.geo, bark(pal), (px, py) => Math.max(py, 0) / (h + 1) * 0.05);
  if (!lod) buttresses(c);
  const leaf = new THREE.Color(pick(pal.leaf)), discs = [[0, 0, 0, 0.78], [0.55, 0.12, -0.2, 0.55], [-0.45, -0.1, 0.35, 0.5]];
  for (const [dx, dy, dz, r] of discs.slice(0, lod ? 1 : 3)) {
    const at = new V(top.x + dx * s, top.y + dy * s, top.z + dz * s), col = leaf.clone().offsetHSL(rand(-0.02, 0.02), 0, rand(-0.03, 0.03));
    if (!lod && (dx || dz)) put(limb(tr.at(0.8), at, 0.04 * s, 0.02 * s), bark(pal), () => 0.03);
    push(blob(r * s, at.x, at.y + r * s * 0.3, at.z, col, crownSway(h), lod ? 0 : 1, 1.9, 0.5));
  }
  return h;
}

const SPECIES = {
  oak: c => broadleaf(c, { h: [1.15, 1.7], wide: 1, rise: 0.7 }),
  cherry: c => broadleaf(c, { h: [1.1, 1.6], wide: 1.3, rise: 0.45, dark: true, sat: 0.16 }),
  pine, birch, willow, acacia,
};

export function addTree(x, y, z, pal, scale = 1, detailed = false) {
  const t = pal.t;
  let kind = pal.style ?? (t > 0.66 ? 'cherry' : t > 0.33 && t < 0.7 && rnd() < 0.45 ? 'pine' : 'oak');
  if (kind === 'birch' && rnd() < 0.3) kind = 'cherry';   // a few blossoming trees among the birches
  const h = SPECIES[kind]({ pal, scale, lod: scale !== 1 && !detailed, put: (g, fn, sway) => pushGeo(bake(g, fn, sway), x, y, z), push: g => pushGeo(g, x, y, z) });
  // trunk blocks the player (scaled-up background trees are not solid)
  if (scale === 1 || detailed) addCol({ x, z, y: y + h, r: (kind === 'willow' ? 0.3 : 0.22) * scale, thick: h + 0.5, ground: false, depth: 0 });
}
