import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress, korundStateMedia, aurelleGazette } from '../lib/press-templates.ts';

// lib/land-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/land-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'land-copy-')),'land-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const D = await import(pathToFileURL(out).href);
const { zoneTooltips:ZT, registryPurchase:RP, purchaseRefusals:PR, foundingRules:FR, foundingRefusals:FRF, landNations:LN, landFor, ZONES, LAND_NATIONS, PURCHASE_REASONS, FOUNDING_REASONS, LAND_PLACEHOLDERS, LAND_NAME_MAX, LAND_LABEL_MAX, LAND_LINE_MAX } = D;

// lib/city-founding.ts imports extensionless modules, so read its constants from source instead of importing it.
const minCityDistance=Number(readFileSync('lib/city-founding.ts','utf8').match(/export const minCityDistance = (\d+)/)[1]);
const claimRadius=Number(readFileSync('lib/city-founding.ts','utf8').match(/export const claimRadius = (\d+)/)[1]);
const authorityLabels=[...readFileSync('lib/city-founding.ts','utf8').matchAll(/label: '([^']+)'/g)].map(m=>m[1]);
const registrySrc=readFileSync('lib/world-registry.ts','utf8');
const foundingSrc=readFileSync('lib/city-founding.ts','utf8');
const codesIn=(srcText)=>{ const codes=new Set(); for (const m of srcText.matchAll(/fail\(\s*\d+\s*,\s*([^,]+),/g)) { const a=m[1].trim().replace(/[\w.]+\s*===\s*'[a-z_]+'/g,'');
  for (const q of a.matchAll(/'([a-z_]+)'/g)) codes.add(q[1]);
  if (/`centre_\$\{[^}]*\}`/.test(a)) for (const z of ['heartland','commons','frontier']) codes.add(`centre_${z}`);
  if (a==='square.zone') for (const z of ['heartland','commons','frontier']) codes.add(z); } return codes; };

const labels=()=>[RP.header,RP.buyButton,...LN.map(x=>x.founded.headline)];
const lines=()=>[...ZONES.map(z=>ZT[z]),RP.confirmPrompt,RP.success,...PURCHASE_REASONS.map(k=>PR[k]),FR.claim,FR.spacing,...FOUNDING_REASONS.map(k=>FRF[k]),
  ...LN.flatMap(n=>[n.authority,n.expeditionDeparts,n.expeditionArrives,n.founded.body,n.refusals.too_close,n.refusals.not_wildlands])].map(l=>l.text);
const all=()=>[...labels(),...lines()];
const fill=t=>LAND_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(LAND_NAME_MAX)),t);
const stripRules=t=>t.replaceAll('radius-2','').replaceAll('6 squares','');

test('shared name cap re-exported; limits 40/80; placeholder set; rule numbers match code', () => {
  assert.equal(LAND_NAME_MAX,COUP_NAME_MAX); assert.equal(LAND_NAME_MAX,24); assert.equal(LAND_LABEL_MAX,40); assert.equal(LAND_LINE_MAX,80);
  assert.deepEqual([...LAND_PLACEHOLDERS],['{price}','{balance}','{owner}','{nation}','{site}','{city}','{authority}']);
  assert.equal(minCityDistance,6); assert.equal(claimRadius,2); assert.match(FR.claim.text,/radius-2/); assert.match(FR.spacing.text,/at least 6 squares/);
});
test('every key is present: four zone tooltips, purchase prompt and success, per-nation founding lines; every line proposal', () => {
  assert.deepEqual(Object.keys(ZT).sort(),[...ZONES].sort()); assert.deepEqual([...ZONES],['heartland','frontier','wildlands','commons']);
  assert.deepEqual(LN.map(x=>x.nationId),[...LAND_NATIONS]); for (const n of LAND_NATIONS) assert.equal(landFor(n).nationId,n);
  for (const x of LN) { for (const l of [x.authority]) assert.equal(l.proposal,true); for (const v of [x.expeditionDeparts,x.expeditionArrives,x.founded.body,x.refusals.too_close,x.refusals.not_wildlands]) { assert.equal(v.proposal,true); assert.equal(typeof v.aiBadge,'boolean'); } assert.equal(x.proposal,true); }
  for (const l of [...ZONES.map(z=>ZT[z]),RP.confirmPrompt,RP.success,FR.claim,FR.spacing,...PURCHASE_REASONS.map(k=>PR[k]),...FOUNDING_REASONS.map(k=>FRF[k])]) assert.equal(l.proposal,true);
  assert.equal(RP.proposal,true); assert.equal(FR.proposal,true); assert.equal(RP.header,'World Registry'); assert.equal(RP.buyButton,'Buy square');
});
test('zone tooltips: Heartland cannot be captured, Frontier can, Wildlands unclaimed, Commons shared and not for sale', () => {
  assert.match(ZT.heartland.text,/never be captured/); assert.match(ZT.frontier.text,/treaty or won in war/); assert.match(ZT.wildlands.text,/unclaimed/); assert.match(ZT.wildlands.text,/World Registry/);
  assert.match(ZT.commons.text,/shared, not for sale/); assert.match(ZT.commons.text,/war, treaty or joint development/);
});
test('refusal reasons line up with the codes lib/world-registry.ts and lib/city-founding.ts return: exactly one line each', () => {
  const rc=codesIn(registrySrc), fc=codesIn(foundingSrc);
  assert.ok(rc.size>=10&&fc.size>=12);
  assert.deepEqual([...rc].sort(),[...PURCHASE_REASONS].sort()); assert.deepEqual([...fc].sort(),[...FOUNDING_REASONS].sort());
  assert.deepEqual(Object.keys(PR).sort(),[...PURCHASE_REASONS].sort()); assert.deepEqual(Object.keys(FRF).sort(),[...FOUNDING_REASONS].sort());
  assert.equal(new Set(PURCHASE_REASONS).size,PURCHASE_REASONS.length); assert.equal(new Set(FOUNDING_REASONS).size,FOUNDING_REASONS.length);
});
test('purchase refusals name what to do next or why, per the three asked reasons; price only as a placeholder', () => {
  assert.match(PR.not_adjacent.text,/next to land your nation owns/); assert.match(PR.owned.text,/already belongs to \{owner\}/); assert.match(PR.insufficient_tessera.text,/\{price\}/); assert.match(PR.insufficient_tessera.text,/\{balance\}/);
  assert.match(RP.confirmPrompt.text,/\{price\}/); assert.match(RP.success.text,/\{price\}/); assert.match(RP.success.text,/\{nation\}/);
  assert.match(PR.heartland.text,/never sold/); assert.match(PR.commons.text,/cannot be bought/);
});
test('limits: labels 40, lines 80, with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=LAND_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=LAND_LINE_MAX,`${t} (${fill(t).length})`);
});
test('only known placeholders, in the right lines', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(LAND_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const x of LN) { assert.match(x.expeditionDeparts.text,/\{site\}/); assert.match(x.expeditionArrives.text,/\{site\}/); assert.match(x.founded.headline+x.founded.body.text,/\{city\}/); }
  assert.match(FRF.wrong_authority.text,/\{authority\}/);
  for (const x of ZONES) assert.doesNotMatch(ZT[x].text,/\{/);
});
test('no new rule numbers: only radius-2 and 6 squares appear; no prices, rates or counts', () => {
  for (const t of all()) assert.doesNotMatch(stripRules(t).replace(/\{[^}]*\}/g,''),/\d|%|percent|\b(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|twice|once)\b|\bvolunteers?\b|\bTSR\b|\bsquares? away\b/i,t);
  for (const t of all()) if (/\d/.test(t)) assert.match(t,/radius-2|6 squares/,t);
});
test('founding voices: bylines are canon; AI badge only on Aurelle "Be it known" lines; who decides per nation', () => {
  assert.deepEqual(landFor('kindle').byline,kindlePress.byline); assert.deepEqual(landFor('korund').byline,korundStateMedia.byline); assert.deepEqual(landFor('aurelle').byline,aurelleGazette.byline);
  for (const x of LN) for (const v of [x.expeditionDeparts,x.expeditionArrives,x.founded.body,x.refusals.too_close,x.refusals.not_wildlands]) assert.equal(v.aiBadge,/^Be it known/.test(v.text),v.text);
  for (const id of ['kindle','korund']) for (const v of [landFor(id).expeditionDeparts,landFor(id).founded.body]) assert.equal(v.aiBadge,false);
  assert.equal(landFor('aurelle').expeditionDeparts.aiBadge,true); assert.equal(landFor('aurelle').expeditionArrives.aiBadge,false);
  assert.match(landFor('kindle').authority.text,/AI government/); assert.match(landFor('korund').authority.text,/AI Chairman/); assert.match(landFor('aurelle').authority.text,/royal charter/);
  assert.match(landFor('kindle').expeditionDeparts.text,/AI government/); assert.match(landFor('korund').expeditionDeparts.text,/Chairman/); assert.match(landFor('aurelle').expeditionDeparts.text,/Crown/);
  assert.deepEqual(authorityLabels,['Government charter','Chairman order','Royal charter']);
});
test('founding refusals in each voice: too close (6 squares) and not Wildlands; no human decision-maker implied', () => {
  for (const x of LN) { assert.match(x.refusals.too_close.text,/6 squares/); assert.match(x.refusals.not_wildlands.text,/Wildlands/); assert.match(x.refusals.too_close.text,/refused/); }
  for (const t of all()) assert.doesNotMatch(t,/\b(citizens? (decide|choose|vote)|players? (decide|choose)|you decide|your vote)\b/i,t);
  assert.match(FRF.too_close.text,/at least 6 squares apart/);
});
test('voice distinct; Korund and Kindle lines carry no Crown formulas; nothing glorifies conquest', () => {
  for (const x of LN.filter(n=>n.nationId!=='aurelle')) for (const v of [x.expeditionDeparts,x.expeditionArrives,x.founded.body]) assert.doesNotMatch(v.text,/Be it known|Court Gazette/);
  for (const v of [landFor('kindle').expeditionDeparts,landFor('kindle').founded.body]) assert.doesNotMatch(v.text,/State Media|Be it known/);
  assert.match(landFor('korund').expeditionDeparts.text,/^State Media:/);
  for (const t of all()) assert.doesNotMatch(t,/conquer|subjugat|glor|triumph|crush|slaughter|massacre|kill|blood/i,t);
});
test('scope: MVP nations only; no real-world reference, Notable or influence spread', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b/); assert.doesNotMatch(t,/\b(Earth|America|Europe|China|Russia|Rome|Roman|Britain|Columbus)\b|Notable|@/); assert.doesNotMatch(t,/influence|sanction|embargo/i);
});
test('unwired: nothing in app/ or components/ imports land-copy, except the #1017 zone legend', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f) && f !== 'app/world-zones.tsx') assert.doesNotMatch(readFileSync(f,'utf8'),/land-copy/, f);
});
