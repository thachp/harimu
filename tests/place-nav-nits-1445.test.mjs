/** #1445 slice 4b. Nits behind the existing flags: door facing, crumb district and city, walk-back detail, zoom-path stacking. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { houseDoorPose, noteDistrictSlots, placeCrumbTargets, PLACE_NAV_FLAG } from '../lib/place-nav.ts';
import { houseSlots } from '../lib/neighborhood-walk.ts';
import { zoomPathCrumbs } from '../lib/zoom-path.ts';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const names = ['NEXT_PUBLIC_HARIMU_PLACE_NAV', 'NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_WALK', 'NEXT_PUBLIC_HARIMU_DESKTOP_GATE'];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
const restore = () => { for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; } noteDistrictSlots(null, null); };
const on = () => { for (const name of names) process.env[name] = 'true'; };
describe('place nav nits 1445', { concurrency: false }, () => {
  test('the door faces the square, crumbs carry district and city, and the nits stay behind the existing classes', async () => {
    assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 77);
    assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(75), PLACE_NAV_FLAG);
    const north = houseDoorPose({ x: 0, z: -8 }), south = houseDoorPose({ x: 0, z: 8 }), east = houseDoorPose({ x: 8, z: 0 }), west = houseDoorPose({ x: -8, z: 0 });
    assert.deepEqual(north, { x: 0, y: 0.46, z: -8 + 0.78, rotationY: 0 });
    assert.deepEqual(south, { x: 0, y: 0.46, z: 8 - 0.78, rotationY: 0 });
    assert.deepEqual(east, { x: 8 - 0.88, y: 0.46, z: 0, rotationY: Math.PI / 2 });
    assert.deepEqual(west, { x: -8 + 0.88, y: 0.46, z: 0, rotationY: Math.PI / 2 });
    for (const house of houseSlots(8)) {
      const door = houseDoorPose(house);
      assert.ok(Math.hypot(door.x, door.z) < Math.hypot(house.x, house.z), `${house.x},${house.z}`);
      const onX = door.z === house.z && door.rotationY === Math.PI / 2, onZ = door.x === house.x && door.rotationY === 0;
      assert.equal(onX || onZ, true);
    }
    try {
      on();
      noteDistrictSlots('forgehaven', 4);
      const targets = placeCrumbTargets('?view=neighborhood&nation=kindle&city=forgehaven&district=1', 'kindle', 'Forgehaven', false);
      assert.equal(targets.cityId, 'forgehaven');
      assert.equal(targets.district, '1');
      const crumbs = zoomPathCrumbs({ view: 'neighborhood', nationLabel: 'Kindle', cityLabel: 'Forgehaven', nationId: 'kindle', neighborhood: true, cityId: targets.cityId, district: targets.district });
      const city = crumbs.find(crumb => crumb.view === 'square'), hood = crumbs.find(crumb => crumb.view === 'neighborhood');
      assert.match(city.href, /(?:^|[?&])city=forgehaven(?:&|$)/);
      assert.doesNotMatch(city.href, /district=/);
      assert.match(hood.href, /(?:^|[?&])city=forgehaven(?:&|$)/);
      assert.match(hood.href, /(?:^|[?&])district=1(?:&|$)/);
      noteDistrictSlots('forgehaven', 2);
      const tight = placeCrumbTargets('?view=neighborhood&city=forgehaven&district=3', 'kindle', 'Forgehaven');
      assert.equal(tight.cityId, 'forgehaven');
      assert.equal(tight.district, undefined);
      const named = placeCrumbTargets('?view=neighborhood&district=0', 'kindle', 'Tarrek Foundry');
      assert.equal(named.cityId, 'tarrek-foundry');
      assert.equal(named.district, '0');
      assert.deepEqual(placeCrumbTargets('?view=neighborhood&city=forgehaven&district=1', 'kindle', 'Forgehaven', true), {});
      assert.equal(placeCrumbTargets('?view=neighborhood&city=nope&district=old', 'kindle', 'Forgehaven').district, undefined);
    } finally { restore(); }
    const shell = await read('app/game-shell.tsx'), panels = await read('app/scene-panels-v2.tsx'), walk = await read('app/neighborhood-walk.tsx'), css = await read('app/zoom-path.css');
    assert.match(shell, /placeShown \? placeCrumbTargets\(sceneSearch/);
    assert.match(shell, /cityId: crumbTargets\?\.cityId, district: crumbTargets\?\.district/);
    assert.match(panels, /onWalk \? districtLabels\(slots\)/);
    assert.match(panels, /detail: placeNavShown\(\) \? 'Back to the walk'/);
    assert.match(walk, /houseDoorPose\(houses\[you\]\)/);
    assert.match(walk, /door\.position\.set\(doorPose\.x, doorPose\.y, doorPose\.z\)/);
    assert.match(walk, /door\.rotation\.y = doorPose\.rotationY/);
    const lifted = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(rule => rule[2].includes('z-index:5') || rule[2].includes('z-index:auto'));
    assert.ok(lifted.length >= 2);
    for (const rule of lifted) {
      assert.match(rule[1], /\.game-place-nav/);
      assert.match(rule[1], /\.game-neighborhood-walk/);
      assert.match(rule[1], /\.game-city-drive/);
      assert.match(rule[1], /\.game-zoom-path|\.game-stage-overlay/);
    }
    assert.match(css, /\.game-zoom-path\{[^}]*position:static/);
    assert.doesNotMatch(css, /overflow-wrap:\s*anywhere|word-break:\s*break-all/);
    assert.doesNotMatch(`${shell}\n${panels}\n${walk}\n${css}`, /overflow-wrap:\s*anywhere|word-break:\s*break-all/);
  });
});
