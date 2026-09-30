// The ruined city (the big island before the lighthouse): a paved street from rim to rim through a plaza with a
// statue and a well, market stalls, houses on both sides (many with an upper floor reached by stairs), a library,
// a tower climbed by stairs along its inner walls, and a sealed house you only get into over its walls.
// Walls, floors and steps use box colliders; the broken wall tops are walkable, so the city is a parkour course too.
import * as THREE from 'three';
import { TAU, rnd, rand, pick } from '../utils.js';
import { bake, shapeAt } from './geometry.js';
import { addCol, pushGeo, freeSpot, secrets } from './world.js';
import { addStele, addPickup, addProp, addPavement, addBanner, addLantern } from './objects/index.js';
import { at, route, drawPath, branch } from './grand.js';

const T = 0.42, H = 2.4, STREET = 2.4;   // wall thickness, storey height, street width

// local (lx, lz) of a building rotated by rot -> world; local -z is the front
const frame = (cx, cz, rot) => { const cs = Math.cos(rot), sn = Math.sin(rot); return (lx, lz) => ({ x: cx + lx * cs - lz * sn, z: cz + lx * sn + lz * cs }); };
const stoneFn = pal => (cen, n, c) => {
  c.copy(pal.stone).multiplyScalar(rand(0.84, 0.98) * ((Math.floor(cen.y / 0.45 + 50) % 2) ? 0.93 : 1));   // courses of stone
  if (n.y > 0.6 && rnd() < 0.55) c.lerp(pal.moss, 0.55); else if (cen.y < 0.45 && rnd() < 0.35) c.lerp(pal.moss, 0.4);
};
const woodFn = (cen, n, c) => c.set('#7d5e40').offsetHSL(0, 0, rand(-0.05, 0.04));

// a box of len (along rot) x h x depth standing on y0; solid with a walkable top unless told otherwise
function box(p, rot, len, h, depth, y0, fn, ground = true) {
  pushGeo(bake(new THREE.BoxGeometry(len, h, depth, 1, Math.max(1, Math.round(h / 0.45)), 1).translate(0, h / 2, 0).rotateY(-rot), fn), p.x, y0, p.z);
  return addCol({ x: p.x, z: p.z, y: y0 + h, rect: [len / 2, depth / 2, rot], thick: h, depth: 0, ground, surface: 'stone' });
}

// wall between local points A and B, in ~1 m chunks: broken tops (ruin), collapsed stretches, an optional doorway
// `door` metres from A (the chunks above it stay as a lintel), optional battlements
function wall(F, rot, A, B, y0, top, fn, { door = null, ruin = 1, crenel = false } = {}) {
  const dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz), wr = rot + Math.atan2(dz, dx);
  const n = Math.max(1, Math.round(len)), seg = len / n;
  for (let k = 0; k < n; k++) {
    const u = seg * (k + 0.5), p = F(A[0] + dx * u / len, A[1] + dz * u / len);
    let h = top - rand(0, 1.1) * ruin - (crenel && k % 2 ? 0.55 : 0);
    if (rnd() < 0.1 * ruin) h = rand(0.5, 1.3);   // collapsed
    if (door !== null && Math.abs(u - door) < 0.75) { if (h > 2.7) box(p, wr, seg + 0.02, h - 2.2, T, y0 + 2.2, fn); continue; }
    box(p, wr, seg + 0.02, h, T, y0, fn);
  }
}

// is the rectangle (hw x hd around c, rotated) clear of everything claimed so far and on the island?
function rectFree(is, c, rot, hw, hd) {
  const F = frame(c.x, c.z, rot);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const p = F(a * hw, b * hd), dx = p.x - is.x, dz = p.z - is.z;
    if (Math.hypot(dx, dz) > is.R * shapeAt(is.h, Math.atan2(dz, dx)) * 0.86) return false;
  }
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return is.occ.every(o => {
    const dx = o.x - c.x, dz = o.z - c.z, lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
    return Math.hypot(lx - Math.max(-hw, Math.min(hw, lx)), lz - Math.max(-hd, Math.min(hd, lz))) > o.r;
  });
}
function claimRect(is, c, rot, hw, hd) {
  const F = frame(c.x, c.z, rot);
  for (let a = -hw; a <= hw + 0.01; a += 1.2) for (let b = -hd; b <= hd + 0.01; b += 1.2) is.occ.push({ ...F(a, b), r: 0.95, solid: true });
}
function floor(is, c, rot, w, d) {
  pushGeo(bake(new THREE.BoxGeometry(w, 0.06, d, Math.round(w), 1, Math.round(d)).translate(0, 0.03, 0).rotateY(-rot),
    (cen, n, col) => { col.copy(is.pal.stone).multiplyScalar(rand(0.7, 0.85)); if (rnd() < 0.2) col.lerp(is.pal.moss, 0.4); }), c.x, is.y + 0.005, c.z);
}

// house: w x d, front (door) on local -z. Two storeys: a wooden upper floor over the back half, stairs up the left wall.
function house(is, c, rot, w, d, storeys, kind = 'house') {
  const F = frame(c.x, c.z, rot), y = is.y, fn = stoneFn(is.pal), top = H * storeys + 0.4, ruin = kind === 'sealed' ? 0.25 : 1;
  const wallTop = kind === 'sealed' ? 2.7 : top;
  floor(is, c, rot, w, d);
  wall(F, rot, [-w / 2 - T / 2, -d / 2], [w / 2 + T / 2, -d / 2], y, wallTop, fn, { door: kind === 'sealed' ? null : (w + T) / 2, ruin });
  wall(F, rot, [w / 2 + T / 2, d / 2], [-w / 2 - T / 2, d / 2], y, wallTop, fn, { ruin });
  wall(F, rot, [-w / 2, d / 2 - T / 2], [-w / 2, -d / 2 + T / 2], y, wallTop, fn, { ruin });
  wall(F, rot, [w / 2, -d / 2 + T / 2], [w / 2, d / 2 - T / 2], y, wallTop, fn, { ruin });
  const put = (name, lx, lz, dy = 0, r = 0, s = 1) => { const p = F(lx, lz); return addProp(name, p.x, y + dy, p.z, rot + r, s); };
  if (storeys > 1) {   // upper floor from lz = 0.4 to the back wall; the stairs run towards it, starting ~1 m in from the door wall
    const back = d / 2 - T / 2, m0 = 0.4;
    box(F(0, (m0 + back) / 2), rot, w - T, 0.22, back - m0, y + H - 0.22, woodFn);
    for (let k = 0; k < 8; k++) box(F(-w / 2 + T / 2 + 0.45, m0 - 0.15 - (7 - k) * 0.3), rot, 0.9, (k + 1) * 0.3, 0.31, y, fn);
  }
  if (kind === 'library') {
    put('bookcase', -w / 4, d / 2 - T / 2 - 0.25); put('bookcase', w / 4, d / 2 - T / 2 - 0.25);
    const tt = put('table', w / 2 - 1.1, -d / 2 + 1.2, 0, Math.PI / 2); put('books', w / 2 - 1.1, -d / 2 + 1.2, tt - y);
    put('bookcase', w / 2 - T / 2 - 0.25, d / 4, H, Math.PI / 2);
    const st = F(0.3, d / 4 + 0.4);
    addStele(st.x, y + H, st.z, rot - Math.PI / 2, is.pal);
    const pk = F(w / 2 - 1.0, d / 2 - 0.9); addPickup(pk.x, y + H + 1.0, pk.z);
  } else if (kind === 'sealed') {   // no way in but over the walls: a stack of crates outside the back wall
    const secretFloor = F(0, 0);
    addCol({ x: secretFloor.x, z: secretFloor.z, y: y + 0.03, rect: [w / 2 - T / 2, d / 2 - T / 2, rot], thick: 0.05, depth: 0.05, surface: 'stone', secret: secrets.length });
    secrets.push({ kind: 'room', name: 'sala lacrada', secret: secrets.length, x: c.x, y, z: c.z, R: w / 2, pal: is.pal });
    put('crate', -0.9, d / 2 + T / 2 + 0.55); put('crate', 0, d / 2 + T / 2 + 0.55); put('crate', 0, d / 2 + T / 2 + 0.55, 0.8);
    put('chest', w / 2 - 0.9, d / 2 - 0.8, 0, Math.PI);
    const st = F(-w / 2 + 1.0, 0.2); addStele(st.x, y, st.z, rot, is.pal);
    const pk = F(0.4, -0.4); addPickup(pk.x, y + 1.0, pk.z);
  } else {   // ordinary house: a few things left behind
    const ground = [['table', 0], ['barrel', 0], ['crate', 0], ['pot', 0], ['chest', Math.PI]];
    const slots = [[w / 2 - 0.9, -d / 2 + 1.0], [w / 2 - 0.8, d / 2 - 0.8], [0.4, d / 2 - 0.8]];
    for (const [lx, lz] of slots) if (rnd() < 0.8) { const [nm, r] = pick(ground); put(nm, lx, lz, 0, r); }
    put('torch', -w / 2 + T / 2 + 0.3, d / 2 - T / 2 - 0.3);
    if (storeys > 1) { put(pick(['chest', 'barrel', 'crate']), w / 2 - 0.9, d / 4 + 0.3, H); if (rnd() < 0.5) { const pk = F(w / 2 - 1.2, d / 4 - 0.6); addPickup(pk.x, y + H + 1.0, pk.z); } }
  }
}

// tower: 5 x 5, stairs climb three inner walls to a landing along the front wall, battlements above
function tower(is, c, rot) {
  const F = frame(c.x, c.z, rot), y = is.y, fn = stoneFn(is.pal), s = 2.5, top = 8.6, e = 1.85;
  floor(is, c, rot, 2 * s, 2 * s);
  wall(F, rot, [-s - T / 2, -s], [s + T / 2, -s], y, top, fn, { door: s + T / 2, ruin: 0.15, crenel: true });
  wall(F, rot, [s + T / 2, s], [-s - T / 2, s], y, top, fn, { ruin: 0.15, crenel: true });
  wall(F, rot, [-s, s - T / 2], [-s, -s + T / 2], y, top, fn, { ruin: 0.15, crenel: true });
  wall(F, rot, [s, -s + T / 2], [s, s - T / 2], y, top, fn, { ruin: 0.15, crenel: true });
  // 21 steps of 0.3 (always walked onto along the way they rise: steps are shallower than you are wide): up the
  // right wall from a clear corner by the door, a corner step, along the back, a corner step, down the left wall,
  // one more corner, then a wooden landing along the front wall at 6.6 m. The battlements are a jump above it.
  const cells = [], run = (x0, z0, x1, z1, n) => {
    for (let k = 0; k < n; k++) { const f = (k + 0.5) / n; cells.push([x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, Math.abs(x1 - x0) / n || 0.9, Math.abs(z1 - z0) / n || 0.9]); }
  };
  run(e, -1.4, e, 1.4, 6); cells.push([e, e, 0.9, 0.9]); run(1.4, e, -1.4, e, 6); cells.push([-e, e, 0.9, 0.9]); run(-e, 1.4, -e, -1.4, 6); cells.push([-e, -e, 0.9, 0.9]);
  cells.forEach(([lx, lz, sx, sz], k) => box(F(lx, lz), rot, sx + 0.01, (k + 1) * 0.3, sz + 0.01, y, fn));
  box(F(0.05, -e), rot, 2.7, 0.3, 0.9, y + 6.3, woodFn);   // landing: from the last corner towards the door side
  const pk = F(1.0, -e); addPickup(pk.x, y + 7.7, pk.z);
  const put = (name, lx, lz) => { const p = F(lx, lz); addProp(name, p.x, y, p.z, rot); };
  put('torch', -0.8, 0.9); put('barrel', -0.5, 0.2); put('crate', 0.6, 0.6);   // kept off the way from the door to the first step
}

export function cityLayout(is, tops) {
  const y = is.y, pal = is.pal;
  // street: entry rim -> plaza near the middle -> exit rim
  const P = { x: is.x + rand(-0.12, 0.12) * is.R, z: is.z + rand(-0.12, 0.12) * is.R };
  const A = at(is, is.entry, 0.95), B = at(is, is.exit, 0.95);
  const street = route(is, [A, { x: (A.x + P.x) / 2 + rand(-2, 2), z: (A.z + P.z) / 2 + rand(-2, 2) }, P, { x: (B.x + P.x) / 2 + rand(-2, 2), z: (B.z + P.z) / 2 + rand(-2, 2) }, B], STREET);
  drawPath(is, street, { w: STREET, paved: true });
  // plaza: statue, well, benches, market stalls, banners
  addPavement(P.x, y, P.z, 5.2, pal);
  is.occ.push({ ...P, r: 6.2, solid: true, path: true });
  addProp('statue', P.x, y, P.z, rand(0, TAU));
  const aw = rand(0, TAU), well = { x: P.x + Math.cos(aw) * 3.4, z: P.z + Math.sin(aw) * 3.4 };
  addProp('well', well.x, y, well.z, rand(0, TAU));
  for (let k = 0; k < 4; k++) {
    const a = aw + Math.PI / 4 + k * Math.PI / 2 + 0.3, r = 4.4;
    if (k === 3) { addProp('cart', P.x + Math.cos(a) * 4.6, y, P.z + Math.sin(a) * 4.6, a + Math.PI / 2); continue; }
    addProp('bench', P.x + Math.cos(a) * r, y, P.z + Math.sin(a) * r, a + Math.PI / 2);
  }
  for (let k = 0; k < 6; k++) {   // market: barrels, crates and pots around the edge
    const a = rand(0, TAU), r = rand(5.4, 6.1), p = { x: P.x + Math.cos(a) * r, z: P.z + Math.sin(a) * r };
    if (street.some(s => (s.x - p.x) ** 2 + (s.z - p.z) ** 2 < 2.2 ** 2)) continue;
    const nm = pick(['barrel', 'crate', 'pot', 'barrel']);
    addProp(nm, p.x, y, p.z, rand(0, TAU));
    if (nm === 'crate' && rnd() < 0.5) addProp('pot', p.x, y + 0.8, p.z, 0, 0.8);
  }
  for (let i = 8; i < street.length - 8; i += 11) {   // banners and lanterns along the street
    const a = street[i - 1], b = street[i + 1], t = Math.atan2(b.z - a.z, b.x - a.x), sd = i % 2 ? 1 : -1;
    const p = { x: street[i].x - Math.sin(t) * (STREET / 2 + 0.5) * sd, z: street[i].z + Math.cos(t) * (STREET / 2 + 0.5) * sd };
    if (is.occ.some(o => o.solid && !o.path && (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < (o.r + 0.4) ** 2)) continue;
    if (i % 3) addLantern(p.x, y, p.z, pal); else addProp('banner', p.x, y, p.z, t);
    is.occ.push({ ...p, r: 0.5, solid: true });
  }
  // houses facing the street, both sides; the first one that fits is the library
  let n = 0;
  for (let i = 4; i < street.length - 4 && n < 12; i += 2) for (const sd of [1, -1]) {
    const a = street[i - 1], b = street[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l * sd, nz = (b.x - a.x) / l * sd;
    const w = rand(5, 6.4), d = rand(6.3, 7), dist = STREET / 2 + 0.35 + 0.3 + T + 0.3 + d / 2;   // clear of the street's own claim
    const c = { x: street[i].x + nx * dist, z: street[i].z + nz * dist }, rot = Math.atan2(-nx, nz);
    if (!rectFree(is, c, rot, w / 2 + T + 0.3, d / 2 + T + 0.3)) continue;
    claimRect(is, c, rot, w / 2 + T, d / 2 + T);
    house(is, c, rot, w, d, n === 0 || rnd() < 0.45 ? 2 : 1, n === 0 ? 'library' : 'house');
    n++;
  }
  // the tower, set back from the street with its own lane
  for (let k = 0; k < 60; k++) {
    const c = freeSpot(is, 0.25, 0.72, 3.8); if (!c) continue;
    if (!rectFree(is, c, 0, 3.6, 3.6) || !rectFree(is, c, Math.PI / 4, 3.6, 3.6)) continue;
    const a = branch(is, street, c, 3.7), rot = Math.atan2(Math.cos(a), -Math.sin(a));
    claimRect(is, c, rot, 2.5 + T, 2.5 + T);
    tower(is, c, rot);
    break;
  }
  // the sealed house: no lane, no door
  for (let k = 0; k < 60; k++) {
    const c = freeSpot(is, 0.3, 0.78, 3.4); if (!c) continue;
    const rot = rand(0, TAU); if (!rectFree(is, c, rot, 2.7 + T, 3.8 + T)) continue;
    claimRect(is, c, rot, 2.3 + T, 3.4 + T);
    house(is, c, rot, 4.6, 4.6, 1, 'sealed');
    break;
  }
  // back streets: more houses further in, each facing the main street with a lane to its door
  for (let k = 0; k < 80 && n < 14; k++) {
    const c = freeSpot(is, 0.2, 0.78, 4.2); if (!c) continue;
    const s = street.reduce((a, b) => ((b.x - c.x) ** 2 + (b.z - c.z) ** 2 < (a.x - c.x) ** 2 + (a.z - c.z) ** 2 ? b : a));
    const l = Math.hypot(c.x - s.x, c.z - s.z) || 1, rot = Math.atan2(-(c.x - s.x) / l, (c.z - s.z) / l);
    const w = rand(4.8, 6), d = rand(6.3, 6.8);
    if (!rectFree(is, c, rot, w / 2 + T + 0.3, d / 2 + T + 0.3)) continue;
    claimRect(is, c, rot, w / 2 + T, d / 2 + T);
    const door = frame(c.x, c.z, rot)(0, -d / 2 - T - 0.9);
    drawPath(is, route(is, [s, { x: (s.x + door.x) / 2, z: (s.z + door.z) / 2 }, door], 1.3), { w: 1.3, paved: true });
    house(is, c, rot, w, d, n === 0 || rnd() < 0.5 ? 2 : 1, n === 0 ? 'library' : 'house');
    n++;
  }

  tops.length = 0;   // the island's usual fragment goes on top of the tower instead
}
