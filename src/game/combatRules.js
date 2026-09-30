// Two inward cuts meet the target's centre at frames 9 and 16 of the 28-frame clip.
export const IMPACTS = [9 / 28, 16 / 28];
export const ATTACK_RATE = 1.35;
export const DRAW_RATE = 1.25;
export const combat = { armed: false, weaponTransition: null, pendingAttack: false, attack: null, queued: false, hp: 3, invulnerable: 0, hurt: 0, defeated: 0 };

export function beginAttack(state, duration) {
  state.armed = true;
  state.queued = false;
  state.attack = { time: 0, duration, swing: 0 };
}

export function advanceAttack(state, dt) {
  const a = state.attack;
  if (!a) return { strikes: [], finished: false };
  a.time += dt;
  const strikes = [];
  while (a.swing < IMPACTS.length && a.time >= a.duration * IMPACTS[a.swing]) strikes.push(a.swing++);
  const finished = a.time >= a.duration;
  if (finished) state.attack = null;
  return { strikes, finished };
}

// +Z is the character's forward axis after Blender's Z-up -> glTF Y-up conversion.
export function inSwordReach(origin, yaw, target, radius = 0.4) {
  const dx = target.x - origin.x, dz = target.z - origin.z;
  const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const side = Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw));
  return Math.abs(target.y - origin.y) < 0.9 && forward >= 0
    && Math.hypot(dx, dz) <= 1.85 + radius && side <= 0.95 + radius;
}
