import * as THREE from 'three';
import { PH } from '../config.js';

// Measure the body, so raised swords never change the character's game scale.
export function prepareCharacter(model, animations) {
  // Locomotion keeps its body motion while drawn swords keep the guard pose.
  // The exported base clips carry the real back-mounted swords when sheathed.
  const guard = animations.find(c => c.name.endsWith('|Idle_Attack'));
  const isSwordTrack = t => /^Sword[RL]\./.test(t.name);
  const armedClips = guard ? animations.filter(c => !/\|(Attack|Idle_Attack|Draw|Sheathe)$/.test(c.name)).map(clip => {
    const tracks = clip.tracks.filter(t => !isSwordTrack(t)).map(t => t.clone());
    for (const track of guard.tracks.filter(isSwordTrack)) {
      const value = Array.from(track.values.slice(0, track.getValueSize()));
      tracks.push(new track.constructor(track.name, [0, clip.duration], [...value, ...value], track.getInterpolation()));
    }
    return new THREE.AnimationClip(clip.name + '_Armed', clip.duration, tracks);
  }) : [];
  model.animations = [...animations, ...armedClips];
  model.updateMatrixWorld(true);
  const body = model.getObjectByName('Ninja_Blob001');
  if (!body) throw new Error('O modelo do ninja não contém o corpo esperado.');
  const bounds = new THREE.Box3().setFromObject(body);
  const scale = PH / (bounds.max.y - bounds.min.y);
  model.scale.setScalar(scale);
  model.position.y = -bounds.min.y * scale;
  model.updateMatrixWorld(true);
  return model;
}

export function swordGroups(model) {
  return ['Espada1', 'Espada2'].map(name => model.getObjectByName(name)).filter(Boolean);
}
