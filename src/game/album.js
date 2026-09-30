// A landmark counts only when its centre is near the middle of a deliberate photo.
import * as THREE from 'three';

const point = new THREE.Vector3();
const KEY = 'nevoa-album-';

export function photoTarget(camera, landmarks, discovered = []) {
  let best = null, score = Infinity;
  for (const spot of landmarks) {
    if (discovered.includes(spot.id)) continue;
    point.set(spot.x, spot.y, spot.z);
    const distance = camera.position.distanceTo(point);
    if (distance < 3 || distance > 40) continue;
    point.project(camera);
    if (point.z <= -1 || point.z >= 1 || Math.abs(point.x) > 0.48 || Math.abs(point.y) > 0.42) continue;
    const s = Math.hypot(point.x, point.y) + distance * 0.002;
    if (s < score) { best = spot; score = s; }
  }
  return best;
}

export function albumImage(id) {
  try { return localStorage.getItem(KEY + id); } catch { return null; }
}

export async function storeAlbumImage(id, blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    const ctx = canvas.getContext('2d');
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const w = bitmap.width * scale, h = bitmap.height * scale;
    ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    bitmap.close();
    localStorage.setItem(KEY + id, canvas.toDataURL('image/jpeg', 0.65));
  } catch { /* the discovery still counts if storage is full or unavailable */ }
}
