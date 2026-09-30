// Huge islands: a winding dirt path from the entry rim to the exit rim, with lanterns and a gate half-way; side
// paths to a stone circle, a pond and a cairn on the rim. Two secrets: a crystal grotto on a shelf under the rim
// (climb down past the cairn) and a small islet in the sky above a hidden wind vent.
import * as THREE from 'three';
import { TAU, rnd, rand } from '../utils.js';
import { bake, jitter, shapeAt } from './geometry.js';
import { pushGeo, freeSpot, clearOf, secrets } from './world.js';
import {
  addPlatform, addColumn, addStele, addPond, addReeds, addCrystalCluster, addArch, addUpdraft, addIslet, addPebble,
  addLantern, addPickup, addPavement,
} from './objects/index.js';

const W = 1.5;   // path width
export const at = (is, a, f) => { const r = is.R * shapeAt(is.h, a) * f; return { x: is.x + Math.cos(a) * r, z: is.z + Math.sin(a) * r }; };

// smooth path through waypoints, pushed out of solid occupied circles (not other paths), kept on the island
export function route(is, pts, w = W) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, 0, p.z)));
  const s = curve.getSpacedPoints(Math.max(6, Math.round(curve.getLength() / 0.8))).map(v => ({ x: v.x, z: v.z }));
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 1; i < s.length - 1; i++) {
      const p = s[i];
      if (pass) { p.x = (s[i - 1].x + p.x * 2 + s[i + 1].x) / 4; p.z = (s[i - 1].z + p.z * 2 + s[i + 1].z) / 4; }
      for (const o of is.occ) {
        if (!o.solid || o.path) continue;
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), need = o.r + w / 2 + 0.2;
        if (d < need && d > 1e-4) { p.x = o.x + dx / d * need; p.z = o.z + dz / d * need; }
      }
      const dx = p.x - is.x, dz = p.z - is.z, d = Math.hypot(dx, dz), lim = is.R * shapeAt(is.h, Math.atan2(dz, dx)) * 0.9;
      if (d > lim) { p.x = is.x + dx / d * lim; p.z = is.z + dz / d * lim; }
    }
  }
  return s;
}

// dirt ribbon with a few flat stones (or worn paving); claims its ground so grass, trees and props keep off it
export function drawPath(is, s, { w: pw = W, paved = false } = {}) {
  const pal = is.pal, pos = [], W = pw;
  const edge = s.map((p, i) => {
    const a = s[Math.max(i - 1, 0)], b = s[Math.min(i + 1, s.length - 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / l, tz = (b.z - a.z) / l, hw = W / 2 * rand(0.85, 1.15);
    return [p.x - tz * hw, p.z + tx * hw, p.x + tz * hw, p.z - tx * hw];
  });
  for (let i = 0; i < s.length - 1; i++) {
    const [lx, lz, rx, rz] = edge[i], [lx2, lz2, rx2, rz2] = edge[i + 1];
    pos.push(lx, 0, lz, rx2, 0, rz2, rx, 0, rz, lx, 0, lz, lx2, 0, lz2, rx2, 0, rz2);
  }
  // make every triangle face up, whatever way the path turns
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i + 3] - pos[i], az = pos[i + 5] - pos[i + 2], bx = pos[i + 6] - pos[i], bz = pos[i + 8] - pos[i + 2];
    if (az * bx - ax * bz < 0) for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pushGeo(bake(g, paved
    ? (cen, n, c) => { c.copy(pal.stone).multiplyScalar(rand(0.78, 0.95)); if (rnd() < 0.15) c.lerp(pal.moss, 0.4); }
    : (cen, n, c) => { c.copy(pal.dirt).offsetHSL(0, -0.05, rand(0.02, 0.08)); if (rnd() < 0.12) c.lerp(pal.moss, 0.35); }), 0, is.y + 0.035, 0);
  s.forEach((p, i) => {
    if (i % 2 === 0) is.occ.push({ x: p.x, z: p.z, r: W / 2 + 0.35, solid: true, path: true });
    if (i % 2 === 1 && rnd() < (paved ? 0.6 : 0.22)) {
      const r = rand(0.18, 0.3), st = jitter(new THREE.DodecahedronGeometry(r, 0), r * 0.15).scale(1.3, 0.22, 1.1).rotateY(rand(0, TAU));
      pushGeo(bake(st, (cen, n, c) => c.copy(pal.stone).multiplyScalar(rand(0.85, 1))), p.x + rand(-0.35, 0.35), is.y + 0.03, p.z + rand(-0.35, 0.35));
    }
  });
}
const nearest = (s, p) => s.reduce((a, b) => ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 < (a.x - p.x) ** 2 + (a.z - p.z) ** 2 ? b : a));
// side path from the main one to the edge of a place (circle of radius r around c)
export function branch(is, main, c, r) {
  const from = nearest(main, c), a = Math.atan2(from.z - c.z, from.x - c.x), to = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
  const mid = { x: (from.x + to.x) / 2 + rand(-1.5, 1.5), z: (from.z + to.z) / 2 + rand(-1.5, 1.5) };
  drawPath(is, route(is, [from, mid, to]));
  return a;   // direction from the place towards the path
}

function stoneCircle(is, main, c, tops) {
  const y = is.y, pal = is.pal;
  is.occ.push({ ...c, r: 4.3, solid: true });
  const door = branch(is, main, c, 4.6);
  addPavement(c.x, y, c.z, 2.6, pal);
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * TAU + door + 0.35;   // leaves a gap facing the path
    if (Math.abs(Math.atan2(Math.sin(a - door), Math.cos(a - door))) < 0.45) continue;
    tops.push(addColumn(c.x + Math.cos(a) * 3.5, y, c.z + Math.sin(a) * 3.5, pal, rand(1.1, 2.8)));
  }
  addStele(c.x, y, c.z, door, pal);
}

function pond(is, main, c) {
  const r = rand(2.3, 2.8);
  is.occ.push({ ...c, r: r + 0.8, solid: true });
  addPond(c.x, is.y, c.z, r, is.pal);
  branch(is, main, c, r + 1.0);
  for (let k = 0; k < 9; k++) {
    if (rnd() < 0.35) continue;
    const a = k / 9 * TAU + rand(-0.2, 0.2), d = r + rand(0.2, 0.6);
    addReeds(c.x + Math.cos(a) * d, is.y, c.z + Math.sin(a) * d, is.pal);
  }
}

// deep lake: stepping stones that sink under you lead to a little rock in the middle with a fragment on it;
// fall in and you swim back to the shore to try again
function deepLake(is, main, c) {
  const r = 5.8, y = is.y;
  is.occ.push({ ...c, r: r + 1.2, solid: true });
  addPond(c.x, y, c.z, r, is.pal, 1.0);   // deep enough to swim: from the water you can't jump back onto the stones
  const a = branch(is, main, c, r + 1.4);
  const mid = addPlatform(c.x, y + 0.35, c.z, 1.1, 'stone', is.pal);
  addPickup(c.x, y + 1.4, c.z);
  mid.secret = secrets.length;
  secrets.push({ kind: 'lake', name: 'ilhota do lago', secret: mid.secret, x: c.x, y: y + 0.35, z: c.z, R: 1.1, pal: is.pal });
  [2.5, 3.9, 5.2].forEach((d, k) => {
    const b = a + (k % 2 ? 0.14 : -0.1);
    addPlatform(c.x + Math.cos(b) * d, y + 0.3, c.z + Math.sin(b) * d, 0.6, 'stone', is.pal, { type: 'sink' });
  });
}

// shelf under the rim at angle a: two slabs step down from the rim to it. false if something is in the way
function grotto(is, a) {
  const Rr = is.R * shapeAt(is.h, a), y = is.y;
  const pt = (r, ang, dy, rad) => ({ x: is.x + Math.cos(ang) * r, y: y + dy, z: is.z + Math.sin(ang) * r, rad });
  const s1 = pt(Rr + 1.5, a, -1.5, 0.9), s2 = pt(Rr + 1.8, a + 0.13, -3.1, 0.9), L = pt(Rr * 0.93 + 1.9, a + 0.3, -4.7, 1.9);
  if (![s1, s2, L].every(p => clearOf(p.x, p.z, p.y, p.rad, 3, is.col))) return false;
  addPlatform(s1.x, s1.y, s1.z, s1.rad, 'slab', is.pal);
  addPlatform(s2.x, s2.y, s2.z, s2.rad, 'slab', is.pal);
  const ledge = addPlatform(L.x, L.y, L.z, L.rad, 'stone', is.pal);
  const inner = pt(Rr * 0.93 + 0.9, a + 0.3, -4.7), outer = pt(Rr * 0.93 + 2.6, a + 0.33, -4.7);
  addCrystalCluster(inner.x, L.y, inner.z, 0.5, is.pal);
  addStele(pt(Rr * 0.93 + 1.7, a + 0.38, 0).x, L.y, pt(Rr * 0.93 + 1.7, a + 0.38, 0).z, a + 0.3 - Math.PI / 2, is.pal);
  addPickup(outer.x, L.y + 1.0, outer.z);
  ledge.secret = secrets.length;
  secrets.push({ kind: 'grotto', name: 'gruta sob a ilha', secret: ledge.secret, x: L.x, y: L.y, z: L.z, R: L.rad, pal: is.pal });
  return true;
}

// hidden vent (a ring of pebbles) whose updraft carries you to an islet floating just past the rim
function skyIslet(is) {
  const v = freeSpot(is, 0.62, 0.78, 1.8); if (!v) return;
  const out = Math.atan2(v.z - is.z, v.x - is.x), Ri = 3.6, d = 1.3 + 1.6 + Ri;
  const I = { x: v.x + Math.cos(out) * d, y: is.y + 8.6, z: v.z + Math.sin(out) * d };
  if (!clearOf(I.x, I.z, I.y, Ri * 1.1, Ri * 1.2, is.col)) return;
  addUpdraft(v.x, is.y, v.z, 1.3, 10.5);
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; addPebble(v.x + Math.cos(a) * 1.45, is.y, v.z + Math.sin(a) * 1.45, is.pal, rand(0.15, 0.28)); }
  is.occ.push({ ...v, r: 1.8, solid: true }, { x: I.x, z: I.z, r: Ri + 1.5 });   // keep trees from growing into the islet
  const s = addIslet(I.x, I.y, I.z, Ri, is.pal, 'ilha no céu');
  s.entry = out + Math.PI;
}

export function grandLayout(is, tops) {
  const y = is.y, pal = is.pal;
  // main path: entry rim -> two wandering waypoints -> exit rim
  const A = at(is, is.entry, 0.95), B = at(is, is.exit, 0.95), px = -(B.z - A.z), pz = B.x - A.x, pl = Math.hypot(px, pz) || 1;
  const way = f => { const o = rand(-0.3, 0.3) * is.R; return { x: A.x + (B.x - A.x) * f + px / pl * o, z: A.z + (B.z - A.z) * f + pz / pl * o }; };
  const main = route(is, [A, way(0.33), way(0.66), B]);
  drawPath(is, main);
  // gate half-way (opening along the path) and lanterns on alternating sides
  const g = main[main.length >> 1], g2 = main[(main.length >> 1) + 1], th = Math.atan2(g2.z - g.z, g2.x - g.x);
  addArch(g.x, y, g.z, pal, -(th + Math.PI / 2), 'stone');
  for (const sd of [1, -1]) is.occ.push({ x: g.x - Math.sin(th) * 1.55 * sd, z: g.z + Math.cos(th) * 1.55 * sd, r: 0.7, solid: true });
  for (let i = 5, side = 1; i < main.length - 5; i += 9, side = -side) {
    const a = main[i - 1], b = main[i + 1], t = Math.atan2(b.z - a.z, b.x - a.x);
    const p = { x: main[i].x - Math.sin(t) * (W / 2 + 0.7) * side, z: main[i].z + Math.cos(t) * (W / 2 + 0.7) * side };
    if (is.occ.some(o => o.solid && !o.path && (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < (o.r + 0.5) ** 2)) continue;
    addLantern(p.x, y, p.z, pal);
    is.occ.push({ ...p, r: 0.5, solid: true });
  }
  // places off the path
  const c = freeSpot(is, 0.3, 0.68, 4.8); if (c) stoneCircle(is, main, c, tops);
  const lake = is.big.lake && freeSpot(is, 0.25, 0.6, 7.2);
  if (lake) deepLake(is, main, lake);
  else { const w = freeSpot(is, 0.25, 0.7, 3.8); if (w) pond(is, main, w); }
  // the grotto: tried at rim angles far from where you come in and leave; a cairn and a lantern mark the spot
  const cand = Array.from({ length: 16 }, (_, k) => k / 16 * TAU)
    .map(a => ({ a, far: Math.min(...[is.entry, is.exit].map(e => Math.abs(Math.atan2(Math.sin(a - e), Math.cos(a - e))))) }))
    .sort((p, q) => q.far - p.far);
  for (const { a } of cand) {
    if (!grotto(is, a)) continue;
    const m = at(is, a, 0.84);
    is.occ.push({ ...m, r: 1.2, solid: true });
    branch(is, main, m, 1.3);
    for (let k = 0; k < 3; k++) addPebble(m.x, y + k * 0.18, m.z, pal, 0.36 - k * 0.09);   // stacked stones
    addLantern(m.x + 0.9, y, m.z + 0.3, pal);
    break;
  }
  skyIslet(is);
}
