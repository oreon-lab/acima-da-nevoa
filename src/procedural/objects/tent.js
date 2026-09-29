// A-frame canvas tent with a dark open front, ridge pole and pegs. Solid (players walk around it).
// rot: rotation about Y; the open front faces local +z after rotation.
import * as THREE from 'three';
import { TAU, rand } from '../../utils.js';
import { bake } from '../geometry.js';
import { addCol, pushGeo } from '../world.js';

export function addTent(x, y, z, rot = 0, canvas = '#d6c7a0') {
  const shape = new THREE.Shape();
  shape.moveTo(-1.05, 0); shape.lineTo(1.05, 0); shape.lineTo(0, 1.45); shape.closePath();
  const tent = new THREE.ExtrudeGeometry(shape, { depth: 2.1, bevelEnabled: false }).translate(0, 0, -1.05);
  const base = new THREE.Color(canvas);
  const fn = (cen, n, c) => {
    if (n.z > 0.9) c.set('#2f261d');                                                 // open door
    else if (n.z < -0.9) c.copy(base).multiplyScalar(0.75);                          // back wall
    else c.copy(base).multiplyScalar(n.x > 0 ? 1.0 : 0.88).offsetHSL(0, 0, rand(-0.02, 0.02));
  };
  pushGeo(bake(tent, fn).rotateY(rot), x, y, z);   // colour by face before rotating
  const pole = (px, pz) => new THREE.CylinderGeometry(0.03, 0.03, 1.75, 5).translate(px, 0.88, pz);
  const wood = (cen, n, c) => c.set('#5d4830');
  for (const pz of [-1.15, 1.15]) pushGeo(bake(pole(0, pz).rotateY(rot), wood), x, y, z);
  for (let k = 0; k < 6; k++) {   // pegs along both sides
    const sx = k % 2 ? -1 : 1, pz = (k >> 1) * 0.95 - 0.95;
    pushGeo(bake(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 4).rotateZ(sx * 0.4).translate(sx * 1.25, 0.08, pz).rotateY(rot), wood), x, y, z);
  }
  addCol({ x, z, y: y + 1.45, r: 1.3, thick: 1.6, ground: false, depth: 0 });
}
