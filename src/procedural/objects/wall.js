// Climbable rock wall: a tall pillar with ivy stripes and a grassy top. Push into it (walk towards it) to climb;
// the collider is flagged `climb` and player.js does the rest, mantling you onto the top.
import { TAU, rnd, rand } from '../../utils.js';
import { rockMass, shapeH } from '../geometry.js';
import { addCol, pushGeo } from '../world.js';
import { grassDisc } from './grass.js';

// y = height of the top, H = how far the wall reaches down
export function addClimbWall(x, y, z, r, H, pal) {
  const stripe = rand(0, TAU);
  const prof = [[0, 0, 0], [0.7, 0, 0.02], [0.97, 0, 0.02], [1.0, -0.15, 0.02], [0.98, -H * 0.3, 0.03], [1.0, -H * 0.55, 0.03], [0.98, -H * 0.8, 0.03], [0.6, -H - 1.2, 0.1], [0, -H - 3, 0]];
  pushGeo(rockMass(r, shapeH(0.15), prof, 12, (cen, n, c) => {
    c.copy(pal.stone).multiplyScalar(rand(0.82, 1.0));
    if (n.y < 0.6 && Math.sin(Math.atan2(cen.z, cen.x) * 3 + stripe + cen.y * 0.25) > 0.35) c.lerp(pal.moss, 0.7);   // ivy climbing up the wall
    if (n.y > 0.6) c.copy(pal.grass);
  }), x, y, z);
  grassDisc(x, y, z, r * 0.8, null, 14, pal);
  return addCol({ x, z, y, r: r * 0.97, thick: H + 1.5, depth: H + 3, climb: true });
}
