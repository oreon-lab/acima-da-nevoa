import * as THREE from 'three';

export const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);
export const canvas = renderer.domElement;

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xffffff, 0.01);   // colour = tint, density driven per frame
export const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 3000);

// uniforms shared by many shaders
export const U = { time: { value: 0 }, gust: { value: 0 }, player: { value: new THREE.Vector3() }, density: { value: 0.01 }, pscale: { value: 1 } };

// 'loading' | 'title' | 'play' | 'pause'
export const game = { state: 'loading', gameT: 0, tod: 0.08, day: 1, wx: { fog: 0, rain: 0, flash: 0 } };   // tod: time of day 0..1 (0.25 noon, 0.75 midnight)
export const keys = {};
