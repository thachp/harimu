import assert from 'node:assert/strict';
import { createCityWorld, capitalProfiles } from '../lib/game-art.ts';
const ids = ['kindle','confluence','meridian','korund','aurelle','ilmar','hoarvale','varkand','veldwood','fulmara'];
assert.deepEqual(Object.keys(capitalProfiles).sort(), [...ids].sort());
const layouts = new Set();
const colors = new Set();
for (const id of ids) {
  const world = createCityWorld(id);
  assert.equal(world.group.userData.capital, capitalProfiles[id].capital);
  assert.equal(world.buildings.length, 5);
  assert.deepEqual(world.buildings.map(b => b.location).sort(), ['square','home','workplace','market','government'].sort());
  const hall = world.buildings.find(b => b.location === 'government');
  assert.equal(hall.label, capitalProfiles[id].institution);
  layouts.add(world.buildings.map(b => b.position.toArray().join(',')).join('|'));
  colors.add(capitalProfiles[id].palette.wall);
  for (const building of world.buildings) {
    assert.ok(Math.abs(building.position.x) < 6 && Math.abs(building.position.z) < 6);
    assert.equal(building.object.userData.location, building.location);
  }
}
assert.equal(layouts.size, 10, 'all capital civic cores have distinct positions');
assert.equal(colors.size, 10, 'all capitals have distinct building palettes');
assert.equal(createCityWorld('fulmara').buildings.find(b => b.location === 'market').label, 'Arcport market');
assert.equal(createCityWorld('korund').buildings.find(b => b.location === 'market').label, 'State ration store');
assert.equal(createCityWorld('unknown').group.userData.capital, 'Forgehaven');
console.log('Ten distinct procedural capital layouts, institutions and playable destinations passed');
