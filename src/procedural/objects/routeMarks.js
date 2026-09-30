// Small inlaid edge stones: one instanced draw call, following movers and respecting phase/collapse state.
import * as THREE from 'three';
import { scene } from '../../core.js';
import { shapeAt } from '../geometry.js';

const marked = [], countPerStep = 10;
const colors = { stone: '#fff1c6', moving: '#a9e2e8', crumble: '#eabb76', wind: '#b8efd5', climb: '#c7e3a7', phase: '#d6e5ff' };
let mesh = null;
const matrix = new THREE.Matrix4(), color = new THREE.Color();

export function addRouteMarks(steps) { marked.push(...steps); }

export function updateRouteMarks(playerPosition) {
  if (!mesh && marked.length) {
    const geometry = new THREE.CylinderGeometry(0.075, 0.075, 0.018, 5);
    const material = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: true });
    mesh = new THREE.InstancedMesh(geometry, material, marked.length * countPerStep);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    scene.add(mesh);
    marked.forEach((c, i) => {
      color.set(colors[c.routeKind] ?? colors.stone);
      for (let k = 0; k < countPerStep; k++) mesh.setColorAt(i * countPerStep + k, color);
    });
  }
  if (!mesh) return;
  marked.forEach((c, i) => {
    const visible = c.ground && !c.gone && Math.hypot(c.x - playerPosition.x, c.z - playerPosition.z) < 26 && Math.abs(c.y - playerPosition.y) < 15;
    for (let k = 0; k < countPerStep; k++) {
      const a = k / countPerStep * Math.PI * 2, r = c.r * shapeAt(c.h, a) * 0.86;
      matrix.makeScale(visible ? 1 : 0, visible ? 1 : 0, visible ? 1 : 0);
      matrix.setPosition(c.x + Math.cos(a) * r, c.y + 0.045, c.z + Math.sin(a) * r);
      mesh.setMatrixAt(i * countPerStep + k, matrix);
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
}
