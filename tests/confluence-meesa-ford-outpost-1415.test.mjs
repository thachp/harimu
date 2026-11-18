/** #1415: Meesa Ford is the named #123 frontier outpost on the existing #487 Confluence square (docs §7.2 Cities).
 *  No new flag, no migration. Not added to the capital + two cities catalog. Travel stays closed while Confluence is not in mvpNations. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  citiesForNation,
  cityCaptureNote,
  cityForNation,
  FRONTIER_CAPTURE_NOTE,
  HEARTLAND_CAPTURE_NOTE,
  outpostCityForNation,
  outpostNationForCity,
} from '../lib/cities.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

test('Meesa Ford is the Confluence frontier outpost; catalog cities stay Heartland', () => {
  const outpost = outpostCityForNation('confluence');
  assert.deepEqual(outpost, {
    id: 'meesa-ford',
    nationId: 'confluence',
    name: 'Meesa Ford',
    capital: false,
    role: 'frontier',
    description: 'Frontier / trade river fort and banded-price market on the border with Meridian.',
  });
  assert.equal(outpostNationForCity('meesa-ford'), 'confluence');
  assert.equal(cityCaptureNote('confluence', 'meesa-ford'), FRONTIER_CAPTURE_NOTE);
  assert.equal(FRONTIER_CAPTURE_NOTE, 'Frontier city: can be besieged and captured in war (two assaults on different days).');
  assert.equal(citiesForNation('confluence').some(city => city.id === 'meesa-ford'), false);
  assert.equal(cityForNation('confluence', 'meesa-ford'), undefined);
  for (const city of citiesForNation('confluence')) {
    assert.equal(cityCaptureNote('confluence', city.id), HEARTLAND_CAPTURE_NOTE, city.id);
  }
});

test('Kindle, Korund, and Aurelle outposts are unchanged; other nations still have none', () => {
  assert.equal(outpostCityForNation('kindle').id, 'ashby-crossing');
  assert.equal(outpostCityForNation('korund').id, 'krel-arsenal');
  assert.equal(outpostCityForNation('aurelle').id, 'vale-bridge');
  assert.equal(cityCaptureNote('kindle', 'ashby-crossing'), FRONTIER_CAPTURE_NOTE);
  assert.equal(cityCaptureNote('aurelle', 'vale-bridge'), FRONTIER_CAPTURE_NOTE);
  for (const nation of ['meridian', 'varkand', 'hoarvale', 'ilmar', 'veldwood', 'fulmara']) {
    assert.equal(outpostCityForNation(nation), undefined, nation);
  }
});

test('the #487 square is unchanged; travel citySquares stays empty while Confluence is not in mvpNations', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const openings = await r.importModule('lib/nation-openings.ts');
  const zones = await r.importModule('lib/map-zones.ts');
  const travel = await r.importModule('lib/travel.ts');
  const seed = openings.nationOpenings.find(nation => nation.id === 'confluence');
  assert.deepEqual(seed.outpost, { x: 7, y: 10 });
  assert.equal(zones.mvpNations.some(nation => nation.id === 'confluence'), false);
  assert.deepEqual(await travel.citySquares(r.db, 'confluence'), []);
});
