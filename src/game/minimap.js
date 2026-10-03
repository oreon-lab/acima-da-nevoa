// Round minimap (top left, Genshin-style): islands near you drawn from above, rotated so the camera's forward is up.
import { islands } from '../procedural/world.js';
import { shapeAt } from '../procedural/geometry.js';
import { save } from './progress.js';

const RANGE = 60, SIZE = 160, c = document.querySelector('#mini'), g = c.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 2);
c.width = c.height = SIZE * dpr;

export function drawMinimap(camera, player) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, SIZE, SIZE);
  const h = SIZE / 2, k = h / RANGE, fx = -Math.sin(camera.rotation.y), fz = -Math.cos(camera.rotation.y);   // camera forward on the ground
  const to = (x, z) => { const dx = x - player.pos.x, dz = z - player.pos.z; return [h + (dz * fx - dx * fz) * k, h - (dx * fx + dz * fz) * k]; };
  g.save(); g.beginPath(); g.arc(h, h, h - 2, 0, 7); g.clip();
  for (const [i, is] of islands.entries()) {
    const dy = Math.abs(is.y - player.pos.y); if (dy > 30) continue;
    g.beginPath();
    for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2, r = is.R * shapeAt(is.h, t), p = to(is.x + Math.cos(t) * r, is.z + Math.sin(t) * r); a ? g.lineTo(...p) : g.moveTo(...p); }
    g.closePath(); g.globalAlpha = dy < 6 ? 1 : 0.4;
    g.fillStyle = save.visited.includes('i' + i) ? 'rgba(236, 229, 216, .8)' : 'rgba(236, 229, 216, .35)'; g.fill();
  }
  g.restore(); g.globalAlpha = 1;
  // you: a pale-gold arrow turned by how far you face from the camera
  g.save(); g.translate(h, h); g.rotate(player.yaw - camera.rotation.y - Math.PI);
  g.beginPath(); g.moveTo(0, -11); g.lineTo(7.5, 8); g.lineTo(0, 4); g.lineTo(-7.5, 8); g.closePath();
  g.fillStyle = '#ffd58a'; g.shadowColor = '#000'; g.shadowBlur = 5; g.fill(); g.restore();
}
