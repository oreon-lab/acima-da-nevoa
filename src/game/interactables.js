// Generic interaction prompts. Anything in the world can offer one: register a source, a function (playerPos) that returns
// null, one candidate or an array of them: { at: {x,y,z} where the prompt is pinned, text, act: action name (default 'interact'), use?: () => void }.
// Each frame the best candidate is picked (nearest, with a bonus for the one you are facing) and its prompt is projected
// from that world point to the screen, so it sits on the object from any camera angle and shrinks with distance.
import * as THREE from 'three';
import { camera } from '../core.js';
import { clamp } from '../utils.js';
import { cap } from './input.js';

const sources = [], v = new THREE.Vector3(), el = document.querySelector('#interact');
let shownText = '';
export const addInteractables = fn => { sources.push(fn); };

const FACING = 0.8;   // metres of "distance" a perfectly faced object is worth over one behind you
export function pickInteractable(pos, yaw) {
  let best = null, bestScore = Infinity;
  for (const fn of sources) {
    const r = fn(pos);
    for (const c of Array.isArray(r) ? r : [r]) {
      if (!c) continue;
      const dx = (c.at?.x ?? pos.x) - pos.x, dz = (c.at?.z ?? pos.z) - pos.z, d = Math.hypot(dx, dz);
      const score = d - (d > 0.01 ? (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / d : 1) * FACING;
      if (score < bestScore) { best = c; bestScore = score; }
    }
  }
  return best;
}

// call every frame with the picked candidate (or null)
export function showPrompt(c, pos) {
  el.classList.toggle('show', !!c);
  if (!c) return;
  const text = `${c.act ?? 'interact'}|${c.text}`;
  if (text !== shownText) { shownText = text; el.innerHTML = `${cap(c.act ?? 'interact')}<span>${c.text}</span>`; }
  const at = c.at ?? { x: pos.x, y: pos.y + 2.4, z: pos.z };   // no anchor: floats above you
  v.set(at.x, at.y, at.z).project(camera);
  const k = clamp(9 / camera.position.distanceTo(at), 0.6, 1.15).toFixed(2);
  el.style.transform = `translate(${Math.round((v.x + 1) / 2 * innerWidth)}px, ${Math.round((1 - v.y) / 2 * innerHeight)}px) scale(${k})`;
  el.style.visibility = v.z < 1 ? '' : 'hidden';
}
