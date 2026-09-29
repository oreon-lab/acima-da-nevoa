// Shared world state filled by the level generator and read by gameplay.
// Collision is vertical cylinders (irregular outline via shape harmonics): the top is walkable,
// the sides down to `thick` act as walls.
import { V3, TAU, rand } from '../utils.js';
import { shapeAt } from './geometry.js';

export const ponds = [];      // { x, y, z, r } walkable water
export const updrafts = [];   // wind vents { x, y, z, r, h }
export const colliders = [], islands = [], worldGeos = [], movers = [], floaters = [], pickups = [], shrines = [], grassI = [], flowerI = [];
export const summit = { pos: new V3(), reached: false };

export const colR = (c, a) => c.r * shapeAt(c.h, a);
export const pushGeo = (g, x, y, z) => { g.translate(x, y, z); worldGeos.push(g); return g; };
export const addCol = c => { colliders.push(Object.assign({ h: null, ground: true, depth: 2, thick: 1 }, c, { rMax: c.r * (c.h ? 1.3 : 1) })); return colliders[colliders.length - 1]; };

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
  for (const c of colliders) {
    if (!c.ground || c.y > maxY || c.y <= best) continue;
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz > c.rMax * c.rMax) continue;
    const r = colR(c, Math.atan2(dz, dx));
    if (dx * dx + dz * dz <= r * r) best = c.y;
  }
  return best;
}

// bobbing / ferry / lift platforms; delta is used to carry the player
export function updateMovers(t) {
  for (const c of movers) {
    const m = c.mover, mo = m.motion, mp = m.mesh.position;
    if (mo.type === 'crumble') { crumble(c, t); continue; }
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

// Crumbling platform: stand on it (player.js stamps c.stood) and it shakes, drops away, then comes back a few seconds later.
function crumble(c, t) {
  const m = c.mover, mp = m.mesh.position, s = m.st ??= { phase: 'idle', t0: 0, vy: 0, tl: t };
  const dt = Math.min(t - s.tl, 0.1); s.tl = t;
  m.delta.set(0, 0, 0);   // the collider never moves, only the mesh
  if (s.phase === 'idle') { if (c.stood > 0 && c.stood > t - 0.15) { s.phase = 'shake'; s.t0 = t; } }
  else if (s.phase === 'shake') {
    mp.x = m.base.x + Math.sin(t * 60) * 0.04; mp.z = m.base.z + Math.cos(t * 53) * 0.04;
    if (t - s.t0 > 0.7) { s.phase = 'fall'; s.t0 = t; s.vy = 0; c.ground = false; mp.x = m.base.x; mp.z = m.base.z; }
  } else if (s.phase === 'fall') {
    s.vy -= 26 * dt; mp.y += s.vy * dt;
    if (t - s.t0 > 3) { s.phase = 'gone'; s.t0 = t; m.mesh.visible = false; }
  } else if (t - s.t0 > 3) { mp.copy(m.base); m.mesh.visible = true; c.ground = true; c.stood = 0; s.phase = 'idle'; }
}
