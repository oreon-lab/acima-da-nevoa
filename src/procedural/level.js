// Level generator: a rising helix of islands linked by parkour segments, then decoration,
// side detours, floating rocks and distant silhouettes. Seeded, so the world is always the same.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from '../core.js';
import { V3, TAU, clamp, lerp, rnd, rand, pick, reseed } from '../utils.js';
import { worldMat } from './materials.js';
import { rockMass, shapeH, shapeAt, palette, islandColor, P_ISLAND, P_STONE } from './geometry.js';
import { islands, secrets, pickups, landmarks, crossings, worldGeos, summit, counts, pushGeo, clearOf, freeSpot, buildGrid } from './world.js';
import { COURSE, WORLD_REVISION } from './course.js';
import { buildWhaleExcursion } from './objects/whale.js';
import { addRouteMarks } from './objects/routeMarks.js';
import { THEMES } from './themes.js';
import {
  addIsland, addIslet, addPlatform, addSpire, addAltar, addFloater, addTree, addBush, addPebble, addBoulder, addColumn,
  addRoots, addShrine, addPickup, grassDisc, buildVegetation, addUpdraft, addClimbWall, addStele, addArch, addBanner,
  addCampfire, addTent, addFlowerBed, addFireflies, addCrystalCluster, addPhasePlatform, addBridge,
} from './objects/index.js';
import { createClouds, addGroundMist } from '../render/atmosphere.js';
import { createFauna } from '../fx/fauna.js';
import { grandLayout } from './grand.js';
import { cityLayout } from './city.js';

// parkour between island i and i+1
// crumble = platforms that drop away, wind = ride an updraft, climb = scale a rock wall. From island 3 on you can
// glide: vents = glide from one updraft column to the next, glidegap = gaps only a glide crosses,
// twin = two lanes of sun and star stones (only one exists at a time), bridge = assembles when the shrine is lit.
const SEGMENTS = COURSE.map(c => c.type);
// islands (by index) that are huge: radius, and what fills them (grand.js paths and secrets, or the city)
const BIG = { 5: { R: 22, lake: true }, 8: { R: 24 }, 9: { R: 26, city: true } };

export function segment(type, s, heading, diff, pal, idx) {
  let x = s.x, z = s.z, y = s.y, prevR = 0, dir = heading, last = null;
  const steps = [];
  const rB = lerp(1.35, 0.95, diff), g0 = lerp(0.9, 1.35, diff), g1 = lerp(1.45, 2.05, diff);
  const place = (r, gap, rise, style, motion, turn = 0.4) => {
    dir = heading + clamp(dir - heading + rand(-turn, turn), -0.55, 0.55);
    const d = prevR + gap + r;
    x += Math.cos(dir) * d; z += Math.sin(dir) * d; y += rise;
    last = addPlatform(x, y, z, r, style, pal, motion); prevR = r; steps.push(last);
    last.course = idx;
    last.routeKind = style === 'crumble' ? 'crumble' : motion ? 'moving' : 'stone';
  };
  const lineTo = (rMul, gMul, riseA, riseB, style, n, turn) => { for (let k = 0; k < n; k++) place(rB * rand(0.9, 1.1) * rMul, rand(g0, g1) * gMul, rand(riseA, riseB), style, null, turn); };
  const ride = (r, gap, rise, motion) => {   // moving platform, then continue from its far end
    dir = heading;
    const d = prevR + gap + r;
    const ax = x + Math.cos(dir) * d, az = z + Math.sin(dir) * d, ay = y + rise;
    const to = motion.type === 'ferry' ? new V3(ax + Math.cos(dir) * motion.travel, ay, az + Math.sin(dir) * motion.travel) : new V3(ax, ay + motion.travel, az);
    last = addPlatform(ax, ay, az, r, 'slab', pal, Object.assign(motion, { to }));
    x = to.x; z = to.z; y = to.y; prevR = r;
  };

  if (type === 'stones') lineTo(1, 1, 0.8, 1.2, 'stone', 7);
  else if (type === 'ruins') lineTo(1, 1, 0.85, 1.25, 'pillar', 7);
  else if (type === 'bob') {
    for (let k = 0; k < 7; k++) place(rB * rand(1.0, 1.2), rand(g0, g1) * 0.9, rand(0.45, 0.75), 'slab', { type: 'bob', amp: rand(0.35, 0.55), spd: rand(0.9, 1.25), ph: k * 1.3 });
  } else if (type === 'ferry') {
    lineTo(1, 1, 0.6, 0.9, 'stone', 2);
    const travel = rand(6.5, 8);
    ride(1.5, 1.0, 0.45, { type: 'ferry', travel, period: travel / 2.4, pause: 1.0 });
    lineTo(1, 0.9, 0.6, 0.95, 'stone', 3, 0.3);
  } else if (type === 'lift') {
    lineTo(1, 1, 0.6, 0.9, 'stone', 2);
    const travel = rand(5, 6.5);
    ride(1.45, 1.0, 0.3, { type: 'lift', travel, period: travel / 1.6, pause: 1.2 });
    lineTo(1, 0.9, 0.5, 0.9, 'stone', 3, 0.3);
  } else if (type === 'crumble') {   // approach safely, test one broad stone, breathe, then repeat
    for (let k = 0; k < 7; k++) {
      const safe = k === 0 || k === 2 || k === 6;
      place(rB * (k === 1 ? 1.6 : 1.25), rand(g0, g1) * 0.8, rand(0.45, 0.65), safe ? 'stone' : 'crumble', safe ? null : { type: 'crumble', delay: k === 1 ? 1.2 : 0.9 }, 0.25);
    }
  } else if (type === 'glideIntro') {
    // Two ordinary jumps, a wide launch pad and a generous landing. The next checkpoint is close.
    lineTo(1.3, 0.8, 0.45, 0.65, 'stone', 2, 0.15);
    place(2.0, 1.0, 0.5, 'stone', null, 0);
    addUpdraft(last.x, last.y, last.z, 1.65, 6.5);
    last.routeKind = 'wind';
    place(2.8, 5.5, 0.6, 'slab', null, 0);
    lineTo(1.4, 0.8, 0.4, 0.6, 'stone', 2, 0.15);
  } else if (type === 'wind') {   // a vent stone throws you up 8 m; steer across to the high slab
    lineTo(1, 1, 0.5, 0.8, 'stone', 1);
    place(1.5, rand(g0, g1), 0.5, 'stone');
    addUpdraft(last.x, last.y, last.z, 1.3, 9.5);
    last.routeKind = 'wind';
    place(2.1, 1.8, 7.6, 'slab', null, 0.2);
    lineTo(1, 1, 0.5, 0.9, 'stone', 2);
  } else if (type === 'climb') {   // walk into the wall to climb it
    lineTo(1, 1, 0.5, 0.8, 'stone', 2);
    const rW = 1.5, dW = prevR + 1.5 + rW;
    x += Math.cos(heading) * dW; z += Math.sin(heading) * dW; y += 5.6;
    last = addClimbWall(x, y, z, rW, 6.6, pal); last.course = idx; last.routeKind = 'climb'; steps.push(last); prevR = rW; dir = heading;
    lineTo(1, 1, 0.6, 0.9, 'stone', 3, 0.3);
  } else if (type === 'vents') {   // three updraft columns over the void, each one topping out higher
    lineTo(1, 1, 0.5, 0.8, 'stone', 1);
    place(1.4, rand(g0, g1), 0.4, 'stone', null, 0.2);
    const y0 = y, cs = Math.cos(heading), sn = Math.sin(heading);
    for (let k = 0; k < 3; k++) {
      const d = k ? 6.2 : prevR + 4.2;
      x += cs * d; z += sn * d;
      addUpdraft(x, y0 + 3 * k - 7, z, 1.6, 11);
      addFloater(x, y0 + 3 * k - 7.5, z, 0.9, pal);
      if (k === 1) addPickup(x, y0 + 3 * k + 3, z);
    }
    y = y0 + 6; prevR = 1.6; dir = heading;
    place(2.0, 2.0, 3, 'slab', null, 0.1);
    lineTo(1, 1, 0.5, 0.8, 'stone', 2, 0.3);
  } else if (type === 'glidegap') {   // jump, glide down to a lone rock; its vent lifts you for the second leg
    lineTo(1, 1, 0.5, 0.8, 'stone', 2);
    place(1.8, 11.5, -2.4, 'stone', null, 0.15);
    addUpdraft(last.x, last.y, last.z, 1.3, 9.5);
    place(2.1, 9.5, 4.5, 'slab', null, 0.15);
    lineTo(1, 1, 0.5, 0.9, 'stone', 2, 0.3);
  } else if (type === 'twin') {   // sun lane and star lane side by side; a star-only fragment for night owls
    lineTo(1, 1, 0.5, 0.8, 'stone', 1);
    const cs = Math.cos(heading), sn = Math.sin(heading), sx = -sn * 1.9, sz = cs * 1.9, x0 = x, z0 = z, y0 = y;
    for (let k = 0; k < 6; k++) {
      const d = prevR + 1.9 + k * 2.6, cx = x0 + cs * d, cz = z0 + sn * d, cy = y0 + 0.5 * (k + 1);
      for (const [offset, kind] of [[1, 'day'], [-1, 'night']]) {
        const c = addPhasePlatform(cx + sx * offset, cy, cz + sz * offset, 0.95, kind);
        c.course = idx; c.routeKind = 'phase'; steps.push(c);
      }
      if (k === 3) addPickup(cx - sx, cy + 1.05, cz - sz);
      x = cx; z = cz; y = cy;
    }
    prevR = 0.2; dir = heading;
    place(1.3, 1.5, 0.4, 'stone', null, 0);
    lineTo(1, 1, 0.5, 0.8, 'stone', 1, 0.3);
  } else if (type === 'bridge') {   // lighting this island's shrine raises a long plank bridge
    lineTo(1, 1, 0.4, 0.7, 'stone', 1);
    place(1.3, rand(g0, g1), 0.4, 'stone', null, 0);
    const e = addBridge(x + Math.cos(heading) * (prevR - 0.15), y, z + Math.sin(heading) * (prevR - 0.15), heading, 15, 2.2, idx);
    x = e.x; y = e.y; z = e.z; prevR = 0; dir = heading;
    place(1.4, 0.05, 0, 'stone', null, 0);
    lineTo(1, 1, 0.5, 0.8, 'stone', 1, 0.3);
  } else if (type === 'finale') {
    // Recall ordinary jumps, ride a familiar vent, then make the final glide. No new skill at the climax.
    lineTo(1.15, 0.9, 0.65, 0.9, 'stone', 3, 0.3);
    place(2.0, 1.2, 0.5, 'stone', null, 0);
    addUpdraft(last.x, last.y, last.z, 1.65, 9.5); last.routeKind = 'wind';
    place(2.5, 9.0, 2.5, 'slab', null, 0);
    place(2.1, 1.1, 0.6, 'stone', null, 0);
    addUpdraft(last.x, last.y, last.z, 1.5, 8); last.routeKind = 'wind';
    place(2.7, 10.0, 1.4, 'slab', null, 0);
    lineTo(1.3, 0.85, 0.5, 0.7, 'stone', 2, 0.15);
  } else if (type === 'spiral') {
    const Rs = 4.4, r = lerp(1.2, 1.0, diff), n = 12, dth = 3 * Math.PI / (n - 1) * (rnd() < 0.5 ? 1 : -1);
    const gap = rand(g0, g1), sx = x + Math.cos(heading) * (gap + r + Rs), sz = z + Math.sin(heading) * (gap + r + Rs);
    for (let k = 0; k < n; k++) {
      const a = heading + Math.PI + k * dth;
      y += 0.8;
      last = addPlatform(sx + Math.cos(a) * Rs, y, sz + Math.sin(a) * Rs, r, 'slab', pal); steps.push(last);
    }
    x = last.x; z = last.z; prevR = r;
    addSpire(sx, sz, y + 1.05, s.y - 10, pal);
    addPickup(sx, y + 2.05, sz);
  }
  // a collectible above a static step mid-way
  const mid = steps.filter(c => !c.mover)[Math.floor(steps.length / 2)];
  if (mid && type !== 'spiral') addPickup(mid.x, mid.y + 1.05, mid.z);
  addRouteMarks(steps);
  return { x, z, y, prevR, last, steps };
}

function decorate(is) {
  const pal = is.pal, occ = is.occ, y = is.y;
  const at = (a, f) => ({ x: is.x + Math.cos(a) * is.R * shapeAt(is.h, a) * f, z: is.z + Math.sin(a) * is.R * shapeAt(is.h, a) * f });
  // reserved: spawn + shrine near the entry, clear corridors at entry / exit rims
  const spawn = at(is.entry, is.idx === 0 ? 0.3 : 0.5);
  const perp = is.entry + Math.PI / 2;
  const sh = { x: spawn.x + Math.cos(perp) * 1.6, z: spawn.z + Math.sin(perp) * 1.6 };
  occ.push({ ...spawn, r: 1.6 }, { ...sh, r: 0.9, solid: true }, { ...at(is.entry, 0.85), r: 2.2 });
  if (!is.summit) occ.push({ ...at(is.exit, 0.85), r: 2.4 });
  addShrine(is, sh.x, sh.z);
  const face = is.summit ? Math.atan2(is.z - spawn.z, is.x - spawn.x) : is.exit;
  is.cp = { x: spawn.x, y, z: spawn.z, heading: face };

  const tops = [];
  if (is.summit) {   // altar under the beacon crystal, ring of old pillars
    addAltar(is.x, y, is.z, pal);
    occ.push({ x: is.x, z: is.z, r: 3, solid: true });
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU + 0.2, p = { x: is.x + Math.cos(a) * is.R * 0.6, z: is.z + Math.sin(a) * is.R * 0.6 };   // the ring of pillars scales with the island
      if (occ.some(o => (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < (o.r + 0.6) ** 2)) continue;
      tops.push(addColumn(p.x, y, p.z, pal, rand(0.9, 2.6)));
      occ.push({ ...p, r: 0.7, solid: true });
    }
    summit.pos.set(is.x, y + 3.3, is.z);
  }
  const theme = THEMES[is.idx];
  theme?.decorate(is, tops);   // signature objects first, so the generic scatter works around them
  if (is.big?.city) cityLayout(is, tops);   // then paths, buildings and places; the scatter fills the rest
  else if (is.big) grandLayout(is, tops);
  const area = is.big ? is.R / 8 : 1;   // big islands get props in proportion to their size
  const nTrees = Math.round(is.R * rand(0.28, 0.45) * area * (theme?.trees ?? 1));
  for (let i = 0; i < nTrees; i++) {
    const s = freeSpot(is, 0.2, 0.82, 1.4); if (!s) continue;
    occ.push({ ...s, r: 1.1 });
    addTree(s.x, y - 0.05, s.z, pal);
  }
  for (let i = 0, n = Math.round((3 + (rnd() * 5 | 0)) * area); i < n; i++) { const s = freeSpot(is, 0.3, 0.92, 0.6); if (s) addBush(s.x, y, s.z, pal); }
  for (let i = 0, n = Math.round((3 + (rnd() * 4 | 0)) * area); i < n; i++) { const s = freeSpot(is, 0.2, 0.95, 0.4); if (s) addPebble(s.x, y, s.z, pal); }
  for (let i = 0, n = Math.round((1 + (rnd() * 2 | 0)) * area); i < n; i++) {
    const s = freeSpot(is, 0.3, 0.75, 1.5); if (!s) continue;
    occ.push({ ...s, r: 1.2, solid: true });
    tops.push(addBoulder(s.x, y, s.z, pal));
  }
  if (!is.summit && theme?.ruin !== false && (is.idx % 3 === 2 || rnd() < 0.3)) {   // a small ruin you can climb
    const s = freeSpot(is, 0.3, 0.6, 2.2);
    if (s) {
      let hh = 0.8;
      for (let k = 0, n = 3 + (rnd() * 3 | 0); k < n; k++) {
        const a = k * 1.25 + rand(-0.2, 0.2), p = { x: s.x + Math.cos(a) * 1.6, z: s.z + Math.sin(a) * 1.6 };
        tops.push(addColumn(p.x, y, p.z, pal, hh));
        occ.push({ ...p, r: 0.5, solid: true });
        hh += rand(0.55, 0.8);
      }
    }
  }
  addRoots(is);
  grassDisc(is.x, y, is.z, is.R, is.h, Math.round(is.R * is.R * (is.big ? 11 : 15)), pal, occ);
  if (is.idx !== 6) addFireflies(is, 14);   // Bosque Pálido has its own swarm
  if (is.idx > 0 && !is.summit) {   // reward on the highest rock/column, else somewhere on the island
    const t = tops.length ? tops.reduce((a, b) => (b.y > a.y ? b : a)) : null;
    if (t) addPickup(t.x, t.y + 1.05, t.z);
    else { const s = freeSpot(is, 0.3, 0.8, 0.5); if (s) addPickup(s.x, y + 1.0, s.z); }
  }
}

// hidden islet: an inscription stone facing the way in, one of four small scenes, a fragment
const ISLET_KINDS = ['watch', 'camp', 'garden', 'ruin'];
function decorateIslet(s) {
  const pal = s.pal, y = s.y, occ = s.occ;
  const at = (a, f) => ({ x: s.x + Math.cos(a) * s.R * shapeAt(s.h, a) * f, z: s.z + Math.sin(a) * s.R * shapeAt(s.h, a) * f });
  occ.push({ ...at(s.entry, 0.75), r: 1.8 });
  const st = at(s.entry + Math.PI, 0.3);
  addStele(st.x, y, st.z, s.entry, pal);
  occ.push({ ...st, r: 1.3, solid: true });
  const spot = (r, min = 0.2, max = 0.75) => { const p = freeSpot(s, min, max, r); if (p) occ.push({ ...p, r, solid: true }); return p; };
  const kind = ISLET_KINDS[s.secret % ISLET_KINDS.length];
  if (kind === 'watch') {   // old observatory: a broken ring of columns and a crystal cluster
    for (let k = 0; k < 6; k++) { const p = spot(0.6, 0.45, 0.8); if (p) addColumn(p.x, y, p.z, pal, rand(0.8, 2.4)); }
    const c = spot(1.4); if (c) addCrystalCluster(c.x, y, c.z, rand(0.8, 1.1), pal);
  } else if (kind === 'camp') {   // someone's last camp
    const c = spot(2.4, 0.1, 0.4);
    if (c) { addCampfire(c.x, y, c.z, pal); const a = rand(0, TAU); addTent(c.x + Math.cos(a) * 2.1, y, c.z + Math.sin(a) * 2.1, Math.atan2(-Math.cos(a), -Math.sin(a))); }
  } else if (kind === 'garden') {   // an overgrown garden in the mist
    for (let k = 0; k < 2; k++) { const r = rand(0.9, 1.2), p = spot(r + 0.3); if (p) addFlowerBed(p.x, y, p.z, r, pal); }
    addGroundMist(s.x, y, s.z, s.R, 0.4);
  } else {   // a lone gate and its banners
    const c = spot(2.0, 0.1, 0.4); if (c) addArch(c.x, y, c.z, pal, rand(0, TAU), 'stone');
    for (let k = 0; k < 2; k++) { const p = spot(0.6, 0.5, 0.85); if (p) addBanner(p.x, y, p.z, pick(['#a8443c', '#3f6f7a', '#c99a3a'])); }
  }
  for (let i = 0; i < 2; i++) { const p = freeSpot(s, 0.3, 0.8, 1.3); if (p) { occ.push({ ...p, r: 1.1 }); addTree(p.x, y - 0.05, p.z, pal); } }
  for (let i = 0; i < 3; i++) { const p = freeSpot(s, 0.3, 0.92, 0.6); if (p) addBush(p.x, y, p.z, pal); }
  const pk = freeSpot(s, 0.1, 0.6, 0.5); if (pk) addPickup(pk.x, y + 1.0, pk.z);
  addRoots(s);
  grassDisc(s.x, y, s.z, s.R, s.h, Math.round(s.R * s.R * 15), pal, occ);
  addFireflies(s, 16);
}

export function buildLevel() {
  reseed(7);
  const N = SEGMENTS.length;
  let heading = -Math.PI / 2;
  let isl = addIsland(0, 0, 0, 9, 0);
  isl.entry = heading + Math.PI;
  for (let i = 0; i < N; i++) {
    const diff = i / (N - 1);
    if (i > 0) heading += rand(-0.25, 0.25) + 0.45;   // steady turn -> the path climbs as a helix
    isl.exit = heading;
    const rim = isl.R * shapeAt(isl.h, heading);
    const start = { x: isl.x + Math.cos(heading) * rim, z: isl.z + Math.sin(heading) * rim, y: isl.y };
    const end = segment(SEGMENTS[i], start, heading, diff, palette((i + 0.5) / N), i);
    crossings.push({ ...COURSE[i], start, end: { x: end.x, y: end.y, z: end.z }, steps: end.steps, owner: i });
    const last = i === N - 1, big = BIG[i + 1], R1 = big?.R ?? (last ? 15 : rand(6.8, 9)), h1 = shapeH(last ? 0.5 : big ? 0.6 : 1);
    let spot = null;
    for (let tries = 0; !spot; tries++) {
      const hd = heading + 0.4 + rand(-0.25, 0.25) * (1 + tries * 0.1);
      const dist = end.prevR + lerp(1.1, 1.6, diff) * rand(0.9, 1.1) + R1 * shapeAt(h1, hd + Math.PI) * 0.97;
      const x = end.x + Math.cos(hd) * dist, z = end.z + Math.sin(hd) * dist, y = end.y + rand(0.45, 0.8);
      if (tries > 40 || clearOf(x, z, y, R1 * 1.2, R1 * 1.2, end.last)) spot = { x, y, z, hd };
    }
    heading = spot.hd;
    isl = addIsland(spot.x, spot.y, spot.z, R1, (i + 1) / N, h1);
    isl.big = big ?? null;
    isl.entry = Math.atan2(end.z - isl.z, end.x - isl.x);
  }
  isl.summit = true;

  // side detours with a reward at the end; on every other island the detour leads on to a hidden islet
  for (const is of islands.slice(1, -1)) {
    const wantIslet = is.idx % 2 === 0;
    let side = rnd() < 0.5 ? 1 : -1;
    for (let attempt = 0; attempt < 2; attempt++, side = -side) {
      const a = is.exit + side * rand(1.6, 2.3), rim = is.R * shapeAt(is.h, a);
      let x = is.x + Math.cos(a) * rim, z = is.z + Math.sin(a) * rim, y = is.y, prevR = 0;
      const cand = [];
      for (let k = 0, n = wantIslet ? 4 : 3; k < n; k++) {
        const r = rand(0.85, 1.05), d = prevR + rand(1.0, 1.55) + r, aa = a + rand(-0.3, 0.3);
        x += Math.cos(aa) * d; z += Math.sin(aa) * d; y += rand(-0.2, 0.75);
        cand.push({ x, y, z, r }); prevR = r;
      }
      if (!cand.every(c => clearOf(c.x, c.z, c.y, c.r, 3, is.col))) continue;
      const e = cand[cand.length - 1];
      let islet = null;
      if (wantIslet) {
        const R = rand(4.2, 5.2), aa = a + rand(-0.3, 0.3), d = e.r + rand(1.2, 1.5) + R;
        islet = { x: e.x + Math.cos(aa) * d, y: e.y + rand(0.3, 0.7), z: e.z + Math.sin(aa) * d, R };
        if (!clearOf(islet.x, islet.z, islet.y, R * 1.1, R * 1.2, is.col)) islet = null;
      }
      const cols = cand.map(c => addPlatform(c.x, c.y, c.z, c.r, 'stone', is.pal));
      if (islet) {
        const s = addIslet(islet.x, islet.y, islet.z, islet.R, is.pal);
        s.entry = Math.atan2(e.z - s.z, e.x - s.x);
        s.col.detour = counts.detours;
      } else {
        addPickup(e.x, e.y + 1.05, e.z);
        cols[cols.length - 1].detour = counts.detours;
      }
      counts.detours++;
      break;
    }
  }

  for (const is of islands) {
    decorate(is);
    if ([0, 8, 9, 10].includes(is.idx)) {
      const names = { 0: ['ninho', 'Ninho da Névoa'], 8: ['jardim', 'Jardim das Brumas'], 9: ['cidade', 'Coroa de Pedra'], 10: ['farol', 'Farol Silencioso'] };
      const [id, name] = names[is.idx];
      landmarks.push({ id, name, x: is.x, y: is.y + (is.summit ? 3.3 : 1.5), z: is.z });
    }
  }
  for (const s of secrets) if (s.kind === 'islet') decorateIslet(s);
  const compatibleVersion = `${WORLD_REVISION}.${islands.length}.${secrets.length}.${pickups.length}.${Math.round(islands.at(-1).y * 100)}`;
  buildWhaleExcursion();
  const whaleVersion = `${WORLD_REVISION}.${islands.length}.${secrets.length}.${pickups.length}.${Math.round(islands.at(-1).y * 100)}`;

  // small floating rocks around each island (visual only)
  for (const is of [...islands, ...secrets.filter(s => s.kind === 'islet')]) {
    for (let k = 0; k < 5; k++) {
      const a = rand(0, TAU), d = is.R + rand(3.5, 11), r = rand(0.5, 1.8);
      const x = is.x + Math.cos(a) * d, z = is.z + Math.sin(a) * d, y = is.y + rand(-9, 1.5);
      if (clearOf(x, z, y, r + 1.5, r * 2.5, null)) addFloater(x, y, z, r, is.pal);
    }
  }

  // distant islands: silhouettes in the mist
  const top = islands[islands.length - 1].y;
  let cx = 0, cz = 0;
  for (const is of islands) { cx += is.x / islands.length; cz += is.z / islands.length; }
  for (let k = 0, made = 0; k < 200 && made < 18; k++) {
    const a = rand(0, TAU), d = rand(95, 260), R0 = rand(7, 20);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = rand(-25, top + 18);
    if (!clearOf(x, z, y, R0 + 35, R0 * 1.4, null)) continue;
    made++;
    const pal = palette(clamp(y / top, 0, 1)), h = shapeH();
    pushGeo(rockMass(R0, h, P_ISLAND(R0 * rand(1, 1.5)), 22, islandColor(pal)), x, y, z);
    for (let t = 0, n = Math.round(R0 * 0.35); t < n; t++) {
      const ta = rand(0, TAU), tr = R0 * shapeAt(h, ta) * Math.sqrt(rnd()) * 0.8;
      addTree(x + Math.cos(ta) * tr, y, z + Math.sin(ta) * tr, pal, rand(1.4, 2.4));
    }
  }
  for (let k = 0, made = 0; k < 300 && made < 45; k++) {
    const base = pick(islands), a = rand(0, TAU), d = rand(22, 70), r = rand(0.8, 3);
    const x = base.x + Math.cos(a) * d, z = base.z + Math.sin(a) * d, y = base.y + rand(-20, 20);
    if (!clearOf(x, z, y, r + 12, r * 3, null)) continue;
    made++;
    pushGeo(rockMass(r, shapeH(), P_STONE(r * rand(1.6, 2.8)), 8, islandColor(palette(clamp(y / top, 0, 1)))), x, y, z);
  }

  // everything static becomes one mesh; grass/flowers one instanced mesh each
  const mesh = new THREE.Mesh(mergeGeometries(worldGeos), worldMat);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  worldGeos.length = 0;
  buildVegetation();
  createClouds(islands);
  createFauna(islands);
  buildGrid();
  return { compatibleVersions: [compatibleVersion, whaleVersion] };
}
