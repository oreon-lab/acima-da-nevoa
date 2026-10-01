// Foley follows events recorded from the character and real attack animation, not guessed edit timestamps.
export function foleyCues(events, dur) {
  let step = 0;
  return events.flatMap(e => {
    const at = Math.max(0, e.at - (e.kind === 'slice' ? 0.04 : 0));
    const types = {
      cloth: ['trailer/audio/kenney-rpg/Audio/cloth1.ogg', 0.42, 0.2],
      land: ['trailer/audio/kenney-impact/Audio/footstep_concrete_002.ogg', 0.32, 0.5],
      step: [`trailer/audio/kenney-impact/Audio/footstep_grass_00${step % 3}.ogg`, 0.3, 0.3],
      draw: ['trailer/audio/kenney-rpg/Audio/drawKnife2.ogg', 0.6, 0.4],
      slice: ['trailer/audio/kenney-rpg/Audio/knifeSlice2.ogg', 0.35, 0.42],
    };
    const s = types[e.kind];
    if (e.kind === 'step') step++;
    if (!s || at >= dur) return [];
    return [{ file:s[0], at, to:Math.min(dur, at + s[1]), gain:s[2], offset:0, fadeIn:0.005, fadeOut:0.08, mood:`foley:${e.kind}` }];
  });
}
