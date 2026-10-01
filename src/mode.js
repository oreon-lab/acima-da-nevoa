// Which world this page is running: the journey above the mist, or O Instante (the other side of the rift).
// The rift cutscene crosses over in the same page (world.instante turns true); `?instante` starts there directly.
// Each world keeps its own save.
export const world = { instante: typeof location !== 'undefined' && new URLSearchParams(location.search).has('instante') };
export const worldUrl = instante => `${location.pathname}${instante ? '?instante' : ''}`;
// `?trailer=<clip>`: the page renders a scripted trailer clip frame by frame (see game/trailer.js) instead of waiting for a player.
// It keeps its own save so the player's progress is never touched.
export const trailerMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('trailer') ? new URLSearchParams(location.search).get('trailer') || 'journey' : null;
