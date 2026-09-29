// One file per procedural object. Import from here.
import { updateFloaters } from './floater.js';
import { updatePickups } from './pickup.js';
import { updateShrines } from './shrine.js';
import { updateBeacon } from './beacon.js';
import { updateCampfires } from './campfire.js';
import { updateCrystals } from './crystals.js';

export { addIsland } from './island.js';
export { addPlatform } from './platform.js';
export { addSpire } from './spire.js';
export { addAltar } from './altar.js';
export { addFloater } from './floater.js';
export { addTree } from './tree.js';
export { addBush } from './bush.js';
export { addPebble } from './pebble.js';
export { addBoulder } from './boulder.js';
export { addColumn } from './column.js';
export { addRoots } from './roots.js';
export { addShrine, lightShrine } from './shrine.js';
export { addPickup } from './pickup.js';
export { grassDisc, buildVegetation } from './grass.js';
// themed-island objects (placed by ../themes.js)
export { addPond } from './pond.js';
export { addReeds } from './reeds.js';
export { addPavement } from './pavement.js';
export { addArch } from './arch.js';
export { addBanner } from './banner.js';
export { addCampfire } from './campfire.js';
export { addTent } from './tent.js';
export { addPetals } from './petals.js';
export { addFireflies } from './fireflies.js';
export { addCrystalCluster } from './crystals.js';
export { addMushroom } from './mushroom.js';
export { addFlowerBed } from './flowerBed.js';
export { addHedge } from './hedge.js';
// parkour extras
export { addUpdraft } from './updraft.js';
export { addClimbWall } from './wall.js';

// per-frame life for everything that animates; cp = active checkpoint, emit = spawn embers
export function animateObjects(t, dt, cp, emit) {
  updateFloaters(t, dt);
  updatePickups(t, dt);
  updateShrines(t, dt, cp, emit);
  updateBeacon(t, dt, emit);
  updateCampfires(t, dt, emit);
  updateCrystals();
}
