// Entry point: builds the world, loads the character, handles game states / input / menus and runs the loop.
import '@fontsource/poppins/latin-200.css';
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import characterUrl from '../assets/ninja.glb?url';
import { prepareCharacter } from './game/characterAsset.js';
import { combat } from './game/combatRules.js';
import { buildCombat, resetCombat, respawnCombat, defeatAllEnemies, reviveAllEnemies, swordStrike, assistAttackYaw, updateCombat, updateCombatHud, enemies } from './game/combat.js';
import { canvas, scene, camera, U, game, keys } from './core.js';
import { settings, saveSettings, resetSettings, dev, TIMES, TIME_TOD, DAYS, NAMES, ROMAN, DEFAULT_BINDS } from './config.js';
import { clamp, lerp, damp } from './utils.js';
import { updateAtmosphere, applyShadows } from './render/atmosphere.js';
import { composer, grade, bloom, applyQuality } from './render/post.js';
import { buildLevel } from './procedural/level.js';
import { whale } from './procedural/objects/whale.js';
import { WORLD_REVISION } from './procedural/course.js';
import { updateRouteMarks } from './procedural/objects/routeMarks.js';
import { resetGuide, updateGuide } from './game/guide.js';
import { MEMORIES, restorationTarget } from './game/journeyRules.js';
import { islands, secrets, landmarks, pickups, summit, colliders, near, updrafts, ponds, updateMovers } from './procedural/world.js';
import { animateObjects, lightShrine, resetShrines, loadProps, ruinsPuzzle, setRuinsSolved, nearestRuinsMirror, rotateRuinsMirror } from './procedural/objects/index.js';
import { updateFx } from './fx/particles.js';
import { updateFauna } from './fx/fauna.js';
import { updateWeather, forceWeather } from './fx/weather.js';
import { player, hooks, collectAll, attachCharacter, spawnAt, updatePlayer, updateAnim, updateFade, startRespawn, fade, requestAttack, requestDash, toggleWeapons, receiveHit, setPlayerVisible } from './game/player.js';
import { cam, free, mapCam, finaleCam, startFinaleCamera, stopFinaleCamera, startFree, updateCamera, orbitCamera, updateCameraInput, recenterCamera, toggleView } from './game/camera.js';
import { initAudio, updateAudio, updateWhaleVoice, glideSound, tone } from './game/audio.js';
import { carrierPoint } from './procedural/whaleRoute.js';
import { whaleVoice } from './procedural/objects/whaleModel.js';
import { ACTIONS, pad, pollPad, keyName, cap } from './game/input.js';
import { save, ghost, ACH, loadSave, persist, newRun, saveGhost, unlock, mark, achCount, fmtTime } from './game/progress.js';
import { photoTarget, albumImage, storeAlbumImage } from './game/album.js';
import { initGhost, record, updateGhost } from './game/ghost.js';
import { drawMapOverlay } from './game/map.js';
import { setCount, initGauge, setGauge, showCount, areaTitle, toast, showTitle, loadingText, openMenu, closeMenu, menuKey, refresh, setTimer } from './game/ui.js';

const level = buildLevel();
hooks.strike = swordStrike;
hooks.aim = assistAttackYaw;
hooks.respawn = respawnCombat;
loadProps().catch(err => console.error('props', err));
const TOP = islands[islands.length - 1].y;
loadSave(`${WORLD_REVISION}.${islands.length}.${secrets.length}.${pickups.length}.${Math.round(TOP * 100)}`, islands.length, pickups.length, -1, level.compatibleVersions);
ruinsPuzzle.onSolved = () => {
  save.ruins = true; persist(); unlock('ruins');
  toast('O relicário despertou', 'Um fragmento de luz apareceu entre os espelhos.', 'DESCOBERTA');
};
initGauge(islands.map(i => i.y));

// put the world in the state of the saved run (also used for a new journey)
function applyRun() {
  stopFinaleCamera(); resetGuide();
  resetCombat();
  document.body.classList.remove('ending');
  resetShrines();
  for (let i = 0; i <= save.cp; i++) lightShrine(i);
  pickups.forEach((k, i) => { k.got = save.got.includes(i); k.g.visible = !k.got; k.g.scale.setScalar(1); k.anim = 0; });
  setRuinsSolved(save.ruins);
  player.cp = save.cp; player.collected = save.got.length;
  summit.reached = save.done;
  game.restoration = restorationTarget(player.collected, save.done);
  setCount(player.collected, pickups.length);
  document.querySelector('#count .cpl').textContent = `Checkpoint · ${ROMAN[save.cp]}`;
  spawnAt(save.cp);
}
applyRun();
const hasRun = () => save.cp > 0 || save.got.length > 0 || save.runT > 5;
document.querySelector('#title .t-start').textContent = hasRun() ? 'Continuar' : 'Começar';

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
  setTimeout(() => areaTitle(player.cp, player.cp ? 'checkpoint' : ''), 1400);
  // Guidance stays attached to the current crossing, rather than disappearing before the player gets there.
}
function pause() {
  if (game.state !== 'play') return;
  game.state = 'pause'; pausedAt = performance.now();
  document.body.classList.add('paused');
  clearKeys(); glideSound(0); persist();
  document.exitPointerLock?.();
  pauseMenu();
  showCount(true);
}
function resume() {
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

hooks.finale = () => { unlock('summit'); completeJourney(); };
// end of the journey: achievements, best time + ghost, then the end screen
function completeJourney() {
  const t = save.runT, fair = !save.dirty;
  save.done = true;
  if (fair && save.falls === 0) unlock('nofall');
  if (fair && t < 480) unlock('fast');
  if (game.day < 0.3) unlock('night');
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
    { label: 'Explorar', kind: 'branch', act: () => exploreMenu(back) },
  ], 'O farol voltou a brilhar', resume, [
    `tempo  ${fmtTime(save.runT)}${save.dirty ? '  (menu de desenvolvedor usado: não vale recorde)' : best ? '  ·  novo recorde!' : save.best !== null ? `  ·  recorde ${fmtTime(save.best)}` : ''}`,
    `fragmentos de luz  ${player.collected} / ${pickups.length}   ·   quedas  ${save.falls}`,
    `memórias encontradas  ${save.memories.length} / ${MEMORIES.length}`,
    `conquistas  ${achCount()} / ${ACH.length}`,
  ], false, 'JORNADA CONCLUÍDA');
  showCount(true);
}

// ------------------------------------------------------------ menus
const footer = () => `◆  ${player.collected} / ${pickups.length}   ·   ${fmtTime(save.runT)}`;
function pauseMenu() {
  openMenu('Pausa', [
    hint({ label: 'Continuar', kind: 'primary', act: resume }, 'Voltar ao jogo'),
    hint({ label: 'Modo foto', act: () => { resume(); enterPhoto(); } }, 'Fotografe os marcos para completar o álbum'),
    hint({ label: 'Explorar', kind: 'branch', act: () => exploreMenu(pauseMenu) }, 'Mapa, álbum e conquistas'),
    hint({ label: 'Configurações', kind: 'branch', act: settingsMenu }, 'Jogabilidade, controles, gráficos, áudio e mundo'),
    hint({ label: 'Jornada', kind: 'branch', act: journeyMenu }, 'Voltar ao checkpoint ou começar uma nova jornada'),
    hint({ label: 'Modo Deus', kind: 'branch', act: devMenu }, 'F2 · invencibilidade, voo, combate, teleporte e cheats'),
  ], footer(), resume, [NAMES[currentIsland()]], false, 'MENU DE PAUSA');
}
function exploreMenu(back) {
  openMenu('Explorar', [
    { label: 'Mapa', kind: 'branch', act: () => mapMenu(() => exploreMenu(back)) },
    { label: 'Álbum de descobertas', kind: 'branch', act: () => albumMenu(() => exploreMenu(back)) },
    { label: 'Memórias do farol', kind: 'branch', act: () => memoriesMenu(() => exploreMenu(back)) },
    { label: 'Conquistas', kind: 'branch', act: () => achMenu(() => exploreMenu(back)) },
    { label: 'Voltar', act: back },
  ], footer(), back, [], false, 'EXPLORAÇÃO');
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
function memoriesMenu(back) {
  const rows = MEMORIES.map(m => hint({ label: save.memories.includes(m.id) ? m.title : `◇ ${m.title}`,
    act: () => openMenu(save.memories.includes(m.id) ? m.title : 'Uma memória na névoa', [{ label: 'Voltar', act: () => memoriesMenu(back) }],
      save.memories.includes(m.id) ? m.effect : `Reúna ${m.at} fragmentos em uma jornada para descobrir esta memória.`,
      () => memoriesMenu(back), [save.memories.includes(m.id) ? m.text : 'As centelhas guardam vozes de quem passou por aqui.'], false, 'MEMÓRIAS DO FAROL'),
  }, save.memories.includes(m.id) ? m.effect : `Reúna ${m.at} fragmentos em uma jornada`));
  openMenu('Memórias do farol', [...rows, { label: 'Voltar', act: back }], `${save.memories.length} / ${MEMORIES.length} memórias`, back,
    ['Cada grupo de fragmentos devolve luz ao farol e abre o horizonte.'], false, 'EXPLORAÇÃO');
}

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
function achMenu(back) {
  openMenu('Conquistas', [
    ...ACH.map(([id, name, desc]) => hint({ label: name, val: () => (save.ach[id] ? '◆' : '·') }, desc)),
    { label: 'Voltar', act: back },
  ], `${achCount()} / ${ACH.length} conquistas`, back, [], false, 'EXPLORAÇÃO');
}
function albumMenu(back) {
  const order = ['ninho', 'ruinas', 'moinho', 'bosque', 'whale', 'pedra', 'jardim', 'cidade', 'farol'];
  const rows = [...landmarks].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map(s => hint({
    label: save.album.includes(s.id) ? s.name : `◇ ${s.name}`,
    val: () => save.album.includes(s.id) ? '◆' : '·',
    preview: { src: save.album.includes(s.id) ? albumImage(s.id) : null, title: save.album.includes(s.id) ? s.name : 'Explore e enquadre este marco no modo foto' },
  }, save.album.includes(s.id) ? 'Foto registrada no álbum' : 'No modo foto, centralize o marco e aperte Enter para fotografar'));
  openMenu('Álbum de descobertas', [...rows, { label: 'Voltar', act: back }], '◆ foto registrada · ◇ por descobrir', back, [`${save.album.length} de ${landmarks.length} marcos fotografados`], false, 'EXPLORAÇÃO');
}
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
const pick = (label, key, list, after, obj = settings) => ({ label, val: () => list[obj[key]], adj: d => { obj[key] = (obj[key] + d + list.length) % list.length; if (obj === settings) saveSettings(); after?.(); } });
const page = (title, rows) => openMenu(title, [...rows, { label: 'Voltar', act: settingsMenu }], footer(), settingsMenu, [], false, 'CONFIGURAÇÕES');
const applyAll = () => { applyHud(); applyShadows(); applyQuality(); cam.dist = settings.camDist; };
const cheat = () => { save.dirty = true; persist(); };   // dev tools: this run no longer counts for the best time

function settingsMenu() {
  openMenu('Configurações', [
    { label: 'Jogabilidade', kind: 'branch', act: gameplayMenu },
    { label: 'Controles', kind: 'branch', act: () => controlsMenu(settingsMenu) },
    { label: 'Gráficos', kind: 'branch', act: graphicsMenu },
    { label: 'Áudio', kind: 'branch', act: audioMenu },
    { label: 'Mundo', kind: 'branch', act: worldMenu },
    { label: 'Modo Deus', kind: 'branch', act: devMenu },
    hint({ label: 'Restaurar padrões', kind: 'muted', act: () => { resetSettings(); applyAll(); settingsMenu(); } }, 'Volta todas as configurações ao original, inclusive as teclas (o menu de desenvolvedor não é afetado)'),
    { label: 'Voltar', act: pauseMenu },
  ], footer(), pauseMenu, [], false, 'MENU DE PAUSA');
}
const gameplayMenu = () => page('Jogabilidade', [
  hint(num('Sensibilidade do mouse', 'sens', 1, 10), 'Velocidade de giro da câmera (mouse e analógico)'),
  flag('Inverter câmera', 'invert'),
  hint(flag('Primeira pessoa', 'firstPerson'), 'Também alterna com V (L3 no controle)'),
  hint(num('Distância da câmera', 'camDist', 4, 10, 0.5, () => { cam.dist = settings.camDist; }), 'Também dá para ajustar com a roda do mouse'),
  hint(flag('Dicas de controle', 'tips'), 'Mostra os controles ao começar'),
  hint(flag('Cronômetro', 'timer', applyHud), 'Tempo da jornada e recorde, no canto superior direito'),
  hint(flag('Fantasma do recorde', 'ghost'), 'Uma silhueta refaz o seu melhor percurso junto com você'),
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
  cheat(); combat.hp = 3; combat.hurt = 0; combat.invulnerable = 1.5; refresh();
}
function resetDeveloperCheats() {
  Object.assign(dev, { fly:false, flySpeed:14, safe:false, speed:1, gravity:1, jump:1, freezeTime:false, hour:9, forced:0, island:player.cp });
  player.vel.set(0,0,0); forceWeather(0); devMenu();
}
const devMenu = () => openMenu('Modo Deus', [
  hint(flag('Invencibilidade', 'safe', cheat, dev), 'Você não recebe dano; quedas retornam ao último chão seguro'),
  hint(flag('Voo livre', 'fly', () => { cheat(); player.vel.set(0,0,0); }, dev), 'WASD move · Espaço sobe · Shift desce · atravessa obstáculos'),
  hint({ label:'Recuperar vida', act:recoverHealth }, 'Restaura os três corações'),
  hint({ label:'Combate', kind:'branch', act:devCombatMenu }, 'Recuperar vida, vencer ou reviver todos os inimigos'),
  hint({ label:'Movimento e física', kind:'branch', act:devMoveMenu }, 'Velocidade, gravidade, pulo e planeio'),
  hint({ label:'Mundo e teleporte', kind:'branch', act:devWorldMenu }, 'Ilhas, clima, horário e fragmentos'),
  hint({ label:'Restaurar cheats', kind:'muted', act:resetDeveloperCheats }, 'Desliga voo e invencibilidade e restaura física e clima; habilidades aprendidas ficam'),
  { label:'Voltar ao jogo', kind:'primary', act:resume },
  { label:'Voltar', act:pauseMenu },
], 'F2 abre este menu · usar cheats desativa o recorde desta jornada', pauseMenu, [], false, 'CHEATS DO DESENVOLVEDOR');
const devPage = (title, rows) => openMenu(title, [...rows, { label:'Voltar', act:devMenu }], 'Usar cheats desativa o recorde desta jornada', devMenu, [], false, 'MODO DEUS');
const devCombatMenu = () => devPage('Modo Deus · Combate', [
  hint(flag('Invencibilidade', 'safe', cheat, dev), 'Bloqueia o dano dos inimigos e protege contra quedas'),
  { label:'Recuperar vida', act:recoverHealth },
  { label:'Vencer todos os inimigos', act:() => { cheat(); defeatAllEnemies(); refresh(); } },
  { label:'Reviver todos os inimigos', act:() => { cheat(); reviveAllEnemies(); refresh(); } },
]);
const devMoveMenu = () => devPage('Modo Deus · Movimento', [
  hint(flag('Voar', 'fly', cheat, dev), 'WASD move na direção da câmera, Espaço sobe, Shift desce. Sem colisão. Usar o menu de desenvolvedor invalida o recorde desta jornada'),
  num('Velocidade de voo', 'flySpeed', 4, 60, 4, null, dev),
  hint(flag('Invencibilidade / sem queda', 'safe', cheat, dev), 'Cair não reinicia: você volta ao último lugar em que pisou'),
  num('Velocidade', 'speed', 0.5, 3, 0.5, cheat, dev, v => v + 'x'),
  num('Gravidade', 'gravity', 0.25, 2, 0.25, cheat, dev, v => v + 'x'),
  num('Força do pulo', 'jump', 0.5, 3, 0.25, cheat, dev, v => v + 'x'),
  hint(flag('Planar liberado', 'glide', () => { cheat(); persist(); }, save), 'Normalmente aprendido ao chegar nas Ruínas do Vento'),
]);
const devWorldMenu = () => devPage('Modo Deus · Mundo', [
  num('Hora do dia', 'hour', 0, 23, 1, () => { game.tod = ((dev.hour - 6) / 24 + 1) % 1; }, dev, v => v + ' h'),
  flag('Congelar horário', 'freezeTime', null, dev),
  pick('Forçar clima', 'forced', ['automático', 'limpo', 'névoa', 'chuva', 'tempestade'], () => forceWeather(dev.forced), dev),
  num('Ilha de destino', 'island', 0, islands.length - 1, 1, null, dev, v => `${v + 1} · ${NAMES[v]}`),
  hint({ label: 'Teleportar', act: () => { const k = dev.island; cheat(); player.cp = save.cp = k; for (let i = 0; i <= k; i++) lightShrine(i); spawnAt(k); resume(); } }, 'Vai para a ilha escolhida e define o checkpoint lá'),
  hint({ label: 'Coletar tudo', act: () => { cheat(); collectAll(); } }, 'Pega todos os fragmentos de luz'),
  hint({ label: 'Visitar píer da baleia', act: () => {
    cheat(); player.cp = save.cp = whale.route.owner;
    spawnAt(player.cp);
    player.pos.set(whale.source.x, whale.source.y, whale.source.z);
    areaTitle(player.cp, 'checkpoint');
    cam.yaw = Math.atan2(-whale.route.nx, -whale.route.nz); cam.pitch = 0.35; cam.dist = 9;
    cam.blend = 1; cam.follow.copy(player.pos); updateCamera(0, player);
    for (let i = 0; i <= player.cp; i++) lightShrine(i);
    resume();
  } }, 'Vai ao píer da Baleia das Brumas. Invalida o recorde desta jornada'),
  hint({ label: 'Prévia do encerramento', act: () => {
    cheat(); player.cp = save.cp = islands.length - 1;
    spawnAt(player.cp); summit.reached = false; save.done = false;
    player.pos.set(summit.pos.x, islands[player.cp].y + 0.45, summit.pos.z);
    for (let i = 0; i <= player.cp; i++) lightShrine(i);
    areaTitle(player.cp, 'checkpoint');
    cam.blend = 1; cam.follow.copy(player.pos); updateCamera(0, player);
    resume();
  } }, 'Vai ao altar e conclui a jornada para testar a cena final. Invalida o recorde desta jornada'),
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
  if (e.code === 'F2' && !e.repeat && (game.state === 'play' || game.state === 'pause')) {
    e.preventDefault();
    if (game.state === 'play') pause();
    setMapView(false); devMenu();
    return;
  }
  if (game.state === 'pause') {
    if (e.code === 'Escape' && performance.now() - pausedAt < 400) return;   // same Esc that released the pointer
    return menuKey(e);
  }
  if (e.repeat) return;
  if (game.state === 'ending') {
    if (e.code === 'Enter' || e.code === 'Escape' || e.code === settings.binds.pause) finishEnding();
    return;
  }
  keys[e.code] = true;
  const b = settings.binds;
  if (game.state === 'title' && (e.code === 'Enter' || e.code === b.jump)) return start();
  if (game.state === 'play') {
    if (e.code === b.jump) player.jumpBuf = 0.14;
    if (e.code === b.attack) requestAttack();
    if (e.code === b.equip) toggleWeapons();
    if (e.code === b.view) toggleView();
    if (e.code === b.dash) requestDash();
    if (e.code === 'Escape' || e.code === b.pause) pause();
    else if (e.code === b.photo) enterPhoto();
    else if (e.code === b.interact && rotateRuinsMirror(player.pos)) tone([440, 587.33], { dur: 0.35, vol: 0.04, gap: 0.05, at: ruinsPuzzle.center });
  } else if (game.state === 'photo') {
    if (e.code === 'Escape' || e.code === b.photo) exitPhoto();
    else if (e.code === 'Enter') shot = true;
    else if (e.code === 'KeyH') document.body.classList.toggle('nohint');
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { clearKeys(); if (game.state === 'photo') exitPhoto(); pause(); });
canvas.addEventListener('mousedown', e => {
  if (game.state === 'title') start();
  else if (game.state === 'play' || game.state === 'photo') {
    if (game.state === 'play' && e.button === 0) requestAttack();
    if (!locked()) lock(); dragging = true;
  }
});
document.querySelector('#pause').addEventListener('mousedown', e => { if (mapCam.on && !e.target.closest('.menu-panel')) mapDrag = true; });
addEventListener('mouseup', () => { dragging = mapDrag = false; });
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
  pause();
});

// unplugging mid-game pauses instead of leaving the character running
addEventListener('gamepaddisconnected', () => { if (game.state === 'play') pause(); });

// gamepad: the same actions, plus d-pad / A / B for the menus
const PAD_MENU = { up: 'ArrowUp', down: 'ArrowDown', left2: 'ArrowLeft', right2: 'ArrowRight', jump: 'Enter', back2: 'Escape' };
function handlePad() {
  pollPad();
  const P = pad.pressed;
  if (game.state === 'title') { if (P.jump || P.pause) start(); }
  else if (game.state === 'play') {
    if (P.jump) player.jumpBuf = 0.14;
    if (P.attack) requestAttack();
    if (P.equip) toggleWeapons();
    if (P.recenter) recenterCamera(player.yaw);
    if (P.view) toggleView();
    if (P.dash) requestDash();
    if (P.pause) pause(); else if (P.photo) enterPhoto(); else if (P.back2 && rotateRuinsMirror(player.pos)) tone([440, 587.33], { dur: 0.35, vol: 0.04, gap: 0.05, at: ruinsPuzzle.center });
  }
  else if (game.state === 'photo') { if (P.photo || P.back2 || P.pause) exitPhoto(); else if (P.jump) shot = true; }
  else if (game.state === 'ending') { if (P.jump || P.back2 || P.pause) finishEnding(); }
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
    attachCharacter(fbx); initGhost(fbx);
    buildCombat(fbx, receiveHit, () => startRespawn());
    respawnCombat(player); loadingText(null); game.state = 'title'; showTitle(true);
  })
  .catch(err => { console.error(err); loadingText('não foi possível carregar o personagem'); });

function saveShot() {
  const target = photoTarget(camera, landmarks, save.album);
  canvas.toBlob(b => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `acima-da-nevoa-${Date.now()}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (target && mark('album', target.id)) {
      storeAlbumImage(target.id, b);
      photoNotice = `◆ ${target.name} registrado no álbum · ${save.album.length}/${landmarks.length}`;
      photoNoticeUntil = performance.now() + 3500;
      tone([523.25, 659.25, 783.99], { dur: 0.9, vol: 0.045, gap: 0.08 });
      if (save.album.length === landmarks.length) unlock('album');
    } else {
      photoNotice = 'Foto salva · centralize um marco para registrá-lo no álbum';
      photoNoticeUntil = performance.now() + 2800;
    }
  });
  grade.uniforms.uFade.value = 0.6;   // a soft flash as the shutter
  unlock('photo');
}

// ------------------------------------------------------------ loop
const fps = { n: 0, t: 0, el: document.querySelector('#fps') }, mapCanvas = document.querySelector('#map');
let last = performance.now(), timerTxt = '';
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 1 / 30); last = now;
  const t = (U.time.value += dt);
  handlePad();
  const playing = game.state === 'play', paused = game.state === 'pause', photo = game.state === 'photo';
  if (playing) game.gameT += dt;

  updateCameraInput(dt);
  updateMovers(game.gameT);
  if (playing) {
    updatePlayer(dt); updateFade(dt);
    if (!save.done) { save.runT += dt; record(save.rec, save.runT, player.pos, player.yaw); }
  } else if (!paused && !photo && fade.phase === 'in') updateFade(dt * 0.5);
  if (photo) grade.uniforms.uFade.value = Math.max(0, grade.uniforms.uFade.value - dt * 3);
  if (!paused && !photo) updateAnim(dt);   // photo mode freezes the pose
  if (playing) updateCombat(dt, player, fade.phase);
  updateCombatHud();
  updateGhost(save.done || game.state === 'title' ? null : ghost, save.runT, playing ? dt : 0, player.pos);
  updateCamera(dt, player);
  setPlayerVisible(!cam.first || game.state !== 'play');
  if (game.state === 'ending' && finaleCam.t >= 8) finishEnding();
  updateGuide(dt, player, save);
  if (!paused && !photo) game.restoration = damp(game.restoration, restorationTarget(player.collected, save.done), 0.65, dt);
  const interact = document.querySelector('#interact');
  const mirror = playing && nearestRuinsMirror(player.pos);
  interact.classList.toggle('show', !!mirror);
  if (mirror) { const html = `${cap('interact')}girar espelho para o cristal central`; if (interact.innerHTML !== html) interact.innerHTML = html; }
  if (photo) {
    const target = photoTarget(camera, landmarks, save.album);
    document.querySelector('#photohint').textContent = performance.now() < photoNoticeUntil ? photoNotice
      : target ? `◆ ${target.name} no enquadramento · Enter fotografar · Esc sair`
        : 'WASD mover · Espaço/Shift subir/descer · mouse olhar · roda zoom · [ ] horário · Enter salvar foto · H esconder dica · Esc sair';
  }
  if (playing || paused) setGauge(player.pos.y, player.cp);
  animateObjects(t, dt, player.cp, !paused, player.pos);
  updateRouteMarks(player.pos);
  if (!paused) { updateFx(dt, player.pos); updateFauna(t); }
  updateWeather(dt, playing);
  if (photo && (keys.BracketLeft || keys.BracketRight)) game.tod = (game.tod + (keys.BracketRight ? 1 : -1) * dt * 0.05 + 1) % 1;   // scrub the time of day
  else if (TIME_TOD[settings.time] !== null) game.tod = TIME_TOD[settings.time];   // fixed time of day
  else if (playing && !dev.freezeTime) game.tod = (game.tod + dt / DAYS[settings.dayLen]) % 1;
  const alt = updateAtmosphere(t, dt, mapCam.on ? mapCam.t : player.pos, TOP, game.tod);   // shadows follow what you look at
  bloom.strength = lerp(0.7, 0.32, game.day);   // lanterns and crystals glow more at night
  grade.uniforms.uFadeCol.value.copy(scene.fog.color).multiplyScalar(0.88);
  grade.uniforms.uTime.value = t;
  updateAudio(alt, paused);
  if (whale.pose) whaleVoice.level = updateWhaleVoice(dt, carrierPoint(whale.pose, 11.5, -2.6, 0), paused);
  const tt = fmtTime(save.runT) + (save.best !== null ? `  ·  recorde ${fmtTime(save.best)}` : '') + (save.dirty ? '  ·  dev' : '');
  if (tt !== timerTxt) setTimer(timerTxt = tt);
  composer.render();
  if (shot) { shot = false; saveShot(); }
  if (mapCam.on) drawMapOverlay(mapCanvas, camera, player, mapCam.focus, t);
  fps.n++; fps.t += dt;
  if (fps.t > 0.5) { fps.el.textContent = settings.fps ? Math.round(fps.n / fps.t) + ' fps' : ''; fps.n = 0; fps.t = 0; }
}
requestAnimationFrame(frame);
if (import.meta.env.DEV) window.dbg = { whale, free, U, cam, colliders, near, updrafts, ponds, player, save, game, settings, dev, islands, secrets, pickups, keys, spawnAt, pause, enterPhoto, combat, enemies, requestAttack, toggleWeapons, step: n => { for (let i = 0; i < n; i++) frame(last + 1000 / 60); } };   // console poking in dev only
