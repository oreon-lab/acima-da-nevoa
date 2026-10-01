// Synthesized ambience (filtered-noise wind that follows the gusts, soft chimes with echo) plus recorded
// one-shots from assets/audio, including the character foley used in the trailer.
import { U, game, camera } from '../core.js';
import { V3, clamp } from '../utils.js';
import { settings } from '../config.js';
import jumpUrl from '../../assets/audio/jump.mp3?url';
import returnUrl from '../../assets/audio/return.mp3?url';
import whaleUrl from '../../assets/audio/whale.mp3?url';
import riserUrl from '../../assets/audio/riser-cutcine.mp3?url';
import tensionUrl from '../../assets/audio/tension-scapes.mp3?url';
import holeUrl from '../../assets/audio/hole-standard.mp3?url';
import glitchUrl from '../../assets/audio/glith.mp3?url';
import droneUrl from '../../assets/audio/drone.mp3?url';
import buildupUrl from '../../assets/audio/buildup.mp3?url';
import apocalypseUrl from '../../assets/audio/apocalypse.mp3?url';
import clothUrl from '../../assets/audio/character/cloth1.ogg?url';
import drawUrl from '../../assets/audio/character/drawKnife2.ogg?url';
import sliceUrl from '../../assets/audio/character/knifeSlice2.ogg?url';
import grass0Url from '../../assets/audio/character/footstep_grass_000.ogg?url';
import grass1Url from '../../assets/audio/character/footstep_grass_001.ogg?url';
import grass2Url from '../../assets/audio/character/footstep_grass_002.ogg?url';
import stoneUrl from '../../assets/audio/character/footstep_concrete_002.ogg?url';

const sfx = {}, buffers = {}, playing = {};
const SAMPLES = { jump: jumpUrl, return: returnUrl, whale: whaleUrl, riser: riserUrl, tension: tensionUrl, hole: holeUrl, glitch: glitchUrl,
  drone: droneUrl, buildup: buildupUrl, apocalypse: apocalypseUrl,
  cloth: clothUrl, draw: drawUrl, slice: sliceUrl, grass0: grass0Url, grass1: grass1Url, grass2: grass2Url, stone: stoneUrl };
// cutscene control: muffle 0..1 = the world's sound dulls as if time stopped; fade 0..1 = everything to silence
export const audioMood = { muffle: 0, fade: 0 };

export function initAudio() {
  if (sfx.ctx) { sfx.ctx.resume(); return; }
  const ctx = new AudioContext(), master = ctx.createGain();
  master.gain.value = settings.volume / 10;
  const spatial = { panningModel: 'HRTF', distanceModel: 'inverse', rolloffFactor: 0 };   // rolloff 0: direction only, no distance fade
  const windPan = new PannerNode(ctx, spatial), rainPan = new PannerNode(ctx, spatial);
  windPan.connect(master); rainPan.connect(master);
  const comp = new DynamicsCompressorNode(ctx, { threshold: -10, ratio: 6 }), muffle = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 20000 });
  master.connect(muffle).connect(comp).connect(ctx.destination);   // loud samples can't clip
  const cine = new GainNode(ctx, { gain: settings.volume / 10 }); cine.connect(comp);   // cutscene music: never muffled
  const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 320 }), band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 800, Q: 2.5 });
  const gLow = new GainNode(ctx, { gain: 0 }), gHigh = new GainNode(ctx, { gain: 0 });
  src.connect(low).connect(gLow).connect(windPan);
  src.connect(band).connect(gHigh).connect(windPan);
  const rainHP = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 1800 }), gRain = new GainNode(ctx, { gain: 0 });
  src.connect(rainHP).connect(gRain).connect(rainPan);
  const glideBP = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1100, Q: 0.8 }), gGlide = new GainNode(ctx, { gain: 0 });
  src.connect(glideBP).connect(gGlide).connect(master);   // rushing air while gliding
  src.start();
  const delay = new DelayNode(ctx, { delayTime: 0.33 }), fb = new GainNode(ctx, { gain: 0.38 }), wet = new GainNode(ctx, { gain: 0.45 });
  delay.connect(fb).connect(delay); delay.connect(wet).connect(master);
  const music = new GainNode(ctx, { gain: settings.music / 10 }); music.connect(master); music.connect(delay);
  const fx = new GainNode(ctx, { gain: settings.sfx / 10 }); fx.connect(master);   // jump, landing, chimes, thunder
  Object.assign(sfx, { muffle, cine, windPan, rainPan, ctx, master, gLow, gHigh, band, delay, music, fx, gRain, gGlide, glideBP, noiseBuf: buf });
  for (const [name, url] of Object.entries(SAMPLES))   // decode in the background; playSample() ignores samples that aren't ready yet
    fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { buffers[name] = buf; }).catch(console.error);
}

// one-shot sample with optional random pitch jitter; single = cut the previous instance first.
// Returns false if audio or the sample isn't ready (callers can fall back to a synth tone).
export function playSample(name, { vol = 1, jitter = 0, single = false, at = null } = {}) {
  const buffer = buffers[name];
  if (!sfx.ctx || !buffer) return false;
  if (single) playing[name]?.stop();
  const src = new AudioBufferSourceNode(sfx.ctx, { buffer, playbackRate: 1 + (Math.random() - 0.5) * 2 * jitter });
  const gain = src.connect(new GainNode(sfx.ctx, { gain: vol }));
  const pan = at ? panner(at) : null;
  (pan ? gain.connect(pan) : gain).connect(sfx.fx);
  src.onended = () => {
    src.disconnect(); gain.disconnect(); pan?.disconnect();
    if (playing[name] === src) delete playing[name];
  };
  src.start();
  playing[name] = src;
  return true;
}

// `at` = a world position: the sound then comes from there (binaural), fading with distance; without it, it is UI.
export function tone(freqs, { dur = 1.2, vol = 0.1, attack = 0.01, type = 'sine', gap = 0.07, slide = 0, at = null } = {}) {
  if (!sfx.ctx) return;
  const t0 = sfx.ctx.currentTime, out = at ? panner(at, 7) : sfx.fx;
  if (at) out.connect(sfx.fx);
  freqs.forEach((f, i) => {
    const t = t0 + i * gap, o = new OscillatorNode(sfx.ctx, { type, frequency: f }), g = new GainNode(sfx.ctx, { gain: 0 });
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); if (!slide) g.connect(sfx.delay);
    o.start(t); o.stop(t + dur + 0.05);
  });
}

// alt: 0 at the bottom, 1 at the summit -> the wind gets stronger as you climb
export function updateAudio(alt, paused) {
  if (!sfx.ctx) return;
  updateMusic(alt);
  updateListener();
  const t = sfx.ctx.currentTime, g = U.gust.value;
  const amb = settings.ambience / 10;
  sfx.gLow.gain.setTargetAtTime((0.1 + 0.16 * g + alt * 0.1) * amb, t, 0.4);
  sfx.gHigh.gain.setTargetAtTime((0.012 + 0.05 * g * (0.4 + alt)) * amb, t, 0.4);
  sfx.band.frequency.setTargetAtTime(550 + 650 * g + alt * 200, t, 0.6);
  sfx.music.gain.setTargetAtTime(settings.music / 10, t, .4);
  sfx.fx.gain.setTargetAtTime(settings.sfx / 10, t, 0.2);
  sfx.gRain.gain.setTargetAtTime(game.wx.rain * 0.07 * settings.ambience / 10, t, 0.6);
  const m = audioMood.muffle, quiet = 1 - audioMood.fade;
  sfx.master.gain.setTargetAtTime(settings.volume / (paused ? 25 : 10) * (1 - 0.55 * m) * quiet, t, 0.2);
  sfx.muffle.frequency.setTargetAtTime(20000 * Math.pow(300 / 20000, m), t, 0.15);
  sfx.cine.gain.setTargetAtTime(settings.volume / 10 * quiet, t, 0.3);
}

// 0..1 while gliding (speed of the air past you)
export function glideSound(k) {
  if (!sfx.ctx) return;
  const t = sfx.ctx.currentTime;
  sfx.gGlide.gain.setTargetAtTime(k * 0.09 * settings.sfx / 10, t, 0.15);
  sfx.glideBP.frequency.setTargetAtTime(800 + k * 900, t, 0.2);
}

// ---------------------------------------------------------------- background music (generated, no files)
// A slow pad that changes chord every ~14 s, plus sparse pentatonic bell notes into the echo.
// By day: bright major-7th chords in C; at night or in rain: darker minor chords in A. Climbing opens the filter,
// adds a high voice and quickens the bells; fog muffles; a storm drops the pad an octave and silences the bells.
const mtof = m => 440 * 2 ** ((m - 69) / 12);
const CHORDS = {
  day: [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]],
  night: [[45, 52, 59, 64], [41, 48, 55, 60], [38, 45, 52, 57], [40, 47, 55, 59]],
};
const SCALE = { day: [72, 74, 76, 79, 81, 84], night: [69, 72, 74, 76, 79, 81] };
const mus = { nextChord: 0, nextNote: 0, step: 0 };

function pad(notes, t, dur, cutoff = 750) {
  const lp = new BiquadFilterNode(sfx.ctx, { type: 'lowpass', frequency: cutoff, Q: 0.4 }); lp.connect(sfx.music);
  for (const m of notes) for (const det of [-7, 7]) {
    const o = new OscillatorNode(sfx.ctx, { type: 'triangle', frequency: mtof(m), detune: det }), g = new GainNode(sfx.ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.018, t + 5); g.gain.setValueAtTime(0.018, t + dur - 6); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(lp); o.start(t); o.stop(t + dur + 0.1);
  }
}
function bell(m, t) {
  const o = new OscillatorNode(sfx.ctx, { type: 'sine', frequency: mtof(m) }), g = new GainNode(sfx.ctx, { gain: 0 });
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
  const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 8, c = camera.position;   // each bell rings from somewhere around you
  const p = panner({ x: c.x + Math.sin(a) * r, y: c.y + Math.random() * 10 - 2, z: c.z + Math.cos(a) * r }, 12);
  o.connect(g).connect(p).connect(sfx.music); o.start(t); o.stop(t + 3.6);
}
function updateMusic(alt) {
  const now = sfx.ctx.currentTime, wx = game.wx, storm = wx.rain > 0.85;
  const mood = game.day > 0.45 && wx.rain < 0.5 ? 'day' : 'night';
  if (now >= mus.nextChord) {
    const chord = CHORDS[mood][mus.step++ % 4].map(m => m - (storm ? 12 : 0));
    if (alt > 0.4) chord.push(chord[chord.length - 1] + 12);
    pad(chord, now + 0.05, 16, (650 + alt * 1300) * (1 - 0.35 * wx.fog) * (1 - 0.3 * wx.rain));
    mus.nextChord = now + 14;
  }
  if (now >= mus.nextNote) {
    const sc = SCALE[mood], m = sc[(Math.random() * sc.length) | 0] + (alt > 0.7 && Math.random() < 0.4 ? 12 : 0);
    if (!storm) bell(m, now + 0.05);
    mus.nextNote = now + (2.5 + Math.random() * 5) * (1.25 - 0.55 * alt) * (1 + wx.rain);
  }
}


// distant thunder: a low rumble of filtered noise, `delay` seconds from now (the flash comes first)
export function thunder(delay = 1) {
  if (!sfx.ctx) return;
  const t = sfx.ctx.currentTime + delay, s = new AudioBufferSourceNode(sfx.ctx, { buffer: sfx.noiseBuf, loop: true });
  const lp = new BiquadFilterNode(sfx.ctx, { type: 'lowpass', frequency: 160 }), g = new GainNode(sfx.ctx, { gain: 0 });
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.7, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
  const a = Math.random() * Math.PI * 2, c = camera.position;
  const p = new PannerNode(sfx.ctx, { panningModel: 'HRTF', rolloffFactor: 0, positionX: c.x + Math.sin(a) * 300, positionY: c.y + 60, positionZ: c.z + Math.cos(a) * 300 });
  s.connect(lp).connect(g).connect(p).connect(sfx.fx); s.start(t); s.stop(t + 4.2);
}

// footsteps: grass = soft rustle, stone = dry tap, sand = gritty scrape, water = splash + plip
const STEP = {
  grass: { type: 'bandpass', f: 2800, q: 0.7, dur: 0.09, vol: 0.05 },
  stone: { type: 'bandpass', f: 1300, q: 1.2, dur: 0.05, vol: 0.08 },
  sand: { type: 'bandpass', f: 1800, q: 0.5, dur: 0.13, vol: 0.055 },
  water: { type: 'highpass', f: 1300, q: 0.5, dur: 0.2, vol: 0.09 },
};
let grassStep = 0;
export function stepSound(surface, power = 1, at = here(0.1)) {
  const sample = surface === 'grass' ? `grass${grassStep++ % 3}` : surface === 'stone' || !STEP[surface] ? 'stone' : null;
  if (sample && playSample(sample, { vol: 0.3 * power, jitter: 0.04, at })) return;
  const c = STEP[surface] || STEP.stone;
  if (!sfx.ctx || !sfx.noiseBuf) return;
  const t = sfx.ctx.currentTime, s = new AudioBufferSourceNode(sfx.ctx, { buffer: sfx.noiseBuf, playbackRate: 0.9 + Math.random() * 0.25 });
  const f = new BiquadFilterNode(sfx.ctx, { type: c.type, frequency: c.f * (0.85 + Math.random() * 0.3), Q: c.q }), g = new GainNode(sfx.ctx, { gain: 0 });
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(c.vol * power, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + c.dur);
  s.connect(f).connect(g).connect(panner(at)).connect(sfx.fx); s.start(t, Math.random() * 3); s.stop(t + c.dur + 0.05);
  if (surface === 'water') tone([620 + Math.random() * 200], { dur: 0.16, vol: 0.02, slide: 0.5, at });
}

export function landSound(surface, power = 1, at = here(0.1)) {
  if (surface !== 'water' && surface !== 'sand' && playSample('stone', { vol: 0.5 * power, jitter: 0.03, at })) return;
  stepSound(surface, power, at);
}

// Broadband blade rush rises into contact and falls away; each sword pans inward.
export function swordWhoosh(swing = 0, at = here(1)) {
  if (playSample('slice', { vol: 0.42, jitter: 0.03, at })) return;
  if (!sfx.ctx) return;
  const ctx = sfx.ctx, t = ctx.currentTime, duration = 0.19;
  const source = new AudioBufferSourceNode(ctx, { buffer: sfx.noiseBuf, playbackRate: swing ? 1.12 : 0.96 });
  const filter = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 650, Q: 0.65 });
  const gain = new GainNode(ctx, { gain: 0 });
  const pan = panner(at);
  filter.frequency.setValueAtTime(swing ? 850 : 650, t);
  filter.frequency.exponentialRampToValueAtTime(swing ? 4200 : 3400, t + 0.06);
  filter.frequency.exponentialRampToValueAtTime(500, t + duration);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.48, t + 0.045);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  source.connect(filter).connect(gain).connect(pan).connect(sfx.fx);
  source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect(); };
  source.start(t, Math.random() * 2); source.stop(t + duration + 0.01);
}

// Dash: a fast rising rush of air with a low thump, at the player.
export function dashSound(at = here(0.8)) {
  if (!sfx.ctx) return;
  const ctx = sfx.ctx, t = ctx.currentTime, dur = 0.32, out = panner(at);
  const source = new AudioBufferSourceNode(ctx, { buffer: sfx.noiseBuf, playbackRate: 1.1 });
  const f = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 500, Q: 0.9 }), g = new GainNode(ctx, { gain: 0 });
  f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3800, t + 0.1); f.frequency.exponentialRampToValueAtTime(700, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  source.connect(f).connect(g).connect(out).connect(sfx.fx);
  source.start(t, Math.random() * 2); source.stop(t + dur + 0.02);
  tone([120], { dur: 0.18, vol: 0.03, slide: 0.5, at });
}

// ------------------------------------------------------------ positional sound
// The listener is the camera. Sources are HRTF panners with a slow, wide rolloff, so a call is still heard (dull and
// quieter, from the right side) across the whole sky, and clearly loud up close.
const fwd = new V3(), up = new V3();
function updateListener() {
  const l = sfx.ctx.listener, p = camera.position;
  camera.getWorldDirection(fwd); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  if (l.positionX) {
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
    l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
    l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
  } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  // 8D ambience: the wind slowly circles the listener (a full turn in ~24 s, drifting up and down); rain falls from above
  const a = U.time.value * 0.26, w = sfx.windPan, r = sfx.rainPan;
  w.positionX.value = p.x + Math.sin(a) * 6; w.positionY.value = p.y + Math.sin(a * 0.37) * 2; w.positionZ.value = p.z + Math.cos(a) * 6;
  r.positionX.value = p.x + Math.sin(a * 0.5) * 3; r.positionY.value = p.y + 8; r.positionZ.value = p.z + Math.cos(a * 0.5) * 3;
}

// A binaural (HRTF) source at a world position. `ref` = the distance up to which it is at full volume.
const here = (dy = 0.6) => ({ x: U.player.value.x, y: U.player.value.y + dy, z: U.player.value.z });
function panner(at, ref = 8) {
  return new PannerNode(sfx.ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: ref, rolloffFactor: 1, maxDistance: 600, positionX: at.x, positionY: at.y, positionZ: at.z });
}

// The whale sings now and then, from its head, wherever it is. Returns 0..1 (how loud the call is right now)
// so the model can glow with it. `pos` = the whale's head, `paused` holds the timer.
let call = null, callIn = 6 + Math.random() * 6;
export function updateWhaleVoice(dt, pos, paused) {
  if (!sfx.ctx || !buffers.whale) return 0;
  if (!call) {
    if (paused || (callIn -= dt) > 0) return 0;
    const ctx = sfx.ctx, filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 18000 });
    const panner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 35, maxDistance: 2000, rolloffFactor: 0.55 });
    const source = new AudioBufferSourceNode(ctx, { buffer: buffers.whale, playbackRate: 1 + (Math.random() - 0.5) * 0.08 });
    source.connect(filter).connect(new GainNode(ctx, { gain: 2.2 })).connect(panner).connect(sfx.fx);
    source.start();
    call = { source, filter, panner, t0: ctx.currentTime, dur: buffers.whale.duration / source.playbackRate.value };
    source.onended = () => { call = null; callIn = 25 + Math.random() * 30; };
  }
  const { panner, filter } = call;
  panner.positionX.value = pos.x; panner.positionY.value = pos.y; panner.positionZ.value = pos.z;
  filter.frequency.value = clamp(18000 - camera.position.distanceTo(pos) * 45, 2200, 18000);   // air dulls the far calls
  const k = (sfx.ctx.currentTime - call.t0) / call.dur;
  return clamp(Math.sin(k * Math.PI) * 1.4, 0, 1);
}

// Cutscene music: starts now (optionally looping, `offset` seconds into the file, fading in over `fadeIn` s) and
// returns stop(fadeSeconds).
export function playCine(name, { loop = false, vol = 1, offset = 0, fadeIn = 0 } = {}) {
  const buffer = buffers[name];
  if (!sfx.ctx || !buffer) return () => {};
  const src = new AudioBufferSourceNode(sfx.ctx, { buffer, loop }), g = new GainNode(sfx.ctx, { gain: fadeIn ? 0 : vol });
  if (fadeIn) g.gain.linearRampToValueAtTime(vol, sfx.ctx.currentTime + fadeIn);
  src.connect(g).connect(sfx.cine); src.start(0, offset);
  return (fade = 0.5) => { const t = sfx.ctx.currentTime; g.gain.setTargetAtTime(0, t, fade / 3); src.stop(t + fade + 0.1); };
}
export const cineReady = name => !!(sfx.ctx && buffers[name]);   // decoded yet? (they load in the background)

// ---------------------------------------------------------------- the rift's debris (synthesized, no files)
// Straight into the cutscene bus (not muffled like the world), scaled by the effects volume, from where it happens.
function debrisOut(at, ref) {
  const g = new GainNode(sfx.ctx, { gain: settings.sfx / 10 });
  g.connect(sfx.cine);
  if (!at) return g;
  const p = panner(at, ref); p.connect(g); return p;
}
// filtered noise burst: `f` → `f2` over its length
function burst(out, t, { dur, type = 'bandpass', f, f2 = f, q = 1, vol, attack = 0.005, rate = 1 }) {
  const s = new AudioBufferSourceNode(sfx.ctx, { buffer: sfx.noiseBuf, playbackRate: rate });
  const fl = new BiquadFilterNode(sfx.ctx, { type, frequency: f, Q: q }), g = new GainNode(sfx.ctx, { gain: 0 });
  if (f2 !== f) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(out); s.start(t, Math.random() * 3); s.stop(t + dur + 0.05);
}
const rr = (a, b) => a + Math.random() * (b - a);

// Rock giving way: a dry crack, the crumbling body, a low thud and grit trickling after. size 0..1 (pebble → cliff).
export function rockBreak(at, size = 0.5) {
  if (!sfx.ctx) return;
  const t = sfx.ctx.currentTime, out = debrisOut(at, 10 + size * 40);
  burst(out, t, { dur: 0.05 + 0.12 * size, f: rr(1800, 3200) * (1 - 0.4 * size), q: 0.9, vol: 0.5 });
  burst(out, t + 0.01, { dur: 0.4 + 1.6 * size, type: 'lowpass', f: 1400 - 600 * size, f2: 120, vol: 0.25 + 0.5 * size, attack: 0.02, rate: 0.7 });
  const o = new OscillatorNode(sfx.ctx, { type: 'sine', frequency: rr(55, 90) }), g = new GainNode(sfx.ctx, { gain: 0 });
  o.frequency.exponentialRampToValueAtTime(30, t + 0.6 + size);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.15 + 0.5 * size, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6 + size);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.7 + size);
  for (let i = 0, n = 3 + Math.round(size * 16); i < n; i++) {   // grit and pebbles, thinning out
    const d = Math.pow(Math.random(), 1.6) * (0.3 + 1.8 * size);
    burst(out, t + 0.03 + d, { dur: rr(0.015, 0.05), f: rr(2500, 6500), q: 2, vol: rr(0.06, 0.2) * (1 - d / (0.4 + 1.8 * size)) });
  }
}

// Stone straining before it breaks: a slow, wavering groan.
export function creak(at, vol = 0.12) {
  if (!sfx.ctx) return;
  const t = sfx.ctx.currentTime, dur = rr(0.8, 1.8), out = debrisOut(at, 25);
  const o = new OscillatorNode(sfx.ctx, { type: 'sawtooth', frequency: rr(45, 90) }), bp = new BiquadFilterNode(sfx.ctx, { type: 'bandpass', frequency: rr(350, 800), Q: 7 });
  const curve = new Float32Array(16).map(() => rr(40, 110));
  o.frequency.setValueCurveAtTime(curve, t, dur);
  const g = new GainNode(sfx.ctx, { gain: 0 });
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(bp).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}

// A chunk flying close past the camera.
export function debrisWhoosh(at, size = 0.5) {
  if (!sfx.ctx) return;
  const t = sfx.ctx.currentTime, dur = 0.6 + 0.6 * size, out = debrisOut(at, 6);
  burst(out, t, { dur, f: 250, f2: 180, q: 0.7, vol: 0.35 + 0.3 * size, attack: dur * 0.45, rate: 0.8 });
  burst(out, t, { dur: dur * 0.8, f: 1400, f2: 500, q: 0.8, vol: 0.2, attack: dur * 0.4 });
}

// The ground itself: a continuous low roar with gravel in it. level(0..1) follows the destruction; stop(fade).
export function quakeBed() {
  if (!sfx.ctx) return { level() {}, stop() {} };
  const ctx = sfx.ctx, out = debrisOut(null), s = new AudioBufferSourceNode(ctx, { buffer: sfx.noiseBuf, loop: true, playbackRate: 0.5 });
  const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 90, Q: 0.7 }), grav = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 700, Q: 0.6 });
  const gL = new GainNode(ctx, { gain: 0 }), gG = new GainNode(ctx, { gain: 0 });
  s.connect(low).connect(gL).connect(out); s.connect(grav).connect(gG).connect(out); s.start();
  return {
    level(k) { const t = ctx.currentTime; gL.gain.setTargetAtTime(1.4 * k, t, 0.3); gG.gain.setTargetAtTime(0.12 * k * (0.6 + 0.4 * Math.random()), t, 0.15); },
    stop(fade = 1) { const t = ctx.currentTime; gL.gain.setTargetAtTime(0, t, fade / 3); gG.gain.setTargetAtTime(0, t, fade / 3); s.stop(t + fade + 0.1); },
  };
}
