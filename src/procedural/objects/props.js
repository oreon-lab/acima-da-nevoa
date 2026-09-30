// Props from Poly Pizza (CC0, see assets/models/CREDITS.md). Placing one adds its collider right away (so the
// world is complete when the grid is built); the models are loaded afterwards, scaled to a set height and drawn
// as one InstancedMesh per model part.
import * as THREE from 'three';
import { scene } from '../../core.js';
import { addCol } from '../world.js';

// h: height in metres; r: collider radius (0 = none) or rect [halfW, halfD]; walk: top can be stood on
const MODELS = {
  statue: { h: 2.4, r: 0.9 }, well: { h: 2.0, r: 1.0 }, barrel: { h: 0.9, r: 0.36, walk: true }, crate: { h: 0.8, rect: [0.42, 0.42], walk: true },
  bench: { h: 0.55, rect: [0.8, 0.28] }, bookcase: { h: 2.0, rect: [0.6, 0.22] }, table: { h: 0.78, rect: [0.7, 0.45], walk: true },
  chest: { h: 0.6, rect: [0.42, 0.3], walk: true }, pot: { h: 0.5, r: 0.24 }, cart: { h: 1.3, r: 1.0 }, banner: { h: 2.8, r: 0.25 },
  torch: { h: 1.5, r: 0.15 }, books: { h: 0.18, r: 0 },
  arch_ruins: { h: 3.0, r: 0 }, column_ruins: { h: 1.65, r: 0.36 },
  tree_floating: { h: 4.2, r: 0 }, tree_light: { h: 3.4, r: 0.5 },
  windmill: { h: 5.5, r: 1.35 }, mushroom_large: { h: 1.15, r: 0.38 },
};
const url = name => new URL(`../../../assets/models/${name}.glb`, import.meta.url).href;
const placed = {};

export function addProp(name, x, y, z, rot = 0, s = 1, tint = null) {
  const m = MODELS[name];
  (placed[name] ??= []).push({ x, y, z, rot, s, tint });
  const top = y + m.h * s;
  if (m.rect) addCol({ x, z, y: top, rect: [m.rect[0] * s, m.rect[1] * s, rot], thick: m.h * s, depth: 0, ground: !!m.walk });
  else if (m.r) addCol({ x, z, y: top, r: m.r * s, thick: m.h * s, depth: 0, ground: !!m.walk });
  return top;
}

// The same fitted GLB assets can live in a moving local frame. Collision is owned by its carrier.
export function addAttachedProp(name, parent, x, y, z, rot = 0, s = 1) {
  (placed[name] ??= []).push({ parent, x, y, z, rot, s });
}

export async function loadProps() {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader(), M = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  await Promise.all(Object.entries(placed).map(async ([name, list]) => {
    const root = (await loader.loadAsync(url(name))).scene;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), k = MODELS[name].h / (box.max.y - box.min.y);
    // model -> origin at the bottom centre, scaled to its height
    const fit = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
    root.traverse(o => {
      if (!o.isMesh) return;
      const groups = new Map();
      for (const p of list) {
        const parent = p.parent ?? scene;
        if (!groups.has(parent)) groups.set(parent, []);
        groups.get(parent).push(p);
      }
      for (const [parent, instances] of groups) {
        const tints = new Map();
        for (const p of instances) { if(!tints.has(p.tint)) tints.set(p.tint,[]); tints.get(p.tint).push(p); }
        for (const [tint, batch] of tints) {
        const materials = tint ? (Array.isArray(o.material) ? o.material.map(m=>m.clone()) : o.material.clone()) : o.material;
        if(tint) for(const material of Array.isArray(materials)?materials:[materials]) {material.color.set(tint);material.vertexColors=false;material.map=null;material.roughness=.92;}
        const im = new THREE.InstancedMesh(o.geometry, materials, batch.length);
        batch.forEach((p, i) => im.setMatrixAt(i, M.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(UP, -p.rot), new THREE.Vector3(p.s, p.s, p.s)).multiply(fit).multiply(o.matrixWorld)));
        im.castShadow = im.receiveShadow = true;
        im.frustumCulled = false;
        parent.add(im);
        }
      }
    });
  }));
}
