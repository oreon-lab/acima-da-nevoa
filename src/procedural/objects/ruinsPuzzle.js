// Three wind mirrors: turn each one towards the receiver to reveal its light fragment.
import * as THREE from 'three';
import { scene } from '../../core.js';
import { addPickup } from './pickup.js';
import { addProp } from './props.js';
import { pickups } from '../world.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const UP = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3();
const OFFSETS = [[2.25, 0], [0, 2.25], [-2.25, 0]];
const TARGETS = [2, 3, 0];
const cold = '#9ac8ec', warm = '#ffe1a0';
export const ruinsPuzzle = { center: null, mirrors: [], receiver: null, reward: null, solved: false, onSolved: null };

function updateMirror(m) {
  const [dx, dz] = DIRS[m.dir];
  m.head.rotation.y = -Math.atan2(dx, dz);
  const correct = m.dir === m.target;
  const len = correct ? 2.25 : 2.65;
  m.beam.position.set(m.x + dx * len / 2, m.y + 1.72, m.z + dz * len / 2);
  m.beam.quaternion.setFromUnitVectors(UP, axis.set(dx, 0, dz));
  m.beam.scale.set(1, len, 1);
  m.beam.material.color.set(correct ? warm : cold);
  m.beam.material.emissive.set(correct ? warm : cold);
  m.lens.material.emissive.set(correct ? warm : cold);
  m.lens.material.emissiveIntensity = correct ? 2.4 : 0.8;
}

export function addRuinsPuzzle(is, x, z) {
  const y = is.y, p = ruinsPuzzle;
  p.center = new THREE.Vector3(x, y + 1.72, z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.82, 0.42, 8),
    new THREE.MeshStandardMaterial({ color: '#8d958e', roughness: 0.95 }));
  base.position.set(x, y + 0.21, z); base.receiveShadow = true; scene.add(base);
  const receiverMat = new THREE.MeshStandardMaterial({ color: cold, emissive: cold, emissiveIntensity: 0.6, roughness: 0.35 });
  p.receiver = new THREE.Mesh(new THREE.OctahedronGeometry(0.38), receiverMat);
  p.receiver.position.copy(p.center); scene.add(p.receiver);
  p.mirrors = OFFSETS.map(([ox, oz], i) => {
    const mx = x + ox, mz = z + oz, head = new THREE.Group();
    addProp('column_ruins', mx, y, mz);
    head.position.set(mx, y + 1.72, mz);
    const lens = new THREE.Mesh(new THREE.OctahedronGeometry(0.24),
      new THREE.MeshStandardMaterial({ color: '#e7f3ff', emissive: cold, emissiveIntensity: 0.8, metalness: 0.25, roughness: 0.3 }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 6, 12),
      new THREE.MeshStandardMaterial({ color: '#b0a486', metalness: 0.4, roughness: 0.5 }));
    rim.rotation.y = Math.PI / 2; head.add(lens, rim); scene.add(head);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6),
      new THREE.MeshStandardMaterial({ color: cold, emissive: cold, emissiveIntensity: 2.4, transparent: true, opacity: 0.8, depthWrite: false }));
    scene.add(beam);
    const m = { x: mx, y, z: mz, target: TARGETS[i], dir: (TARGETS[i] + i + 1) % 4, head, lens, beam };
    updateMirror(m);
    return m;
  });
  addPickup(x, y + 2.65, z);
  p.reward = pickups.at(-1);
  p.reward.available = false;
  p.reward.g.visible = false;
}

export function setRuinsSolved(solved) {
  const p = ruinsPuzzle;
  if (!p.center) return;
  p.solved = !!solved;
  p.mirrors.forEach((m, i) => { m.dir = p.solved ? m.target : (m.target + i + 1) % 4; updateMirror(m); });
  p.receiver.material.color.set(p.solved ? warm : cold);
  p.receiver.material.emissive.set(p.solved ? warm : cold);
  p.receiver.material.emissiveIntensity = p.solved ? 2.5 : 0.6;
  p.reward.g.visible = p.solved && !p.reward.got;
  p.reward.available = p.solved;
}

export function nearestRuinsMirror(pos) {
  if (ruinsPuzzle.solved) return null;
  let best = null, dBest = 2.15 ** 2;
  for (const m of ruinsPuzzle.mirrors) {
    const d = (pos.x - m.x) ** 2 + (pos.z - m.z) ** 2;
    if (d < dBest && Math.abs(pos.y - m.y) < 1.8) { best = m; dBest = d; }
  }
  return best;
}

export function rotateRuinsMirror(pos) {
  const m = nearestRuinsMirror(pos);
  if (!m) return false;
  m.dir = (m.dir + 1) % 4;
  updateMirror(m);
  if (ruinsPuzzle.mirrors.every(q => q.dir === q.target)) {
    ruinsPuzzle.solved = true;
    ruinsPuzzle.receiver.material.color.set(warm);
    ruinsPuzzle.receiver.material.emissive.set(warm);
    ruinsPuzzle.receiver.material.emissiveIntensity = 2.5;
    ruinsPuzzle.reward.g.visible = true;
    ruinsPuzzle.reward.available = true;
    ruinsPuzzle.onSolved?.();
  }
  return true;
}

export function updateRuinsPuzzle(t) {
  if (!ruinsPuzzle.receiver) return;
  ruinsPuzzle.receiver.rotation.y = t * 0.6;
  ruinsPuzzle.receiver.material.emissiveIntensity = (ruinsPuzzle.solved ? 2.3 : 0.6) + Math.sin(t * 2) * 0.18;
}
