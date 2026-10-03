import test from 'node:test';
import assert from 'node:assert/strict';
import { canCollect, lightStage, nextStage, restorationTarget, journeyHint } from '../src/game/journeyRules.js';
import { COURSE } from '../src/procedural/course.js';

test('a hidden or locked fragment cannot be collected, including after loading', () => {
  const k = { got: false, available: false, g: { visible: false } };
  assert.equal(canCollect(k), false);
  k.g.visible = true; assert.equal(canCollect(k), false);
  k.available = true; assert.equal(canCollect(k), true);
  k.got = true; assert.equal(canCollect(k), false);
});
test('restoration progresses at meaningful thresholds and never gates the ending', () => {
  assert.deepEqual([0, 4, 5, 11, 12, 23, 24, 37].map(lightStage), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(nextStage(5), 12);
  assert.equal(nextStage(37), null);
  assert.equal(restorationTarget(0, true), 1);
  assert.ok(Math.abs(restorationTarget(24, false) - 0.6) < 1e-10);
});
test('every crossing teaches a known action and the climax recalls skills already taught', () => {
  for (const c of COURSE) assert.ok(journeyHint(c.hint, 'K', 'IJKL'));
  assert.ok(COURSE.findIndex(c => c.type === 'wind') < COURSE.findIndex(c => c.type === 'vents'));
  assert.ok(COURSE.findIndex(c => c.type === 'climb') < COURSE.length - 1);
  assert.equal(COURSE[3].type, 'glideIntro');
  assert.equal(COURSE.at(-1).type, 'finale');
  assert.ok(journeyHint('glide', 'K', 'IJKL').includes('K'));
});
