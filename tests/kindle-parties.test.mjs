import test from 'node:test';
import assert from 'node:assert/strict';
import { kindleParties, pledgeCatalog, kindleCandidatePlatforms, pledge, kindleParty, PLEDGE_CARD_MAX, PLEDGE_PRESS_MAX, PARTY_NAME_MAX,
  PARTY_IDEOLOGY_MAX, PARTY_BLURB_MAX, PLEDGES_PER_CANDIDATE_MIN, PLEDGES_PER_CANDIDATE_MAX, PLEDGE_INCOME_TAX_BAND, pledgeFigures } from '../lib/kindle-parties.ts';
import { readFileSync } from 'node:fs';
import { kindleIncomeTaxBand } from '../lib/income-tax.ts';
// lib/elections.ts imports extensionless modules, so read its candidate ids from source instead of importing it.
const electionCandidates=[...readFileSync(new URL('../lib/elections.ts',import.meta.url),'utf8').matchAll(/\{id:'([a-z-]+)',name:'[^']+',platform:/g)].map(m=>({id:m[1]}));

const sentences=s=>s.split(/(?<=[.!?])\s+/).filter(Boolean);
const allText=()=>[...kindleParties.flatMap(x=>[x.name,x.ideology,x.color,x.blurb]),...pledgeCatalog.flatMap(x=>[x.card,x.brokenPressLine])];

test('exactly 3 AI parties with locked ids and full fields', () => {
  assert.deepEqual(kindleParties.map(x=>x.id),['steady-hand','open-ledger','dockside-builders']);
  for (const x of kindleParties) { assert.equal(x.ai,true); assert.equal(x.proposal,true);
    assert.ok(x.name.length<=PARTY_NAME_MAX); assert.ok(x.ideology.length<=PARTY_IDEOLOGY_MAX, x.id); assert.ok(x.blurb.length<=PARTY_BLURB_MAX, x.id);
    const n=sentences(x.blurb).length; assert.ok(n>=2&&n<=3, `${x.id} blurb ${n} sentences`);
    assert.doesNotMatch(x.color,/#|rgb|\d/); assert.ok(['Ember Orange','Basalt Black','Brass'].includes(x.color), x.color); }
  assert.equal(new Set(kindleParties.map(x=>x.color)).size,3);
});
test('pledge catalog: 12-18 locked keys, categories, length limits, figures only where §9.4 gives them', () => {
  assert.deepEqual(pledgeCatalog.map(x=>x.key),['tax-lower-income','tax-lower-sales','tax-fair-land','jobs-full-employment','jobs-public-works','jobs-mines',
    'housing-public','trade-meridian-deal','trade-open-markets','trade-careful-deals','frontier-new-cities','frontier-docks','civic-open-ballots','civic-fewer-rules']);
  assert.ok(pledgeCatalog.length>=12&&pledgeCatalog.length<=18);
  assert.deepEqual([...new Set(pledgeCatalog.map(x=>x.category))].sort(),['civic','frontier','housing','jobs','tax','trade']);
  for (const x of pledgeCatalog) { assert.equal(x.proposal,true); assert.ok(x.key.startsWith(x.category+'-'), x.key);
    assert.ok(x.card.length<=PLEDGE_CARD_MAX, x.card); assert.ok(x.brokenPressLine.length<=PLEDGE_PRESS_MAX, x.key);
    if (!(x.key in pledgeFigures)) assert.doesNotMatch(x.card+x.brokenPressLine,/\d|%|\bper ?cent\b|\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i, x.key); }
  assert.equal(PLEDGE_CARD_MAX,80);
});
test('every lib/elections.ts candidate (3) maps to one party and 3-5 resolving pledges', () => {
  assert.equal(electionCandidates.length,3);
  assert.deepEqual(Object.keys(kindleCandidatePlatforms).sort(),electionCandidates.map(c=>c.id).sort());
  assert.deepEqual(kindleCandidatePlatforms,{
    'ines-varro':{partyId:'steady-hand',pledges:['jobs-full-employment','jobs-public-works','trade-careful-deals','jobs-mines']},
    'tobin-achterberg':{partyId:'open-ledger',pledges:['tax-lower-income','tax-lower-sales','trade-open-markets','trade-meridian-deal','civic-fewer-rules']},
    'mara-quell':{partyId:'dockside-builders',pledges:['housing-public','frontier-docks','tax-fair-land']}});
  const used=new Set();
  for (const [id,m] of Object.entries(kindleCandidatePlatforms)) { assert.ok(kindleParty(m.partyId), id);
    assert.ok(m.pledges.length>=PLEDGES_PER_CANDIDATE_MIN&&m.pledges.length<=PLEDGES_PER_CANDIDATE_MAX, id);
    assert.equal(new Set(m.pledges).size,m.pledges.length); for (const k of m.pledges) assert.ok(pledge(k), k);
    assert.ok(!used.has(m.partyId), 'one candidate per party'); used.add(m.partyId); }
});
test('pledges keep each one-line platform true', () => {
  const cats=id=>kindleCandidatePlatforms[id].pledges.map(k=>pledge(k).category);
  assert.ok(cats('ines-varro').includes('jobs')&&cats('ines-varro').includes('trade'));
  assert.ok(cats('tobin-achterberg').includes('tax')&&kindleCandidatePlatforms['tobin-achterberg'].pledges.includes('trade-open-markets'));
  assert.ok(cats('mara-quell').includes('housing')&&kindleCandidatePlatforms['mara-quell'].pledges.includes('frontier-docks'));
});
test('only canon nations and places; no real-world parties, ideologies, places or Notable', () => {
  const t=allText().join(' ');
  assert.doesNotMatch(t,/\b(democrat\w*|republican|labou?r party|tory|whig|green party|socialis\w*|communis\w*|liberal|conservative|libertarian|fascis\w*|marxis\w*|capitalis\w*)\b/i);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|China|Russia|London|Paris|Washington|Moscow|Tokyo)\b/);
  assert.doesNotMatch(t,/Notable/);
  const proper=t.match(/\b(Meridian|Varkand|Korund|Aurelle|Ilmar|Hoarvale|Veldwood|Fulmara|Confluence|Kindle|Brasswell Port|Republic|Resident)\b/g)??[];
  assert.ok(proper.includes('Meridian')&&proper.includes('Brasswell Port'));
});
test('no party blurb uses the Kindle national motto (ARC #262)', () => {
  for (const x of kindleParties) assert.doesNotMatch(x.blurb+x.ideology+x.name,/strike your own spark/i, x.id);
  assert.equal(pledgeCatalog.length,14); assert.equal(pledge('housing-rent-board'),undefined);
});

test('pledge figures (#263): income tax inside 0-50%, anchored on 20%; the only city count is 3; nothing else carries a number', () => {
  assert.deepEqual(PLEDGE_INCOME_TAX_BAND,{min:0,max:50}); assert.deepEqual(PLEDGE_INCOME_TAX_BAND,{min:kindleIncomeTaxBand.min,max:kindleIncomeTaxBand.max});
  assert.deepEqual(Object.keys(pledgeFigures).sort(),['frontier-new-cities','tax-lower-income']);
  const tax=pledge('tax-lower-income'), cities=pledge('frontier-new-cities');
  assert.equal(tax.card,'Lower income tax to 20%'); assert.equal(cities.card,'Build 3 frontier cities');
  assert.equal(pledgeFigures['tax-lower-income'].value,20); assert.equal(pledgeFigures['frontier-new-cities'].value,3);
  // every percentage in any card or press line is a whole number inside the band, and every city count is 3
  const pcts=pledgeCatalog.flatMap(x=>[...(x.card+' '+x.brokenPressLine).matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m=>Number(m[1])));
  assert.ok(pcts.length>=2); for (const n of pcts) { assert.ok(Number.isInteger(n)&&n>=PLEDGE_INCOME_TAX_BAND.min&&n<=PLEDGE_INCOME_TAX_BAND.max, String(n)); }
  assert.deepEqual([...new Set(pcts)],[20]);
  for (const x of pledgeCatalog.filter(y=>y.category==='tax'&&y.key!=='tax-lower-income')) assert.doesNotMatch(x.card+x.brokenPressLine,/\d|%/, x.key);
  const counts=pledgeCatalog.flatMap(x=>[...(x.card+' '+x.brokenPressLine).matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+)?(?:frontier\s+)?cit(?:y|ies)\b/gi)].map(m=>m[1].toLowerCase()));
  assert.ok(counts.length>=2); for (const c of counts) assert.equal(c,'3');
  for (const x of [tax,cities]) { const n=pledgeFigures[x.key].value; assert.ok(x.card.includes(String(n))); assert.ok(x.brokenPressLine.includes(String(n))); assert.equal(x.proposal,true); }
  // the only digits anywhere in the catalog or party text belong to those two pledges
  const digits=[...kindleParties.flatMap(x=>[x.name,x.ideology,x.color,x.blurb]),...pledgeCatalog.filter(x=>!(x.key in pledgeFigures)).flatMap(x=>[x.card,x.brokenPressLine])].join(' ');
  assert.doesNotMatch(digits,/\d|%/);
  // consistent with #287's wording: "income tax", whole percent with a % sign, no real-world rate or place
  assert.match(tax.card,/\bincome tax\b/); assert.doesNotMatch(tax.card+tax.brokenPressLine,/set by|AI Assembly|SPK/);
});
