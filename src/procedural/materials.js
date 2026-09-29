// Shared materials. Wind is applied in world space inside the vertex shader, so one
// merged mesh / one instanced mesh can sway everywhere at once.
import * as THREE from 'three';
import { U } from '../core.js';
import { WIND } from '../config.js';
import { f4 } from '../utils.js';

function addWind(mat, weight, decl = '', push = false) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTime: U.time, uGust: U.gust, uPlayer: U.player });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uGust; uniform vec3 uPlayer; ${decl}
        const vec2 WIND = vec2(${f4(WIND.x)}, ${f4(WIND.y)});`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wPos = modelMatrix * mvPosition;
        float wWeight = ${weight};
        float wv = sin(uTime * 1.4 + wPos.x * 0.21 + wPos.z * 0.17) * 0.55 + sin(uTime * 2.9 + wPos.x * 0.83 - wPos.z * 0.61) * 0.22;
        vec2 wd = WIND * (wv * (0.45 + uGust * 0.6) + uGust * 0.7);
        ${push ? `vec2 pd = wPos.xz - uPlayer.xz; float pl = length(pd);
        wd += pd / max(pl, 0.001) * (1.0 - smoothstep(0.2, 1.1, pl)) * step(abs(wPos.y - uPlayer.y), 0.8) * 1.8;` : ''}
        wPos.xz += wd * wWeight;
        wPos.y -= dot(wd, wd) * wWeight * 0.25;
        mvPosition = viewMatrix * wPos;
        gl_Position = projectionMatrix * mvPosition;`);
  };
}

// terrain, rocks, trees, props: flat-shaded vertex colours, per-vertex sway weight
export const worldMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.93 });
addWind(worldMat, 'aSway', 'attribute float aSway;');

// grass & flowers: bend with height and get pushed away by the player
export const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
addWind(grassMat, 'position.y * position.y * 0.32', '', true);
{ // blades keep their up-facing normal on both sides, so the back never goes dark
  const w = grassMat.onBeforeCompile;
  grassMat.onBeforeCompile = sh => { w(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')); };
}
