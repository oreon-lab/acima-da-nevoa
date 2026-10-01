// The crossing: one continuous shot from the rift cutscene's last frame to control in O Instante.
//   0     inside the horizon: black. The old world is taken down and O Instante built (the one heavy frame, unseen).
//   0.3   the tunnel fades in: streaks of light rushing past, scraps of the old world tumbling by, the character
//         spinning ahead of the camera, a riser climbing to…
//   3.5   …a flash: out of the hole on the other side, which opens as it spits the character out
//   3.5   the fall: the camera rises from under the hole, swings over the character to show the stopped world far
//         below, then settles behind them as they right themselves; out of the tunnel the world is grey, colour
//         only round the character
//   7.4   landing on the first island (dust, a thud, a squash), the letterbox slides away
//   8.7   the camera is already where the game camera would be: control is handed over without a cut
import * as THREE from 'three';
import { scene, camera, game, U } from '../core.js';
import { V3, clamp, lerp, smoothstep, rand, TAU } from '../utils.js';
import { settings } from '../config.js';
import { grade } from '../render/post.js';
import { player, rig, syncRig, spawnAt } from './player.js';
import { cam, cineCam, resetCameraMotion } from './camera.js';
import { playCine, cineReady, tone, rockBreak, thunder, debrisWhoosh } from './audio.js';
import { instante, startHum, welcome } from '../procedural/instante.js';
import { islands } from '../procedural/world.js';
import { puff, burst } from '../fx/particles.js';
import { areaTitle } from './ui.js';

const T_TUN = 0.3, T_OUT = 3.5, T_LAND = 7.4, T_BARS = 7.9, T_CTRL = 8.7;
export const crossing = { on: false, t: 0 };
const fired = new Set(), once = (k, at) => crossing.t >= at && !fired.has(k) && fired.add(k);

// ---- the tunnel, far above everything (its walls hide the rest of the world)
const TUN = new V3(0, 900, 0), CAM_X = -150;
const tunnelMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, fog: false, uniforms: { uOff: { value: 0 }, uK: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uOff, uK; varying vec2 vUv;
  float h1(float n){ return fract(sin(n * 91.345) * 43758.5453); }
  void main(){
    float lane = floor(vUv.x * 90.0), h = h1(lane);
    float y = fract(vUv.y * 5.0 * (0.6 + h) - uOff * (0.5 + h) + h * 7.0);
    float streak = smoothstep(0.0, 0.015, y) * (1.0 - smoothstep(0.015, 0.2 + h * 0.3, y)) * step(0.45, h);
    float band = 0.5 + 0.5 * sin(vUv.x * 18.85 + vUv.y * 40.0 + uOff * 2.0);
    vec3 col = mix(vec3(0.03, 0.01, 0.07), vec3(0.22, 0.08, 0.38), band * 0.45) + vec3(0.8, 0.58, 1.0) * streak * 1.7;
    gl_FragColor = vec4(col * uK, 1.0);
  }`,
});
const exitMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uK: { value: 0 } },
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uK; varying vec2 vP; void main(){ float r = length(vP) * 2.0;
    gl_FragColor = vec4(vec3(0.95, 0.88, 1.0) * (exp(-r * 4.0) * 2.0 + exp(-r * 1.4) * 0.6) * uK * (1.0 - smoothstep(0.85, 1.0, r)), 1.0); }`,
});
const tunnel = new THREE.Group();
tunnel.add(new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 400, 48, 1, true).rotateZ(Math.PI / 2), tunnelMat));
const exitDisc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateY(-Math.PI / 2), exitMat);
exitDisc.position.x = 120; tunnel.add(exitDisc);
const glow = new THREE.PointLight('#b48cff', 6, 20, 1.4); glow.position.x = CAM_X + 2; tunnel.add(glow);
// scraps of the old world (grass, earth, rock) and loose thread tumbling past
const SCRAPS = 46, scrapCol = ['#6e9a44', '#5c8c3a', '#6b5842', '#716d67', '#a29b8d', '#d8c2ff'];
const scraps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), SCRAPS);
const scrapData = Array.from({ length: SCRAPS }, (_, i) => ({ a: rand(0, TAU), r: rand(1.4, 5.5), ph: rand(0, 70), s: rand(0.4, 1.6), sp: rand(18, 32), rot: new V3(rand(0, TAU), rand(0, TAU), rand(0, TAU)) }));
scrapData.forEach((d, i) => scraps.setColorAt(i, new THREE.Color(scrapCol[i % scrapCol.length])));
scraps.frustumCulled = false; tunnel.add(scraps);
tunnel.position.copy(TUN); tunnel.visible = false;
scene.add(tunnel);

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3(), _p = new V3();
const look = new V3(), pos = new V3(), tumbleAxis = new V3(0.35, 0.25, 1).normalize(), FLASH = new THREE.Color('#efe4ff');
let enter = null, E = new V3(), L = new V3(), shake = 0, lastWhoosh = 0;

// called by the rift cutscene as the camera crosses the horizon; `build` swaps the worlds (main.js)
export function startCrossing(build) {
  Object.assign(crossing, { on: true, t: 0 }); fired.clear();
  enter = build; cineCam.on = true; game.state = 'cutscene';
  grade.uniforms.uFadeCol.value.setRGB(0, 0, 0); grade.uniforms.uFade.value = 1;
}

// the game camera's pose for a given look target and orbit (the same maths as camera.js), so the hand-over is exact
function orbitPose(target, yaw, pitch, dist, out) {
  look.set(target.x, target.y + 1, target.z);
  return out.set(look.x + Math.sin(yaw) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + Math.cos(yaw) * Math.cos(pitch) * dist);
}
// keyframes over k: [k, value] pairs, eased between
const key = (k, frames) => { for (let i = 1; i < frames.length; i++) if (k <= frames[i][0]) return lerp(frames[i - 1][1], frames[i][1], smoothstep(k, frames[i - 1][0], frames[i][0])); return frames.at(-1)[1]; };
const setFov = f => { if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); } };

export function updateCrossing(dt) {
  if (!crossing.on) return;
  const t = (crossing.t += dt), g = grade.uniforms;
  if (once('build', 0.05)) {
    enter();
    E.copy(instante.exit); L.copy(islands[0].cp); instante.gray = 0;
    rig.scale.setScalar(1); rig.visible = true;
    player.grounded = false; player.jumpAnim = true; player.vel.set(0, 0, 0);
    tunnel.visible = true;
  }
  if (!fired.has('build')) return;
  if (once('riser', 0.2) && cineReady('riser')) playCine('riser', { offset: 8.15 - (T_OUT - 0.2), vol: 0.9 });   // its hard cut lands on the flash

  if (t < T_OUT) {                                            // ---- the tunnel
    const k = smoothstep(t, T_TUN, T_OUT);
    tunnelMat.uniforms.uOff.value += dt * (0.4 + 2.2 * k * k);
    tunnelMat.uniforms.uK.value = smoothstep(t, T_TUN, 1.1);
    exitMat.uniforms.uK.value = smoothstep(t, 1.6, 3.3); exitDisc.scale.setScalar(lerp(3, 28, smoothstep(t, 1.6, 3.4) ** 2));
    for (let i = 0; i < SCRAPS; i++) {
      const d = scrapData[i], x = 60 - ((d.ph + t * d.sp * (1 + k)) % 75);
      _p.set(CAM_X + x, Math.sin(d.a + t * 0.6) * d.r, Math.cos(d.a + t * 0.6) * d.r);
      _e.set(d.rot.x + t * 2, d.rot.y + t * 1.3, d.rot.z); _s.setScalar(d.s);
      scraps.setMatrixAt(i, _m.compose(_p, _q.setFromEuler(_e), _s));
      if (x < -1 && x > -2.5 && t - lastWhoosh > 0.35 && d.r < 2.5) { lastWhoosh = t; debrisWhoosh(_p.clone().add(TUN), 0.3); }
    }
    scraps.instanceMatrix.needsUpdate = true;
    // the character spins ahead, pulled along
    player.pos.set(TUN.x + CAM_X + 4.2 + Math.sin(t * 1.3) * 0.3, TUN.y - 0.6 + Math.sin(t * 1.7) * 0.25, TUN.z + Math.cos(t * 1.1) * 0.3);
    player.yaw = Math.PI / 2; syncRig();
    rig.quaternion.setFromAxisAngle(tumbleAxis, t * 2.6);
    pos.set(TUN.x + CAM_X, TUN.y, TUN.z);
    camera.position.copy(pos); camera.lookAt(player.pos.x + 20, player.pos.y, player.pos.z);
    camera.rotateZ(t * 0.5 + Math.sin(t * 7) * 0.01 * k);
    setFov(t < 1 ? lerp(100, 72, smoothstep(t, 0, 1)) : lerp(72, 96, k * k));
    if (t < 2) g.uFadeCol.value.setRGB(0, 0, 0); else g.uFadeCol.value.copy(FLASH);
    g.uFade.value = t < 2 ? 1 - smoothstep(t, T_TUN, 1.0) : smoothstep(t, 2.95, T_OUT);
    g.uGlitch.value = 0.2 * smoothstep(t, 2.6, T_OUT);
    return;
  }

  if (once('out', T_OUT)) {                                   // ---- out of the hole
    tunnel.visible = false; g.uGlitch.value = 0;
    instante.holeAge = -0.05; instante.gray = 1;
    player.yaw = Math.PI / 2;
    thunder(0); startHum();
    tone([196, 293.66, 392, 587.33], { dur: 3, vol: 0.05, attack: 0.02, gap: 0.09 });
    burst(E.x, E.y, E.z, 60, 5);
  }
  const k = clamp((t - T_OUT) / (T_LAND - T_OUT), 0, 1);
  g.uFadeCol.value.copy(FLASH); g.uFade.value = 1 - smoothstep(t, T_OUT, T_OUT + 0.9);
  if (k < 1) {                                                // ---- the fall
    const h = smoothstep(k, 0, 1), v = k ** 1.8;
    player.pos.set(lerp(E.x, L.x, h), lerp(E.y, L.y, v), lerp(E.z, L.z, h));
    syncRig();
    const spin = (t - T_OUT) * 5 * (1 - 0.5 * k);
    rig.quaternion.setFromAxisAngle(tumbleAxis, spin).slerp(_q.identity(), smoothstep(k, 0.5, 0.9));
    if (Math.random() < dt * 30) puff(player.pos.x, player.pos.y + 0.5, player.pos.z, 1, 0.3, 0.25, 0.3);
  }
  if (once('land', T_LAND)) {                                 // ---- landing
    spawnAt(0);                                               // exactly where the game starts (and its camera)
    rig.quaternion.identity();
    player.jumpAnim = false; player.sqV = -7;
    shake = 0.35;
    puff(L.x, L.y + 0.1, L.z, 26, 2.6, 0.7, 0.55);
    burst(L.x, L.y + 0.3, L.z, 24, 2.2, new THREE.Color('#d8c2ff'));
    rockBreak(L, 0.55);
    tone([392, 493.88, 587.33], { dur: 1.8, vol: 0.04, attack: 0.02, gap: 0.08 });
  }
  // the camera: under the hole looking up, over the character looking down at the stopped world, then behind them
  const yaw0 = -Math.PI / 2;
  const yaw = key(k, [[0, yaw0 + 2.6], [0.35, yaw0 + 1.3], [1, yaw0]]);
  const pitch = key(k, [[0, -0.45], [0.35, 1.05], [0.75, 0.6], [1, 0.36]]);
  const dist = key(k, [[0, 9], [0.4, 7.5], [1, cam.dist]]);
  orbitPose(player.pos, yaw, pitch, dist, pos);
  shake = Math.max(0, shake - dt * 0.5);
  const sh = shake * shake * 4;
  camera.position.copy(pos).add(new V3(Math.sin(t * 43) * sh, Math.sin(t * 37) * sh, Math.sin(t * 51) * sh));
  camera.lookAt(look);
  setFov(lerp(80, settings.fov, smoothstep(k, 0, 1)));
  if (once('bars', T_BARS)) document.body.classList.remove('bars');
  if (once('control', T_CTRL)) {                              // ---- hand over
    document.body.classList.remove('cinema');
    cam.yaw = yaw0; cam.pitch = 0.36; cam.blend = 1; cam.follow.copy(player.pos); resetCameraMotion();
    cineCam.on = false; crossing.on = false; g.uFade.value = 0;
    game.state = 'play';
    areaTitle(0, '');
    welcome(1500);
  }
}
