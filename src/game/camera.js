// Third-person orbit with responsive input smoothing and an obstacle-aware boom.
import { camera, U, game, keys } from '../core.js';
import { settings, dev } from '../config.js';
import { V3, clamp, damp, smoothstep } from '../utils.js';
import { islands, summit, near, inside } from '../procedural/world.js';
import { held, move, pad } from './input.js';

export const cam = { yaw: 0, pitch: 0.36, dist: 6.6, follow: new V3(), blend: 0 };
// Apply look before movement so the camera and movement share the same heading.
let lookX = 0, lookY = 0, boom = 6.6, zoom = 6.6;
// Mouse deltas are raw and unsmoothed (1:1, no lag, no drift after stopping); they accumulate
// between frames and are applied once. Pointer-lock spikes (a known browser glitch) are clamped.
const SPIKE = 0.12;   // rad per event
export function orbitCamera(x, y) { lookX += clamp(x, -SPIKE, SPIKE); lookY += clamp(y, -SPIKE, SPIKE); }
export function updateCameraInput(dt) {
  if (game.state !== 'play') { lookX = lookY = 0; return; }
  const k = 2.4 * settings.sens / 5;
  const yaw = lookX + ((held('camLeft') ? 2.2 : 0) - (held('camRight') ? 2.2 : 0) - pad.lookX * k) * dt;
  const pitch = lookY + pad.lookY * k * dt * (settings.invert ? -1 : 1);
  lookX = lookY = 0;
  cam.yaw = (cam.yaw + yaw) % (Math.PI * 2);
  cam.pitch = clamp(cam.pitch + pitch, -0.25, 1.15);
}
export function resetCameraMotion() { lookX = lookY = 0; boom = zoom = cam.dist; }

// Sphere samples stop the boom before walls, including obstacles between player and camera.
export function cameraClearance(origin, desired) {
  const length = origin.distanceTo(desired), steps = Math.max(1, Math.ceil(length / 0.12));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, x = origin.x + (desired.x - origin.x) * t;
    const y = origin.y + (desired.y - origin.y) * t, z = origin.z + (desired.z - origin.z) * t;
    if (near(x, z).some(c => !c.gone && y > c.y - c.thick - 0.22 && y < c.y + 0.22 && inside(c, x, z, 0.22)))
      return Math.max(0.9, length * (i - 1) / steps);   // never closer than the near plane + character body
  }
  return length;
}
export const finaleCam = { on: false, t: 0, from: new V3(), lookFrom: new V3() };
export function startFinaleCamera() {
  finaleCam.on = true; finaleCam.t = 0; finaleCam.from.copy(camera.position);
  finaleCam.lookFrom.copy(camera.position).add(camera.getWorldDirection(new V3()).multiplyScalar(10));
}
export function stopFinaleCamera() { finaleCam.on = false; }

function updateFinaleCamera(dt) {
  finaleCam.t += dt;
  const k = smoothstep(finaleCam.t / 4.5, 0, 1), a = cam.yaw + finaleCam.t * 0.065;
  pos.set(summit.pos.x + Math.sin(a) * 24, summit.pos.y + 8, summit.pos.z + Math.cos(a) * 24);
  camera.position.lerpVectors(finaleCam.from, pos, k);
  look.copy(summit.pos); look.y -= 0.7;
  orbit.lerpVectors(finaleCam.lookFrom, look, k); camera.lookAt(orbit);
}
const pos = new V3(), look = new V3(), orbit = new V3();

// photo mode: a free camera that starts where the game camera is and stays within reach of the player
export const free = { pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, fov: 60 };
export function startFree() {
  free.pos.copy(camera.position); free.vel.set(0, 0, 0); free.fov = camera.fov;
  const d = camera.getWorldDirection(new V3());
  free.yaw = Math.atan2(-d.x, -d.z); free.pitch = Math.asin(clamp(d.y, -1, 1));
}
function updateFree(dt, player) {
  const k = 2.2 * settings.sens / 5;
  free.yaw -= pad.lookX * k * dt; free.pitch = clamp(free.pitch - pad.lookY * k * dt, -1.5, 1.5);
  const { x, z } = move(), up = (keys.Space || pad.held.camRight ? 1 : 0) - (keys.ShiftLeft || keys.ShiftRight || pad.held.camLeft ? 1 : 0);
  const sy = Math.sin(free.yaw), cy = Math.cos(free.yaw), S = keys.ControlLeft ? 2.5 : 7;
  free.vel.x = damp(free.vel.x, (-sy * z + cy * x) * S, 6, dt);
  free.vel.z = damp(free.vel.z, (-cy * z - sy * x) * S, 6, dt);
  free.vel.y = damp(free.vel.y, up * S * 0.7, 6, dt);
  free.pos.addScaledVector(free.vel, dt);
  const off = free.pos.clone().sub(player.pos), l = off.length();
  if (l > 40) free.pos.copy(player.pos).addScaledVector(off, 40 / l);
  camera.position.copy(free.pos);
  camera.rotation.set(free.pitch, free.yaw, 0, 'YXZ');
  if (camera.fov !== free.fov) { camera.fov = free.fov; camera.updateProjectionMatrix(); }
}

// map (pause menu): the real world seen from above, orbiting slowly around the island in focus
export const mapCam = { on: false, focus: 0, yaw: 0, pitch: 0.85, zoom: 1, dist: 10, t: new V3() };
function updateMapCam(dt) {
  const is = islands[mapCam.focus], k = 2.4 * settings.sens / 5;
  mapCam.yaw += dt * 0.06 - pad.lookX * k * dt;
  mapCam.pitch = clamp(mapCam.pitch + pad.lookY * k * dt, 0.3, 1.45);
  mapCam.t.x = damp(mapCam.t.x, is.x, 3, dt); mapCam.t.y = damp(mapCam.t.y, is.y, 3, dt); mapCam.t.z = damp(mapCam.t.z, is.z, 3, dt);
  mapCam.dist = damp(mapCam.dist, Math.max(is.R * 3.2, 30) * mapCam.zoom, 3, dt);
  const cp = Math.cos(mapCam.pitch), t = mapCam.t, d = mapCam.dist;
  camera.position.set(t.x + Math.sin(mapCam.yaw) * cp * d, t.y + Math.sin(mapCam.pitch) * d, t.z + Math.cos(mapCam.yaw) * cp * d);
  camera.lookAt(t);
}

export function updateCamera(dt, player) {
  if (finaleCam.on) { if (game.state === 'ending') updateFinaleCamera(dt); return; }
  if (mapCam.on) return updateMapCam(dt);
  if (game.state === 'photo') return updateFree(dt, player);
  const fov = damp(camera.fov, settings.fov, 6, dt);
  if (Math.abs(camera.fov - fov) > .001) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const p = player.pos;
  // fast dev flight: follow tightly so the character never drifts out of frame
  const rate = dev.fly ? 14 + dev.flySpeed * 0.6 : 10;
  cam.follow.x = damp(cam.follow.x, p.x, rate, dt);
  cam.follow.z = damp(cam.follow.z, p.z, rate, dt);
  // Always follow the character's height; a steady rate keeps hops smooth (no mode switch to snap on),
  // faster only when the vertical speed would otherwise leave the character out of frame.
  const verticalFollow = dev.fly ? rate : Math.max(7, Math.abs(player.vel?.y ?? 0) * 0.8);
  cam.follow.y = damp(cam.follow.y, p.y, verticalFollow, dt);
  zoom = damp(zoom, cam.dist, 12, dt);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  look.set(cam.follow.x, cam.follow.y + 1.0, cam.follow.z);
  pos.set(look.x + Math.sin(cam.yaw) * cp * zoom, look.y + sp * zoom, look.z + Math.cos(cam.yaw) * cp * zoom);
  const clear = cameraClearance(look, pos);
  boom = clear < boom ? clear : damp(boom, clear, 5, dt);
  pos.sub(look).setLength(Math.min(boom, clear)).add(look);

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
