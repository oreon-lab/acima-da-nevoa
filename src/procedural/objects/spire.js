// Tall rock the spiral staircase winds around; its top is a bonus perch. Lumpy silhouette with ledges.
import { rockMass, shapeH, islandColor } from '../geometry.js';
import { addCol, pushGeo } from '../world.js';
import { grassDisc } from './grass.js';

export function addSpire(x, z, top, bottom, pal) {
  const H = top - bottom, h = shapeH(0.6), R0 = 1.8;
  const prof = [[0, 0, 0], [0.7, 0, 0.03], [0.97, 0, 0.02], [1.02, -0.08, 0.03], [1.1, -0.35, 0.04], [0.95, -0.7, 0.05],
    [1.0, -H * 0.16, 0.07], [0.82, -H * 0.3, 0.08], [1.06, -H * 0.46, 0.08], [0.86, -H * 0.62, 0.09], [0.98, -H * 0.78, 0.09],
    [0.7, -H * 0.94, 0.12], [0.4, -H - 1.5, 0.14], [0, -H - 4, 0]];
  pushGeo(rockMass(R0, h, prof, 12, islandColor(pal)), x, top, z);
  addCol({ x, z, y: top, r: R0 * 0.97, h, depth: H + 4, thick: H });
  grassDisc(x, top, z, R0 * 0.8, h, 30, pal);
}
