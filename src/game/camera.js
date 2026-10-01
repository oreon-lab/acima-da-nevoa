// Third-person orbit with responsive input smoothing and an obstacle-aware boom.
import { camera, U, game, keys } from '../core.js';
import { settings, saveSettings, dev } from '../config.js';
import { V3, clamp, damp, smoothstep, angDiff } from '../utils.js';
import { islands, summit, near, inside } from '../procedural/world.js';
import { held, move, pad } from './input.js';

export const cam = { yaw: 0, pitch: 0.36, dist: 6.6, follow: new V3(), blend: 0, first: false };
// dash effects seen through the camera: a field-of-view kick and the speed streaks overlay
export const dashFx = { kick: 0, start() { this.kick = 1; const n = document.querySelector('#dashfx'); n?.classList.add('on'); setTimeout(() => n?.classList.remove('on'), 260); } };
const EYE = 0.95;   // eye height above the feet (the body is 1.05 tall)
export function toggleView() { settings.firstPerson = !settings.firstPerson; saveSettings(); }
// Apply look before movement so the camera and movement share the same heading.
let lookX = 0, lookY = 0, boom = 6.6, zoom = 6.6;
// Mouse deltas are raw and unsmoothed (1:1, no lag, no drift after stopping); they accumulate
// between frames and are applied once. Pointer-lock spikes (a known browser glitch) are clamped.
let recenterT = 0, recenterYaw = 0;
// swing the camera behind the character (gamepad R3)
export function recenterCamera(yaw) { recenterT = 0.45; recenterYaw = yaw + Math.PI; }
const SPIKE = 0.12;   // rad per event
export function orbitCamera(x, y) { lookX += clamp(x, -SPIKE, SPIKE); lookY += clamp(y, -SPIKE, SPIKE); }
export function updateCameraInput(dt) {
  if (game.state !== 'play') { lookX = lookY = 0; return; }
  const k = 2.4 * settings.sens / 5;
  const yaw = lookX + ((held('camLeft') ? 2.2 : 0) - (held('camRight') ? 2.2 : 0) - pad.lookX * k) * dt;
  const pitch = lookY + pad.lookY * k * dt * (settings.invert ? -1 : 1);
  lookX = lookY = 0;
  if (recenterT > 0) {   // any manual look cancels it
    if (Math.abs(yaw) > 0.002) recenterT = 0;
    else { recenterT -= dt; cam.yaw += angDiff(cam.yaw, recenterYaw) * (1 - Math.exp(-12 * dt)); }
  }
  cam.yaw = (cam.yaw + yaw) % (Math.PI * 2);
  // pitch > 0 looks down. First person can look almost straight up or down; the orbit stays above the ground.
  const lim = settings.firstPerson ? [-1.45, 1.45] : [-0.25, 1.15];
  cam.pitch = clamp(cam.pitch + pitch, lim[0], lim[1]);
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
  free.fov = clamp(free.fov + ((pad.held.zoomOut ? 1 : 0) - (pad.held.zoomIn ? 1 : 0)) * 40 * dt, 15, 100);
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

export const cineCam = { on: false };   // the rift cutscene drives the camera itself
export function updateCamera(dt, player) {
  if (cineCam.on) return;
  if (finaleCam.on) { if (game.state === 'ending') updateFinaleCamera(dt); return; }
  if (mapCam.on) return updateMapCam(dt);
  if (game.state === 'photo') return updateFree(dt, player);
  dashFx.kick = damp(dashFx.kick, 0, 5, dt);   // the dash pushes the field of view out, then it eases back
  const fov = damp(camera.fov, settings.fov + dashFx.kick * 5, dashFx.kick > 0.05 ? 14 : 6, dt);
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
  cam.first = settings.firstPerson && cam.blend >= 1;
  if (cam.first) {   // eye at the head, looking where the orbit camera would be looking from
    cam.follow.y = damp(cam.follow.y, p.y, 16, dt);
    camera.position.set(p.x, cam.follow.y + EYE, p.z);
    camera.rotation.set(-cam.pitch, cam.yaw, 0, 'YXZ');
    return;
  }
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
