import * as THREE from 'three';

export const S_CHAR = 0.0038;                 // character.fbx is ~300 units tall
export const PR = 0.34, PH = 1.05;            // player radius / height
export const MAX_SPEED = 5.4, JUMP_V = 11.2, GRAV = 30;
export const SUN = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
export const WIND = new THREE.Vector2(0.88, 0.47).normalize();
export const FOG_LAYER = 22;                  // top of the low mist sea

export const NAMES = ['Ninho da Névoa', 'Ilha do Orvalho', 'Degraus de Musgo', 'Ruínas do Vento', 'Espiral Antiga',
  'Travessia Lenta', 'Bosque Pálido', 'Pedra Suspensa', 'Jardim das Brumas', 'Coroa de Pedra', 'O Farol Silencioso'];
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

export const TIMES = ['automático', 'manhã', 'meio-dia', 'pôr do sol', 'noite'], TIME_TOD = [null, 0.08, 0.25, 0.5, 0.75];   // fixed times of day
export const FOGS = [0.3, 0.65, 1, 1.5], DAYS = [120, 300, 600];   // fog density multipliers / day lengths in seconds
const DEFAULTS = {
  sens: 5, invert: false, camDist: 6.6, tips: true,                                       // gameplay
  quality: 2, fov: 60, shadows: true, bloom: true, particles: 1, fog: 2, hud: true, fps: false,   // graphics (fog: index into FOGS)
  volume: 7, music: 9, sfx: 10, ambience: 10,                                           // audio
  weather: 0, time: 0, dayLen: 1,                                                        // world (weather 0 auto / 1 off; time: index into TIMES; dayLen: index into DAYS)
};
export const settings = { ...DEFAULTS };
export const resetSettings = () => { Object.assign(settings, DEFAULTS); saveSettings(); };
// developer switches (not saved)
export const dev = { fly: false, flySpeed: 14, safe: false, speed: 1, gravity: 1, jump: 1, freezeTime: false, hour: 9, forced: 0, island: 0 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('nevoa-settings')) || {}); } catch { /* defaults */ }
export const saveSettings = () => { try { localStorage.setItem('nevoa-settings', JSON.stringify(settings)); } catch { /* ignore */ } };
