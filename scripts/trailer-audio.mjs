// Foley follows events recorded from the character and real attack animation, not guessed edit timestamps.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function foleyCues(events, dur) {
  let step = 0;
  return events.flatMap(e => {
    const at = Math.max(0, e.at - (e.kind === 'slice' ? 0.04 : 0));
    const v = step % 5, wood = e.floor === 'wood';
    const types = {
      cloth: [['trailer/audio/kenney-rpg/Audio/cloth1.ogg', 0.42, 0.2]],
      land: [[wood ? 'trailer/audio/kenney-impact/Audio/footstep_wood_003.ogg' : 'trailer/audio/kenney-impact/Audio/footstep_concrete_002.ogg', 0.32, 0.5]],
      step: [[`trailer/audio/kenney-impact/Audio/footstep_${wood ? 'wood' : 'grass'}_00${v}.ogg`, 0.3, wood ? 0.38 : 0.3]],
      draw: [['trailer/audio/kenney-rpg/Audio/drawKnife2.ogg', 0.6, 0.45]],
      slice: [['trailer/audio/kenney-rpg/Audio/knifeSlice2.ogg', 0.35, 0.45]],
      wind: [['trailer/audio/synth/whoosh.wav', 1.2, 1.1]],
      kill: [['trailer/audio/synth/hit.wav', 1.2, 0.9], ['trailer/audio/kenney-impact/Audio/impactPunch_heavy_000.ogg', 0.5, 0.55]],
    };
    const s = types[e.kind];
    if (e.kind === 'step') step++;
    if (!s || at >= dur) return [];
    return s.map(([file, len, gain]) => ({ file, at, to: Math.min(dur, at + len), gain, offset: 0, fadeIn: 0.005, fadeOut: 0.08, mood: `foley:${e.kind}` }));
  });
}

// Trailer sound design synthesised by ffmpeg (no third-party samples): sub booms, a riser, wind, a whoosh and the whale.
const ch = 'pan=stereo|c0=c0|c1=c0';
const SYNTH = {
  // a falling sub with a short transient and a long room tail
  'boom.wav': ['aevalsrc=exprs=0.9*sin(2*PI*(40*t+(70/8)*(1-exp(-8*t))))*exp(-1.4*t)+0.4*(random(0)*2-1)*exp(-35*t):s=48000:d=4', `lowpass=f=1200,aecho=0.8:0.5:90|210:0.3|0.18,${ch}`],
  'hit.wav': ['aevalsrc=exprs=0.8*sin(2*PI*(65*t+(140/14)*(1-exp(-14*t))))*exp(-4*t)+0.7*(random(0)*2-1)*exp(-28*t):s=48000:d=1.2', `lowpass=f=3500,${ch}`],
  // 12 s of rising pitch, brightness and level: trimmed from its start so it always ends on the cue point
  'riser.wav': ['aevalsrc=exprs=(0.45*sin(2*PI*(55*t+1.3*t*t*t))+0.3*sin(2*PI*(82*t+1.95*t*t*t))+0.45*(random(0)*2-1)*pow(t/12\\,2))*pow(t/12\\,2.2):s=48000:d=12', `highpass=f=45,lowpass=f=5000,aecho=0.8:0.6:60|130:0.3|0.25,${ch}`],
  'wind.wav': ['anoisesrc=c=brown:a=0.7:d=24:seed=7:r=48000', `highpass=f=60,lowpass=f=650,tremolo=f=0.13:d=0.55,aecho=0.8:0.7:37|61:0.4|0.35,${ch}`],
  'whoosh.wav': ['anoisesrc=c=pink:a=0.9:d=1.2:seed=3:r=48000', `bandpass=f=900:width_type=h:w=1600,volume='pow(sin(PI*t/1.2)\\,3)':eval=frame,${ch}`],
  // a slow call that rises and falls, spread by a long echo so it sounds huge and far away
  'whale.wav': ['aevalsrc=exprs=(0.6*sin(2*PI*(160*t+(110*5/PI)*(1-cos(PI*t/5))))+0.25*sin(4*PI*(160*t+(110*5/PI)*(1-cos(PI*t/5)))))*pow(sin(PI*t/5)\\,1.5):s=48000:d=5', `vibrato=f=4.5:d=0.12,lowpass=f=1400,aecho=0.8:0.75:420|930:0.45|0.3,${ch}`],
};
export function synthSfx(root, ffmpeg) {
  const dir = resolve(root, 'trailer/audio/synth');
  mkdirSync(dir, { recursive: true });
  for (const [name, [src, fx]] of Object.entries(SYNTH)) {
    const out = resolve(dir, name);
    if (existsSync(out)) continue;
    const r = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', src, '-af', fx, '-c:a', 'pcm_s16le', out], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`synth ${name}: ${r.stderr}`);
  }
}
