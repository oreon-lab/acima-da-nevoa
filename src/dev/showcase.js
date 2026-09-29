// Dev page: every procedural object side by side, for looking at them up close.
// Console: sc.view('trees') | sc.view('air') | sc.view('under') | sc.view('shrine') | sc.look([x,y,z],[tx,ty,tz])
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, camera, U } from '../core.js';
import { updateAtmosphere, createClouds } from '../render/atmosphere.js';
import { composer, grade } from '../render/post.js';
import { worldGeos, summit, islands } from '../procedural/world.js';
import { worldMat } from '../procedural/materials.js';
import { palette, themed } from '../procedural/geometry.js';
import { THEMES } from '../procedural/themes.js';
import { updateFx } from '../fx/particles.js';
import * as O from '../procedural/objects/index.js';

const pal = palette(0.15), pal2 = palette(0.5), pal3 = palette(0.85);
const ground = O.addIsland(0, 0, 0, 26, 0.15);
ground.cp = { x: 0, y: 0, z: 0, heading: 0 };

// ground row (z = 0), each object 3 units apart, three palettes for trees
let x = -21;
const put = fn => { fn(x, 0, 0); x += 3.2; };
const birchPal = themed(palette(0.6), THEMES[6].pal);
for (const [style, p] of [['oak', pal], ['pine', pal2], ['birch', birchPal], ['willow', themed(pal, THEMES[1].pal)], ['acacia', themed(pal2, THEMES[3].pal)], ['cherry', pal3]]) put((x, y, z) => O.addTree(x, y, z, { ...p, style }));
put((x, y, z) => O.addBush(x, y, z, pal));
put((x, y, z) => O.addBush(x, y, z, pal3));
put((x, y, z) => O.addPebble(x, y, z, pal));
put((x, y, z) => O.addBoulder(x, y, z, pal));
put((x, y, z) => O.addColumn(x, y, z, pal, 1.8));
put((x, y, z) => O.addColumn(x, y, z, pal2, 1.0));
O.addShrine({ x: 0, y: 0, z: 6, pal, idx: 0 }, 0, 6);
O.lightShrine(0);
O.addAltar(-9, 0, 9, pal);
O.addPickup(-3, 1.0, 6);
O.addPickup(-1.5, 1.0, 6);
summit.pos.set(9, 4, 9);
O.addRoots(ground);

// air row (z = -12): platforms, spire, floaters
[['stone', pal], ['slab', pal], ['pillar', pal2], ['stone', pal3]].forEach(([style, p], i) => O.addPlatform(-9 + i * 4, 6, -12, 1.4, style, p));
O.addSpire(6, -12, 6, -12, pal2);
O.addFloater(11, 6, -12, 1.2, pal);
O.addFloater(14, 7, -12, 0.8, pal2);
O.addFloater(17, 5, -12, 1.6, pal3);

O.grassDisc(0, 0, 0, 26, null, 9000, pal, [{ x: 0, z: 6, r: 1.2, solid: true }]);
const mesh = new THREE.Mesh(mergeGeometries(worldGeos), worldMat);
mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
scene.add(mesh);
O.buildVegetation();

islands[0].y = 0;
createClouds([{ x: 0, y: 0, z: 0 }, { x: 30, y: 30, z: -40 }, { x: 60, y: 62, z: -90 }]);   // stand-ins for the real path
grade.uniforms.uFade.value = 0;
const target = { pos: new THREE.Vector3(0, 3.2, 11), look: new THREE.Vector3(-7, 1, 0) };
const VIEWS = {
  trees: [[-15, 3, 6], [-15, 1.6, 0]], bush: [[-3, 2, 5], [-3, 0.5, 0]], stone: [[2, 2.5, 5], [2, 1, 0]],
  air: [[-1, 7, -3], [-1, 6, -12]], under: [[-8, -4, 12], [0, -3, 0]], shrine: [[3, 2.2, 10], [0, 1.4, 6]],
  altar: [[-9, 3, 14], [-9, 0.6, 9]], beacon: [[9, 4, 14], [9, 4, 9]], floaters: [[14, 7, -5], [14, 6.5, -12]],
  wide: [[0, 3.2, 14], [-6, 1, 0]],
  sky: [[0, 3, 0], [0, 40, -60]], sun: [[0, 3, 0], [-40, 30, -55]], high: [[0, 62, 0], [0, 40, -80]], down: [[0, 70, 0], [0, -30, -60]],
};
window.sc = {
  look: (p, l) => { target.pos.set(...p); target.look.set(...l); },
  view: n => window.sc.look(...VIEWS[n]),
  THREE, O, scene, camera,
};

let last = performance.now();
(function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
  const t = (U.time.value += dt);
  camera.position.copy(target.pos); camera.lookAt(target.look);
  O.animateObjects(t, dt, 0, true);
  updateFx(dt, target.look);
  updateAtmosphere(t, dt, target.look, 60);
  grade.uniforms.uTime.value = t;
  composer.render();
})(last);
