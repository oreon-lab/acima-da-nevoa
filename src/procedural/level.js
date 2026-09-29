// Level generator: a rising helix of islands linked by parkour segments, then decoration,
// side detours, floating rocks and distant silhouettes. Seeded, so the world is always the same.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from '../core.js';
import { V3, TAU, clamp, lerp, rnd, rand, pick } from '../utils.js';
import { worldMat } from './materials.js';
import { rockMass, shapeH, shapeAt, palette, islandColor, P_ISLAND, P_STONE } from './geometry.js';
import { islands, worldGeos, summit, pushGeo, clearOf, freeSpot } from './world.js';
import { THEMES } from './themes.js';
import {
  addIsland, addPlatform, addSpire, addAltar, addFloater, addTree, addBush, addPebble, addBoulder, addColumn,
  addRoots, addShrine, addPickup, grassDisc, buildVegetation, addUpdraft, addClimbWall,
} from './objects/index.js';
import { createClouds } from '../render/atmosphere.js';

// parkour between island i and i+1
// crumble = platforms that drop away, wind = ride an updraft, climb = scale a rock wall
const SEGMENTS = ['stones', 'bob', 'crumble', 'spiral', 'ferry', 'wind', 'lift', 'bob', 'climb', 'spiral'];

function segment(type, s, heading, diff, pal) {
  let x = s.x, z = s.z, y = s.y, prevR = 0, dir = heading, last = null;
  const steps = [];
  const rB = lerp(1.35, 0.95, diff), g0 = lerp(0.9, 1.35, diff), g1 = lerp(1.45, 2.05, diff);
  const place = (r, gap, rise, style, motion, turn = 0.4) => {
    dir = heading + clamp(dir - heading + rand(-turn, turn), -0.55, 0.55);
    const d = prevR + gap + r;
    x += Math.cos(dir) * d; z += Math.sin(dir) * d; y += rise;
    last = addPlatform(x, y, z, r, style, pal, motion); prevR = r; steps.push(last);
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
  } else if (type === 'crumble') {   // the middle stone is solid, so you can catch your breath
    for (let k = 0; k < 6; k++) place(rB * rand(1.1, 1.3), rand(g0, g1) * 0.9, rand(0.5, 0.8), k === 2 ? 'stone' : 'crumble', k === 2 ? null : { type: 'crumble' });
  } else if (type === 'wind') {   // a vent stone throws you up 8 m; steer across to the high slab
    lineTo(1, 1, 0.5, 0.8, 'stone', 1);
    place(1.5, rand(g0, g1), 0.5, 'stone');
    addUpdraft(last.x, last.y, last.z, 1.3, 9.5);
    place(2.1, 1.8, 7.6, 'slab', null, 0.2);
    lineTo(1, 1, 0.5, 0.9, 'stone', 2);
  } else if (type === 'climb') {   // walk into the wall to climb it
    lineTo(1, 1, 0.5, 0.8, 'stone', 2);
    const rW = 1.5, dW = prevR + 1.5 + rW;
    x += Math.cos(heading) * dW; z += Math.sin(heading) * dW; y += 5.6;
    last = addClimbWall(x, y, z, rW, 6.6, pal); steps.push(last); prevR = rW; dir = heading;
    lineTo(1, 1, 0.6, 0.9, 'stone', 3, 0.3);
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
  return { x, z, y, prevR, last };
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
      const a = k / 8 * TAU + 0.2, p = { x: is.x + Math.cos(a) * 6.8, z: is.z + Math.sin(a) * 6.8 };
      if (occ.some(o => (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < (o.r + 0.6) ** 2)) continue;
      tops.push(addColumn(p.x, y, p.z, pal, rand(0.9, 2.6)));
      occ.push({ ...p, r: 0.7, solid: true });
    }
    summit.pos.set(is.x, y + 3.3, is.z);
  }
  const theme = THEMES[is.idx];
  theme?.decorate(is, tops);   // signature objects first, so the generic scatter works around them
  const nTrees = Math.round(is.R * rand(0.28, 0.45) * (theme?.trees ?? 1));
  for (let i = 0; i < nTrees; i++) {
    const s = freeSpot(is, 0.2, 0.82, 1.4); if (!s) continue;
    occ.push({ ...s, r: 1.1 });
    addTree(s.x, y - 0.05, s.z, pal);
  }
  for (let i = 0, n = 3 + (rnd() * 5 | 0); i < n; i++) { const s = freeSpot(is, 0.3, 0.92, 0.6); if (s) addBush(s.x, y, s.z, pal); }
  for (let i = 0, n = 3 + (rnd() * 4 | 0); i < n; i++) { const s = freeSpot(is, 0.2, 0.95, 0.4); if (s) addPebble(s.x, y, s.z, pal); }
  for (let i = 0, n = 1 + (rnd() * 2 | 0); i < n; i++) {
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
  grassDisc(is.x, y, is.z, is.R, is.h, Math.round(is.R * is.R * 15), pal, occ);
  if (is.idx > 0 && !is.summit) {   // reward on the highest rock/column, else somewhere on the island
    const t = tops.length ? tops.reduce((a, b) => (b.y > a.y ? b : a)) : null;
    if (t) addPickup(t.x, t.y + 1.05, t.z);
    else { const s = freeSpot(is, 0.3, 0.8, 0.5); if (s) addPickup(s.x, y + 1.0, s.z); }
  }
}

export function buildLevel() {
  const N = SEGMENTS.length;
  let heading = -Math.PI / 2;
  let isl = addIsland(0, 0, 0, 9, 0);
  isl.entry = heading + Math.PI;
  for (let i = 0; i < N; i++) {
    const diff = i / (N - 1);
    if (i > 0) heading += rand(-0.25, 0.25) + 0.45;   // steady turn -> the path climbs as a helix
    isl.exit = heading;
    const rim = isl.R * shapeAt(isl.h, heading);
    const end = segment(SEGMENTS[i], { x: isl.x + Math.cos(heading) * rim, z: isl.z + Math.sin(heading) * rim, y: isl.y }, heading, diff, palette((i + 0.5) / N));
    const last = i === N - 1, R1 = last ? 11.5 : rand(6.8, 9), h1 = shapeH(last ? 0.5 : 1);
    let spot = null;
    for (let tries = 0; !spot; tries++) {
      const hd = heading + 0.4 + rand(-0.25, 0.25) * (1 + tries * 0.1);
      const dist = end.prevR + lerp(1.1, 1.6, diff) * rand(0.9, 1.1) + R1 * shapeAt(h1, hd + Math.PI) * 0.97;
      const x = end.x + Math.cos(hd) * dist, z = end.z + Math.sin(hd) * dist, y = end.y + rand(0.45, 0.8);
      if (tries > 40 || clearOf(x, z, y, R1 * 1.2, R1 * 1.2, end.last)) spot = { x, y, z, hd };
    }
    heading = spot.hd;
    isl = addIsland(spot.x, spot.y, spot.z, R1, (i + 1) / N, h1);
    isl.entry = Math.atan2(end.z - isl.z, end.x - isl.x);
  }
  isl.summit = true;

  // side detours with a reward at the end
  for (const is of islands.slice(1, -1)) {
    let side = rnd() < 0.5 ? 1 : -1;
    for (let attempt = 0; attempt < 2; attempt++, side = -side) {
      const a = is.exit + side * rand(1.6, 2.3), rim = is.R * shapeAt(is.h, a);
      let x = is.x + Math.cos(a) * rim, z = is.z + Math.sin(a) * rim, y = is.y, prevR = 0;
      const cand = [];
      for (let k = 0; k < 3; k++) {
        const r = rand(0.85, 1.05), d = prevR + rand(1.0, 1.55) + r, aa = a + rand(-0.3, 0.3);
        x += Math.cos(aa) * d; z += Math.sin(aa) * d; y += rand(-0.2, 0.75);
        cand.push({ x, y, z, r }); prevR = r;
      }
      if (!cand.every(c => clearOf(c.x, c.z, c.y, c.r, 3, is.col))) continue;
      for (const c of cand) addPlatform(c.x, c.y, c.z, c.r, 'stone', is.pal);
      const e = cand[cand.length - 1];
      addPickup(e.x, e.y + 1.05, e.z);
      break;
    }
  }

  for (const is of islands) decorate(is);

  // small floating rocks around each island (visual only)
  for (const is of islands) {
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
}
