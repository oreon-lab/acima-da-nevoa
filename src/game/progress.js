// Saved progress (localStorage): the current run (checkpoint, fragments, time, ghost recording) and things kept
// across runs (best time + its ghost, learned abilities, achievements and places found).
import { world, trailerMode } from '../mode.js';

// Isolated saves for local visual QA; never read or write a player's journey while previewing tests.
// O Instante keeps its own save, so crossing over never touches the journey above the mist.
const qa = trailerMode !== null || (import.meta.env?.DEV && new URLSearchParams(location.search).has('qa'));
let KEY, GKEY;
const useKeys = instante => { const base = instante ? 'nevoa-instante' : 'nevoa'; KEY = qa ? `${base}-qa-save` : `${base}-save`; GKEY = qa ? `${base}-qa-ghost` : `${base}-ghost`; };
useKeys(world.instante);
const RUN = () => ({ cp: 0, got: [], runT: 0, falls: 0, done: false, dirty: false, rec: [], echoes: [] });   // echoes: O Instante's stopped clocks
const KEPT = () => ({ glide: false, best: null, records: {}, visited: [], detours: [] });
export const save = { ver: '', ...RUN(), ...KEPT() };
export let ghost = null;   // { ver, t, rec } of the best run
// crossing over in the same page: from here on read and write O Instante's save (the journey's is saved first)
export function useInstanteSave() { persist(); useKeys(true); Object.assign(save, RUN(), KEPT()); ghost = null; }

// ver identifies the generated world; a run saved for a different world is dropped (kept stuff survives)
export function loadSave(ver, nIslands, nPickups, addedPickupIndex = -1, compatibleVersions = []) {
  save.ver = ver;
  const parts = ver.split('.');
  const legacyVer = addedPickupIndex >= 0 && parts.length === 4 ? `${parts[0]}.${parts[1]}.${nPickups - 1}.${parts[3]}` : null;
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') {
      const arr = v => (Array.isArray(v) ? v : []);
      save.glide = s.glide === true;
      save.records = s.records && typeof s.records === 'object' ? { ...s.records } : {};
      if (Number.isFinite(s.best) && s.ver) save.records[s.ver] = s.best;
      // Times belong to a route; changing the course keeps the old record without comparing unlike runs.
      const compatible = compatibleVersions.includes(s.ver);
      save.best = Number.isFinite(save.records[ver]) ? save.records[ver] : ((s.ver === legacyVer || compatible) && Number.isFinite(s.best) ? s.best : null);
      save.visited = arr(s.visited); save.detours = arr(s.detours);
      if (s.ver === ver || s.ver === legacyVer || compatible) {
        save.cp = Number.isInteger(s.cp) && s.cp >= 0 && s.cp < nIslands ? s.cp : 0;
        save.got = arr(s.got).filter(i => Number.isInteger(i) && i >= 0 && i < (s.ver === legacyVer ? nPickups - 1 : nPickups))
          .map(i => s.ver === legacyVer && i >= addedPickupIndex ? i + 1 : i);
        save.runT = Number.isFinite(s.runT) && s.runT > 0 ? s.runT : 0;
        save.falls = Number.isInteger(s.falls) ? s.falls : 0;
        save.done = s.done === true; save.dirty = s.dirty === true;
        save.echoes = arr(s.echoes).filter(Number.isInteger);
        save.rec = arr(s.rec).filter(f => Array.isArray(f) && f.length === 4 && f.every(Number.isFinite));
      }
    }
    const g = JSON.parse(localStorage.getItem(GKEY));
    if ((g?.ver === ver || g?.ver === legacyVer || compatibleVersions.includes(g?.ver)) && Number.isFinite(g.t) && Array.isArray(g.rec)) ghost = { ...g, ver };
  } catch { /* no save or storage blocked */ }
}
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* full or blocked */ } }
export function saveGhost(rec, t) {
  ghost = { ver: save.ver, t, rec };
  try { localStorage.setItem(GKEY, JSON.stringify(ghost)); } catch { /* ignore */ }
}
export function newRun() { Object.assign(save, RUN()); persist(); }

// add v to one of the kept lists; true if it was new
export function mark(list, v) {
  if (save[list].includes(v)) return false;
  save[list].push(v); persist();
  return true;
}
export const fmtTime = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
