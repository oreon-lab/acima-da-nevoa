// Entry point: builds the world, loads the character, handles game states / input / menus and runs the loop.
import '@fontsource/poppins/latin-200.css';
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import characterUrl from '../assets/ninja.glb?url';
import { prepareCharacter } from './game/characterAsset.js';
import { combat } from './game/combatRules.js';
import { buildCombat, resetCombat, respawnCombat, defeatAllEnemies, reviveAllEnemies, swordStrike, assistAttackYaw, updateCombat, updateCombatHud, enemies } from './game/combat.js';
import { canvas, scene, camera, renderer, U, game, keys } from './core.js';
import { settings, saveSettings, resetSettings, dev, TIMES, TIME_TOD, DAYS, NAMES, ROMAN, DEFAULT_BINDS, useInstanteNames } from './config.js';
import { clamp, lerp, damp } from './utils.js';
import { updateAtmosphere, applyShadows } from './render/atmosphere.js';
import { composer, grade, bloom, applyQuality } from './render/post.js';
import * as THREE from 'three';
import { buildLevel } from './procedural/level.js';
import { buildInstante, updateInstante, updatePieces, applyInstanteRun, instanteGoal, instantePrompt, welcome, instante } from './procedural/instante.js';
import { world, worldUrl, trailerMode } from './mode.js';
import { startCrossing, updateCrossing, crossing } from './game/crossing.js';
import { PULL, worldMat } from './procedural/materials.js';
import { whale } from './procedural/objects/whale.js';
import { WORLD_REVISION } from './procedural/course.js';
import { updateRouteMarks } from './procedural/objects/routeMarks.js';
import { resetGuide, updateGuide, tutorial } from './game/guide.js';
import { restorationTarget } from './game/journeyRules.js';
import { islands, secrets, pickups, summit, colliders, near, updrafts, ponds, updateMovers, clearWorld } from './procedural/world.js';
import { animateObjects, animateCore, lightShrine, resetShrines, loadProps } from './procedural/objects/index.js';
import { updateFx } from './fx/particles.js';
import { updateFauna } from './fx/fauna.js';
import { updateWeather, forceWeather } from './fx/weather.js';
import { player, hooks, collectAll, attachCharacter, spawnAt, updatePlayer, updateAnim, updateFade, startRespawn, fade, requestAttack, requestDash, toggleWeapons, receiveHit, setPlayerVisible, rig } from './game/player.js';
import { cam, free, mapCam, finaleCam, startFinaleCamera, stopFinaleCamera, startFree, updateCamera, orbitCamera, updateCameraInput, recenterCamera, toggleView } from './game/camera.js';
import { startCutscene, updateCutscene, cutscene, seekCutscene, beat } from './game/cutscene.js';
import { trailer } from './game/trailer.js';
import { initAudio, updateAudio, updateWhaleVoice, glideSound, tone } from './game/audio.js';
import { carrierPoint } from './procedural/whaleRoute.js';
import { whaleVoice } from './procedural/objects/whaleModel.js';
import { ACTIONS, pad, pollPad, keyName, cap } from './game/input.js';
import { save, ghost, loadSave, persist, newRun, saveGhost, fmtTime, useInstanteSave } from './game/progress.js';
import { initGhost, record, updateGhost } from './game/ghost.js';
import { setCheats, toggleCheats, cheatsOpen } from './game/cheatPanel.js';
import { initTutorial, startTutorial, endTutorial, updateTutorial } from './game/tutorial.js';
import { drawMapOverlay } from './game/map.js';
import { drawMinimap } from './game/minimap.js';
import { addInteractables, pickInteractable, showPrompt } from './game/interactables.js';
import { setCount, initGauge, setGauge, showCount, areaTitle, showTitle, loadingText, openMenu, setTabs, closeMenu, menuKey, refresh, setTimer } from './game/ui.js';

const persistent = new Set(scene.children);   // what exists before a world is built (sky, lights, player, effects…)
const level = world.instante ? buildInstante() : buildLevel();
hooks.strike = (actor, swing) => { swordStrike(actor, swing); if (trailer.on) trailer.sound('slice'); };
hooks.aim = assistAttackYaw;
hooks.respawn = respawnCombat;
loadingText('carregando árvores, ruínas e objetos…', 0.2);
const propsReady = loadProps().then(() => loadingText('carregando o personagem…', 0.6)).catch(err => { console.error('props', err); if (trailerMode !== null) throw err; });
let TOP = world.instante ? 12 : islands[islands.length - 1].y;   // O Instante has no climb: its atmosphere is fixed
const worldVersion = () => `${WORLD_REVISION}.${islands.length}.${secrets.length}.${pickups.length}.${Math.round(TOP * 100)}`;
function instanteLook() {   // the other side: its own title, no height gauge
  document.body.classList.add('instante');
  document.querySelector('#title .t-kicker').textContent = 'do outro lado';
  document.querySelector('#title .t-main').textContent = 'O Instante';
  document.querySelector('#title .t-sub').textContent = 'o mundo parado no momento em que foi arrancado';
}
if (world.instante) instanteLook();
loadSave(worldVersion(), islands.length, pickups.length, -1, level.compatibleVersions);
// everything that offers an interact prompt registers a source here (see game/interactables.js)
addInteractables(pos => {
  if (world.instante) return instantePrompt();
  return [];
});
const interactHere = () => pickInteractable(player.pos, player.yaw);
initGauge(islands.map(i => i.y));

// Crossing over (called from the black inside the horizon, see crossing.js): the journey is saved, its world taken
// down, O Instante built into the same arrays, and a fresh run there begun. Nothing is visible while it happens.
function enterInstante() {
  useInstanteSave();
  for (const o of [...scene.children]) {
    if (persistent.has(o)) continue;
    scene.remove(o);
    o.traverse(n => { if (n.geometry?.attributes.position?.count > 20000) n.geometry.dispose(); });   // the big merged meshes
  }
  clearWorld(); enemies.length = 0; whale.pose = null;
  PULL.uPull.value.w = -1000; PULL.uFocus.value.w = 0; worldMat.side = THREE.FrontSide; worldMat.needsUpdate = true;
  grade.uniforms.uLens.value = 0; grade.uniforms.uGray.value = 0; grade.uniforms.uGlitch.value = 0;
  rig.traverse(o => { if (o.isMesh) o.castShadow = true; });   // the cutscene turned every shadow off
  forceWeather(1);
  world.instante = true; useInstanteNames(); instanteLook();
  const built = buildInstante();
  TOP = 12;
  loadSave(worldVersion(), islands.length, pickups.length, -1, built.compatibleVersions);
  newRun();
  applyRun();
}
cutscene.onThrough = () => startCrossing(enterInstante);

// put the world in the state of the saved run (also used for a new journey)
function applyRun() {
  stopFinaleCamera(); resetGuide();
  resetCombat();
  document.body.classList.remove('ending');
  resetShrines();
  for (let i = 0; i <= save.cp; i++) lightShrine(i);
  pickups.forEach((k, i) => { k.got = save.got.includes(i); k.g.visible = !k.got; k.g.scale.setScalar(1); k.anim = 0; });
  if (world.instante) { save.glide = true; applyInstanteRun(); }
  player.cp = save.cp; player.collected = save.got.length;
  summit.reached = save.done;
  game.restoration = restorationTarget(player.collected, save.done);
  setCount(player.collected, pickups.length);
  document.querySelector('#count .cpl').textContent = `Checkpoint · ${ROMAN[save.cp]}`;
  spawnAt(save.cp);
}
applyRun();
const hasRun = () => save.cp > 0 || save.got.length > 0 || save.runT > 5;

const applyHud = () => { document.body.classList.toggle('nohud', !settings.hud); document.body.classList.toggle('notimer', !settings.timer); };
applyHud(); applyShadows(); applyQuality(); cam.dist = settings.camDist;
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// ------------------------------------------------------------ states
const locked = () => document.pointerLockElement === canvas;
const lock = () => { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* not available */ } };
const clearKeys = () => { for (const k in keys) keys[k] = false; };
let dragging = false, mapDrag = false, pausedAt = 0, capturing = null, shot = false;
let photoNotice = '', photoNoticeUntil = 0;

function start() {
  game.state = 'play';
  document.body.classList.add('playing');   // the HUD only exists once you are in the game
  showTitle(false);
  initAudio(); lock();
  if (world.instante && save.runT < 1) welcome(2600);
  setTimeout(() => areaTitle(player.cp, player.cp ? 'checkpoint' : ''), 1400);
  // Guidance stays attached to the current crossing, rather than disappearing before the player gets there.
}
// ------------------------------------------------------------ before the game: title → home menu → (first time: setup) → (new journey: intro) → play
const root = () => (document.body.classList.contains('home') ? homeMenu() : pauseMenu());
let introSkip = null;
function openHome() { initAudio(); showTitle(false); homeMenu(); }
function homeMenu() {
  game.state = 'pause'; document.body.classList.add('home');
  const run = hasRun();
  openMenu('Acima da névoa', [
    hint({ label: run ? 'Continuar' : 'Começar', kind: 'primary', act: begin }, run ? `Último santuário · ${NAMES[save.cp]}` : 'Uma luz para voltar'),
    ...(run ? [hint({ label: 'Nova jornada', act: confirmHome }, 'Recomeça do início; recordes e descobertas ficam salvos')] : []),
    { label: 'Configurações', kind: 'branch', act: settingsMenu },
    { label: 'Créditos', kind: 'branch', act: creditsMenu },
  ], run ? `${fmtTime(save.runT)}  ·  ${player.collected} / ${pickups.length}` : '', null, [], false, 'MENU INICIAL');
}
const confirmHome = () => openMenu('Nova jornada?', [
  { label: 'Sim, recomeçar do início', kind: 'danger', act: () => { newRun(); applyRun(); begin(); } },
  { label: 'Não', act: homeMenu },
], 'O progresso desta jornada se perde. Recorde, conquistas, álbum e habilidades ficam.', homeMenu, [], false, 'NOVA JORNADA');
const creditsMenu = () => openMenu('Créditos', [{ label: 'Voltar', act: homeMenu }], '', homeMenu, [
  'Um jogo de Vitor, feito com Three.js e Vite',
  'Trailer · música de Scott Buckley (CC BY 4.0)',
  'Trailer · efeitos sonoros de Kenney (CC0)',
], false, 'CRÉDITOS');
const setupDone = () => { try { return localStorage.getItem('nevoa-setup') === '1'; } catch { return true; } };
function setupMenu(next) {
  if (!(navigator.hardwareConcurrency > 4)) { settings.quality = 1; saveSettings(); applyQuality(); }   // a modest machine starts on medium
  openMenu('Antes de começar', [
    hint(pick('Qualidade gráfica', 'quality', ['baixa', 'média', 'alta'], applyQuality), 'Escolhida pelo seu computador; baixa ajuda em máquinas mais fracas'),
    num('Volume geral', 'volume', 0, 10),
    hint(flag('Dicas de controle', 'tips'), 'Mostra os controles ao longo da primeira ilha'),
    { label: 'Tudo certo', kind: 'primary', act: () => { try { localStorage.setItem('nevoa-setup', '1'); } catch { /* ignore */ } next(); } },
  ], pad.connected ? 'Controle detectado · A pula, o analógico move' : 'Teclado e mouse · um controle é reconhecido assim que você o conectar', null,
  ['Você pode mudar tudo isso depois, em Configurações.'], false, 'PRIMEIRA VEZ');
}
function begin() {
  const go = () => { closeMenu(); document.body.classList.remove('home'); if (!world.instante && !hasRun()) intro(); else start(); };
  setupDone() ? go() : setupMenu(go);
}
// opening scene on a new journey: four lines, one after the other; any confirm skips
function intro() {
  game.state = 'intro'; clearKeys();
  const n = document.querySelector('#intro'), end = () => { clearTimeout(t); n.classList.remove('show'); introSkip = null; start(); }, t = setTimeout(end, 16000);
  introSkip = end; n.classList.add('show');
}

function pause() {
  if (game.state !== 'play' || trailerMode !== null) return;   // a trailer render is never interrupted by a lost focus
  game.state = 'pause'; pausedAt = performance.now();
  document.body.classList.add('paused');
  clearKeys(); glideSound(0); persist();
  document.exitPointerLock?.();
  pauseMenu();
  showCount(true);
}
function resume() {
  if (document.body.classList.contains('home')) return begin();
  stopFinaleCamera();
  document.body.classList.remove('paused');
  game.state = 'play'; capturing = null; setMapView(false);
  closeMenu(); showCount(false);
  lock();
}
function enterPhoto() {
  if (game.state !== 'play') return;
  game.state = 'photo'; clearKeys(); glideSound(0);
  startFree();
  document.body.classList.add('photo');
}
function exitPhoto() {
  game.state = 'play'; clearKeys();
  document.body.classList.remove('photo');
  applyQuality();   // restores the field of view
}
function newJourney() {
  newRun(); applyRun();
  fade.phase = 'in'; fade.t = 1;
  setTimeout(() => areaTitle(0, ''), 900);
}

// the rift: the last island's first step starts the black hole cutscene (see cutscene.js). O Instante ends when its
// lighthouse is rewound instead (instante.js), then shows the closing card.
hooks.rift = () => {
  if (world.instante) return;
  if (game.state !== 'play') return;
  game.state = 'cutscene'; clearKeys(); glideSound(0);
  document.exitPointerLock?.();
  player.vel.set(0, 0, 0);
  startCutscene();
};
// O Instante's closing card (the only one: the rift carries straight on into the crossing); confirm goes back
instante.onEnd = () => {
  clearKeys(); glideSound(0); document.exitPointerLock?.();
  save.done = true; persist();
  document.querySelector('#cine .cap').classList.add('show'); cutscene.done = true;
};
const crossOver = () => { location.href = worldUrl(false); };
hooks.finale = () => completeJourney();
// end of the journey: achievements, best time + ghost, then the end screen
function completeJourney() {
  const t = save.runT, fair = !save.dirty;
  save.done = true;
  const best = fair && (save.best === null || t < save.best);
  if (best) { save.best = t; save.records[save.ver] = t; saveGhost(save.rec, t); }
  persist();
  finaleBest = best;
  game.state = 'ending'; clearKeys(); glideSound(0);
  document.body.classList.add('ending');
  document.exitPointerLock?.();
  startFinaleCamera();
}
let finaleBest = false;
function finishEnding() {
  document.body.classList.remove('ending');
  endScreen(finaleBest);
}
function endScreen(best) {
  if (game.state === 'photo') exitPhoto();
  if (game.state !== 'play' && game.state !== 'ending' && game.state !== 'pause') return;
  game.state = 'pause'; pausedAt = performance.now(); clearKeys(); glideSound(0);
  document.body.classList.add('paused');
  document.exitPointerLock?.();
  const back = () => endScreen(best);
  openMenu('Acima da névoa', [
    { label: 'Continuar explorando', act: resume },
    { label: 'Nova jornada', act: () => { resume(); newJourney(); } },
    { label: 'Mapa', kind: 'branch', act: () => mapMenu(back) },
  ], 'O farol voltou a brilhar', resume, [
    `tempo  ${fmtTime(save.runT)}${save.dirty ? '  (menu de desenvolvedor usado: não vale recorde)' : best ? '  ·  novo recorde!' : save.best !== null ? `  ·  recorde ${fmtTime(save.best)}` : ''}`,
    `fragmentos de luz  ${player.collected} / ${pickups.length}   ·   quedas  ${save.falls}`,
  ], false, 'JORNADA CONCLUÍDA');
  showCount(true);
}

// ------------------------------------------------------------ menus
const footer = () => `◆  ${player.collected} / ${pickups.length}   ·   ${fmtTime(save.runT)}`;
function pauseMenu() {
  openMenu('Pausa', [
    hint({ label: 'Continuar', kind: 'primary', act: resume }, 'Voltar ao jogo'),
    hint({ label: 'Modo foto', act: () => { resume(); enterPhoto(); } }, 'Câmera livre para salvar fotos do mundo'),
    hint({ label: 'Mapa', kind: 'branch', act: () => mapMenu(pauseMenu) }, 'As ilhas que você já visitou'),
    hint({ label: 'Configurações', kind: 'branch', act: settingsMenu }, 'Jogabilidade, controles, gráficos, áudio e mundo'),
    hint({ label: 'Jornada', kind: 'branch', act: journeyMenu }, 'Voltar ao checkpoint ou começar uma nova jornada'),
  ], footer(), resume, [NAMES[currentIsland()]], false, 'MENU DE PAUSA');
}
function journeyMenu() {
  openMenu('Jornada', [
    hint({ label: 'Voltar ao checkpoint', act: () => { resume(); startRespawn(); } }, 'Retorna ao último santuário aceso'),
    hint({ label: 'Nova jornada', act: confirmNew }, 'Recomeça do início; recordes e descobertas ficam salvos'),
    { label: 'Voltar', act: pauseMenu },
  ], footer(), pauseMenu, [], false, 'JORNADA');
}
const confirmNew = () => openMenu('Nova jornada?', [
  { label: 'Sim, recomeçar do início', kind: 'danger', act: () => { resume(); newJourney(); } },
  { label: 'Não', act: journeyMenu },
], 'O progresso desta jornada se perde. Recorde, conquistas, álbum e habilidades ficam.', journeyMenu, [], false, 'JORNADA');

// the island you are on (or closest to)
function currentIsland() {
  if (player.ground?.island !== undefined) return player.ground.island;
  let best = 0, bd = Infinity;
  islands.forEach((is, i) => { const d = Math.max(0, Math.hypot(player.pos.x - is.x, player.pos.z - is.z) - is.R) + Math.abs(player.pos.y - is.y) * 0.5; if (d < bd) { bd = d; best = i; } });
  return best;
}
// map: the camera flies out from where it is to orbit the current island; ‹ › picks another island
// only islands you have set foot on can be looked at; the rest stay locked (and veiled) until you get there
const seenIsland = i => save.visited.includes('i' + i);
let mapBack = pauseMenu;
function mapMenu(back = pauseMenu) {
  mapBack = back;
  const here = currentIsland();
  Object.assign(mapCam, { on: true, focus: seenIsland(here) ? here : player.cp, yaw: cam.yaw, pitch: 0.85, zoom: 1, dist: cam.dist });
  mapCam.t.copy(player.pos);
  setMapView(true);
  const found = secrets.filter(s => save.visited.includes('s' + s.secret)).length;
  openMenu('Mapa', [
    { label: 'Ilha', val: () => `${ROMAN[mapCam.focus]} · ${NAMES[mapCam.focus]}`, adj: d => { let f = mapCam.focus; do f = (f + d + islands.length) % islands.length; while (!seenIsland(f) && f !== mapCam.focus); mapCam.focus = f; } },
    { label: 'Voltar', act: closeMap },
  ], `Arraste para girar · roda para aproximar · ${islands.filter((_, i) => seenIsland(i)).length}/${islands.length} ilhas · ${found}/${secrets.length} segredos`, closeMap, [], true, 'EXPLORAÇÃO');
}
function setMapView(on) { mapCam.on = game.mapView = on; document.body.classList.toggle('mapview', on); }
function closeMap() { setMapView(false); mapBack(); }
function bindKey(a, code) {
  const b = settings.binds, other = Object.keys(b).find(k => k !== a && b[k] === code);
  if (other) b[other] = b[a];   // swap, so no action is left without a key
  b[a] = code; saveSettings();
}
function controlsMenu(back) {
  openMenu('Controles', [
    hint({ label: 'Teclado', kind: 'branch', act: () => keyboardMenu(() => controlsMenu(back)) }, 'Altere as teclas de movimento e ações'),
    hint({ label: 'Mouse e controle', kind: 'branch', act: () => devicesMenu(() => controlsMenu(back)) }, 'Câmera, fotografia e comandos do gamepad'),
    { label: 'Voltar', act: back },
  ], 'Escolha um dispositivo para ver os comandos', back, [], false, 'CONFIGURAÇÕES');
}
function keyboardMenu(back) {
  openMenu('Teclado', [
    ...ACTIONS.map(([a, label]) => hint({ label, val: () => (capturing === a ? 'pressione uma tecla…' : keyName(settings.binds[a])), act: () => { capturing = a; refresh(); } },
      'Enter ou clique para trocar a tecla  ·  Esc cancela  ·  as setas também movem')),
    hint({ label: 'Teclas padrão', act: () => { settings.binds = { ...DEFAULT_BINDS }; saveSettings(); refresh(); } }, 'Volta todas as teclas ao original'),
    { label: 'Voltar', act: () => { capturing = null; back(); } },
  ], 'Selecione uma ação para atribuir outra tecla', () => { capturing = null; back(); }, [], false, 'CONTROLES');
}
function devicesMenu(back) {
  openMenu('Mouse e controle', [
    hint({ label: 'Mouse', val: () => 'câmera / ataque' }, 'Clique esquerdo: atacar · mouse: câmera · roda: distância da câmera'),
    hint({ label: 'Controle', val: () => (pad.connected ? 'conectado' : 'desconectado') }, 'Analógico esquerdo: mover · direito: câmera (clique R3: câmera atrás do personagem) · A: pular/planar · B: interagir · X: atacar · Y: sacar/guardar · LB/RB: girar · Start: pausa · Select: foto (LT/RT: zoom)'),
    { label: 'Voltar', act: back },
  ], 'Planar: no ar, aperte pular de novo e segure (liberado nas Ruínas do Vento)', back, [], false, 'CONTROLES');
}

// settings: a list of categories, each with its own page of rows (label on the left, value on the right)
const round = x => Math.round(x * 100) / 100;
const hint = (item, text) => Object.assign(item, { hint: text });
const num = (label, key, lo, hi, step = 1, after, obj = settings, fmt = v => v) => ({ label, val: () => fmt(obj[key]), frac: () => (obj[key] - lo) / (hi - lo), adj: d => { obj[key] = clamp(round(obj[key] + d * step), lo, hi); if (obj === settings) saveSettings(); after?.(); } });
const flag = (label, key, after, obj = settings) => ({ label, val: () => (obj[key] ? 'sim' : 'não'), on: () => !!obj[key], adj: () => { obj[key] = !obj[key]; if (obj === settings) saveSettings(); after?.(); } });
const pick = (label, key, list, after, obj = settings) => ({ label, val: () => list[obj[key]], opts: list, idx: () => obj[key], set: k => { obj[key] = k; if (obj === settings) saveSettings(); after?.(); }, adj: d => { obj[key] = (obj[key] + d + list.length) % list.length; if (obj === settings) saveSettings(); after?.(); } });
const section = label => ({ label, kind: 'section' });
// settings pages share one CS-style screen: tabs on top, headed groups of rows, live preview in the world behind
const TABS = [['Jogabilidade', () => gameplayMenu()], ['Gráficos', () => graphicsMenu()], ['Áudio', () => audioMenu()], ['Mundo', () => worldMenu()]];
const page = (title, rows) => {
  openMenu(title, [...rows, { label: 'Voltar', act: settingsMenu }], 'As mudanças valem na hora', settingsMenu, [], false, 'CONFIGURAÇÕES', true);
  setTabs(TABS, TABS.findIndex(t => t[0] === title));
};
const applyAll = () => { applyHud(); applyShadows(); applyQuality(); cam.dist = settings.camDist; };
const cheat = () => { save.dirty = true; persist(); };   // dev tools: this run no longer counts for the best time

function settingsMenu() {
  openMenu('Configurações', [
    { label: 'Jogabilidade', kind: 'branch', act: gameplayMenu },
    { label: 'Controles', kind: 'branch', act: () => controlsMenu(settingsMenu) },
    { label: 'Gráficos', kind: 'branch', act: graphicsMenu },
    { label: 'Áudio', kind: 'branch', act: audioMenu },
    { label: 'Mundo', kind: 'branch', act: worldMenu },
    hint({ label: 'Restaurar padrões', kind: 'muted', act: () => { resetSettings(); applyAll(); settingsMenu(); } }, 'Volta todas as configurações ao original, inclusive as teclas (o menu de desenvolvedor não é afetado)'),
    { label: 'Voltar', act: root },
  ], footer(), root, [], false, document.body.classList.contains('home') ? 'MENU INICIAL' : 'MENU DE PAUSA');
}
const gameplayMenu = () => page('Jogabilidade', [
  section('Câmera'),
  hint(num('Sensibilidade do mouse', 'sens', 1, 10), 'Velocidade de giro da câmera (mouse e analógico)'),
  flag('Inverter câmera', 'invert'),
  hint(flag('Primeira pessoa', 'firstPerson'), 'Também alterna com V (L3 no controle)'),
  hint(num('Distância da câmera', 'camDist', 4, 10, 0.5, () => { cam.dist = settings.camDist; }), 'Também dá para ajustar com a roda do mouse'),
  section('Interface'),
  hint(flag('Dicas de controle', 'tips'), 'Mostra os controles ao começar'),
  hint(flag('Cronômetro', 'timer', applyHud), 'Tempo da jornada e recorde, no canto superior direito'),
  hint(flag('Fantasma do recorde', 'ghost'), 'Uma silhueta refaz o seu melhor percurso junto com você'),
]);
const graphicsMenu = () => page('Gráficos', [
  section('Geral'),
  hint(pick('Qualidade', 'quality', ['baixa', 'média', 'alta'], applyQuality), 'Resolução e brilho (bloom). Baixa ajuda em computadores fracos'),
  num('Campo de visão', 'fov', 50, 90, 5, applyQuality),
  flag('Mostrar HUD', 'hud', applyHud),
  flag('Mostrar FPS', 'fps'),
  section('Qualidade avançada'),
  flag('Sombras', 'shadows', applyShadows),
  flag('Brilho (bloom)', 'bloom', applyQuality),
  pick('Partículas', 'particles', ['reduzidas', 'normais']),
  pick('Névoa', 'fog', ['leve', 'suave', 'normal', 'densa']),
]);
const audioMenu = () => page('Áudio', [
  num('Volume geral', 'volume', 0, 10),
  hint(num('Música', 'music', 0, 10), 'Muda com o horário, o clima e a altitude'),
  num('Efeitos', 'sfx', 0, 10),
  hint(num('Ambiente', 'ambience', 0, 10), 'Vento e chuva'),
]);
const worldMenu = () => page('Mundo', [
  pick('Clima', 'weather', ['automático', 'desligado']),
  pick('Horário', 'time', TIMES),
  hint(pick('Duração do dia', 'dayLen', ['2 min', '5 min', '10 min']), 'Quanto dura um dia completo, de manhã até a noite'),
]);
function recoverHealth() {
  cheat(); combat.hp = 3; combat.hurt = 0; combat.invulnerable = 1.5;
}
function resetDeveloperCheats() {
  Object.assign(dev, { fly:false, flySpeed:14, safe:false, speed:1, gravity:1, jump:1, freezeTime:false, hour:9, forced:0, island:player.cp });
  player.vel.set(0,0,0); forceWeather(0);
}
// cheats live in a floating window (F2), not in the menus: the game keeps running while it is open
const warp = k => { cheat(); player.cp = save.cp = k; for (let i = 0; i <= k; i++) lightShrine(i); };
setCheats([
  ['Geral', [
    hint(flag('Invencibilidade', 'safe', cheat, dev), 'Você não recebe dano; quedas retornam ao último chão seguro'),
    hint(flag('Voo livre', 'fly', () => { cheat(); player.vel.set(0, 0, 0); }, dev), 'WASD move · Espaço sobe · Shift desce · atravessa obstáculos'),
    num('Velocidade de voo', 'flySpeed', 4, 60, 4, null, dev),
    hint({ label: 'Recuperar vida', act: recoverHealth }, 'Restaura os três corações'),
    hint({ label: 'Restaurar cheats', act: resetDeveloperCheats }, 'Desliga voo e invencibilidade e restaura física e clima; habilidades aprendidas ficam'),
  ]],
  ['Combate', [
    { label: 'Vencer todos os inimigos', act: () => { cheat(); defeatAllEnemies(); } },
    { label: 'Reviver todos os inimigos', act: () => { cheat(); reviveAllEnemies(); } },
  ]],
  ['Movimento', [
    num('Velocidade', 'speed', 0.5, 3, 0.5, cheat, dev, v => v + 'x'),
    num('Gravidade', 'gravity', 0.25, 2, 0.25, cheat, dev, v => v + 'x'),
    num('Força do pulo', 'jump', 0.5, 3, 0.25, cheat, dev, v => v + 'x'),
    hint(flag('Planar liberado', 'glide', () => { cheat(); persist(); }, save), 'Normalmente aprendido ao chegar nas Ruínas do Vento'),
  ]],
  ['Mundo', [
    num('Hora do dia', 'hour', 0, 23, 1, () => { game.tod = ((dev.hour - 6) / 24 + 1) % 1; }, dev, v => v + ' h'),
    flag('Congelar horário', 'freezeTime', null, dev),
    pick('Forçar clima', 'forced', ['automático', 'limpo', 'névoa', 'chuva', 'tempestade'], () => forceWeather(dev.forced), dev),
  ]],
  ['Teleporte', [
    num('Ilha de destino', 'island', 0, islands.length - 1, 1, null, dev, v => `${v + 1} · ${NAMES[v]}`),
    hint({ label: 'Teleportar', act: () => { const k = dev.island; warp(k); spawnAt(k); } }, 'Vai para a ilha escolhida e define o checkpoint lá'),
    hint({ label: 'Coletar tudo', act: () => { cheat(); collectAll(); } }, 'Pega todos os fragmentos de luz'),
    hint({ label: 'Píer da baleia', act: () => {
      warp(whale.route.owner); spawnAt(player.cp);
      player.pos.set(whale.source.x, whale.source.y, whale.source.z);
      areaTitle(player.cp, 'checkpoint');
      cam.yaw = Math.atan2(-whale.route.nx, -whale.route.nz); cam.pitch = 0.35; cam.dist = 9;
      cam.blend = 1; cam.follow.copy(player.pos); updateCamera(0, player);
    } }, 'Vai ao píer da Baleia das Brumas'),
    hint({ label: 'Prévia do buraco negro', act: () => {
      warp(islands.length - 2); spawnAt(islands.length - 1);
      cam.blend = 1; cam.follow.copy(player.pos); updateCamera(0, player);
    } }, 'Pisa na última ilha pela primeira vez e dispara a cutscene do buraco negro'),
    hint({ label: 'Prévia do encerramento', act: () => {
      warp(islands.length - 1); spawnAt(player.cp); summit.reached = false; save.done = false;
      player.pos.set(summit.pos.x, islands[player.cp].y + 0.45, summit.pos.z);
      areaTitle(player.cp, 'checkpoint');
      cam.blend = 1; cam.follow.copy(player.pos); updateCamera(0, player);
    } }, 'Vai ao altar e conclui a jornada para testar a cena final'),
  ]],
]);

// ------------------------------------------------------------ input
addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
  if (capturing) {   // rebinding: the next key (Esc cancels)
    e.preventDefault();
    if (e.code !== 'Escape') bindKey(capturing, e.code);
    capturing = null; refresh();
    return;
  }
  if (e.code === 'F2' && !e.repeat && (game.state === 'play' || cheatsOpen())) { e.preventDefault(); toggleCheats(); return; }
  if (game.state === 'pause') {
    if (e.code === 'Escape' && performance.now() - pausedAt < 400) return;   // same Esc that released the pointer
    return menuKey(e);
  }
  if (game.state === 'cutscene') {   // no control; at the end any confirm crosses over (the world is gone)
    if (cutscene.done && !e.repeat && (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape')) crossOver();
    return;
  }
  if (e.repeat) return;
  if (game.state === 'tutorial') {
    if (e.code === 'Escape' || e.code === settings.binds.tutorial) endTutorial();
    return;
  }
  if (game.state === 'ending') {
    if (e.code === 'Enter' || e.code === 'Escape' || e.code === settings.binds.pause) finishEnding();
    return;
  }
  if (game.state === 'intro') { if (['Enter', 'Escape', 'Space'].includes(e.code)) introSkip?.(); return; }
  keys[e.code] = true;
  const b = settings.binds;
  if (game.state === 'title' && (e.code === 'Enter' || e.code === b.jump)) return openHome();
  if (game.state === 'play') {
    if (e.code === b.jump) player.jumpBuf = 0.14;
    if (e.code === b.attack && !world.instante) requestAttack();   // O Instante: held, it stops time (instante.js)
    if (e.code === b.equip && !world.instante) toggleWeapons();
    if (e.code === b.view) toggleView();
    if (e.code === b.dash) requestDash();
    if (e.code === 'Escape' || e.code === b.pause) pause();
    else if (e.code === b.photo) enterPhoto();
    else if (e.code === b.tutorial) startTutorial(tutorial);
    else if (e.code === b.interact) interactHere()?.use?.();
  } else if (game.state === 'photo') {
    if (e.code === 'Escape' || e.code === b.photo) exitPhoto();
    else if (e.code === 'Enter') shot = true;
    else if (e.code === 'KeyH') document.body.classList.toggle('nohint');
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { clearKeys(); if (game.state === 'photo') exitPhoto(); endTutorial(); pause(); });
canvas.addEventListener('mousedown', e => {
  if (game.state === 'title') openHome();
  else if (game.state === 'intro') introSkip?.();
  else if (game.state === 'play' || game.state === 'photo') {
    if (game.state === 'play' && e.button === 0) { if (world.instante) instante.mouseStop = true; else requestAttack(); }
    if (!locked()) lock(); dragging = true;
  }
});
document.querySelector('#pause').addEventListener('mousedown', e => { if (mapCam.on && !e.target.closest('.menu-panel')) mapDrag = true; });
addEventListener('mouseup', () => { dragging = mapDrag = false; instante.mouseStop = false; });
addEventListener('mousemove', e => {
  if (mapCam.on && mapDrag) { mapCam.yaw -= e.movementX * 0.006; mapCam.pitch = clamp(mapCam.pitch + e.movementY * 0.004, 0.3, 1.45); return; }
  if (!(locked() || dragging)) return;
  const k = 0.0005 * settings.sens;
  if (game.state === 'play') {
    orbitCamera(-e.movementX * k, e.movementY * k * (settings.invert ? -1 : 1));
  } else if (game.state === 'photo') {
    free.yaw -= e.movementX * k;
    free.pitch = clamp(free.pitch - e.movementY * k * (settings.invert ? -1 : 1), -1.5, 1.5);
  }
});
addEventListener('wheel', e => {
  if (game.state === 'play') { cam.dist = settings.camDist = clamp(round(cam.dist + e.deltaY * 0.004), 4, 10); saveSettings(); }
  else if (game.state === 'photo') free.fov = clamp(free.fov + e.deltaY * 0.02, 15, 100);
  else if (mapCam.on) mapCam.zoom = clamp(mapCam.zoom * (1 + e.deltaY * 0.001), 0.35, 3);
});
document.addEventListener('pointerlockchange', () => {
  if (locked()) return;
  if (game.state === 'photo') exitPhoto();
  endTutorial(); pause();
});

// unplugging mid-game pauses instead of leaving the character running
addEventListener('gamepaddisconnected', () => { if (game.state === 'play') pause(); });

// gamepad: the same actions, plus d-pad / A / B for the menus
const PAD_MENU = { up: 'ArrowUp', down: 'ArrowDown', left2: 'ArrowLeft', right2: 'ArrowRight', jump: 'Enter', back2: 'Escape' };
function handlePad() {
  pollPad();
  const P = pad.pressed;
  if (game.state === 'title') { if (P.jump || P.pause) openHome(); }
  else if (game.state === 'intro') { if (P.jump || P.back2 || P.pause) introSkip?.(); }
  else if (game.state === 'play') {
    if (P.jump) player.jumpBuf = 0.14;
    if (P.attack && !world.instante) requestAttack();
    if (P.equip && !world.instante) toggleWeapons();
    if (P.recenter) recenterCamera(player.yaw);
    if (P.view) toggleView();
    if (P.dash) requestDash();
    if (P.pause) pause(); else if (P.photo) enterPhoto(); else if (P.back2) interactHere()?.use?.();
  }
  else if (game.state === 'photo') { if (P.photo || P.back2 || P.pause) exitPhoto(); else if (P.jump) shot = true; }
  else if (game.state === 'ending') { if (P.jump || P.back2 || P.pause) finishEnding(); }
  else if (game.state === 'cutscene') { if (cutscene.done && (P.jump || P.pause)) crossOver(); }
  else if (game.state === 'pause' && !capturing) {
    if (P.pause) return resume();
    for (const k in PAD_MENU) if (P[k]) menuKey({ code: PAD_MENU[k] });
  }
}

// ------------------------------------------------------------ character (loader fetched on demand, like the model)
import('three/addons/loaders/GLTFLoader.js')
  .then(async ({ GLTFLoader }) => {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(characterUrl);
    const fbx = prepareCharacter(gltf.scene, gltf.animations);
    attachCharacter(fbx); initGhost(fbx); initTutorial(fbx);
    buildCombat(fbx, receiveHit, () => startRespawn(), world.instante ? [] : undefined);
    respawnCombat(player); loadingText(null);
    if (trailerMode !== null) { await propsReady; await trailer.init({ tick, clip: trailerMode }); } else { game.state = 'title'; showTitle(true); }
  })
  .catch(err => { console.error(err); loadingText('não foi possível carregar o personagem'); });

function saveShot() {
  canvas.toBlob(b => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `acima-da-nevoa-${Date.now()}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    photoNotice = 'Foto salva';
    photoNoticeUntil = performance.now() + 2000;
  });
  grade.uniforms.uFade.value = 0.6;   // a soft flash as the shutter
}

// ------------------------------------------------------------ loop
const fps = { n: 0, t: 0, el: document.querySelector('#fps') }, mapCanvas = document.querySelector('#map');
let last = performance.now(), timerTxt = '';
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 1 / 30); last = now;
  tick(dt);
}
// one step of the whole game; the trailer renderer calls it with a fixed dt, one call per output frame
function tick(dt) {
  const wdt = dt * game.timeScale;   // world time: the rift can stop it
  const t = (U.time.value += world.instante && !instante.thawed ? 0 : wdt);   // O Instante: the world's clock is stopped
  handlePad();
  const playing = game.state === 'play', paused = game.state === 'pause', photo = game.state === 'photo';
  if (playing) game.gameT += dt;
  if (trailer.on) trailer.pre(dt);

  updateCameraInput(dt);
  updateMovers(game.gameT);
  if (world.instante) updatePieces(dt);   // before the player, so a moving rock carries you
  if (playing && !trailer.on) {
    updatePlayer(dt); updateFade(dt);
    if (!save.done) { save.runT += dt; record(save.rec, save.runT, player.pos, player.yaw); }
  } else if (!paused && !photo && !trailer.on && fade.phase === 'in') updateFade(dt * 0.5);
  if (trailer.on) trailer.update(dt);
  if (photo) grade.uniforms.uFade.value = Math.max(0, grade.uniforms.uFade.value - dt * 3);
  if (!paused && !photo) updateAnim(wdt);   // photo mode freezes the pose
  if (playing) updateCombat(dt, player, fade.phase);
  updateCombatHud();
  updateGhost(save.done || game.state === 'title' ? null : ghost, save.runT, playing ? dt : 0, player.pos);
  updateCamera(dt, player);
  setPlayerVisible(!cam.first || game.state !== 'play');
  updateTutorial(dt);
  if (game.state === 'ending' && finaleCam.t >= 8) finishEnding();
  updateGuide(dt, player, save, world.instante ? instanteGoal() : null);
  if (!paused && !photo && !world.instante && !trailer.on) game.restoration = damp(game.restoration, restorationTarget(player.collected, save.done), 0.65, dt);   // the trailer sets it per shot
  showPrompt(playing ? interactHere() : null, player.pos);
  if (photo) {
    document.querySelector('#photohint').textContent = performance.now() < photoNoticeUntil ? photoNotice
      : 'WASD mover · Espaço/Shift subir/descer · mouse olhar · roda zoom · [ ] horário · Enter salvar foto · H esconder dica · Esc sair';
  }
  if (playing || paused) setGauge(player.pos.y, player.cp);
  if (world.instante) animateCore(t, wdt, player.cp, !paused);
  else { animateObjects(t, wdt, player.cp, !paused, player.pos); updateRouteMarks(player.pos); }
  if (!paused) { updateFx(wdt, player.pos); if (!world.instante) updateFauna(t); }
  updateWeather(dt, playing);
  if (photo && (keys.BracketLeft || keys.BracketRight)) game.tod = (game.tod + (keys.BracketRight ? 1 : -1) * dt * 0.05 + 1) % 1;   // scrub the time of day
  else if (TIME_TOD[settings.time] !== null) game.tod = TIME_TOD[settings.time];   // fixed time of day
  else if (playing && !dev.freezeTime) game.tod = (game.tod + dt / DAYS[settings.dayLen]) % 1;
  if (world.instante) game.tod = 0.46;   // the sun stopped low: a frozen sunset (only visible in colour inside the bubble)
  const alt = updateAtmosphere(t, dt, trailer.focus ?? (mapCam.on ? mapCam.t : player.pos), TOP, game.tod);   // shadows follow what you look at
  bloom.strength = lerp(0.7, 0.32, game.day);   // lanterns and crystals glow more at night
  grade.uniforms.uFadeCol.value.copy(scene.fog.color).multiplyScalar(0.88);
  if (world.instante) updateInstante(dt);   // after the atmosphere and the fade colour: it overrides both
  grade.uniforms.uTime.value = t;
  updateAudio(alt, paused);
  if (whale.pose) whaleVoice.level = updateWhaleVoice(dt, carrierPoint(whale.pose, 11.5, -2.6, 0), paused);
  const tt = fmtTime(save.runT) + (save.best !== null ? `  ·  recorde ${fmtTime(save.best)}` : '') + (save.dirty ? '  ·  dev' : '');
  if (tt !== timerTxt) setTimer(timerTxt = tt);
  updateCutscene(dt);
  updateCrossing(dt);   // after the cutscene: it takes over on the frame the horizon is crossed
  if (trailer.on) trailer.post();   // a trailer shot may take the camera back from the cutscene
  if (!trailer.quick) composer.render();   // the trailer seeks silently between shots
  if (shot) { shot = false; saveShot(); }
  if (playing && !world.instante) drawMinimap(camera, player);
  if (mapCam.on) drawMapOverlay(mapCanvas, camera, player, mapCam.focus, t);
  fps.n++; fps.t += dt;
  if (fps.t > 0.5) { fps.el.textContent = settings.fps ? Math.round(fps.n / fps.t) + ' fps' : ''; fps.n = 0; fps.t = 0; }
}
if (!trailerMode) requestAnimationFrame(frame);
if (import.meta.env.DEV) {   // console poking in dev only
  window.dbg = { cutscene, scene, camera, renderer, whale, free, U, cam, colliders, near, updrafts, ponds, player, save, game, settings, dev, islands, secrets, pickups, keys, spawnAt, pause, enterPhoto, combat, enemies, requestAttack, toggleWeapons, instante, step: n => { for (let i = 0; i < n; i++) tick(1 / 60); } };
  dbg.cutscene.seek = n => {   // dbg.cutscene.seek(dbg.cutscene.beat(9))
    if (!cutscene.on) {
      if (game.state !== 'play') console.warn(`dbg.cutscene.seek: o jogo está em '${game.state}' — comece (Enter) para o corte não ficar por baixo do título`);
      hooks.rift();
    }
    return seekCutscene(n);
  };
  dbg.cutscene.beat = beat;
}
