// Free-standing gate you can walk through (the pillars are solid). 'stone': fluted pillars, a lintel that
// broke off on one side, mossy vines, fallen block. 'wood': garden trellis with blossoms and leaves.
// rot: rotation about Y (the gate opens perpendicular to the pillar line).
import * as THREE from 'three';
import { TAU, rnd, rand, pick } from '../../utils.js';
import { bake, jitter } from '../geometry.js';
import { addCol, pushGeo } from '../world.js';

const WIDTH = 1.55, HEIGHT = 2.7;

export function addArch(x, y, z, pal, rot = 0, style = 'stone') {
  const wood = style === 'wood';
  const stoneFn = (cen, n, c) => { c.copy(pal.stone).multiplyScalar(rand(0.86, 1.04)); if ((n.y > 0.6 || cen.y < 0.4) && rnd() < 0.5) c.lerp(pal.moss, 0.6); };
  const woodFn = (cen, n, c) => c.set('#8a6a48').offsetHSL(0, 0, rand(-0.04, 0.04) + n.y * 0.03);
  const fn = wood ? woodFn : stoneFn;
  const put = (g, colorFn = fn, sway) => { g.rotateY(rot); pushGeo(bake(g, colorFn, sway), x, y, z); };

  for (const sx of [-1, 1]) {
    const lean = wood ? rand(-0.03, 0.03) : 0;
    let g;
    if (wood) g = new THREE.BoxGeometry(0.22, HEIGHT, 0.22, 1, 3, 1).translate(0, HEIGHT / 2, 0);
    else {   // octagonal pillar, slight taper, fluted by pushing alternate sides in
      g = new THREE.CylinderGeometry(0.38, 0.46, HEIGHT, 8, 3).translate(0, HEIGHT / 2, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = Math.round((Math.atan2(p.getZ(i), p.getX(i)) + Math.PI) / (TAU / 8)) % 2 ? 0.93 : 1; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
      g = jitter(g, 0.01);
    }
    g.translate(sx * WIDTH + lean, 0, 0);
    put(g);
    if (!wood) put(new THREE.BoxGeometry(0.98, 0.16, 0.98).translate(sx * WIDTH, 0.08, 0));                       // plinth
    if (!wood) put(new THREE.BoxGeometry(0.82, 0.2, 0.82).translate(sx * WIDTH, HEIGHT + 0.02, 0));               // capital
    const px = x + Math.cos(rot) * sx * WIDTH, pz = z - Math.sin(rot) * sx * WIDTH;   // world position of this pillar
    addCol({ x: px, z: pz, y: y + HEIGHT, r: 0.46, thick: HEIGHT + 0.2, ground: false, depth: 0 });
  }

  if (wood) {   // crossbeams and a lattice
    put(new THREE.BoxGeometry(WIDTH * 2 + 0.6, 0.16, 0.3).translate(0, HEIGHT + 0.1, 0));
    put(new THREE.BoxGeometry(WIDTH * 2 + 0.3, 0.1, 0.22).translate(0, HEIGHT - 0.35, 0));
    for (let k = -3; k <= 3; k++) put(new THREE.BoxGeometry(0.06, 0.36, 0.06).translate(k * 0.4, HEIGHT - 0.17, 0));
    const petals = pal.flowers;
    for (let k = 0; k < 26; k++) {   // blossoms and leaves draped over the top and down the posts
      const onPost = rnd() < 0.5, sx = rnd() < 0.5 ? -1 : 1;
      const px = onPost ? sx * WIDTH + rand(-0.18, 0.18) : rand(-WIDTH - 0.2, WIDTH + 0.2), py = onPost ? rand(0.9, HEIGHT) : HEIGHT + rand(-0.4, 0.2);
      const leaf = rnd() < 0.55, s = leaf ? rand(0.07, 0.13) : rand(0.05, 0.085);
      const g = new THREE.IcosahedronGeometry(s, 0).translate(px, py, rand(-0.16, 0.16));
      put(g, (cen, n, c) => (leaf ? c.copy(pal.moss).offsetHSL(rand(-0.02, 0.02), 0.05, rand(-0.02, 0.07)) : c.set(pick(petals)).offsetHSL(0, 0, rand(-0.03, 0.04))), (px2, py2) => 0.1);
    }
  } else {
    const broken = rnd() < 0.7, len = broken ? WIDTH * 2 - 0.15 : WIDTH * 2 + 0.7, off = broken ? -0.55 : 0;
    put(new THREE.BoxGeometry(len, 0.5, 0.78).translate(off, HEIGHT + 0.35, 0));    // lintel
    if (broken) {   // the other half lies on the ground
      const chunk = new THREE.BoxGeometry(0.95, 0.42, 0.7).rotateY(rand(-0.6, 0.6)).rotateZ(rand(-0.12, 0.12));
      put(chunk.translate(WIDTH + 0.85, 0.21, 0.9));
    }
    for (let k = 0; k < 5; k++) {   // vines hanging from the lintel
      const l = rand(0.5, 1.3), v = new THREE.ConeGeometry(0.03, l, 4, 3, true).rotateX(Math.PI).translate(rand(-WIDTH, WIDTH * (broken ? 0.4 : 1)), HEIGHT + 0.1 - l / 2, rand(-0.3, 0.3));
      put(v, (cen, n, c) => c.copy(pal.moss).offsetHSL(0, 0, rand(-0.03, 0.04)), (px, py) => 0.3);
    }
  }
}
