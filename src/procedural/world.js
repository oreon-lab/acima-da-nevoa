// Shared world state filled by the level generator and read by gameplay.
// Collision is vertical cylinders (irregular outline via shape harmonics): the top is walkable,
// the sides down to `thick` act as walls.
import { V3, TAU, rand, angDiff } from '../utils.js';
import { shapeAt, rockEnvelope, rockTwist } from './geometry.js';

export const ponds = [];      // { x, y, z, r, depth, col } water you wade (depth 0.5) or swim (1.0) in
// the water under (x, z), if any
export function waterAt(x, z) { for (const w of ponds) if ((x - w.x) ** 2 + (z - w.z) ** 2 < w.r * w.r) return w; return null; }
// height of the lake bed at (x, z): the shore shelves down over the first 1.3 m to the full depth
export function waterFloor(w, x, z) {
  const k = Math.min(Math.max((w.r - Math.hypot(x - w.x, z - w.z)) / 1.3, 0), 1);
  return w.y - w.depth * k * k * (3 - 2 * k);
}
export const streams = [];    // { pts:[{x,z}], w, y, speed } shallow running water: it carries you along its flow
// current under (x, y, z) as [vx, vz], or null
export function streamAt(x, y, z) {
  for (const s of streams) {
    if (Math.abs(y - s.y) > 0.5) continue;
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1], b = s.pts[i], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      const t = Math.min(Math.max(((x - a.x) * dx + (z - a.z) * dz) / L2, 0), 1);
      if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < s.w / 2) { const L = Math.sqrt(L2); return [dx / L * s.speed, dz / L * s.speed]; }
    }
  }
  return null;
}
export const updrafts = [];   // wind vents { x, y, z, r, h }
export const colliders = [], islands = [], worldGeos = [], movers = [], floaters = [], pickups = [], shrines = [], grassI = [], flowerI = [];
export const secrets = [];    // hidden islets at the end of some detours { x, y, z, R, col }
export const crossings = [];  // main-route start, end and walkable steps, used by contextual guidance
export const summit = { pos: new V3(), reached: false };
export const counts = { detours: 0 };
// forget the generated world (crossing over to O Instante rebuilds into these same arrays)
export function clearWorld() {
  for (const a of [ponds, streams, updrafts, colliders, islands, worldGeos, movers, floaters, pickups, shrines, grassI, flowerI, secrets, crossings]) a.length = 0;
  summit.reached = false; summit.pos.set(0, -1e4, 0); counts.detours = 0;
  buildGrid();
}

// Spatial hash for gameplay queries: static colliders are bucketed into CELL-sized squares (padded by 1 so a
// point query only needs its own cell); moving platforms are few and always checked.
const CELL = 8, grid = new Map(), dyn = [], EMPTY = [];
const cellKey = (i, j) => (i + 4096) * 8192 + (j + 4096);
export function buildGrid() {
  grid.clear(); dyn.length = 0;
  for (const c of colliders) {
    if (c.mover && c.mover.motion.type !== 'crumble') { dyn.push(c); continue; }
    const r = c.rMax + 1;
    for (let i = Math.floor((c.x - r) / CELL); i <= Math.floor((c.x + r) / CELL); i++)
      for (let j = Math.floor((c.z - r) / CELL); j <= Math.floor((c.z + r) / CELL); j++) {
        const k = cellKey(i, j);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(c);
      }
  }
}
// colliders that may touch a point within ~1 unit of (x, z)
export function near(x, z) {
  const cell = grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? EMPTY;
  return dyn.length ? cell.concat(dyn) : cell;
}

// Colliders are vertical prisms: a cylinder with an irregular outline (r, h), or a box when `rect: [halfW, halfD, rot]`
// (walls, floors and steps in the ruined city). Top = walkable (if ground), sides down to `thick` = walls.
// Rock masses instead carry the mesh profile (`prof`), so the sides follow the visible outline: the top face takes
// the widest ring and the walls taper with the body down to its tip.
export const pushGeo = (g, x, y, z) => { g.translate(x, y, z); worldGeos.push(g); return g; };
export const addCol = c => {
  const prof = c.prof ? rockEnvelope(c.prof) : null;
  const wide = prof ? prof.reduce((m, f) => Math.max(m, f[1]), 1) : 1;
  const rMax = (c.rMax ?? (c.rect ? Math.hypot(c.rect[0], c.rect[1]) : (c.r ?? 0) * (c.h ? 1.3 : 1))) * wide;
  colliders.push(Object.assign({ h: null, ground: true, depth: 2, thick: prof ? (c.depth ?? 2) : 1 }, c,
    { prof, topF: wide, r: c.r ?? rMax, rMax }));
  return colliders[colliders.length - 1];
};
// (x, z) in the local frame of a box collider
export function toLocal(c, x, z) {
  const cs = Math.cos(c.rect[2]), sn = Math.sin(c.rect[2]), dx = x - c.x, dz = z - c.z;
  return [dx * cs + dz * sn, -dx * sn + dz * cs];
}
// A cylinder can also have a hole (`inner`: radius of the empty middle, a ring) and/or a bite taken out of it
// (`cut: { x, z, r }`, an empty disc in world coordinates, a crescent). Both are empty space: you fall through.
export function inHollow(c, x, z, m = 0) {
  if (c.inner && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.inner - m) ** 2) return true;
  return !!c.cut && (x - c.cut.x) ** 2 + (z - c.cut.z) ** 2 < (c.cut.r - m) ** 2;
}
// radius factor of a rock profile at `t` metres below the top (knots are [[depth, factor], ...], sorted)
function rfAt(p, t) {
  if (t <= p[0][0]) return p[0][1];
  for (let k = 1; k < p.length; k++) {
    const [d0, f0] = p[k - 1], [d1, f1] = p[k];
    if (t <= d1) return f0 + (f1 - f0) * (t - d0) / (d1 - d0);
  }
  return 0;   // past the tip: no rock left
}
// radius of a rock wall at `t` below the top, at angle `a` (the outline twists as it deepens, like the mesh)
function wallR(c, a, t) {
  const f = rfAt(c.prof, t);
  return f > 0 ? c.r * shapeAt(c.h, a + rockTwist(t, c.r)) * f : 0;
}
// radius of the walkable top at angle `a`: a rock's edge is its widest ring, so its rim never overhangs the
// surface you stand on
const topR = (c, a) => c.r * shapeAt(c.h, a) * (c.topF ?? 1);
// wall radius at angle `a` for a body spanning `t0..t1` metres below the top: the widest point along that span.
// Without a span the walkable top radius is used, so callers can treat it as "how far out this collider reaches".
export function colR(c, a, t0, t1) {
  if (!c.prof || t0 === undefined) return topR(c, a);
  let r = wallR(c, a, t0);
  if (t1 > t0) {
    r = Math.max(r, wallR(c, a, t1));
    for (const [d] of c.prof) if (d > t0 && d < t1) r = Math.max(r, wallR(c, a, d));
  }
  return r;
}
// is (x, z) over the collider's top (grown by margin m)?
export function inside(c, x, z, m = 0) {
  if (c.rect) { const [lx, lz] = toLocal(c, x, z); return Math.abs(lx) <= c.rect[0] + m && Math.abs(lz) <= c.rect[1] + m; }
  const dx = x - c.x, dz = z - c.z, r = topR(c, Math.atan2(dz, dx)) + m;
  return dx * dx + dz * dz <= r * r && !((c.inner || c.cut) && inHollow(c, x, z, m));
}

// random point on an island (between minF..maxF of its radius) at least `clear` away from every occupied circle
export function freeSpot(isl, minF, maxF, clear) {
  for (let k = 0; k < 40; k++) {
    const a = rand(0, TAU), r = isl.R * shapeAt(isl.h, a) * Math.sqrt(rand(minF * minF, maxF * maxF));
    const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
    if (isl.occ.every(o => (o.x - x) ** 2 + (o.z - z) ** 2 > (o.r + clear) ** 2)) return { x, z };
  }
  return null;
}

// true if a volume at (x,z) from y-depth..y+3 doesn't touch any collider (used while generating)
export function clearOf(x, z, y, rad, depth, ignore) {
  for (const c of colliders) {
    if (c === ignore) continue;
    if (y + 3 < c.y - c.depth || c.y + 3 < y - depth) continue;
    if (Math.hypot(x - c.x, z - c.z) < rad + c.rMax + 1) return false;
  }
  return true;
}

// highest walkable top at (x,z) not above maxY
export function groundUnder(x, z, maxY) {
  let best = -Infinity;
  for (const c of near(x, z)) {
    if (!c.ground || c.y > maxY || c.y <= best) continue;
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz > c.rMax * c.rMax) continue;
    if (inside(c, x, z)) best = c.y;
  }
  return best;
}

// bobbing / ferry / lift platforms; delta is used to carry the player
export function updateMovers(t) {
  for (const c of movers) {
    const m = c.mover, mo = m.motion, mp = m.mesh.position;
    if (mo.type === 'carrier') {
      const pose = mo.sample(t), o = m.offset, co = Math.cos(pose.yaw), si = Math.sin(pose.yaw);
      const x = pose.x + o.x * co - o.z * si, y = pose.y + o.y, z = pose.z + o.x * si + o.z * co;
      m.delta.set(x - c.x, y - c.y, z - c.z); m.yawDelta = angDiff(m.yaw, pose.yaw); m.yaw = pose.yaw;
      c.x = x; c.y = y; c.z = z;
      if (m.drive) { mp.set(pose.x, pose.y, pose.z); m.mesh.rotation.y = -pose.yaw; mo.animate(t); m.onPose(pose); }
      continue;
    }
    if (mo.type === 'crumble') { crumble(c, t); continue; }
    if (mo.type === 'sink') { sink(c, t); continue; }
    const ox = mp.x, oy = mp.y, oz = mp.z;
    if (mo.type === 'bob') mp.set(m.base.x, m.base.y + Math.sin(t * mo.spd + mo.ph) * mo.amp, m.base.z);
    else {
      const T = mo.period + mo.pause, u = t % (2 * T);
      let k = u < T ? Math.min(u / mo.period, 1) : 1 - Math.min((u - T) / mo.period, 1);
      k = k * k * (3 - 2 * k);
      mp.lerpVectors(m.base, mo.to, k);
    }
    m.delta.set(mp.x - ox, mp.y - oy, mp.z - oz);
    c.x = mp.x; c.y = mp.y; c.z = mp.z;
  }
}

// Lake stepping stone: a moment after you step on it, it starts to sink (carrying you down into the water);
// left alone it floats back up.
function sink(c, t) {
  const m = c.mover, mp = m.mesh.position, s = m.st ??= { tl: t, on: 0 };
  const dt = Math.min(t - s.tl, 0.1), oy = mp.y; s.tl = t;
  s.on = c.stood > t - 0.15 ? s.on + dt : 0;
  if (s.on > 0.45) mp.y = Math.max(mp.y - 0.25 * dt, m.base.y - 0.9);
  else if (!s.on) mp.y = Math.min(mp.y + 0.5 * dt, m.base.y);
  m.delta.set(0, mp.y - oy, 0);
  c.y = mp.y;
}

// Crumbling platform: stand on it (player.js stamps c.stood) and it shakes, drops away, then comes back a few seconds later.
function crumble(c, t) {
  const m = c.mover, mp = m.mesh.position, s = m.st ??= { phase: 'idle', t0: 0, vy: 0, tl: t };
  const dt = Math.min(t - s.tl, 0.1); s.tl = t;
  m.delta.set(0, 0, 0);   // the collider never moves, only the mesh
  if (s.phase === 'idle') { if (c.stood > 0 && c.stood > t - 0.15) { s.phase = 'shake'; s.t0 = t; } }
  else if (s.phase === 'shake') {
    mp.x = m.base.x + Math.sin(t * 60) * 0.04; mp.z = m.base.z + Math.cos(t * 53) * 0.04;
    if (t - s.t0 > (m.motion.delay ?? 0.7)) { s.phase = 'fall'; s.t0 = t; s.vy = 0; c.ground = false; c.gone = true; mp.x = m.base.x; mp.z = m.base.z; }
  } else if (s.phase === 'fall') {
    s.vy -= 26 * dt; mp.y += s.vy * dt;
    if (t - s.t0 > 3) { s.phase = 'gone'; s.t0 = t; m.mesh.visible = false; }
  } else if (t - s.t0 > 3) { mp.copy(m.base); m.mesh.visible = true; c.ground = true; c.gone = false; c.stood = 0; s.phase = 'idle'; }
}
