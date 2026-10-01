import * as THREE from 'three';
import { world } from './mode.js';

export const S_CHAR = 0.0038;                 // character.fbx is ~300 units tall
export const PR = 0.34, PH = 1.05;            // player radius / height
export const MAX_SPEED = 5.4, JUMP_V = 11.2, GRAV = 30;
export const SUN = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
export const WIND = new THREE.Vector2(0.88, 0.47).normalize();
export const FOG_LAYER = 22;                  // top of the low mist sea

const INSTANTE_NAMES = ['O Instante', 'A Ilha Partida', 'O Jardim Suspenso', 'A Cachoeira Parada', 'A Corrente', 'O Farol Parado'];
export const NAMES = world.instante ? [...INSTANTE_NAMES]
  : ['Ninho da Névoa', 'Ilha do Orvalho', 'Degraus de Musgo', 'Ruínas do Vento', 'Espiral Antiga',
    'Travessia Lenta', 'Bosque Pálido', 'Pedra Suspensa', 'Jardim das Brumas', 'Coroa de Pedra', 'O Farol Silencioso'];
export const useInstanteNames = () => NAMES.splice(0, NAMES.length, ...INSTANTE_NAMES);   // crossing over in the same page
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

export const TIMES = ['automático', 'manhã', 'meio-dia', 'pôr do sol', 'noite'], TIME_TOD = [null, 0.08, 0.25, 0.5, 0.75];   // fixed times of day
export const FOGS = [0.3, 0.65, 1, 1.5], DAYS = [120, 300, 600];   // fog density multipliers / day lengths in seconds
// rebindable keys (KeyboardEvent.code); arrows always work for moving as well
export const DEFAULT_BINDS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', attack: 'KeyJ', equip: 'KeyC', interact: 'KeyR', camLeft: 'KeyQ', camRight: 'KeyE', view: 'KeyV', dash: 'ShiftLeft', photo: 'KeyF', pause: 'KeyP' };
const DEFAULTS = {
  sens: 5, invert: false, firstPerson: false, camDist: 6.6, tips: true, timer: true, ghost: true,             // gameplay
  quality: 2, fov: 60, shadows: true, bloom: true, particles: 1, fog: 2, hud: true, fps: false,   // graphics (fog: index into FOGS)
  volume: 7, music: 9, sfx: 10, ambience: 10,                                           // audio
  weather: 0, time: 0, dayLen: 1,                                                        // world (weather 0 auto / 1 off; time: index into TIMES; dayLen: index into DAYS)
  binds: DEFAULT_BINDS,
};
// numeric ranges; anything outside (old or hand-edited saves) falls back to the default
const LIMITS = { sens: [1, 10], camDist: [4, 10], quality: [0, 2], fov: [50, 90], particles: [0, 1], fog: [0, 3], volume: [0, 10], music: [0, 10], sfx: [0, 10], ambience: [0, 10], weather: [0, 1], time: [0, 4], dayLen: [0, 2] };
export const settings = structuredClone(DEFAULTS);
export const resetSettings = () => { Object.assign(settings, structuredClone(DEFAULTS)); saveSettings(); };
// developer switches (not saved)
export const dev = { fly: false, flySpeed: 14, safe: false, speed: 1, gravity: 1, jump: 1, freezeTime: false, hour: 9, forced: 0, island: 0 };

export function loadSettings(raw) {
  let s; try { s = JSON.parse(raw); } catch { return; }
  if (!s || typeof s !== 'object') return;
  for (const k of Object.keys(DEFAULTS)) {
    const v = s[k], d = DEFAULTS[k];
    if (k === 'binds') { if (v && typeof v === 'object') for (const a in d) if (typeof v[a] === 'string' && v[a]) settings.binds[a] = v[a]; continue; }
    if (typeof v !== typeof d) continue;
    if (LIMITS[k]) { if ((Number.isInteger(v) || (k === 'camDist' && Number.isFinite(v))) && v >= LIMITS[k][0] && v <= LIMITS[k][1]) settings[k] = v; } else settings[k] = v;
  }
}
try { loadSettings(localStorage.getItem('nevoa-settings')); } catch { /* storage blocked: defaults */ }
export const saveSettings = () => { try { localStorage.setItem('nevoa-settings', JSON.stringify(settings)); } catch { /* ignore */ } };
