// Move tutorials: at a move that isn't obvious at first sight (the first long glide, the climbing wall) the guide
// offers "B · ver tutorial". Pressing it plays a short clip: a copy of the character does the move twice, filmed
// from the side between letterbox bars, while the overlay says what to press and lights the key as it's pressed.
// The real character waits, frozen, where you left it.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { scene, camera, game } from '../core.js';
import { settings } from '../config.js';
import { lerp, clamp, smoothstep } from '../utils.js';
import { cineCam } from './camera.js';
import { rig } from './player.js';
import { pad, keyName } from './input.js';

const PAUSE = 1.1, REST = 1.2, LOOPS = 2;
const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0.7, depthWrite: false, fog: false, side: THREE.DoubleSide });
const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 40).rotateX(-Math.PI / 2), ringMat);
ring.visible = false; scene.add(ring);
const box = document.querySelector('#tutorial');
let root = null, mixer = null, cur = '';
const acts = {}, run = { on: false, a: null, b: null, kind: '', loop: 0, t: 0, prevState: 'play' };
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), mid = new THREE.Vector3();

export function initTutorial(fbx) {
  const g = clone(fbx);   // shares the character's materials: it looks like you, not a ghost
  root = new THREE.Group(); root.add(g); root.visible = false; scene.add(root);
  mixer = new THREE.AnimationMixer(g);
  for (const clip of g.animations) acts[clip.name.split('|').pop()] = mixer.clipAction(clip);
  if (acts.Jump) { acts.Jump.setLoop(THREE.LoopOnce); acts.Jump.clampWhenFinished = true; }
}
const anim = name => { if (name !== cur && acts[name]) { acts[cur]?.fadeOut(0.12); acts[name].reset().fadeIn(0.12).play(); cur = name; } };
const flat = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const glideHop = (c, a, b) => ['glide', 'vents'].includes(c.hint) && flat(a, b) > 7;

// the next tricky move of this crossing from the stone nearest `pos`: { a, b, kind } or null
export function tutorialAt(c, pos) {
  if (!c || !root) return null;
  const pts = [c.start, ...c.steps, c.end];
  let best = 0;
  pts.forEach((p, i) => { if (flat(p, pos) < flat(pts[best], pos)) best = i; });
  for (let i = Math.max(best - 1, 0); i < pts.length - 1; i++) {
    if (pts[i + 1].climb) return { a: pts[i], b: pts[i + 1], kind: 'climb' };
    if (glideHop(c, pts[i], pts[i + 1])) return { a: pts[i], b: pts[i + 1], kind: 'glide' };
  }
  return null;
}
export const tutorialLabel = kind => (kind === 'climb' ? 'como escalar' : 'como planar');

export function startTutorial(move) {
  if (run.on || !move) return;
  Object.assign(run, { on: true, ...move, loop: 0, t: 0, prevState: game.state });
  game.state = 'tutorial'; cineCam.on = true;
  document.body.classList.add('cinema', 'bars');
  root.visible = ring.visible = true; box.classList.add('show');
  box.querySelector('.t-foot').textContent = `${keyName(settings.binds.tutorial)} ou Esc · voltar ao jogo`;
  // filmed from the side of the move, far enough to see both stones
  mid.set((run.a.x + run.b.x) / 2, (run.a.y + run.b.y) / 2, (run.a.z + run.b.z) / 2);
  const dx = run.b.x - run.a.x, dz = run.b.z - run.a.z, len = Math.hypot(dx, dz) || 1, d = Math.max(9, len * 1.15);
  camPos.set(mid.x - dz / len * d, mid.y + d * 0.35 + (run.kind === 'climb' ? 2 : 1), mid.z + dx / len * d);
  camLook.copy(mid).y += run.kind === 'climb' ? 2 : 1;
  camera.position.copy(camPos); camera.lookAt(camLook);
}
export function endTutorial() {
  if (!run.on) return;
  run.on = false; game.state = run.prevState; cineCam.on = false;
  document.body.classList.remove('cinema', 'bars');
  root.visible = ring.visible = false; rig.visible = true; box.classList.remove('show');
}
export const tutorialOn = () => run.on;

// steps of the clip: [text, key, held from t (in the hop), until]
function caption(k, t) {
  const jump = pad.active ? 'A' : keyName(settings.binds.jump), fwd = pad.active ? 'Analógico ↑' : keyName(settings.binds.forward);
  if (run.kind === 'climb') return t < PAUSE * 0.5 ? ['1 · Vá até a parede coberta de musgo', fwd, false]
    : ['2 · Continue andando contra a parede: o personagem escala sozinho', fwd, true];
  if (t < PAUSE - 0.15) return ['1 · Vá até a borda da pedra', fwd, t > PAUSE * 0.4];
  if (k < 0.3) return ['2 · Pule', jump, k < 0.15];
  return ['3 · Perto do alto do salto, aperte de novo e SEGURE para planar', jump, true];
}

export function updateTutorial(dt) {
  if (!run.on) return;
  rig.visible = false;
  const { a, b } = run, climb = run.kind === 'climb', len = flat(a, b);
  const D = climb ? 2.2 : 0.9 + len * 0.13;
  run.t += dt;
  root.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  const k = clamp((run.t - PAUSE) / D, 0, 1);
  // stands back from the edge, walks up to it, then the move
  const back = climb ? 0 : 1.2, ux = (b.x - a.x) / (len || 1), uz = (b.z - a.z) / (len || 1);
  if (run.t < PAUSE) {
    const w = smoothstep(run.t, PAUSE * 0.35, PAUSE);
    root.position.set(a.x - ux * back * (1 - w), a.y, a.z - uz * back * (1 - w));
    anim(w > 0 && w < 1 ? 'Walk' : 'Idle');
  } else if (run.t < PAUSE + D) {
    if (climb) {
      const h = smoothstep(k, 0, 0.3);
      root.position.set(lerp(a.x, b.x, h * 0.8), lerp(a.y, b.y, smoothstep(k, 0.25, 1)), lerp(a.z, b.z, h * 0.8));
      anim('Walk');
    } else {   // up, then a long, gentle glide down
      const arc = k < 0.25 ? Math.sin(k / 0.25 * Math.PI / 2) * 1.6 : 1.6 * (1 - smoothstep(k, 0.25, 1));
      root.position.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k) + arc, lerp(a.z, b.z, k));
      anim('Jump');
    }
  } else {
    root.position.set(b.x, b.y, b.z); anim('Idle');
    if (run.t > PAUSE + D + REST) { run.loop++; run.t = 0; if (run.loop >= LOOPS) return endTutorial(); }
  }
  ring.position.set(b.x, b.y + 0.06, b.z);
  ring.scale.setScalar((b.r ? clamp(b.r * 1.1, 0.8, 3) : 1) * (0.95 + 0.1 * Math.sin(performance.now() / 180)));
  camera.lookAt(camLook);
  const [text, key, on] = caption(k, run.t);
  const html = `${text}|${key}|${on}`;
  if (box.dataset.k !== html) {
    box.dataset.k = html;
    box.querySelector('.t-title').textContent = tutorialLabel(run.kind);
    box.querySelector('.t-text').textContent = text;
    box.querySelector('.kc').textContent = key;
    box.querySelector('.t-keys').classList.toggle('on', on);
  }
  mixer.update(dt);
}
