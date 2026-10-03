// One place that answers "is this action held?" for rebindable keys and a gamepad (standard mapping).
import { keys } from '../core.js';
import { settings } from '../config.js';

export const ACTIONS = [
  ['forward', 'Frente'], ['back', 'Trás'], ['left', 'Esquerda'], ['right', 'Direita'], ['jump', 'Pular / planar'], ['interact', 'Interagir'],
  ['attack', 'Ataque duplo'], ['equip', 'Sacar / guardar espadas'],
  ['camLeft', 'Girar câmera (esq.)'], ['camRight', 'Girar câmera (dir.)'], ['view', 'Primeira pessoa'], ['dash', 'Investida (dash)'], ['photo', 'Modo foto'], ['pause', 'Pausa'], ['tutorial', 'Ver tutorial'],
];
const ARROW = { forward: 'ArrowUp', back: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

export const pad = { x: 0, z: 0, lookX: 0, lookY: 0, held: {}, pressed: {}, active: false };
export const held = a => !!(keys[settings.binds[a]] || keys[ARROW[a]] || pad.held[a]);

// movement input, length <= 1 (x right, z forward)
export function move() {
  let x = (held('right') ? 1 : 0) - (held('left') ? 1 : 0) + pad.x, z = (held('forward') ? 1 : 0) - (held('back') ? 1 : 0) + pad.z;
  const l = Math.hypot(x, z);
  if (l > 1) { x /= l; z /= l; }
  return { x, z };
}

// call once per frame; `pressed` holds the buttons that went down this frame
const DEAD = 0.18;
const stick = (x, y) => {   // radial dead zone, so diagonals and slow creeping feel the same as straight lines
  const l = Math.hypot(x, y);
  if (l < DEAD) return [0, 0];
  const k = Math.min((l - DEAD) / (1 - DEAD), 1) / l;
  return [x * k, y * k];
};
// prefers a pad with the standard mapping; any other pad is still used (Firefox often reports mapping '')
const findPad = () => {
  const all = [...(navigator.getGamepads?.() ?? [])].filter(g => g?.connected);
  return all.find(g => g.mapping === 'standard') ?? all[0] ?? null;
};
export function pollPad() {
  const gp = findPad(), prev = pad.held;
  if (!gp) { Object.assign(pad, { x: 0, z: 0, lookX: 0, lookY: 0, held: {}, pressed: {}, connected: false }); return; }
  pad.connected = true;
  const b = i => !!gp.buttons[i]?.pressed, ax = i => gp.axes[i] ?? 0;
  const [lx, ly] = stick(ax(0), ax(1)), [rx, ry] = stick(ax(2), ax(3));
  pad.x = lx; pad.z = -ly; pad.lookX = rx; pad.lookY = ry;
  pad.held = { jump: b(0), back2: b(1), attack: b(2), equip: b(3), camLeft: b(4), camRight: b(5), zoomOut: b(6), zoomIn: b(7),
    photo: b(8), pause: b(9), view: b(10), recenter: b(11), dash: b(7), up: b(12), down: b(13), left2: b(14), right2: b(15) };
  pad.pressed = {};
  for (const k in pad.held) if (pad.held[k] && !prev[k]) pad.pressed[k] = true;
  if (pad.x || pad.z || pad.lookX || pad.lookY || Object.keys(pad.pressed).length) pad.active = true;
}
// short vibration (hits, hard landings); silently ignored where unsupported
export function rumble(strong = 0.6, ms = 120) {
  const gp = findPad();
  gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 }).catch?.(() => {});
}
// the on-screen hints follow whichever device was used last
if (typeof addEventListener === 'function') {   // (tests import this file in Node)
  addEventListener('keydown', () => { pad.active = false; });
  addEventListener('mousedown', () => { pad.active = false; });
}

// readable key names for the controls menu
const NAMES = { Space: 'Espaço', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: 'Backspace', ShiftLeft: 'Shift esq.', ShiftRight: 'Shift dir.',
  ControlLeft: 'Ctrl esq.', ControlRight: 'Ctrl dir.', AltLeft: 'Alt esq.', AltRight: 'Alt dir.', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
export const keyName = c => NAMES[c] ?? c.replace(/^Key|^Digit|^Numpad/, m => (m === 'Numpad' ? 'Num ' : ''));

// ---- prompts: the same little keys everywhere (HUD, menus). Text is escaped, since key names come from saved settings.
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const keycap = t => `<kbd>${esc(t)}</kbd>`;
const PAD_KEY = { jump: 'A', interact: 'B', attack: 'X', equip: 'Y', camLeft: 'LB', camRight: 'RB', view: 'L3', dash: 'RT', photo: 'Select', pause: 'Start' };
export const padcap = t => `<kbd class="pad ${/^[ABXY]$/.test(t) ? t.toLowerCase() : 'sys'}">${esc(t)}</kbd>`;
// the glyph for an action on whichever device was used last
export const cap = a => (pad.active && PAD_KEY[a] ? padcap(PAD_KEY[a]) : keycap(keyName(settings.binds[a] ?? a)));
