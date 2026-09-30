// Art direction follows the islands: faceted colour, layered turf, fitted CC0 models and wind vegetation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU, rand } from '../../utils.js';
import { bake, rockMass, islandColor } from '../geometry.js';
import { worldMat } from '../materials.js';
import { worldGeos, grassI, flowerI, colliders } from '../world.js';
import { addGrass, addFlower, buildVegetation } from './grass.js';
import { addFlowerBed } from './flowerBed.js';
import { addAttachedProp } from './props.js';
import { addTree } from './tree.js';

function mesh(parent, geometry, material) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
const variation = p => Math.sin(p.x * 12.7 + p.y * 7.3 + p.z * 18.4) * 0.022;
export const whaleVoice = { level: 0 };   // 0..1 while it sings (set from the audio), the body glows with it
const blue = new THREE.Color('#426674'), pearl = new THREE.Color('#c0ccc2'), deep = new THREE.Color('#1f3d4c');
// countershading, a darker saddle with pale old scars along the flanks
function skinColor(p, n, c) {
  const belly = THREE.MathUtils.smoothstep(-p.y, 3.6, 5.0);
  const mottle = Math.sin(p.x * 1.9 + p.z * 3.1) * Math.sin(p.x * 0.7 - p.y * 2.3);
  c.copy(blue).lerp(pearl, belly);
  c.lerp(deep, THREE.MathUtils.smoothstep(mottle, 0.4, 0.95) * 0.55 * (1 - belly));
  c.lerp(pearl, THREE.MathUtils.smoothstep(-mottle, 0.78, 0.98) * 0.4 * (1 - belly));
  c.offsetHSL(variation(p) * 0.2, 0, variation(p) + n.y * 0.035);
}

// One continuous hull with a broad head, a full chest and a narrowing caudal peduncle.
const HULL = new THREE.CatmullRomCurve3([
    [-14.2, 0.22, 0.35], [-12, 0.8, 0.9], [-9, 2.3, 2.1], [-5.5, 3.9, 3.2],
    [-1, 4.65, 3.7], [4.5, 4.55, 3.65], [8.5, 3.85, 3.05], [11.2, 2.95, 2.65],
    [12.35, 1.55, 1.75], [12.7, 0.03, 0.05],
  ].map(p => new THREE.Vector3(...p)), false, 'centripetal');
const hullCy = x => -3.95 + Math.exp(-(((x - 5) / 7) ** 2)) * 0.2;
// half width / half height of the body at x, and its centre line
function hullAt(x) {
  let best = HULL.getPoint(0);
  for (let i = 1; i <= 96; i++) { const p = HULL.getPoint(i / 96); if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; }
  return { w: best.y, h: best.z, cy: hullCy(best.x) };
}
function hull() {
  const curve = HULL;
  const positions = [], indices = [], rings = 48, sides = 40;
  for (let i = 0; i <= rings; i++) {
    const p = curve.getPoint(i / rings), cy = hullCy(p.x);
    for (let j = 0; j < sides; j++) {
      const a = j / sides * TAU;
      positions.push(p.x, Math.min(-0.27, cy + p.z * Math.cos(a)), p.y * Math.sin(a));
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + (j + 1) % sides, c = a + sides, d = b + sides;
    indices.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices);
  return bake(g, skinColor);
}

// Sculpted, closed fins: tapered edges, a raised leading ridge and a pale underside.
function finGeometry(outline, thickness) {
  const area = outline.reduce((sum,p,i)=>sum+p[0]*outline[(i+1)%outline.length][1]-p[1]*outline[(i+1)%outline.length][0],0);
  if (area < 0) outline = [...outline].reverse();
  const center = new THREE.Vector2(); outline.forEach(p => center.add(new THREE.Vector2(...p))); center.multiplyScalar(1 / outline.length);
  const pos = [], idx = [], N = outline.length;
  for (const side of [-1, 1]) {
    pos.push(center.x, side * thickness, center.y);
    for (const [x, z] of outline) pos.push(x, side * 0.035, z);
  }
  for (let j = 0; j < N; j++) {
    const a = 1 + j, b = 1 + (j + 1) % N, off = N + 1;
    idx.push(0, a, b, off, b + off, a + off, a, a + off, b, b, a + off, b + off);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return bake(g, (p, n, c) => c.copy(n.y > 0 ? blue : pearl).offsetHSL(0, 0, variation(p) + n.y * 0.05));
}

export function makeWhale(pal) {
  const root = new THREE.Group(); root.name = 'Baleia das Brumas';
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.81 });
  const dark = new THREE.MeshStandardMaterial({ color: '#203641', roughness: 0.73 });
  const crease = new THREE.MeshStandardMaterial({ color: '#859f9f', roughness: 0.9 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#9ed6d5', emissive: '#598c91', emissiveIntensity: 0.25, roughness: 0.27 });
  mesh(root, hull(), skin);
  const tube = (points, radius, mat = dark, parent = root) => mesh(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 32, radius, 6, false), mat);
  // A single mouth line wraps around the blunt rostrum; paired folds and throat pleats give it anatomy.
  tube([[3.7,-3.5,-4.5],[7.2,-3.85,-4.14],[10.4,-4,-3.3],[12,-3.95,-1.8],[12.66,-3.95,0],[12,-3.95,1.8],[10.4,-4,3.3],[7.2,-3.85,4.14],[3.7,-3.5,4.5]], 0.065);
  for (const side of [-1, 1]) {
    tube([[3.8,-3.15,side*4.5],[4.1,-3.36,side*4.59],[4.4,-3.5,side*4.58]], 0.045);
    // Eyelid socket is recessed into the cheek; glints are tiny rather than white cartoon discs.
    const eye = new THREE.Group(); eye.position.set(7.65,-2.72,side*4.0); root.add(eye);
    const socket = mesh(eye, new THREE.SphereGeometry(1, 20, 12), dark); socket.scale.set(0.4,0.23,0.105);
    const iris = mesh(eye, new THREE.SphereGeometry(1, 16, 10), eyeMat); iris.position.set(0.03,0,side*0.08); iris.scale.set(0.19,0.155,0.04);
    const pupil = mesh(eye, new THREE.SphereGeometry(1, 12, 8), dark); pupil.position.set(0.065,0,side*0.115); pupil.scale.set(0.08,0.105,0.02);
    const glint = mesh(eye, new THREE.SphereGeometry(0.032, 8, 6), new THREE.MeshBasicMaterial({color:'#e4f2e9'})); glint.position.set(0.11,0.055,side*0.137);
    eye.userData.iris = iris;
  }
  for (let i = -5; i <= 5; i++) {
    const z = i * 0.3;
    tube([[10.8,-5.32,z*.5],[8,-6.6,z*.85],[4,-7.25,z],[0,-7.45,z],[-3,-7.16,z*.72]], 0.026, crease);
  }
  // Pectorals sweep backwards; flukes have a distinct central notch and broad trailing tips.
  const fins = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(3.5,-4.4,side*3.95); root.add(pivot);
    // long humpback-style flipper: a scalloped leading edge and a curved, swept tip
    const outline = [[0,0],[0.3,1.1],[0.05,1.9],[0.15,2.7],[-0.35,3.4],[-0.25,4.3],[-1.0,5.1],[-1.5,6.0],[-2.4,6.9],[-3.6,7.5],[-4.9,7.6],[-5.3,7.0],[-4.6,5.3],[-3.5,3.0],[-1.5,0.4]].map(([x,z])=>[x,side*z]);
    mesh(pivot, finGeometry(outline,0.28),skin); fins.push(pivot);
  }
  const tail = new THREE.Group(); tail.position.set(-13.5,-3.9,0); root.add(tail);
  const flukes = new THREE.Group(); tail.add(flukes);   // bends a beat after the peduncle, so the tail undulates
  for (const side of [-1,1]) mesh(flukes,finGeometry([[.5,0],[-.1,1.4],[-.8,3.1],[-2.4,5.1],[-3.7,6.3],[-4.3,6.2],[-3.9,4.9],[-3.3,3.3],[-3.0,2.2],[-2.8,1.0],[-2.5,.25],[-1.6,0]].map(([x,z])=>[x,side*z]),0.27),skin);
  // Keel ridges along the back of the tail and the belly, like a real caudal peduncle.
  for (const sign of [1, -1]) {
    const pts = [-2.5, -5, -7.5, -10, -12.5, -13.6].map(x => { const b = hullAt(x); return [x, Math.min(-0.27, b.cy + sign * b.h * 0.96), 0]; });
    tube(pts, 0.085, dark);
  }
  // Tubercles on the rostrum, as on a humpback's head.
  const head = hull().getAttribute('position'), knobs = [];
  for (let i = 0; i < head.count; i++) if (head.getX(i) > 8.6 && head.getY(i) > -3.9 && i % 5 === 0) knobs.push(i);
  const tubercle = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), crease, knobs.length);
  const m4 = new THREE.Matrix4();
  knobs.forEach((idx, k) => { const s2 = 0.7 + ((k * 37) % 10) / 12; m4.makeScale(s2, s2, s2); m4.setPosition(head.getX(idx), head.getY(idx), head.getZ(idx)); tubercle.setMatrixAt(k, m4); });
  root.add(tubercle);
  // Bioluminescent spots along both flanks; they breathe slowly and flare while it sings.
  const glowMat = new THREE.MeshBasicMaterial({ color: '#7fe9ff', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  const spots = [];
  for (let i = 0; i < 46; i++) {
    const x = 9 - i * 0.5, b = hullAt(x), dy = Math.sin(i * 1.7) * b.h * 0.42;
    for (const side of [-1, 1]) {
      const yy = b.cy + dy + (side > 0 ? 0.35 : 0);
      spots.push([x, yy, side * b.w * Math.sqrt(Math.max(0, 1 - (dy / b.h) ** 2)) * 1.005]);
    }
  }
  const glow = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), glowMat, spots.length); glow.frustumCulled = false;
  spots.forEach((p, k) => { const s2 = 0.6 + ((k * 53) % 10) / 14; m4.makeScale(s2, s2, s2); m4.setPosition(...p); glow.setMatrixAt(k, m4); });
  root.add(glow);
  // Song: rings of light leave the head while it calls.
  const rings = [0, 1, 2].map(() => {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#bff6ff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    r.position.set(12.9, -2.7, 0); r.frustumCulled = false; root.add(r); return r;
  });

  // Use the actual island terrain pipeline, with an elliptical outline and scalloped turf lip.
  const outline = a => (1 + .018*Math.sin(a*3+.4) + .012*Math.sin(a*7)) / Math.sqrt(Math.cos(a)**2 + (Math.sin(a)*8.2/3.7)**2);
  const terrain = rockMass(8.2, outline, [[0,.1,0],[.45,.1,0],[1,.1,.007],[1.025,-.13,.007],[.98,-.36,.009],[.88,-.7,.006],[0,-.87,0]],64,islandColor(pal));
  mesh(root,terrain,worldMat);
  // Existing CC0 mushroom models retain their original materials and scale fitting.
  for (const [x,z,s] of [[-4.5,-1.75,.38],[-3.2,-2.3,.28],[1.85,2.15,.35],[3.9,-1.8,.28]]) addAttachedProp('mushroom_large',root,x,.1,z,0,s);
  const geoStart = worldGeos.length, grassStart = grassI.length, flowerStart = flowerI.length;
  const colliderStart = colliders.length;
  const treePalette = {...pal, style:'oak'};
  addTree(-3.8,.1,-2.2,treePalette); addTree(1.2,.1,2.3,treePalette);
  const trunks = colliders.splice(colliderStart);
  addFlowerBed(-3.8,.1,-2.15,.62,pal); addFlowerBed(1.15,.1,2.15,.62,pal);
  // Leave the central walking lane and the boarding sides free. A low winding stone path links rewards.
  for (let i = 0; i < 20; i++) {
    const x = -6.3 + i*.64, z = Math.sin(i*.48)*.4;
    const g = new THREE.DodecahedronGeometry(rand(.22,.34),0).scale(1.6,.16,1).rotateY(rand(0,TAU));
    g.translate(x,.105,z);
    worldGeos.push(bake(g,(p,n,c)=>c.copy(pal.stone).offsetHSL(0,0,variation(p))));
  }
  for (let i = 0; i < 240; i++) {
    const a = rand(0,TAU), r = Math.sqrt(rand(.04,.9)), x = Math.cos(a)*7.5*r, z = Math.sin(a)*3.25*r;
    if (Math.abs(z - Math.sin((x+6.3)/.64*.48)*.4) < .55 || Math.abs(x) < 1 && Math.abs(z) > 2.4) continue;
    addGrass(x,.1,z,pal,.75);
    if (i%5 === 0) addFlower(x,.1,z,pal.flowers[i%pal.flowers.length],rand(.24,.44));
  }
  for (let i = 0; i < 45; i++) {
    const a = i/45*TAU, x = Math.cos(a)*7.95, z = Math.sin(a)*3.5;
    if (Math.abs(x) < 1.7 && Math.abs(z) > 3) continue;
    const g = new THREE.DodecahedronGeometry(rand(.1,.22),0).scale(1.35,.5,1); g.translate(x,.1,z);
    worldGeos.push(bake(g,(p,n,c)=>c.copy(pal.rock).lerp(pal.moss,n.y>.4?.7:.1)));
  }
  const garden = mesh(root,mergeGeometries(worldGeos.splice(geoStart)),worldMat); garden.name = 'Jardim das costas';
  buildVegetation(root,grassI.splice(grassStart),flowerI.splice(flowerStart));

  // Twin blowholes sit on bare skin in front of the garden, with a fine breathing spray.
  for (const z of [-.2,.2]) {
    const hole = mesh(root,new THREE.SphereGeometry(1,16,8),dark); hole.scale.set(.35,.035,.11); hole.position.set(9.25,-.86,z);
  }
  const mistMat = new THREE.MeshBasicMaterial({color:'#dfefed',transparent:true,opacity:.16,depthWrite:false});
  const spray = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.14,1),mistMat,30); spray.frustumCulled=false; root.add(spray);
  const matrix = new THREE.Matrix4();
  return { root, trunks, animate(t) {
    tail.rotation.z = Math.sin(t*.65)*.15; flukes.rotation.z = Math.sin(t*.65-.9)*.14;
    const v = whaleVoice.level;
    glowMat.opacity = 0.42 + 0.12 * Math.sin(t * 0.9) + v * 0.5; glowMat.color.setRGB(0.5, 0.91, 1).multiplyScalar(1 + v * 2.2);
    rings.forEach((r, i) => { const k = (t * 0.55 + i / 3) % 1, s2 = 0.6 + k * 7; r.scale.set(1, s2, s2); r.material.opacity = v * (1 - k) * 0.5; r.position.x = 12.9 + k * 3; });
    fins.forEach((f,i)=>{f.rotation.x=Math.sin(t*.65+i*.4)*.12; f.rotation.z=Math.sin(t*.65)*.025;});
    for (const eye of root.children.filter(o=>o.userData.iris)) eye.scale.y = t%9>8.8?.16:1;
    for (let i=0;i<30;i++) {
      const life=((t%9)-i*.055)/2.1, active=life>0&&life<1;
      const size=active?Math.sin(life*Math.PI)*(.45+life):0;
      matrix.makeScale(size,size*1.7,size); matrix.setPosition(9.25+Math.sin(i*2.4)*life*.65,-.8+life*4.2,Math.cos(i*2.4)*life*.55);
      spray.setMatrixAt(i,matrix);
    }
    spray.instanceMatrix.needsUpdate=true;
  }};
}
