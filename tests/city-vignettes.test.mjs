import test from 'node:test';
import assert from 'node:assert/strict';
import { cityVignettes, cityVignette, CITY_VIGNETTE_MAX, CITY_VIGNETTE_MIN_SENTENCES, CITY_VIGNETTE_MAX_SENTENCES } from '../lib/city-vignettes.ts';
import { citiesForNation } from '../lib/cities.ts';

const nations=['kindle','confluence','meridian','korund','aurelle','ilmar','hoarvale','varkand','veldwood','fulmara'];
const nonCapitals=nations.flatMap(n=>citiesForNation(n)).filter(c=>!c.capital);
const capitals=nations.flatMap(n=>citiesForNation(n)).filter(c=>c.capital);
// Canon landmarks, copied from harimu-docs content/world/nations/<page>.mdx (Cities > Landmark(s)).
const canonLandmark={'tarrek-foundry':'The Great Crucible','kolt-savanna':'Harvest Bell tower','lanu-terraces':'The Thousand-Step Terrace','oalin-harbor':'Riverpearl Market',
 'tsenga-sez':'SEZ Exchange Tower','holv-gorge':'Great Turbine Dam','strova-mines':'Ironroot Deep','gren-plateau':'Granary of the People','windrest':'Great Loom Hall',
 'highmere':'Duke\'s Windmill Ring','lume-mesa':'Pilgrim\'s Stair','glassen':'The Great Kiln','fjeldmark':'Frostcore Vaults','isling-springs':'The Great Bath',
 'voren-light':'Great Lens Lighthouse','moorhald':'Peat Commons','ashglade':'Heartwood Hall','fernhollow':'The Long Glade','vendezzo':'Grand Slipway','malvara-rods':'The Rod Forest'};
const sentences=s=>s.split(/(?<=[.!?])\s+/).filter(Boolean);

test('covers exactly the 20 non-capital cities from lib/cities.ts', () => {
  assert.equal(nonCapitals.length,20);
  assert.deepEqual(cityVignettes.map(c=>c.cityId).sort(), nonCapitals.map(c=>c.id).sort());
  for (const c of nonCapitals) assert.equal(cityVignette(c.id).nationId,c.nationId, c.id);
  for (const c of capitals) assert.equal(cityVignette(c.id),undefined, `capital ${c.id} has no vignette`);
});
test('2-3 sentences, length limit, proposal flag', () => {
  for (const c of cityVignettes) { const n=sentences(c.vignette).length;
    assert.ok(n>=CITY_VIGNETTE_MIN_SENTENCES&&n<=CITY_VIGNETTE_MAX_SENTENCES, `${c.cityId}: ${n} sentences`);
    assert.ok(c.vignette.length<=CITY_VIGNETTE_MAX, `${c.cityId}: ${c.vignette.length}`); assert.equal(c.proposal,true); }
});
test('signature building is the canon landmark and appears in the vignette', () => {
  for (const c of cityVignettes) { assert.equal(c.signatureBuilding,canonLandmark[c.cityId], c.cityId);
    assert.ok(c.vignette.toLowerCase().includes(c.signatureBuilding.replace(/^The /,'').toLowerCase()), `${c.cityId} vignette names its building`); }
});
test('no real-world places, people or Notables', () => {
  const real=['earth','europe','asia','africa','america','pacific','atlantic','china','japan','india','russia','france','germany','italy','venice','iceland','norway','sahara','andes','alps','himalaya','london','paris','rome','tokyo','mars','moon'];
  for (const c of cityVignettes) { const s=c.vignette.toLowerCase();
    for (const r of real) assert.ok(!new RegExp(`\\b${r}\\b`).test(s), `${c.cityId} mentions ${r}`);
    assert.ok(!/\bNotable\b/.test(c.vignette), c.cityId); }
});
