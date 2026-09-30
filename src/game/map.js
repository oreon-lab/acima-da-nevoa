// Pause-menu map: the live 3D world is rendered from the map camera (camera.js mapCam); this draws over it:
// a dark veil over everything you haven't explored (visited islands and found secret places show through it),
// a gold outline around the island in focus, numerals on visited islands and a lock on the others, the
// checkpoint diamond, "?" over secret places not found yet, and an arrow for you.
import { V3 } from '../utils.js';
import { islands, secrets } from '../procedural/world.js';
import { shapeAt } from '../procedural/geometry.js';
import { ROMAN, NAMES } from '../config.js';
import { save } from './progress.js';
import { whale } from '../procedural/objects/whale.js';

const INK = 'rgba(255, 248, 235,', GOLD = '#ffd58a', v = new V3();

// small padlock marker
function lock(g, x, y) {
  g.save(); g.translate(x, y); g.fillStyle = INK + '.6)'; g.strokeStyle = INK + '.6)'; g.lineWidth = 1.8;
  g.beginPath(); g.arc(0, -3, 3.6, Math.PI, 0); g.stroke();
  g.fillRect(-5.5, -3, 11, 8.5);
  g.fillStyle = 'rgba(10, 14, 20, .8)'; g.fillRect(-0.9, 0, 1.8, 3);
  g.restore();
}

export function drawMapOverlay(canvas, camera, player, focus, t) {
  const dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const S = (x, y, z) => { v.set(x, y, z).project(camera); return v.z < 1 && v.z > -1 ? [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H] : null; };
  const rim = (x, y, z, R, h, grow) => {   // the island's outline on screen, or null if part of it is behind the camera
    const pts = [];
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, r = R * shapeAt(h, a) * grow, p = S(x + Math.cos(a) * r, y + 0.15, z + Math.sin(a) * r); if (!p) return null; pts.push(p); }
    return pts;
  };
  const poly = pts => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); };

  // the veil: dark everywhere, cleared (with soft edges) over the places you have been
  g.save();
  g.fillStyle = 'rgba(6, 10, 16, .58)'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out'; g.filter = 'blur(16px)'; g.fillStyle = '#000';
  islands.forEach((is, i) => { if (!save.visited.includes('i' + i)) return; const pts = rim(is.x, is.y, is.z, is.R, is.h, 1.25); if (pts) { poly(pts); g.fill(); } });
  for (const sp of secrets) if (save.visited.includes('s' + sp.secret)) { const pts = rim(sp.x, sp.y, sp.z, Math.max(sp.R, 1.5), sp.h ?? null, 1.4); if (pts) { poly(pts); g.fill(); } }
  g.restore();

  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(10, 14, 20, .8)'; g.shadowBlur = 6;

  // outline of the island in focus, pulsing
  const f = islands[focus], fr = rim(f.x, f.y, f.z, f.R, f.h, 1.03);
  if (fr) { poly(fr); g.strokeStyle = GOLD; g.globalAlpha = 0.65 + 0.3 * Math.sin(t * 2.5); g.lineWidth = 2; g.stroke(); g.globalAlpha = 1; }

  islands.forEach((is, i) => {
    const p = S(is.x, is.y + 3, is.z); if (!p) return;
    const seen = save.visited.includes('i' + i), me = i === focus;
    if (!seen) { lock(g, p[0], p[1]); return; }   // not been there yet
    g.fillStyle = INK + '.95)';
    g.font = `${me ? 600 : 500} ${me ? 15 : 12}px Poppins, sans-serif`;
    g.fillText(ROMAN[i], p[0], p[1]);
    if (me) { g.font = '300 20px Poppins, sans-serif'; g.fillText(NAMES[i], p[0], p[1] - 24); }
    if (i === player.cp) {   // checkpoint diamond over the shrine
      const c = is.cp, q = S(c.x, c.y + 2.9, c.z);
      if (q) { g.save(); g.translate(...q); g.rotate(Math.PI / 4); g.fillStyle = GOLD; g.shadowColor = GOLD; g.shadowBlur = 12; g.fillRect(-5, -5, 10, 10); g.restore(); }
    }
  });
  g.font = '600 16px Poppins, sans-serif';
  for (const sp of secrets) {
    const found = save.visited.includes('s' + sp.secret), p = S(sp.x, sp.y + 1.6, sp.z); if (!p) continue;
    g.fillStyle = GOLD;
    if (found) { g.beginPath(); g.arc(p[0], p[1], 3.5, 0, Math.PI * 2); g.fill(); }
    else g.fillText('?', p[0], p[1] + Math.sin(t * 3 + sp.secret) * 2);
  }
  if (whale.pose && save.visited.includes('i' + whale.route.owner)) {
    const p = S(whale.source.x, whale.source.y + 1, whale.source.z);
    if (p) {
      g.font = '500 12px Poppins, sans-serif'; g.fillStyle = '#bde7ed';
      g.fillText('Píer da baleia', p[0], p[1] - 14);
      g.beginPath(); g.arc(p[0], p[1], 4, 0, Math.PI * 2); g.strokeStyle = '#bde7ed'; g.stroke();
    }
  }
  // you: an arrow on the screen, pointing the way you face
  const pp = S(player.pos.x, player.pos.y + 1.4, player.pos.z), fw = S(player.pos.x + Math.sin(player.yaw) * 2, player.pos.y + 1.4, player.pos.z + Math.cos(player.yaw) * 2);
  if (pp && fw) {
    g.save(); g.translate(...pp); g.rotate(Math.atan2(fw[1] - pp[1], fw[0] - pp[0]) + Math.PI / 2);
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3.5); g.lineTo(-6, 7); g.closePath();
    g.fillStyle = '#fff'; g.shadowColor = '#000'; g.shadowBlur = 8; g.fill(); g.restore();
  }
}
