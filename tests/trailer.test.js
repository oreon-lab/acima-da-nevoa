import test from 'node:test';
import assert from 'node:assert/strict';
import { installHeadlessPresentation } from './helpers/headless.js';
installHeadlessPresentation();
const { Puppet, jump } = await import('../src/game/trailerKit.js');
const { CLIPS } = await import('../src/game/trailerClips.js');

test('trailer jumps are airborne until landing and have a still dwell', () => {
  const p = new Puppet([0, 0, 0]).add(jump([3, 1, 0], 0.8, 1.4, 0.1));
  for (const t of [0.1, 0.4, 0.79]) {
    assert.equal(p.at(t).grounded, false);
    assert.equal(p.at(t).jumping, true);
  }
  assert.equal(p.at(0.85).grounded, true);
  assert.equal(p.at(0.85).jumping, false);
  assert.equal(p.at(0.85).vel.length(), 0, 'a landed jump must not slide during its dwell');
});

test('every trailer caption is visible within its shot, and all cuts align to both supported frame rates', () => {
  const clip = CLIPS.journey;
  let at = 0;
  for (const s of clip.shots) {
    assert.ok(s.dur > 0);
    assert.ok(Math.abs(s.at - at) < 1e-6);
    for (const fps of [30, 60]) assert.ok(Math.abs(s.dur * fps - Math.round(s.dur * fps)) < 1e-6);
    for (const c of s.captions ?? []) assert.ok(c.at >= 0 && c.at < c.to && c.to <= s.dur, `${s.name}: caption exceeds shot`);
    at += s.dur;
  }
  assert.ok(at > 85 && at < 110);
  assert.equal(at, clip.dur);
  const tease = clip.shots.filter(s => s.teaser);
  assert.ok(tease.length > 0 && tease.reduce((n, s) => n + s.dur, 0) <= 1.8, 'the ending can only appear in brief glimpses');
  assert.ok(!clip.shots.some(s => /through-the-horizon|instante|resolution/.test(s.name)), 'the resolution stays undisclosed');
  const checkpoints = clip.shots.filter(s => s.island !== undefined).map(s => s.island);
  assert.ok(checkpoints.every((cp, i) => i === 0 || cp >= checkpoints[i - 1]), 'the edit always ascends rather than jumping backwards');
});

test('score cues fit the edit and leave a short break before the title resolves musically', () => {
  const clip = CLIPS.journey, cues = clip.audio(clip.shots);
  assert.ok(new Set(cues.map(c => c.file)).size >= 5);
  for (const c of cues) assert.ok(c.at >= 0 && c.at < c.to && c.to <= clip.dur);
  assert.ok(cues.every(c => c.file.startsWith('trailer/audio/')), 'the new score cannot reuse sounds intended for game cutscenes');
  const logo = clip.shots.find(s => s.name === 'title').at;
  assert.ok(cues.some(c => c.at > logo && c.at < logo + 1));
});
