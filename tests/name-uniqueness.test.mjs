import test from 'node:test';
import assert from 'node:assert/strict';
import { draftLeaderPersonas, aurelleClaimantHouses } from '../lib/leader-drafts.ts';
import { leaderPersonas } from '../lib/leader-personas.ts';
import { notableProfiles } from '../lib/notable-profiles.ts';
import { draftNotableProfiles } from '../lib/notable-drafts.ts';
import { additionalNotableProfiles } from '../lib/notable-roster.ts';

// Canon example names from the ten nation pages (harimu-docs content/world/nations/*.mdx, Culture > Language flavor).
const canon = ['Kaya Tarrek','Odo Brasswell','Rennek Ashby','Mira Kolt','Lanu Meesa','Oalin Tov','Ninaé Ruel','Maon Liss','Tsenga Holv','Shirun Dao-7','Galev Tsu','Imra Shen',
  'Strova Gren','Vardo Krel','Gruna Toss','Ilvo Brask','Aelis of Windrest','Corwen Highmere','Sieran Vale','Lirae Dunmorrow','Sorath Clearwell','Anoa Thessaly','Ithar Lume','Saveth Glassen',
  'Ingrid Fjeldmark','Aalo Rimehald','Sørne Vakk','Teodor Isling','Dask "Lantern" Voren','Kira Moorhald','Brann Vett','Yssa Dunkar','Wenna of Ashglade','Felwyn Torr','Ivel Marrow','Oskar Fernhollow',
  'Zara Vendezzo','Chiro Malvara','Talia Brine','Enzo Corvel'];
const draftNames = Object.values(draftNotableProfiles).flat().map(p => p.name);
const rosterNames = Object.values(additionalNotableProfiles).flat().map(p => p.name);
// Surname: last token, minus a rank-year suffix (-7) and call sign; "X of Y" -> Y.
const surname = name => name.replace(/"[^"]*"\s*/, '').replace(/-\d+$/, '').trim().split(/\s+/).pop();
// Declared on purpose: House Dunmorrow takes its seat town's name; canon Lirae Dunmorrow is of that house.
const declaredKin = new Set(['Dunmorrow']);

test('leader and claimant names are unique across all name sources', () => {
  const leaders = [...Object.values(draftLeaderPersonas).flat().map(p => p.name), ...aurelleClaimantHouses.map(h => h.claimant)];
  const others = [...canon, ...Object.values(leaderPersonas).map(p => p.name), ...Object.values(notableProfiles).map(p => p.name),
    ...draftNames, ...rosterNames];
  const otherNames = new Set(others), otherSurnames = new Set(others.map(surname));
  const seenNames = new Set(), seenSurnames = new Set();
  for (const name of leaders) {
    const last = surname(name);
    assert.ok(!otherNames.has(name), `name collision: ${name}`);
    assert.ok(declaredKin.has(last) || !otherSurnames.has(last), `surname collision: ${name}`);
    assert.ok(!seenNames.has(name) && !seenSurnames.has(last), `duplicate within leaders: ${name}`);
    seenNames.add(name); seenSurnames.add(last);
  }
});
test('Notable modules do not collide with each other or with live personas', () => {
  const groups = [Object.values(notableProfiles).map(p => p.name), Object.values(leaderPersonas).map(p => p.name),
    draftNames, rosterNames];
  const seen = new Map();
  groups.forEach((group, index) => { for (const name of group) for (const key of [name, surname(name)]) {
    assert.ok(!seen.has(key) || seen.get(key) === index, `cross-module collision: ${name}`); seen.set(key, index);
  } });
});
test('naming conventions: Meridian rank-year suffix, Varkand call sign, claimant seats are Aurelle cities', () => {
  for (const p of draftLeaderPersonas.meridian) assert.match(p.name, /-\d+$/);
  for (const p of draftLeaderPersonas.varkand) assert.match(p.name, /^\S+ "[^"]+" \S+$/);
  const aurelleCities = ['Highspire','Windrest','Highmere','Dunmorrow','Vale Bridge'];
  for (const h of aurelleClaimantHouses) { assert.ok(aurelleCities.includes(h.seat)); assert.notEqual(h.seat, 'Highmere'); }
  assert.equal(aurelleClaimantHouses.find(h => h.house === 'House Dunmorrow').seat, 'Dunmorrow');
});
