// A continuous, clockwise circuit: the whale always swims forwards and pauses at both piers.
export const WHALE_WAIT = 12, WHALE_TRAVEL = 36;
export const WHALE_PERIOD = 2 * (WHALE_WAIT + WHALE_TRAVEL);
export function whalePose(time, route) {
  const t = ((time % WHALE_PERIOD) + WHALE_PERIOD) % WHALE_PERIOD;
  const half = WHALE_WAIT + WHALE_TRAVEL;
  const returning = t >= half, local = t % half;
  const progress = Math.max(0, Math.min(1, (local - WHALE_WAIT) / WHALE_TRAVEL));
  const eased = progress * progress * (3 - 2 * progress);
  const angle = Math.PI - (returning ? Math.PI : 0) - Math.PI * eased;
  const c = Math.cos(angle), s = Math.sin(angle), { nx, nz, radius, center, y } = route;
  const tx = -nz, tz = nx;
  const dx = nx * s - tx * c, dz = nz * s - tz * c;
  return {
    x: center.x + radius * (nx * c + tx * s),
    y: y + Math.sin(time * 0.55) * 0.1,
    z: center.z + radius * (nz * c + tz * s),
    yaw: Math.atan2(dz, dx),
    dock: local < WHALE_WAIT ? returning ? 'destination' : 'source' : null,
    waiting: local < WHALE_WAIT ? WHALE_WAIT - local : 0,
    sourceIn: !returning && local < WHALE_WAIT ? 0 : WHALE_PERIOD - t,
    destinationIn: returning && local < WHALE_WAIT ? 0 : t < half ? half - t : WHALE_PERIOD + half - t,
  };
}

export function carrierPoint(pose, x = 0, y = 0, z = 0) {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  return { x: pose.x + x * c - z * s, y: pose.y + y, z: pose.z + x * s + z * c };
}
