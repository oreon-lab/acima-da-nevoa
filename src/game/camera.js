// Close third-person camera, above and tilted down; looks further up as you pitch it up.
import { camera, U, game, keys } from '../core.js';
import { V3, clamp, damp, smoothstep } from '../utils.js';
import { islands, groundUnder } from '../procedural/world.js';

export const cam = { yaw: 0, pitch: 0.36, dist: 6.6, follow: new V3(), blend: 0 };
const pos = new V3(), look = new V3(), orbit = new V3();

export function updateCamera(dt, player) {
  const p = player.pos;
  cam.follow.x = damp(cam.follow.x, p.x, 10, dt);
  cam.follow.z = damp(cam.follow.z, p.z, 10, dt);
  // follow jumps only partially, so little hops don't shake the view
  let ty = p.y > player.lastGroundY ? player.lastGroundY + (p.y - player.lastGroundY) * 0.35 : p.y;
  if (!player.grounded) ty = Math.max(ty, islands[player.cp].y - 10);   // let a fall read as a fall
  cam.follow.y = damp(cam.follow.y, ty, 5, dt);
  if (game.state === 'play') { if (keys.KeyQ) cam.yaw += 2.2 * dt; if (keys.KeyE) cam.yaw -= 2.2 * dt; }

  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  pos.set(cam.follow.x + Math.sin(cam.yaw) * cp * cam.dist, cam.follow.y + 1.0 + sp * cam.dist, cam.follow.z + Math.cos(cam.yaw) * cp * cam.dist);
  const gy = groundUnder(pos.x, pos.z, pos.y + 1.5);
  if (pos.y < gy + 0.7) pos.y = gy + 0.7;
  look.set(cam.follow.x, cam.follow.y + 1.05 + clamp((0.36 - cam.pitch) * 2.6, 0, 2.6), cam.follow.z);

  if (cam.blend < 1) {   // title-screen orbit -> gameplay
    const a = U.time.value * 0.05 + 2.4, k = smoothstep(cam.blend, 0, 1);
    orbit.set(p.x + Math.sin(a) * 12, p.y + 3.2, p.z + Math.cos(a) * 12);
    pos.lerpVectors(orbit, pos, k);
    look.lerpVectors(orbit.set(p.x, p.y + 4.5, p.z), look, k);
    if (game.state === 'play') cam.blend = Math.min(1, cam.blend + dt / 2.2);
  }
  camera.position.copy(pos);
  camera.lookAt(look);
}
