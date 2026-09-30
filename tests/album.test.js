import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { photoTarget } from '../src/game/album.js';

test('photo album accepts a framed landmark and ignores off-screen or known ones', () => {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const spots = [
    { id: 'centre', x: 0, y: 0, z: 0 },
    { id: 'outside', x: 20, y: 0, z: 0 },
  ];
  assert.equal(photoTarget(camera, spots)?.id, 'centre');
  assert.equal(photoTarget(camera, spots, ['centre']), null);
  camera.position.set(0, 0, 2);
  camera.updateMatrixWorld();
  assert.equal(photoTarget(camera, spots), null);
});
