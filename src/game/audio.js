// Synthesized ambience (filtered-noise wind that follows the gusts, soft chimes with echo) plus recorded
// one-shots from assets/audio (jump, return).
import { U, game } from '../core.js';
import { settings } from '../config.js';
import jumpUrl from '../../assets/audio/jump.mp3?url';
import returnUrl from '../../assets/audio/return.mp3?url';

const sfx = {}, buffers = {}, playing = {};
const SAMPLES = { jump: jumpUrl, return: returnUrl };

export function initAudio() {
  if (sfx.ctx) { sfx.ctx.resume(); return; }
  const ctx = new AudioContext(), master = ctx.createGain();
  master.gain.value = settings.volume / 10;
  master.connect(ctx.destination);
  const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 320 }), band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 800, Q: 2.5 });
  const gLow = new GainNode(ctx, { gain: 0 }), gHigh = new GainNode(ctx, { gain: 0 });
  src.connect(low).connect(gLow).connect(master);
  src.connect(band).connect(gHigh).connect(master);
  const rainHP = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 1800 }), gRain = new GainNode(ctx, { gain: 0 });
  src.connect(rainHP).connect(gRain).connect(master);
  src.start();
  const delay = new DelayNode(ctx, { delayTime: 0.33 }), fb = new GainNode(ctx, { gain: 0.38 }), wet = new GainNode(ctx, { gain: 0.45 });
  delay.connect(fb).connect(delay); delay.connect(wet).connect(master);
  const music = new GainNode(ctx, { gain: settings.music / 10 }); music.connect(master); music.connect(delay);
  const fx = new GainNode(ctx, { gain: settings.sfx / 10 }); fx.connect(master);   // jump, landing, chimes, thunder
  Object.assign(sfx, { ctx, master, gLow, gHigh, band, delay, music, fx, gRain, noiseBuf: buf });
  for (const [name, url] of Object.entries(SAMPLES))   // decode in the background; playSample() ignores samples that aren't ready yet
    fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { buffers[name] = buf; }).catch(console.error);
}

// one-shot sample with optional random pitch jitter; single = cut the previous instance first.
// Returns false if audio or the sample isn't ready (callers can fall back to a synth tone).
export function playSample(name, { vol = 1, jitter = 0, single = false } = {}) {
  const buffer = buffers[name];
  if (!sfx.ctx || !buffer) return false;
  if (single) playing[name]?.stop();
  const src = new AudioBufferSourceNode(sfx.ctx, { buffer, playbackRate: 1 + (Math.random() - 0.5) * 2 * jitter });
  src.connect(new GainNode(sfx.ctx, { gain: vol })).connect(sfx.fx);
  src.start();
  playing[name] = src;
  return true;
}

export function tone(freqs, { dur = 1.2, vol = 0.1, attack = 0.01, type = 'sine', gap = 0.07, slide = 0 } = {}) {
  if (!sfx.ctx) return;
  const t0 = sfx.ctx.currentTime;
  freqs.forEach((f, i) => {
    const t = t0 + i * gap, o = new OscillatorNode(sfx.ctx, { type, frequency: f }), g = new GainNode(sfx.ctx, { gain: 0 });
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfx.fx); if (!slide) g.connect(sfx.delay);
    o.start(t); o.stop(t + dur + 0.05);
  });
}

// alt: 0 at the bottom, 1 at the summit -> the wind gets stronger as you climb
export function updateAudio(alt, paused) {
  if (!sfx.ctx) return;
  updateMusic();
  const t = sfx.ctx.currentTime, g = U.gust.value;
  const amb = settings.ambience / 10;   // wind level
  sfx.gLow.gain.setTargetAtTime((0.1 + 0.16 * g + alt * 0.1) * amb, t, 0.4);
  sfx.gHigh.gain.setTargetAtTime((0.012 + 0.05 * g * (0.4 + alt)) * amb, t, 0.4);
  sfx.band.frequency.setTargetAtTime(550 + 650 * g + alt * 200, t, 0.6);
  sfx.music.gain.setTargetAtTime(settings.music / 10, t, 0.2);
  sfx.fx.gain.setTargetAtTime(settings.sfx / 10, t, 0.2);
  sfx.gRain.gain.setTargetAtTime(game.wx.rain * 0.07 * settings.ambience / 10, t, 0.6);
  sfx.master.gain.setTargetAtTime(settings.volume / (paused ? 25 : 10), t, 0.2);
}

// ---------------------------------------------------------------- background music (generated, no files)
// A slow pad that changes chord every ~14 s, plus sparse pentatonic bell notes into the echo.
// By day: bright major-7th chords in C; at night: lower, darker minor chords in A.
const mtof = m => 440 * 2 ** ((m - 69) / 12);
const CHORDS = {
  day: [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]],
  night: [[45, 52, 59, 64], [41, 48, 55, 60], [38, 45, 52, 57], [40, 47, 55, 59]],
};
const SCALE = { day: [72, 74, 76, 79, 81, 84], night: [69, 72, 74, 76, 79, 81] };
const mus = { nextChord: 0, nextNote: 0, step: 0 };

function pad(notes, t, dur) {
  const lp = new BiquadFilterNode(sfx.ctx, { type: 'lowpass', frequency: 750, Q: 0.4 }); lp.connect(sfx.music);
  for (const m of notes) for (const det of [-7, 7]) {
    const o = new OscillatorNode(sfx.ctx, { type: 'triangle', frequency: mtof(m), detune: det }), g = new GainNode(sfx.ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.018, t + 5); g.gain.setValueAtTime(0.018, t + dur - 6); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(lp); o.start(t); o.stop(t + dur + 0.1);
  }
}
function bell(m, t) {
  const o = new OscillatorNode(sfx.ctx, { type: 'sine', frequency: mtof(m) }), g = new GainNode(sfx.ctx, { gain: 0 });
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
  o.connect(g).connect(sfx.music); o.start(t); o.stop(t + 3.6);
}
function updateMusic() {
  const now = sfx.ctx.currentTime, mood = game.day > 0.45 ? 'day' : 'night';
  if (now >= mus.nextChord) { pad(CHORDS[mood][mus.step++ % 4], now + 0.05, 16); mus.nextChord = now + 14; }
  if (now >= mus.nextNote) { const sc = SCALE[mood]; bell(sc[(Math.random() * sc.length) | 0], now + 0.05); mus.nextNote = now + 2.5 + Math.random() * 5; }
}

// distant thunder: a low rumble of filtered noise, `delay` seconds from now (the flash comes first)
export function thunder(delay = 1) {
  if (!sfx.ctx) return;
  const t = sfx.ctx.currentTime + delay, s = new AudioBufferSourceNode(sfx.ctx, { buffer: sfx.noiseBuf, loop: true });
  const lp = new BiquadFilterNode(sfx.ctx, { type: 'lowpass', frequency: 160 }), g = new GainNode(sfx.ctx, { gain: 0 });
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.7, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
  s.connect(lp).connect(g).connect(sfx.fx); s.start(t); s.stop(t + 4.2);
}

// footsteps: grass = soft rustle, stone = dry tap, sand = gritty scrape, water = splash + plip
const STEP = {
  grass: { type: 'bandpass', f: 2800, q: 0.7, dur: 0.09, vol: 0.05 },
  stone: { type: 'bandpass', f: 1300, q: 1.2, dur: 0.05, vol: 0.08 },
  sand: { type: 'bandpass', f: 1800, q: 0.5, dur: 0.13, vol: 0.055 },
  water: { type: 'highpass', f: 1300, q: 0.5, dur: 0.2, vol: 0.09 },
};
export function stepSound(surface, power = 1) {
  const c = STEP[surface] || STEP.stone;
  if (!sfx.ctx || !sfx.noiseBuf) return;
  const t = sfx.ctx.currentTime, s = new AudioBufferSourceNode(sfx.ctx, { buffer: sfx.noiseBuf, playbackRate: 0.9 + Math.random() * 0.25 });
  const f = new BiquadFilterNode(sfx.ctx, { type: c.type, frequency: c.f * (0.85 + Math.random() * 0.3), Q: c.q }), g = new GainNode(sfx.ctx, { gain: 0 });
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(c.vol * power, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + c.dur);
  s.connect(f).connect(g).connect(sfx.fx); s.start(t, Math.random() * 3); s.stop(t + c.dur + 0.05);
  if (surface === 'water') tone([620 + Math.random() * 200], { dur: 0.16, vol: 0.02, slide: 0.5 });
}
