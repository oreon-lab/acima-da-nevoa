import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { scene, game } from '../core.js';
import { dev, settings } from '../config.js';
import { islands, freeSpot, inside, waterAt } from '../procedural/world.js';
import { swordGroups } from './characterAsset.js';
import { combat, inSwordReach } from './combatRules.js';
import { burst } from '../fx/particles.js';
import { tone } from './audio.js';
import { cap } from './input.js';

export const enemies = [];
const hitColor = new THREE.Color('#bceeff');
const slashGeo = new THREE.RingGeometry(0.85, 0.93, 28, 1, -0.7, 2.4).rotateY(Math.PI / 2);
const slashes = [0, 1].map(() => {
  const mesh = new THREE.Mesh(slashGeo, new THREE.MeshBasicMaterial({ color: '#d6f6ff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  mesh.visible = false; scene.add(mesh);
  return { mesh, life: 0 };
});
let damagePlayer = null, returnPlayer = null, hudText = '';

export function buildCombat(model, onDamage, onReturn) {
  damagePlayer = onDamage; returnPlayer = onReturn;
  for (const index of [0, 2, 4, 6, 8]) {
    const island = islands[index];
    const spot = freeSpot(island, 0.12, 0.55, 0.9);
    if (!spot || waterAt(spot.x, spot.z)) continue;
    spawnEnemy(model, island, spot, { hp:3 });
  }
}

function spawnEnemy(model, island, spot, { hp, type = 'Guard', hostile = false, height = 1.05 }) {
  const body = clone(model), materials = [];
  for (const sword of swordGroups(body)) sword.visible = false;
  body.traverse(o => {
    if (!o.isMesh) return;
    const tint = material => {
      const m = material.clone();
      if (m.name === 'Ninja_Main') m.color.set('#53486d');
      if (m.name === 'Ninja_Secondary') m.color.set('#967baf');
      m.userData.baseEmissive = m.emissive.clone();
      materials.push(m); return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
  });
  const root = new THREE.Group(); root.name = type; root.add(body);
  root.position.set(spot.x, island.y, spot.z); scene.add(root);
  const bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: hostile ? '#dc8472' : '#dac2ff', depthTest:false, fog:false }));
  bar.position.y = height+.45; bar.scale.set(.65,.045,1); root.add(bar);
  const mixer = new THREE.AnimationMixer(body), acts = {};
  for (const clip of model.animations) acts[clip.name.split('|').pop()] = mixer.clipAction(clip);
  for (const n of ['HitRecieve','Bite_Front','Death']) if (acts[n]) { acts[n].setLoop(THREE.LoopOnce); acts[n].clampWhenFinished = true; }
  acts.Idle?.play();
  const enemy = { root,body,materials,bar,mixer,acts,anim:'Idle',island,home:root.position.clone(),hp,maxHp:hp,hostile,type,height,stun:0,cooldown:2,windup:0,dying:0 };
  enemies.push(enemy); return enemy;
}

function animateEnemy(e, name, force = false) {
  if ((!force && e.anim === name) || !e.acts[name]) return;
  e.acts[e.anim]?.fadeOut(0.1);
  e.acts[name].reset().fadeIn(0.1).play(); e.anim = name;
}

export function resetCombat() {
  combat.defeated = 0; combat.armed = false; combat.weaponTransition = null; combat.pendingAttack = false;
  for (const e of enemies) restoreEnemy(e);
}

function restoreEnemy(e) {
  e.hp = e.maxHp; e.stun = e.windup = e.dying = 0; e.cooldown = 2;
  e.root.position.copy(e.home); e.root.scale.setScalar(1); e.root.visible = true;
  e.bar.scale.x = 0.65; animateEnemy(e, 'Idle');
}

// Developer actions use the same death/reset paths as ordinary combat.
export function defeatAllEnemies() {
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    e.hp = 0; e.windup = 0; e.dying = 0.35; e.bar.scale.x = 0;
    animateEnemy(e, 'Death', true); combat.defeated++;
  }
}
export function reviveAllEnemies() {
  for (const e of enemies) restoreEnemy(e);
  combat.defeated = 0;
}

export function respawnCombat(player) {
  combat.hp = 3; combat.invulnerable = 2;
  for (const e of enemies) if (e.island.idx === player.cp && e.hp > 0) restoreEnemy(e);
}

// Only assist nearby targets inside the intended forward cone.
export function assistAttackYaw(player, yaw) {
  let best = null, score = Infinity;
  for (const e of enemies) {
    const dx = e.root.position.x - player.pos.x, dz = e.root.position.z - player.pos.z;
    const distance = Math.hypot(dx, dz), angle = Math.atan2(dx, dz);
    const delta = Math.atan2(Math.sin(angle - yaw), Math.cos(angle - yaw));
    if (e.hp <= 0 || distance > 2.5 || Math.abs(e.root.position.y - player.pos.y) > 0.8 || Math.abs(delta) > 0.48) continue;
    const candidate = distance + Math.abs(delta) * 2;
    if (candidate < score) { score = candidate; best = delta; }
  }
  return yaw + (best ?? 0);
}

export function swordStrike(player, swing) {
  const slash = slashes[swing];
  slash.life = 0.18; slash.mesh.visible = true;
  slash.mesh.position.copy(player.pos).add(new THREE.Vector3(Math.sin(player.yaw) * 0.82, 0.7, Math.cos(player.yaw) * 0.82));
  slash.mesh.position.x += Math.cos(player.yaw) * (swing ? -0.35 : 0.35);
  slash.mesh.position.z -= Math.sin(player.yaw) * (swing ? -0.35 : 0.35);
  slash.mesh.rotation.set(0, player.yaw, swing ? 0.55 : -0.55, 'YXZ');
  let hit = null;
  for (const e of enemies) {
    if (e.hp <= 0 || !inSwordReach(player.pos, player.yaw, e.root.position)) continue;
    hit = e.root.position; e.hp--; e.stun = 0.55; e.windup = 0; e.cooldown = 0.9;
    e.bar.scale.x = 0.65 * e.hp / e.maxHp;
    animateEnemy(e, 'HitRecieve');
    burst(e.root.position.x, e.root.position.y + 0.6, e.root.position.z, 12, 1.8, hitColor);
    if (e.hp === 0) { animateEnemy(e, 'Death', true); e.dying = 0.35; combat.defeated++; }
  }
  if (hit) tone([150, 620], { dur: 0.075, vol: 0.065, gap: 0.012, type: 'triangle', slide: 0.45, at: hit });
}

function walkEnemy(e, target, speed, dt) {
  const dx = target.x - e.root.position.x, dz = target.z - e.root.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.15) return false;
  const step = Math.min(speed * dt, distance), x = e.root.position.x + dx / distance * step, z = e.root.position.z + dz / distance * step;
  if (!inside(e.island.col, x, z, -0.7) || waterAt(x, z)
    || e.island.occ.some(o => o.solid && Math.hypot(x - o.x, z - o.z) < o.r + 0.35)) return false;
  e.root.position.x = x; e.root.position.z = z;
  e.root.rotation.y = Math.atan2(dx, dz);
  return true;
}

export function updateCombat(dt, player, fadePhase) {
  combat.invulnerable = Math.max(0, combat.invulnerable - dt);
  combat.hurt = Math.max(0, combat.hurt - dt);
  for (const s of slashes) {
    s.life = Math.max(0, s.life - dt); s.mesh.visible = s.life > 0;
    s.mesh.material.opacity = s.life / 0.18 * 0.6;
  }
  for (const e of enemies) {
    if (e.hp <= 0) {
      e.mixer.update(dt); e.dying = Math.max(0, e.dying - dt); e.root.scale.setScalar(e.dying / 0.35); e.root.visible = e.dying > 0; continue;
    }
    const distance = e.root.position.distanceTo(player.pos);
    e.bar.visible = distance < 8 && (combat.armed || e.hostile);
    if (distance > 30) continue;
    e.stun = Math.max(0, e.stun - dt); e.cooldown = Math.max(0, e.cooldown - dt);
    for (const m of e.materials) {
      m.emissive.copy(m.userData.baseEmissive);
      if (e.stun > 0 || e.windup > 0) { m.emissive.set(e.windup > 0 ? '#e25865' : '#99dfff'); m.emissiveIntensity = e.stun > 0 ? 0.65 : 0.25; }
      else m.emissiveIntensity = 0;
    }
    const engage = (e.hostile || (combat.armed && !combat.weaponTransition)) && fadePhase === 'none' && !dev.fly && inside(e.island.col, player.pos.x, player.pos.z, -0.2)
      && distance < (e.hostile ? 8 : 6) && Math.abs(player.pos.y - e.root.position.y) < 1.5;
    if (e.stun > 0) { e.mixer.update(dt); continue; }
    if (!engage) {
      e.windup = 0; animateEnemy(e, walkEnemy(e, e.home, 1, dt) ? 'Walk' : 'Idle');
    } else if (e.windup > 0) {
      e.windup -= dt;
      if (!e.struck && e.windup <= (e.biteAt ?? 0)) {
        e.struck = true;
        if (distance < 1.25 && combat.invulnerable <= 0 && !dev.safe) {
          combat.hp--; combat.invulnerable = 1.3; damagePlayer?.();
          burst(player.pos.x, player.pos.y + 0.6, player.pos.z, 8, 1.2, new THREE.Color('#ff99ad'));
          tone([180, 110], { dur: 0.16, vol: 0.04, at: player.pos });
          if (combat.hp <= 0) returnPlayer?.();
        }
      }
      if (e.windup <= 0) {
        e.cooldown = 1.2;
      }
    } else if (distance < 1.1 && e.cooldown <= 0) {
      e.windup = 0.65; e.biteAt = e.hostile ? e.windup * 0.4 : 0; e.struck = false;
      if (e.acts.Bite_Front) e.acts.Bite_Front.timeScale = e.acts.Bite_Front.getClip().duration / e.windup;
      e.root.rotation.y = Math.atan2(player.pos.x - e.root.position.x, player.pos.z - e.root.position.z);
      animateEnemy(e, 'Bite_Front', true);
    } else animateEnemy(e, distance > 1 ? (walkEnemy(e, player.pos, e.hostile ? 1.65 : 1.45, dt) ? 'Walk' : 'Idle') : 'Idle');
    e.mixer.update(dt);
  }
}

export function updateCombatHud() {
  const el = document.querySelector('#combat');
  if (!el) return;
  const status = combat.hp <= 0 ? 'Voltando ao checkpoint…' : combat.hurt > 0 ? 'Atingido' : combat.weaponTransition ? (combat.weaponTransition.toArmed ? 'Sacando espadas' : 'Guardando nas costas') : combat.attack ? 'Golpe duplo' : combat.armed ? 'Guarda de combate' : 'Espadas nas costas';
  const controls = `${cap('attack')}atacar${cap('equip')}sacar / guardar`;
  const hearts = Array.from({ length: 3 }, (_, i) => `<i${i < combat.hp ? ' class="on"' : ''}>♥</i>`).join('');
  const text = `<div class="hp">${hearts}</div><div class="st">${status}</div><div class="kills">Guardas vencidos ${combat.defeated} / ${enemies.length}</div><div class="keys">${controls}</div>`;
  if (text !== hudText) { el.innerHTML = hudText = text; }
  el.classList.toggle('hurt', combat.hurt > 0);
  el.style.setProperty('--recovery', combat.attack ? `${1 - Math.min(1, combat.attack.time / combat.attack.duration)}` : '0');
  el.hidden = game.state === 'title' || game.state === 'loading' || game.state === 'ending';
}
