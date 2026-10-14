import test from 'node:test';
import assert from 'node:assert/strict';
import { draftLeaderPersonas, aurelleClaimantHouses } from '../lib/leader-drafts.ts';
import { leaderPersonas } from '../lib/leader-personas.ts';
import { notableProfiles } from '../lib/notable-profiles.ts';
import { draftNotableProfiles } from '../lib/notable-drafts.ts';
import { additionalNotableProfiles } from '../lib/notable-roster.ts';

import { existsSync, readFileSync } from 'node:fs';

// Canon example names by nation, copied exactly from harimu-docs content/world/nations/<page>.mdx (Culture > Language flavor > Examples).
const canonByNation = {
  'kindle-republic': ['Kaya Tarrek','Odo Brasswell','Rennek Ashby','Mira Kolt'],
  'the-confluence': ['Lanu Meesa','Oalin Tov','Ninaé Ruel','Maon Liss'],
  'meridian': ['Tsenga Holv','Shirun Dao-7','Galev Tsu','Imra Shen'],
  'korund': ['Strova Gren','Vardo Krel','Gruna Toss','Ilvo Brask'],
  'aurelle': ['Aelis of Windrest','Corwen Highmere','Sieran Vale','Lirae Dunmorrow'],
  'ilmar-sanctum': ['Sorath Clearwell','Anoa Thessaly','Ithar Lume','Saveth Glassen'],
  'hoarvale': ['Ingrid Fjeldmark','Aalo Rimehald','Sørne Vakk','Teodor Isling'],
  'varkand': ['Dask "Lantern" Voren','Kira Moorhald','Brann Vett','Yssa Dunkar'],
  'veldwood': ['Wenna of Ashglade','Felwyn Torr','Ivel Marrow','Oskar Fernhollow'],
  'fulmara': ['Zara Vendezzo','Chiro Malvara','Talia Brine','Enzo Corvel'],
};
const canon = Object.values(canonByNation).flat();
// Shipped personas (live Notables and leaders) are canon in code.
const shipped = [...Object.values(notableProfiles).map(p => p.name), ...Object.values(leaderPersonas).map(p => p.name)];
const canonical = new Set([...canon, ...shipped]);
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
  const fullNames = new Map(), surnames = new Map();
  groups.forEach((group, index) => { for (const name of group) {
    assert.ok(!fullNames.has(name) || fullNames.get(name) === index, `full-name collision: ${name}`); fullNames.set(name, index);
    const last = surname(name), prior = surnames.get(last);
    // A shared surname across modules is allowed only when both names are canon (e.g. Sieran Vale and Mara Vale).
    assert.ok(!prior || prior.index === index || (canonical.has(prior.name) && canonical.has(name)), `surname collision: ${name} / ${prior?.name}`);
    if (!prior) surnames.set(last, { index, name });
  } });
});
test('leaders avoid surnames and given names flagged in review', () => {
  const leaders = [...Object.values(draftLeaderPersonas).flat().map(p => p.name), ...aurelleClaimantHouses.map(h => h.claimant)].join(' ');
  for (const token of ['Rimehald','Vakk','Voren','Thessar','Thessaly','Talia','Moorhald','Glassen','Windrest']) assert.ok(!leaders.includes(token), token);
});
test('naming conventions: Meridian rank-year suffix, Varkand call sign, claimant seats are Aurelle cities', () => {
  for (const p of draftLeaderPersonas.meridian) assert.match(p.name, /-\d+$/);
  for (const p of draftLeaderPersonas.varkand) assert.match(p.name, /^\S+ "[^"]+" \S+$/);
  const aurelleCities = ['Highspire','Windrest','Highmere','Dunmorrow','Vale Bridge'];
  for (const h of aurelleClaimantHouses) { assert.ok(aurelleCities.includes(h.seat)); assert.notEqual(h.seat, 'Highmere'); }
  for (const p of draftLeaderPersonas.fulmara) assert.match(p.name, /(ara|ezzo)$/);
  for (const p of draftLeaderPersonas.hoarvale) assert.match(p.name, /(hald|mark)$/);
  assert.equal(aurelleClaimantHouses.find(h => h.house === 'House Dunmorrow').seat, 'Dunmorrow');
});
test('canon names used in code are spelled exactly as on their nation page', () => {
  const used = [...shipped, ...draftNames, ...rosterNames];
  for (const [page, names] of Object.entries(canonByNation)) for (const name of names) {
    const given = name.split(/\s/)[0];
    for (const other of used) assert.ok(other.split(/\s/)[0] !== given || other === name, `${other} reuses canon given name of ${name}; use the canon spelling or a new given name`);
  }
  for (const name of rosterNames.concat(draftNames)) {
    const near = canon.find(c => c.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '') === name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, ''));
    if (near) assert.equal(name, near, `canon spelling: ${name}`);
  }
  // When a harimu-docs checkout is available, verify the fixture against each nation page verbatim.
  const docs = process.env.HARIMU_DOCS_DIR ?? new URL('../../harimu-docs/content/world/nations/', import.meta.url).pathname;
  for (const [page, names] of Object.entries(canonByNation)) {
    const file = `${docs.replace(/\/$/, '')}/${page}.mdx`;
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const name of names) assert.ok(text.includes(name), `${name} not found verbatim in ${page}.mdx`);
  }
});
