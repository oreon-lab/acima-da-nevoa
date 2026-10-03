// Trailer renderer: `?trailer=<clip>` turns the page into a deterministic film set. Nothing here runs in normal play.
// A clip is a list of shots in edit order (trailerClips.js). The external renderer (scripts/render-trailer.mjs) asks for
// the clip's plan, then renders shot by shot: `begin(i)` sets the shot up, every `step()` advances the whole game by
// one output frame (1/FPS s, times the shot's speed for slow motion) and the page is screenshotted. Shots are cut
// together (or dissolved) and scored in ffmpeg; the score is part of the plan, in clip time, so picture and sound
// are laid out from the same numbers.
//
// A shot: { name, dur, dissolve?: s (crossfade in from the previous shot), begin?(), frame(u, dt, o), post?(u, o),
//           speed?(o) (sim seconds per output second), fx?(o) → { black, white }, captions?: [{ at, to, html, ... }],
//           card?: html (a black title card: no world), grade?: css filter }
//   u = sim seconds since the shot began (slowed by speed), o = output seconds since the shot began.
import { game, canvas } from '../core.js';
import { settings, dev } from '../config.js';
import { clamp } from '../utils.js';
import { fade, setPlayerVisible, player } from './player.js';
import { grade } from '../render/post.js';
import { save, newRun } from './progress.js';
import { cineCam } from './camera.js';
import { forceWeather } from '../fx/weather.js';
import { CLIPS } from './trailerClips.js';
import { enemies } from './combat.js';
import { resetDrive, ease, easeOut, seg, trailerSound } from './trailerKit.js';
import { showTitle } from './ui.js';

export const FPS = 60;
export const trailer = { on: false, focus: null, quick: false, clip: null, u: 0, o: 0 };

// ------------------------------------------------------------ overlay (captions, title cards, fades, flashes)
const css = `
body.trailer .hud, body.trailer #cine, body.trailer #dashfx { display: none !important; }
body.trailer { cursor: none; background: #000; }
#tr { position: fixed; inset: 0; pointer-events: none; font-family: Poppins, sans-serif; color: #f4efe3; }
#tr .layer { position: absolute; inset: 0; opacity: 0; }
#tr .black { background: #000; } #tr .white { background: #fff8ec; }
#tr .shade { background: radial-gradient(ellipse 85% 80% at 50% 48%, transparent 60%, rgba(6,12,20,.32)), linear-gradient(rgba(8,18,28,.42), transparent 26%, transparent 64%, rgba(8,18,28,.62)); opacity: 1; }
#tr .card { background: #000; display: grid; place-items: center; text-align: center; }
#tr .cap { position: absolute; left: 0; right: 0; opacity: 0; text-align: center; text-shadow: 0 1px 2px #061016, 0 2px 10px rgba(6,16,22,.9), 0 0 32px rgba(6,16,22,.75); }
#tr::before, #tr::after { content: ''; position: absolute; left: 0; right: 0; height: 12.8%; background: #000; z-index: 2; }
#tr::before { top: 0; } #tr::after { bottom: 0; }
#tr .k { font-size: 1.05vw; font-weight: 500; letter-spacing: .15em; color: #ffd58a; }
#tr .l { font-size: 3vw; font-weight: 400; letter-spacing: .03em; line-height: 1.3; }
#tr .card .l { font-size: 2.6vw; letter-spacing: .1em; }
#tr .s { font-size: 1.2vw; font-weight: 400; letter-spacing: .08em; color: rgba(244,239,227,.8); margin-top: 1.2em; }
#tr .rule { display: flex; align-items: center; justify-content: center; gap: 1vw; color: #ffd58a; font-size: .6vw; margin: 1.1vw 0 1vw; }
#tr .rule i { width: 9vw; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,226,170,.8)); }
#tr .rule i:last-child { transform: scaleX(-1); }
#tr svg.em { width: 3.6vw; height: 3.6vw; color: #ffd58a; filter: drop-shadow(0 0 12px rgba(255,213,138,.45)); }
#tr .a { font-size: 2.2vw; font-weight: 500; letter-spacing: .7em; padding-left: .7em; color: #ffd58a; text-transform: uppercase; margin-top: 1.1vw; }
#tr .b { font-size: 10vw; font-weight: 200; letter-spacing: .04em; line-height: 1; text-shadow: 0 0 60px rgba(255,213,138,.28), 0 2px 4px rgba(6,14,22,.7); }
`;
const ui = {};
function buildOverlay() {
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  const root = document.createElement('div'); root.id = 'tr';
  root.innerHTML = '<div class="layer shade"></div><div class="caps"></div><div class="layer card"><div></div></div><div class="layer white"></div><div class="layer black"></div>';
  document.body.append(root);
  for (const k of ['black', 'white', 'shade', 'card', 'caps']) ui[k] = root.querySelector('.' + k);
  ui.cardBody = ui.card.firstChild;
}
// captions belong to a shot and run on its output clock: { at, to, html, top | bottom, fade, rise }
function showCaptions(sh) {
  ui.caps.replaceChildren(...(sh.captions || []).map(c => {
    const n = document.createElement('div'); n.className = 'cap'; n.innerHTML = c.html;
    n.style.top = c.top ?? ''; n.style.bottom = c.bottom ?? (c.top ? '' : '16%');
    c.node = n; return n;
  }));
}
function updateOverlay(sh, o) {
  for (const c of sh.captions || []) {
    const f = c.fade ?? 0.7, k = ease(seg(o, c.at, c.at + f)) * (1 - ease(seg(o, c.to - f, c.to)));
    c.node.style.opacity = k.toFixed(3);
    c.node.style.transform = `translateY(${((c.rise ?? 10) * (1 - easeOut(seg(o, c.at, c.at + f * 2)))).toFixed(1)}px)`;
    if (c.spread) c.node.style.letterSpacing = `${(c.spread * (1 - easeOut(seg(o, c.at, c.to)))).toFixed(3)}em`;
  }
  const fx = sh.fx ? sh.fx(o) : {};
  ui.black.style.opacity = clamp(fx.black ?? 0, 0, 1).toFixed(3);
  ui.white.style.opacity = clamp(fx.white ?? 0, 0, 1).toFixed(3);
  ui.shade.style.opacity = sh.card ? '0' : String(fx.shade ?? 1);
  ui.card.style.opacity = sh.card ? '1' : '0';
}

// ------------------------------------------------------------ clip runtime
let clip = null, shot = null, tickFn = null;
const soundEvents = [];
trailer.sound = kind => {
  if (shot && shot.actor !== false && !shot.card) soundEvents.push({ kind, at: shot.at + trailer.o, floor: shot.floor ?? 'grass' });
};
trailerSound.emit = kind => trailer.sound(kind);

// Math.random is replaced by a seeded generator so everything that is not already seeded (sparks, fauna) repeats too
function seedRandom(seed) {
  let s = seed >>> 0;
  Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

trailer.init = async ({ tick, clip: name }) => {
  tickFn = tick;
  clip = CLIPS[name];
  if (!clip) { console.error(`trailer: no clip '${name}' (has: ${Object.keys(CLIPS).join(', ')})`); return; }
  trailer.clip = name;
  seedRandom(1234);
  soundEvents.length = 0;
  Object.assign(settings, { tips: false, hud: false, weather: 1, time: 0, firstPerson: false, ghost: false, particles: 1, quality: 2, bloom: true, shadows: true, fog: 1, fov: 45 });
  dev.freezeTime = true;
  document.body.classList.add('trailer');
  showTitle(false); buildOverlay();
  newRun(); save.glide = true;
  fade.phase = 'none'; fade.t = 0; grade.uniforms.uFade.value = 0;
  cineCam.on = true; setPlayerVisible(true);
  game.state = 'play'; trailer.on = true;
  await clip.init?.();
  window.__trailer = api;
};

function begin(i) {
  shot = clip.shots[i];
  trailer.u = 0; trailer.o = 0; trailer.focus = null; game.trailerFocus = null; trailer.shot = i;
  resetDrive();
  player.idleT = 0;
  if (shot.island !== undefined) player.cp = shot.island;
  settings.weather = 1; dev.forced = 0; forceWeather(1);
  if (!shot.keepCamera) cineCam.on = true;
  shot.begin?.(shot);
  canvas.style.filter = shot.grade ?? clip.grade ?? '';   // the colour grade: plain CSS on the finished frame
  ui.cardBody.innerHTML = shot.card ?? '';
  showCaptions(shot);
}

// called inside the game's tick, after the world moved and before the camera is read; dt is sim time
trailer.pre = dt => { if (shot?.clock) game.gameT = shot.clock(trailer.o + dt); };
trailer.update = dt => {
  if (!shot) return;
  trailer.u += dt;
  shot.frame?.(trailer.u, dt, trailer.o);
  trailer.focus = game.trailerFocus ?? null;
};
// called after the rift cutscene / crossing moved the camera: a shot may still take it over
trailer.post = () => {
  if (shot?.post) shot.post(trailer.u, trailer.o);
  setPlayerVisible(shot?.actor !== false && !shot?.card);
  enemies.forEach(e => { e.bar.visible = false; });
  document.querySelectorAll('#combat, #interact, #photohint, #toast').forEach(n => { n.style.display = 'none'; });
};

// ------------------------------------------------------------ driver API (window.__trailer)
const api = {
  fps: FPS,
  setQuick(value) { trailer.quick = value; },
  // shots (with how long each renders: its own length plus the next shot's dissolve) and the score, in clip time
  plan() {
    let t = 0;
    const shots = clip.shots.map((s, i) => {
      const tail = clip.shots[i + 1]?.dissolve ?? 0, at = t; t += s.dur;
      return { name: s.name, at, dur: s.dur, dissolve: s.dissolve ?? 0, render: s.dur + tail };
    });
    return { shots, dur: t, audio: clip.audio ? clip.audio(shots) : [] };
  },
  begin(i) { begin(i); },
  step() {
    if (!shot) throw new Error('Call __trailer.begin(shotIndex) before step()');
    const sp = shot.speed ? shot.speed(trailer.o) : 1;
    tickFn(sp / FPS);
    trailer.o += 1 / FPS;
    updateOverlay(shot, trailer.o);
    return trailer.o;
  },
  // preview helper: begin shot i and run silently to `o` output seconds into it (nothing rendered until the end)
  seek(i, o = 0) {
    begin(i); trailer.quick = true;
    while (trailer.o < o - 1e-6) api.step();
    trailer.quick = false; api.step();
    return { shot: shot.name, o: trailer.o };
  },
  info: () => ({ shot: shot?.name, u: trailer.u, o: trailer.o, state: game.state }),
  sounds: () => soundEvents,
};
