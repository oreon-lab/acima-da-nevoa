// Themed islands, keyed by island index (names in config.js NAMES). A theme can:
//   pal      - palette overrides ('#hex' colours, arrays for leaf/flowers, style: 'birch')
//   trees    - multiplier for the generic tree count
//   ruin     - false to skip the generic climbable column stairs
//   decorate - (island, tops) place the signature objects; `tops` collects climbable colliders for the pickup
// Main features sit relative to the entry/exit direction so the path across the island stays open.
import * as THREE from 'three';
import { TAU, rand, pick } from '../utils.js';
import { bake } from './geometry.js';
import { freeSpot, pushGeo, landmarks } from './world.js';
import { addProp } from './objects/props.js';
import { addRuinsPuzzle } from './objects/ruinsPuzzle.js';
import { addGroundMist } from '../render/atmosphere.js';
import { addPond } from './objects/pond.js';
import { addReeds } from './objects/reeds.js';
import { addPavement } from './objects/pavement.js';
import { addArch } from './objects/arch.js';
import { addBanner } from './objects/banner.js';
import { addColumn } from './objects/column.js';
import { addCampfire } from './objects/campfire.js';
import { addTent } from './objects/tent.js';
import { addPetals } from './objects/petals.js';
import { addFireflies } from './objects/fireflies.js';
import { addCrystalCluster } from './objects/crystals.js';
import { addFloater } from './objects/floater.js';
import { addMushroom } from './objects/mushroom.js';
import { addFlowerBed } from './objects/flowerBed.js';
import { addHedge } from './objects/hedge.js';

const at = (is, ang, f) => ({ x: is.x + Math.cos(ang) * is.R * f, z: is.z + Math.sin(ang) * is.R * f });
const claim = (is, s, r, solid = true) => is.occ.push({ x: s.x, z: s.z, r, solid });
const side = () => (rand(0, 1) < 0.5 ? 1 : -1);

export const THEMES = {
  // Degraus de Musgo: damp, mossy, mushrooms everywhere (the generic column stairs stay)
  2: {
    pal: { grass: '#4b7c3b', tip: '#a5c472', moss: '#4a8a3a', rock: '#5f6d5b', stone: '#8f9a86', dirt: '#5b5040', flowers: ['#e8f0d8', '#ffe6a0'] },
    trees: 0.8,
    decorate(is) {
      for (let k = 0; k < 8; k++) {
        const s = freeSpot(is, 0.15, 0.9, 0.7); if (!s) continue;
        addMushroom(s.x, is.y, s.z, rand(0.8, 1.5)); claim(is, s, 0.45, false);
      }
      for (let k = 0; k < 3; k++) {
        const s = freeSpot(is, 0.3, 0.82, 0.65); if (!s) continue;
        addProp('mushroom_large', s.x, is.y, s.z, rand(0, TAU), rand(0.75, 1.1)); claim(is, s, 0.7);
      }
    },
  },

  // Ilha do Orvalho: a still pond ringed with reeds; the path wades straight through it
  1: {
    pal: { grass: '#4d8a55', tip: '#a6d08e', moss: '#4a8a5e', flowers: ['#ffffff', '#cfe0ff', '#ffe27a'], style: 'willow' },
    trees: 0.7, ruin: false,
    decorate(is) {
      const r = rand(2.4, 2.9), c = at(is, is.exit, 0.1);
      addPond(c.x, is.y, c.z, r, is.pal); claim(is, c, r + 0.6);
      for (let k = 0, n = 10; k < n; k++) {
        if (rand(0, 1) < 0.3) continue;   // gaps in the reeds
        const a = k / n * TAU + rand(-0.2, 0.2), d = r + rand(0.2, 0.6);
        addReeds(c.x + Math.cos(a) * d, is.y, c.z + Math.sin(a) * d, is.pal);
      }
    },
  },

  // Ruínas do Vento: dry golden grass, flagstones, a broken gate, banners snapping in the wind
  3: {
    pal: { grass: '#8f9a56', tip: '#d9d39a', moss: '#8a9350', stone: '#c1baa8', dirt: '#857a62', flowers: ['#fff3c4', '#ffe27a'], style: 'acacia' },
    trees: 0.2, ruin: false,
    // Three separate zones so the island reads at a glance: spawn on the entry side, the wind-mirror puzzle
    // off to the side (well clear of the spawn), and a single gate on the exit side. Banners only on the rim.
    decorate(is) {
      const c = at(is, is.exit, 0.1), y = is.y;
      addPavement(c.x, y, c.z, 2.6, is.pal); claim(is, c, 2.8, false);
      addArch(c.x, y, c.z, is.pal, -(is.exit + Math.PI / 2), 'stone');   // opens along the path
      const puzzle = at(is, is.entry + Math.PI / 2, 0.5);
      addRuinsPuzzle(is, puzzle.x, puzzle.z); claim(is, puzzle, 3.4);
      landmarks.push({ id: 'ruinas', name: 'Espelhos do Vento', x: puzzle.x, y: y + 1.7, z: puzzle.z });
      for (let k = 0; k < 2; k++) {
        const s = freeSpot(is, 0.75, 0.88, 1.0); if (!s) continue;
        addBanner(s.x, y, s.z, pick(['#a8443c', '#3f6f7a', '#c99a3a'])); claim(is, s, 0.6);
      }
    },
  },

  // Travessia Lenta: a rest stop to the side of the path, campfire, tent and log seats
  5: {
    pal: { dirt: '#6b5a44', grass: '#6a8a3e' },
    trees: 0.6, ruin: false,
    decorate(is) {
      const y = is.y, pal = is.pal, s0 = side(), c = at(is, is.entry + s0 * Math.PI / 2, 0.32);
      pushGeo(bake(new THREE.RingGeometry(0.3, 2.7, 20, 3).rotateX(-Math.PI / 2), (cen, n, col) => col.copy(pal.dirt).offsetHSL(0, 0, rand(-0.03, 0.03) - Math.hypot(cen.x, cen.z) * 0.012)), c.x, y + 0.03, c.z);
      addCampfire(c.x, y, c.z, pal);
      const a = Math.atan2(c.z - is.z, c.x - is.x) + rand(-0.4, 0.4);   // tent sits on the far side, door towards the fire
      addTent(c.x + Math.cos(a) * 2.3, y, c.z + Math.sin(a) * 2.3, Math.atan2(-Math.cos(a), -Math.sin(a)));
      for (const off of [1.9, -1.9]) {   // log seats tangent to the fire
        const b = a + off, len = 1.05;
        const g = new THREE.CylinderGeometry(0.16, 0.17, len, 7).rotateZ(Math.PI / 2);
        pushGeo(bake(g, (cen, n, col) => col.set('#5b4530').offsetHSL(0, 0, rand(-0.03, 0.03))).rotateY(-b - Math.PI / 2), c.x + Math.cos(b) * 1.55, y + 0.17, c.z + Math.sin(b) * 1.55);
      }
      claim(is, c, 3.0);
      const mill = at(is, is.exit + Math.PI / 2, 0.65);
      addProp('windmill', mill.x, y, mill.z, is.exit);
      claim(is, mill, 2.2);
      landmarks.push({ id: 'moinho', name: 'Moinho Suspenso', x: mill.x, y: y + 2.8, z: mill.z });
    },
  },

  // Bosque Pálido: white birches, pale blossom, petals on the ground, fireflies
  6: {
    pal: { grass: '#a5b98a', tip: '#e6edd4', bark: '#ddd8cb', moss: '#a9bb98', bush: '#a7bf98', rock: '#a3a7a8', style: 'birch',
      leaf: ['#f6dde6', '#fbeeea', '#ecc9d8', '#ffffff', '#dfe8d2'], flowers: ['#ffffff', '#f7d2e4', '#e8e0ff'] },
    trees: 2.3, ruin: false,
    decorate(is) {
      addPetals(is, Math.round(is.R * is.R * 3.2), is.pal.leaf);
      addFireflies(is, 36);
      const s = freeSpot(is, 0.3, 0.65, 1.6);
      if (s) { addProp('tree_light', s.x, is.y, s.z); claim(is, s, 1.2); landmarks.push({ id: 'bosque', name: 'Árvore do Bosque Pálido', x: s.x, y: is.y + 1.8, z: s.z }); }
    },
  },

  // Pedra Suspensa: cold blue-grey rock, glowing crystals, boulders hovering overhead
  7: {
    pal: { rock: '#6f7896', stone: '#b3b8cc', grass: '#7fa18e', tip: '#c5ddcf', moss: '#6d9c88', dirt: '#7a7684', leaf: ['#9fc4b0', '#b3d3c4', '#8fb8b4'] },
    trees: 0.4, ruin: false,
    decorate(is) {
      const y = is.y;
      addProp('tree_floating', is.x, y + 5.5, is.z, 0, 1.15);
      landmarks.push({ id: 'pedra', name: 'Árvore Suspensa', x: is.x, y: y + 8, z: is.z });
      for (let k = 0; k < 4; k++) {
        const s = freeSpot(is, 0.35, 0.8, 1.2); if (!s) continue;
        addCrystalCluster(s.x, y, s.z, rand(0.8, 1.3), is.pal); claim(is, s, 1.7);
      }
      addFloater(is.x, y + 8.6, is.z, 1.7, is.pal);   // the suspended stone itself (rocks hang up to ~2.5 r below their y, so keep clear of the ground)
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU + rand(-0.3, 0.3);
        addFloater(is.x + Math.cos(a) * is.R * 0.55, y + rand(5.2, 8.5), is.z + Math.sin(a) * is.R * 0.55, rand(0.5, 1.0), is.pal);
      }
    },
  },

  // Jardim das Brumas: lush lawn, flower beds, clipped hedges, a trellis over the path, mist on the ground
  8: {
    pal: { grass: '#5b9b4e', tip: '#b9df80', moss: '#5f9a55', flowers: ['#ff9db8', '#ffd166', '#ffffff', '#b79cff', '#ff7f6b', '#8fd3ff'] },
    trees: 0.6, ruin: false,
    decorate(is) {
      const y = is.y, pal = is.pal;
      for (let k = 0; k < 3; k++) {
        const r = rand(1.0, 1.5), s = freeSpot(is, 0.25, 0.75, r + 0.3); if (!s) continue;
        addFlowerBed(s.x, y, s.z, r, pal); claim(is, s, r + 0.3);
      }
      if (!is.big) {   // big islands lay out their own path and gate (grand.js)
        const c = at(is, is.exit, 0.1);
        addArch(c.x, y, c.z, pal, -(is.exit + Math.PI / 2), 'wood'); claim(is, c, 1.8, false);
        for (const sd of [1, -1]) {   // hedges flank the path, one on each side
          const mid = is.exit + sd * Math.PI / 2;
          addHedge(is, mid - 0.55, mid + 0.55, 0.7, pal);
        }
      } else for (let k = 0; k < 5; k++) {   // more beds to fill the big garden
        const r = rand(1.0, 1.5), s = freeSpot(is, 0.25, 0.8, r + 0.3); if (!s) continue;
        addFlowerBed(s.x, y, s.z, r, pal); claim(is, s, r + 0.3);
      }
      addGroundMist(is.x, y, is.z, is.R, 0.35);
      addGroundMist(is.x, y, is.z, is.R * 0.9, 0.85);
    },
  },

  // Coroa de Pedra: the ruined city (laid out by city.js); pale stone, dry grass, few trees
  9: {
    pal: { stone: '#d3cdbf', grass: '#8f9c78', tip: '#d6dcc0', moss: '#86976f', dirt: '#8c8272', rock: '#9a9aa2' },
    trees: 0.25, ruin: false,
    decorate() {},
  },
};
