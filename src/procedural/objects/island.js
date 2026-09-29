// Main floating island: grassy top with an overhanging lip, layered earth and rock underneath, a few
// stones along the rim. Walkable; the top is flat at y so collision stays simple.
import * as THREE from 'three';
import { TAU, rnd, rand } from '../../utils.js';
import { bake, jitter, rockMass, shapeH, shapeAt, palette, themed, islandColor, P_ISLAND } from '../geometry.js';
import { THEMES } from '../themes.js';
import { islands, addCol, pushGeo } from '../world.js';

export function addIsland(x, y, z, R0, t, h = shapeH()) {
  const depth = R0 * rand(0.95, 1.3), pal = themed(palette(t), THEMES[islands.length]?.pal);   // themed islands recolour themselves
  pushGeo(rockMass(R0, h, P_ISLAND(depth), 30, islandColor(pal)), x, y, z);
  const isl = { x, y, z, R: R0, h, depth, pal, idx: islands.length, occ: [] };
  isl.col = addCol({ x, z, y, r: R0 * 0.97, h, depth, thick: 2.2, island: isl.idx });
  islands.push(isl);
  rimStones(isl);
  return isl;
}

// small half-buried stones along the edge break up the perfect outline
function rimStones({ x, y, z, R, h, pal }) {
  for (let k = 0, n = Math.round(R * 1.6); k < n; k++) {
    const a = rand(0, TAU), r = R * shapeAt(h, a) * rand(0.9, 0.99), s = rand(0.12, 0.34);
    const g = jitter(new THREE.DodecahedronGeometry(s, 0), s * 0.2);
    g.scale(rand(0.8, 1.4), rand(0.5, 0.8), rand(0.8, 1.4));
    g.rotateY(rand(0, TAU));
    pushGeo(bake(g, (cen, n, c) => { c.copy(pal.rock).offsetHSL(0, 0, rand(-0.03, 0.05)); if (n.y > 0.6 && rnd() < 0.6) c.lerp(pal.moss, 0.55); }),
      x + Math.cos(a) * r, y + s * 0.1, z + Math.sin(a) * r);
  }
}
