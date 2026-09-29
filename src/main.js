// Entry point: builds the world, loads the character, handles game states / input and runs the loop.
import '@fontsource/poppins/latin-200.css';
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import characterUrl from '../assets/character.fbx?url';
import { canvas, scene, U, game, keys } from './core.js';
import { settings, saveSettings, resetSettings, dev, TIMES, TIME_TOD, DAYS, NAMES } from './config.js';
import { clamp, lerp } from './utils.js';
import { updateAtmosphere, applyShadows } from './render/atmosphere.js';
import { composer, grade, bloom, applyQuality } from './render/post.js';
import { buildLevel } from './procedural/level.js';
import { islands, pickups, updateMovers } from './procedural/world.js';
import { animateObjects, lightShrine } from './procedural/objects/index.js';
import { updateFx } from './fx/particles.js';
import { updateWeather, forceWeather } from './fx/weather.js';
import { player, collectAll, attachCharacter, spawnAt, updatePlayer, updateAnim, updateFade, startRespawn, fade } from './game/player.js';
import { cam, updateCamera } from './game/camera.js';
import { initAudio, updateAudio } from './game/audio.js';
import { setCount, initGauge, setGauge, showCount, areaTitle, message, showTitle, loadingText, openMenu, closeMenu, menuKey } from './game/ui.js';

buildLevel();
const TOP = islands[islands.length - 1].y;
spawnAt(0);
lightShrine(0);
setCount(0, pickups.length);
initGauge(islands.map(i => i.y));

const applyHud = () => document.body.classList.toggle('nohud', !settings.hud);
applyHud(); applyShadows(); applyQuality(); cam.dist = settings.camDist;

// ------------------------------------------------------------ states
const locked = () => document.pointerLockElement === canvas;
const lock = () => { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* not available */ } };
let dragging = false, pausedAt = 0;

function start() {
  game.state = 'play';
  document.body.classList.add('playing');   // the HUD only exists once you are in the game
  showTitle(false);
  initAudio(); lock();
  setTimeout(() => areaTitle(0, ''), 1400);
  setTimeout(() => settings.tips && message('WASD mover  ·  Espaço pular  ·  Mouse câmera  ·  Esc pausa', 6500), 5200);
}
function pause() {
  if (game.state !== 'play') return;
  game.state = 'pause'; pausedAt = performance.now();
  for (const k in keys) keys[k] = false;
  pauseMenu();
  showCount(true);
}
function resume() {
  game.state = 'play';
  closeMenu(); showCount(false);
  lock();
}
const footer = () => `◆  ${player.collected} / ${pickups.length}`;
function pauseMenu() {
  openMenu('Pausa', [
    { label: 'Continuar', act: resume },
    { label: 'Voltar ao checkpoint', act: () => { resume(); startRespawn(); } },
    { label: 'Configurações', act: settingsMenu },
  ], footer(), resume);
}
// settings: a list of categories, each with its own page of rows (label on the left, value on the right)
const set = (k, v) => { settings[k] = v; saveSettings(); };
const round = x => Math.round(x * 100) / 100;
const hint = (item, text) => Object.assign(item, { hint: text });
const num = (label, key, lo, hi, step = 1, after, obj = settings, fmt = v => v) => ({ label, val: () => fmt(obj[key]), adj: d => { obj[key] = clamp(round(obj[key] + d * step), lo, hi); if (obj === settings) saveSettings(); after?.(); } });
const flag = (label, key, after, obj = settings) => ({ label, val: () => (obj[key] ? 'sim' : 'não'), adj: () => { obj[key] = !obj[key]; if (obj === settings) saveSettings(); after?.(); } });
const pick = (label, key, list, after, obj = settings) => ({ label, val: () => list[obj[key]], adj: d => { obj[key] = (obj[key] + d + list.length) % list.length; if (obj === settings) saveSettings(); after?.(); } });
const page = (title, rows) => openMenu(title, [...rows, { label: 'Voltar', act: settingsMenu }], footer(), settingsMenu);
const applyAll = () => { applyHud(); applyShadows(); applyQuality(); cam.dist = settings.camDist; };

function settingsMenu() {
  openMenu('Configurações', [
    { label: 'Jogabilidade', act: gameplayMenu },
    { label: 'Gráficos', act: graphicsMenu },
    { label: 'Áudio', act: audioMenu },
    { label: 'Mundo', act: worldMenu },
    { label: 'Desenvolvedor', act: devMenu },
    hint({ label: 'Restaurar padrões', act: () => { resetSettings(); applyAll(); settingsMenu(); } }, 'Volta todas as configurações ao original (o menu de desenvolvedor não é afetado)'),
    { label: 'Voltar', act: pauseMenu },
  ], footer(), pauseMenu);
}
const gameplayMenu = () => page('Jogabilidade', [
  hint(num('Sensibilidade do mouse', 'sens', 1, 10), 'Velocidade de giro da câmera'),
  flag('Inverter câmera', 'invert'),
  hint(num('Distância da câmera', 'camDist', 4, 10, 0.5, () => { cam.dist = settings.camDist; }), 'Também dá para ajustar com a roda do mouse'),
  hint(flag('Dicas de controle', 'tips'), 'Mostra os controles ao começar'),
]);
const graphicsMenu = () => page('Gráficos', [
  hint(pick('Qualidade', 'quality', ['baixa', 'média', 'alta'], applyQuality), 'Resolução e brilho (bloom). Baixa ajuda em computadores fracos'),
  num('Campo de visão', 'fov', 50, 90, 5, applyQuality),
  flag('Sombras', 'shadows', applyShadows),
  flag('Brilho (bloom)', 'bloom', applyQuality),
  pick('Partículas', 'particles', ['reduzidas', 'normais']),
  pick('Névoa', 'fog', ['leve', 'suave', 'normal', 'densa']),
  flag('Mostrar HUD', 'hud', applyHud),
  flag('Mostrar FPS', 'fps'),
]);
const audioMenu = () => page('Áudio', [
  num('Volume geral', 'volume', 0, 10),
  num('Música', 'music', 0, 10),
  num('Efeitos', 'sfx', 0, 10),
  hint(num('Ambiente', 'ambience', 0, 10), 'Vento e chuva'),
]);
const worldMenu = () => page('Mundo', [
  pick('Clima', 'weather', ['automático', 'desligado']),
  pick('Horário', 'time', TIMES),
  hint(pick('Duração do dia', 'dayLen', ['2 min', '5 min', '10 min']), 'Quanto dura um dia completo, de manhã até a noite'),
]);
const devMenu = () => page('Desenvolvedor', [
  hint(flag('Voar', 'fly', null, dev), 'WASD move na direção da câmera, Espaço sobe, Shift desce. Sem colisão'),
  num('Velocidade de voo', 'flySpeed', 4, 60, 4, null, dev),
  hint(flag('Sem queda', 'safe', null, dev), 'Cair não reinicia: você volta ao último lugar em que pisou'),
  num('Velocidade', 'speed', 0.5, 3, 0.5, null, dev, v => v + 'x'),
  num('Gravidade', 'gravity', 0.25, 2, 0.25, null, dev, v => v + 'x'),
  num('Força do pulo', 'jump', 0.5, 3, 0.25, null, dev, v => v + 'x'),
  num('Hora do dia', 'hour', 0, 23, 1, () => { game.tod = ((dev.hour - 6) / 24 + 1) % 1; }, dev, v => v + ' h'),
  flag('Congelar horário', 'freezeTime', null, dev),
  pick('Forçar clima', 'forced', ['automático', 'limpo', 'névoa', 'chuva', 'tempestade'], () => forceWeather(dev.forced), dev),
  num('Ilha de destino', 'island', 0, islands.length - 1, 1, null, dev, v => `${v + 1} · ${NAMES[v]}`),
  hint({ label: 'Teleportar', act: () => { const k = dev.island; player.cp = k; lightShrine(k); spawnAt(k); resume(); } }, 'Vai para a ilha escolhida e define o checkpoint lá'),
  hint({ label: 'Coletar tudo', act: () => { collectAll(); } }, 'Pega todos os fragmentos de luz'),
]);

// ------------------------------------------------------------ input
addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (game.state === 'pause') {
    if (e.code === 'Escape' && performance.now() - pausedAt < 400) return;   // same Esc that released the pointer
    return menuKey(e);
  }
  if (e.repeat) return;
  keys[e.code] = true;
  if (game.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) return start();
  if (game.state === 'play') {
    if (e.code === 'Space') player.jumpBuf = 0.14;
    if (e.code === 'Escape' || e.code === 'KeyP') pause();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; pause(); });
canvas.addEventListener('mousedown', () => {
  if (game.state === 'title') start();
  else if (game.state === 'play') { if (!locked()) lock(); dragging = true; }
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', e => {
  if (game.state !== 'play' || !(locked() || dragging)) return;
  const k = 0.0005 * settings.sens;
  cam.yaw -= e.movementX * k;
  cam.pitch = clamp(cam.pitch + e.movementY * k * (settings.invert ? -1 : 1), -0.25, 1.15);
});
addEventListener('wheel', e => { if (game.state === 'play') cam.dist = clamp(cam.dist + e.deltaY * 0.004, 4, 10); });
document.addEventListener('pointerlockchange', () => { if (!locked()) pause(); });

// ------------------------------------------------------------ character
new FBXLoader().load(characterUrl, fbx => {
  attachCharacter(fbx);
  loadingText(null);
  game.state = 'title';
  showTitle(true);
}, undefined, err => {
  console.error(err);
  loadingText('não foi possível carregar assets/character.fbx');
});

// ------------------------------------------------------------ loop
const fps = { n: 0, t: 0, el: document.querySelector('#fps') };
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
  const t = (U.time.value += dt);
  const playing = game.state === 'play', paused = game.state === 'pause';
  if (playing) game.gameT += dt;

  updateMovers(game.gameT);
  if (playing) { updatePlayer(dt); updateFade(dt); }
  else if (!paused && fade.phase === 'in') updateFade(dt * 0.5);
  if (!paused) updateAnim(dt);
  updateCamera(dt, player);
  if (playing || paused) setGauge(player.pos.y, player.cp);
  animateObjects(t, dt, player.cp, !paused);
  if (!paused) updateFx(dt, player.pos);
  updateWeather(dt, playing);
  if (TIME_TOD[settings.time] !== null) game.tod = TIME_TOD[settings.time];   // fixed time of day
  else if (playing && !dev.freezeTime) game.tod = (game.tod + dt / DAYS[settings.dayLen]) % 1;
  const alt = updateAtmosphere(t, dt, player.pos, TOP, game.tod);
  bloom.strength = lerp(0.7, 0.32, game.day);   // lanterns and crystals glow more at night
  grade.uniforms.uFadeCol.value.copy(scene.fog.color).multiplyScalar(0.88);
  grade.uniforms.uTime.value = t;
  updateAudio(alt, paused);
  composer.render();
  fps.n++; fps.t += dt;
  if (fps.t > 0.5) { fps.el.textContent = settings.fps ? Math.round(fps.n / fps.t) + ' fps' : ''; fps.n = 0; fps.t = 0; }
}
requestAnimationFrame(frame);
