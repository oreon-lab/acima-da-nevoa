// Ghost of the best run: the run is sampled every REC_DT seconds as [x, y, z, yaw]; the best one is replayed by a
// translucent copy of the character, in step with the current run's clock.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { scene } from '../core.js';
import { settings, MAX_SPEED } from '../config.js';
import { lerp, smoothstep, angDiff } from '../utils.js';

export const REC_DT = 0.2;
const mat = new THREE.MeshBasicMaterial({ color: '#cfe4ff', transparent: true, opacity: 0.3, depthWrite: false, fog: false });   // the custom fog chunk needs lights
let root = null, mixer = null, cur = '';
const acts = {};

export function initGhost(fbx) {
  const g = clone(fbx);
  g.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(() => mat) : mat; o.castShadow = o.receiveShadow = false; } });
  root = new THREE.Group(); root.add(g); root.visible = false;
  scene.add(root);
  mixer = new THREE.AnimationMixer(g);
  for (const clip of g.animations) acts[clip.name.split('|').pop()] = mixer.clipAction(clip);
}

const r2 = v => Math.round(v * 100) / 100;
export function record(rec, t, p, yaw) {
  const i = Math.floor(t / REC_DT);
  while (rec.length <= i) rec.push([r2(p.x), r2(p.y), r2(p.z), r2(yaw)]);
}

export function updateGhost(data, t, dt, playerPos) {
  if (!root) return;
  const rec = data?.rec, f = t / REC_DT, i = Math.floor(f);
  root.visible = !!(settings.ghost && rec && i < rec.length - 1);
  if (!root.visible) return;
  const a = rec[i], b = rec[i + 1], k = f - i;
  root.position.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
  root.rotation.y = a[3] + angDiff(a[3], b[3]) * k;
  mat.opacity = 0.32 * smoothstep(root.position.distanceTo(playerPos), 0.8, 3);   // fades when it overlaps you
  const sp = Math.hypot(b[0] - a[0], b[2] - a[2]) / REC_DT, air = Math.abs(b[1] - a[1]) / REC_DT > 1.5;
  const want = sp > 0.8 && !air ? 'Walk' : 'Idle';
  if (want !== cur && acts[want]) { acts[cur]?.fadeOut(0.2); acts[want].reset().fadeIn(0.2).play(); cur = want; }
  if (cur === 'Walk') acts.Walk.timeScale = 0.8 + sp / MAX_SPEED * 0.55;
  mixer.update(dt);
}
