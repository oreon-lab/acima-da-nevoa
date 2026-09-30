// One file per procedural object. Import from here.
import { updateFloaters } from './floater.js';
import { updatePickups } from './pickup.js';
import { updateShrines } from './shrine.js';
import { updateBeacon } from './beacon.js';
import { updateCampfires } from './campfire.js';
import { updateCrystals } from './crystals.js';
import { updatePhase } from './phase.js';
import { updateBridges } from './bridge.js';
import { updateRuinsPuzzle } from './ruinsPuzzle.js';
import { updateLanterns } from './lantern.js';

export { addIsland, addIslet } from './island.js';
export { addStele } from './stele.js';
export { addLantern } from './lantern.js';
export { addPhasePlatform } from './phase.js';
export { addBridge } from './bridge.js';
export { addProp, loadProps } from './props.js';
export { addRuinsPuzzle, ruinsPuzzle, setRuinsSolved, nearestRuinsMirror, rotateRuinsMirror } from './ruinsPuzzle.js';
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
export { addShrine, lightShrine, resetShrines } from './shrine.js';
export { addPickup } from './pickup.js';
export { grassDisc, buildVegetation } from './grass.js';
// themed-island objects (placed by ../themes.js)
export { addPond, waterWake } from './pond.js';
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
export function animateObjects(t, dt, cp, emit, playerPosition) {
  updateFloaters(t, dt);
  updatePickups(t, dt);
  updateShrines(t, dt, cp, emit);
  updateBeacon(t, dt, emit);
  updateCampfires(t, dt, emit);
  updateCrystals();
  updatePhase(t, playerPosition);
  updateBridges(cp, dt);
  updateRuinsPuzzle(t);
  updateLanterns();
}
