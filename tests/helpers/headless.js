// Exercise real level generation and player physics without a GPU. Only browser presentation is replaced.
import { registerHooks } from 'node:module';

export function installHeadlessPresentation() {
  const storage = new Map();
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  const noop = '() => {}';
  const mocks = {
    '/src/core.js': `import * as THREE from 'three';
      export const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xffffff, 0.01);
      export const camera = new THREE.PerspectiveCamera(60, 16/9, 0.1, 3000);
      export const renderer = { toneMappingExposure: 1 }; export const canvas = {};
      export const keys = {}; export const game = { state: 'play', gameT: 0, restoration: 0, tod: 0.08, day: 1, wx: { rain: 0, fog: 0, flash: 0 } };
      export const U = { time: { value: 0 }, gust: { value: 0 }, player: { value: new THREE.Vector3() }, density: { value: 0.01 }, pscale: { value: 1 }, night: { value: 0 } };`,
    '/src/game/ui.js': ['setCount', 'flashCount', 'areaTitle', 'toast'].map(n => `export const ${n} = ${noop};`).join('\n'),
    '/src/game/audio.js': ['tone', 'playSample', 'stepSound', 'glideSound', 'swordWhoosh', 'dashSound'].map(n => `export const ${n} = ${noop};`).join('\n'),
    '/src/render/post.js': 'export const grade = { uniforms: { uFade: { value: 0 } } };',
  };
  registerHooks({ load(url, context, nextLoad) {
    const path = new URL(url).pathname.replaceAll('\\', '/');
    const suffix = Object.keys(mocks).find(k => path.endsWith(k));
    return suffix ? { format: 'module', source: mocks[suffix], shortCircuit: true } : nextLoad(url, context);
  } });
  return storage;
}
