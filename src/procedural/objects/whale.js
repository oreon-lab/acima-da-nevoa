// A living island with an actual moving deck. The circuit, collision and rewards use the same pose.
import { makeWhale } from './whaleModel.js';
import { scene } from '../../core.js';
import { V3, TAU } from '../../utils.js';
import { islands, secrets, colliders, movers, pickups, addCol, clearOf } from '../world.js';
import { shapeAt } from '../geometry.js';
import { addPlatform } from './platform.js';
import { addIslet } from './island.js';
import { addPickup } from './pickup.js';
import { addLantern } from './lantern.js';
import { addCrystalCluster } from './crystals.js';
import { addFlowerBed } from './flowerBed.js';
import { addTree } from './tree.js';
import { addRouteMarks } from './routeMarks.js';
import { whalePose, carrierPoint, WHALE_PERIOD } from '../whaleRoute.js';

export const whale = { root: null, route: null, deck: null, source: null, destination: null, sanctuary: null, pose: null, cargo: [] };

function clearCircuit(route, owner) {
  for (let k = 0; k < 48; k++) {
    const p = whalePose(k / 48 * WHALE_PERIOD, route);
    for (const c of colliders) {
      if (c === owner.col || p.y + 2 < c.y - c.depth || c.y + 3 < p.y - 8) continue;
      const a = Math.atan2(c.z - p.z, c.x - p.x) - p.yaw;
      const bodyRadius = 1 / Math.sqrt((Math.cos(a) / 13) ** 2 + (Math.sin(a) / 5.2) ** 2);
      if (Math.hypot(c.x - p.x, c.z - p.z) < bodyRadius + c.rMax + 1) return false;
    }
  }
  return true;
}

function chooseRoute() {
  // Search without consuming the seeded RNG: all existing islands and rewards retain their identities.
  for (const owner of [islands[5], islands[1], islands[8]]) {
    for (let k = 0; k < 48; k++) {
      const angle = owner.exit + Math.PI / 2 + k / 48 * TAU;
      const away = a => Math.abs(Math.atan2(Math.sin(angle - a), Math.cos(angle - a))) > 0.65;
      if (!away(owner.entry) || !away(owner.exit)) continue;
      const nx = Math.cos(angle), nz = Math.sin(angle), rim = owner.R * shapeAt(owner.h, angle);
      const source = { x: owner.x + nx * (rim + 4.4), y: owner.y + 0.15, z: owner.z + nz * (rim + 4.4) };
      const radius = 20;
      const route = { nx, nz, radius, y: owner.y + 0.4, owner: owner.idx,
        center: { x: source.x + nx * (7.6 + radius), z: source.z + nz * (7.6 + radius) } };
      const far = whalePose(WHALE_WAIT_AT_FAR, route);
      const destination = { x: far.x + nx * 7.6, y: source.y, z: far.z + nz * 7.6 };
      const sanctuary = { x: far.x + nx * 18, y: source.y, z: far.z + nz * 18 };
      if (clearOf(source.x, source.z, source.y, 2.5, 3, owner.col)
        && clearOf(sanctuary.x, sanctuary.z, sanctuary.y, 10, 12, null) && clearCircuit(route, owner)) {
        return { route, source, destination, sanctuary, owner };
      }
    }
  }
  throw new Error('No clear circuit for the sky whale');
}
const WHALE_WAIT_AT_FAR = WHALE_PERIOD / 2;

export function buildWhaleExcursion() {
  const { route, source, destination, sanctuary, owner } = chooseRoute();
  Object.assign(whale, { route, source, destination });
  const home = addPlatform(source.x, source.y, source.z, 2.4, 'slab', owner.pal);
  home.whaleDock = 'source'; whale.source.col = home;
  addLantern(source.x - route.nz * 1.6, source.y, source.z + route.nx * 1.6, owner.pal);
  addRouteMarks([home]);
  const island = addIslet(sanctuary.x, sanctuary.y, sanctuary.z, 7.1, owner.pal, 'Santuário do Horizonte');
  island.entry = Math.atan2(destination.z - sanctuary.z, destination.x - sanctuary.x);
  whale.sanctuary = island;
  const far = addPlatform(destination.x, destination.y, destination.z, 2.4, 'slab', owner.pal);
  far.whaleDock = 'destination'; far.secret = island.secret; whale.destination.col = far;
  addRouteMarks([far]);
  for (const side of [-1, 1]) {
    addLantern(destination.x + route.nz * side * 1.6, destination.y, destination.z - route.nx * side * 1.6, owner.pal);
    addTree(sanctuary.x + route.nx * 2 + route.nz * side * 3, sanctuary.y, sanctuary.z + route.nz * 2 - route.nx * side * 3, owner.pal, 0.7);
  }
  addFlowerBed(sanctuary.x, sanctuary.y, sanctuary.z, 2.0, owner.pal);
  addCrystalCluster(sanctuary.x + route.nx * 3.8, sanctuary.y, sanctuary.z + route.nz * 3.8, 1.2, owner.pal);
  const built = makeWhale(owner.pal); whale.root = built.root; scene.add(built.root);
  const pose = whalePose(0, route); whale.pose = pose;
  const motion = { type: 'carrier', sample: t => whalePose(t, route), animate: built.animate };
  const deck = addCol({ x: pose.x, y: pose.y + 0.1, z: pose.z, r: 1, rMax: 8.2, depth: 8, thick: 0.6, surface: 'grass', whaleDeck: true,
    h: a => 1 / Math.sqrt((Math.cos(a - whale.pose.yaw) / 8.0) ** 2 + (Math.sin(a - whale.pose.yaw) / 3.6) ** 2) });
  deck.mover = { mesh: built.root, motion, delta: new V3(), yaw: pose.yaw, offset: { x: 0, y: 0.1, z: 0 }, drive: true,
    onPose: p => {
      whale.pose = p;
      for (const cargo of whale.cargo) {
        const point = carrierPoint(p, ...cargo.local);
        cargo.pickup.g.position.x = point.x; cargo.pickup.g.position.z = point.z;
        if (!cargo.pickup.got) cargo.pickup.g.position.y = point.y;
        else cargo.pickup.g.position.y += deck.mover.delta.y;
        cargo.pickup.base = point.y;
      }
      const point = carrierPoint(p, 0, 1, 0);
    } };
  whale.deck = deck; movers.push(deck);
  for (const trunk of built.trunks) {
    const offset = {x:trunk.x,y:trunk.y,z:trunk.z};
    const p = carrierPoint(pose, offset.x, offset.y, offset.z), c = addCol({ ...trunk, ...p });
    c.mover = { mesh: built.root, motion, delta: new V3(), yaw: pose.yaw, offset, drive: false }; movers.push(c);
  }
  for (const local of [[-5.4, 1.05, 1], [0, 1.05, -1.2], [5.0, 1.05, 0.7]]) {
    const p = carrierPoint(pose, ...local); addPickup(p.x, p.y, p.z);
    whale.cargo.push({ local, pickup: pickups.at(-1) });
  }
  addPickup(sanctuary.x, sanctuary.y + 1.1, sanctuary.z);
  return whale;
}

