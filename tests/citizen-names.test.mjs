import test from 'node:test';
import assert from 'node:assert/strict';
import { citizenNameLists, citizenNamesStatus, varkandCallSigns, citizenName } from '../lib/citizen-names.ts';
import { draftLeaderPersonas, aurelleClaimantHouses } from '../lib/leader-drafts.ts';
import { leaderPersonas } from '../lib/leader-personas.ts';
import { notableProfiles } from '../lib/notable-profiles.ts';
import { draftNotableProfiles } from '../lib/notable-drafts.ts';
import { additionalNotableProfiles } from '../lib/notable-roster.ts';

// Canon example names from each nation page (same fixture as tests/name-uniqueness.test.mjs).
const canonExamples = ['Kaya Tarrek','Odo Brasswell','Rennek Ashby','Mira Kolt','Lanu Meesa','Oalin Tov','Ninaé Ruel','Maon Liss',
  'Tsenga Holv','Shirun Dao-7','Galev Tsu','Imra Shen','Strova Gren','Vardo Krel','Gruna Toss','Ilvo Brask','Aelis of Windrest',
  'Corwen Highmere','Sieran Vale','Lirae Dunmorrow','Sorath Clearwell','Anoa Thessaly','Ithar Lume','Saveth Glassen','Ingrid Fjeldmark',
  'Aalo Rimehald','Sørne Vakk','Teodor Isling','Dask "Lantern" Voren','Kira Moorhald','Brann Vett','Yssa Dunkar','Wenna of Ashglade',
  'Felwyn Torr','Ivel Marrow','Oskar Fernhollow','Zara Vendezzo','Chiro Malvara','Talia Brine','Enzo Corvel','Maera Solenne'];
const existing = [...canonExamples, ...Object.values(notableProfiles).map(p => p.name), ...Object.values(leaderPersonas).map(p => p.name),
  ...Object.values(draftNotableProfiles).flat().map(p => p.name), ...Object.values(additionalNotableProfiles).flat().map(p => p.name),
  ...Object.values(draftLeaderPersonas).flat().map(p => p.name), ...aurelleClaimantHouses.map(h => h.claimant)];
const norm = s => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
const tokens = name => name.replace(/"[^"]*"/g, ' ').replace(/-\d+/g, '').split(/\s+/).filter(t => t && t !== 'of');
const existingTokens = new Set(existing.flatMap(tokens).map(norm));
const lists = Object.entries(citizenNameLists);

// Real people, politicians and brands an invented name must never match (whole name token, accent- and case-insensitive).
export const realNameBlocklist = ['tesla','ferrari','lamborghini','versace','gucci','prada','armani','zara','nokia','ikea','volvo','lego',
  'rolex','nike','elon','musk','trump','biden','putin','obama','stalin','lenin','marx','messi','ronaldo','beyonce','swift','bezos','gates',
  'jobs','disney','pixar','marvel','kodak','bosch','siemens','bugatti','maserati','lavazza','barilla','ferrero','nutella','gazprom','lada',
  'skoda','toyota','honda','sony','samsung','huawei','tencent','alibaba','xiaomi','moana','ariel','zorro','loki','freya','thor','havel',
  'ostmark','copperfield','sunwell','lorien','miraval','mazara','navarra','gorm','aeryn','vostro'];
const blocked = new Set(realNameBlocklist.map(norm));
const isBlocked = name => tokens(name).some(t => blocked.has(norm(t)));

test('lists are inactive and cover all ten nations with at least 30 given and 30 family names', () => {
  assert.equal(citizenNamesStatus, 'inactive');
  assert.equal(lists.length, 10);
  for (const [nation, { given, family, rule }] of lists) {
    assert.ok(rule.length > 0, nation);
    assert.ok(given.length >= 30, `${nation} given ${given.length}`);
    assert.ok(family.length >= 30, `${nation} family ${family.length}`);
    for (const n of [...given, ...family]) assert.match(n, /^\p{Lu}[\p{L}]+$/u, `${nation}: ${n}`);
  }
  assert.ok(varkandCallSigns.length >= 30);
});
test('every name is unique across nations and never reuses a canon, Notable or leader name token', () => {
  const seen = new Map();
  for (const [nation, { given, family }] of lists) for (const n of [...given, ...family]) {
    assert.ok(!seen.has(norm(n)), `${n} in ${nation} duplicates ${seen.get(norm(n))}`); seen.set(norm(n), nation);
    assert.ok(!existingTokens.has(norm(n)), `${nation}: ${n} reuses an existing name`);
  }
  for (const c of varkandCallSigns) assert.ok(!['lantern','bastion'].includes(norm(c)), c);
});
test('generated citizen names never reproduce an existing full name and are distinct per nation', () => {
  const full = new Set(existing.map(norm));
  for (const [nation] of lists) {
    const names = new Set();
    for (let i = 0; i < 300; i++) { const n = citizenName(nation, i); assert.ok(!full.has(norm(n)), n); names.add(n); }
    assert.ok(names.size >= 250, `${nation} only ${names.size} distinct names`);
  }
});
test('naming rules per nation', () => {
  const L = citizenNameLists;
  for (const f of L.hoarvale.family) assert.match(f, /(hald|mark)$/);
  for (const f of L.fulmara.family) assert.match(f, /(ara|ezzo)$/);
  for (const f of L.korund.family) assert.match(f, /(ov|ra)$/);
  for (const g of L.veldwood.given) assert.match(g, /(el|wyn)$/);
  for (const g of L.meridian.given) assert.match(g, /(sh|ts|g)/i);
  for (const g of L.aurelle.given) assert.match(g, /(ae|ie|el|ri|li)/i);
  for (const g of L.confluence.given) assert.match(g, /(aa|ee|oo|uu|ii)|[lmn]/i);
  for (const g of L.varkand.given) assert.match(g, /[vkd]/i);
  for (const g of L.ilmar.given) assert.match(g, /(th|s)/i);
  for (const g of L.kindle.given) assert.match(g, /[ktr]/i);
  assert.match(citizenName('meridian', 3), /^\S+ \S+-\d$/);
  assert.match(citizenName('korund', 3), /^\S+ \S+ · Brigade \d+$/);
  assert.match(citizenName('varkand', 3), /^\S+ "[^"]+" \S+$/);
});
test('blocklist screens real people and brands', () => {
  for (const [nation, { given, family }] of lists) for (const n of [...given, ...family]) assert.ok(!isBlocked(n), `${nation}: ${n}`);
  for (const c of varkandCallSigns) assert.ok(!isBlocked(c), c);
  assert.ok(isBlocked('Elon Musk') && isBlocked('Vico Ferrari') && isBlocked('Beyoncé'));
});
