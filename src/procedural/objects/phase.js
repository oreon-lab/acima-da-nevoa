// Sun and star stones: platforms that only exist by day ('day', warm gold) or by night ('night', cold blue).
// Out of their time they fade to a ghost and can't be stood on; near dusk and dawn they flicker as a warning.
import * as THREE from 'three';
import { scene, game } from '../../core.js';
import { rand } from '../../utils.js';
import { rockMass, shapeH, P_SLAB } from '../geometry.js';
import { addCol } from '../world.js';

const LOOK = { day: ['#e9cf94', '#ffb54a'], night: ['#b9c9ee', '#6f9cff'] };
const mats = Object.fromEntries(Object.entries(LOOK).map(([k, [c, e]]) => [k, new THREE.MeshStandardMaterial({
  color: c, emissive: e, emissiveIntensity: 0.4, roughness: 0.5, flatShading: true, transparent: true,
})]));
const phased = [];
let crossingDay = null;

export function addPhasePlatform(x, y, z, r, kind) {
  const h = shapeH(0.8), geo = rockMass(r, h, P_SLAB(rand(1.0, 1.4)), 8, (cen, n, c) => c.setRGB(1, 1, 1));
  geo.deleteAttribute('color');
  const mesh = new THREE.Mesh(geo, mats[kind]);
  mesh.position.set(x, y, z); mesh.castShadow = true;
  scene.add(mesh);
  const c = addCol({ x, y, z, r: r * 0.97, h, depth: 1.4, surface: 'stone', phase: kind });
  phased.push(c);
  return c;
}

export function updatePhase(t, playerPosition) {
  if (!phased.length) return;
  // Once a player approaches the crossing, keep that lane solid until they leave it.
  // The clock remains atmospheric; it cannot remove the landing target halfway through a jump.
  const crossing = playerPosition && phased.some(c => Math.hypot(c.x - playerPosition.x, c.z - playerPosition.z) < 6 && Math.abs(c.y - playerPosition.y) < 8);
  if (!crossing) crossingDay = null;
  else if (crossingDay === null) crossingDay = game.day > 0.5;
  const day = crossingDay ?? game.day > 0.5, edge = crossingDay === null && Math.abs(game.day - 0.5) < 0.07;
  for (const [kind, m] of Object.entries(mats)) {
    const on = (kind === 'day') === day;
    m.opacity = on ? (edge ? 0.55 + 0.45 * Math.sin(t * 14) ** 2 : 1) : 0.13;
    m.depthWrite = on;
    m.emissiveIntensity = on ? 0.35 + 0.5 * (1 - game.day) : 0.15;
  }
  for (const c of phased) { const on = (c.phase === 'day') === day; c.ground = on; c.gone = !on; }
}
