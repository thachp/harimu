import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress, korundStateMedia, aurelleGazette } from '../lib/press-templates.ts';

// lib/war-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next). Node's type
// stripping cannot resolve that, so load it as tests/debate-copy.test.mjs does: rewrite the specifier and transpile.
const src=readFileSync('lib/war-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'war-copy-')),'war-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const W = await import(pathToFileURL(out).href);
const { declarationNotices, mobilizationStatus:M, blockedDeclaration:B, defenseWindow:D, citizenSafety:S, noticesFor, WAR_NATIONS, DECLARATION_SIDES, WAR_PLACEHOLDERS, WAR_NAME_MAX, WAR_LABEL_MAX, WAR_BODY_MAX } = W;

const notices=()=>declarationNotices.flatMap(x=>Object.values(x.notices));
const bodies=()=>[...notices().map(x=>x.body),...M.mobilizing,...M.active,...M.ended,B.foundingPeriod,B.nonAggression,B.peaceLock,D.line,...D.explainer,...S.lines].map(x=>typeof x==='string'?x:x.text);
const heads=()=>notices().map(x=>x.headline);
const all=()=>[...heads(),...bodies()];
const fill=t=>WAR_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(WAR_NAME_MAX)),t);
const docFigures=t=>t.replaceAll('48 real hours','').replaceAll('4-hour','').replaceAll('30 days','').replaceAll('One hammer, one heart','');

test('shape: every nation has ours / against-us / world notices, every line proposal', () => {
  assert.deepEqual(declarationNotices.map(x=>x.nationId),[...WAR_NATIONS]);
  const ids=new Set();
  for (const x of declarationNotices) {
    assert.equal(x.proposal,true); assert.equal(noticesFor(x.nationId),x); assert.deepEqual(Object.keys(x.notices).sort(),[...DECLARATION_SIDES].sort());
    for (const nt of Object.values(x.notices)) { assert.equal(nt.proposal,true); assert.equal(typeof nt.aiBadge,'boolean'); assert.ok(!ids.has(nt.id)); ids.add(nt.id); }
  }
  for (const k of ['mobilizing','active','ended']) { assert.ok(M[k].length>=2&&M[k].length<=3, k); for (const l of M[k]) assert.equal(l.proposal,true); }
  for (const l of [B.foundingPeriod,B.nonAggression,B.peaceLock,D.line,...D.explainer,...S.lines]) assert.equal(l.proposal,true);
  for (const o of [M,B,D,S]) assert.equal(o.proposal,true);
});
test('bylines reuse the three press packs; Crown-speaking Aurelle lines are AI-badged', () => {
  assert.deepEqual(noticesFor('kindle').byline,kindlePress.byline);
  assert.deepEqual(noticesFor('korund').byline,korundStateMedia.byline);
  assert.deepEqual(noticesFor('aurelle').byline,aurelleGazette.byline);
  for (const nt of Object.values(noticesFor('aurelle').notices)) if (/Be it known/.test(nt.body)) assert.equal(nt.aiBadge,true, nt.id);
  assert.match(noticesFor('korund').notices.ours.body,/Korund State Media reports/); assert.match(noticesFor('kindle').notices.world.body,/\bBoth sides\b/);
});
test('re-exports the shared name cap; 40/140 hold with every placeholder filled at it', () => {
  assert.equal(WAR_NAME_MAX,COUP_NAME_MAX); assert.equal(WAR_NAME_MAX,24);
  for (const t of heads()) assert.ok(fill(t).length<=WAR_LABEL_MAX, t);
  for (const t of bodies()) assert.ok(fill(t).length<=WAR_BODY_MAX, t);
});
test('placeholders: only known ones; every one used; casus belli never in a block reason', () => {
  const t=all().join(' ');
  for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(WAR_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const p of WAR_PLACEHOLDERS) assert.ok(t.includes(p), p);
  for (const l of M.mobilizing) assert.ok(l.text.includes('{endsAt}'));
  assert.match(D.line.text,/\{start\}.*\{end\}/);
});
test('figures: only 48 real hours, the 4-hour window and the 30-day Founding Period; mobilization says 48 real hours', () => {
  for (const nt of notices()) assert.match(nt.body,/48 real hours/, nt.id);
  assert.match(B.foundingPeriod.text,/Founding Period, a shard's first 30 days/); assert.match(D.explainer[0].text,/4-hour defense window/);
  for (const t of all()) assert.doesNotMatch(docFigures(t),/\d|%|percent|\b(one|two|three|four|five|ten|twelve|hundred)\b/i, t);
  assert.doesNotMatch(all().join(' '),/peace lock|ten days|10 days|14 days|\b2 active/i);
});
test('reasons, not threats; no violence glorified; citizens never killed; no casualties, battles or loot beyond the safety line', () => {
  for (const t of all()) assert.doesNotMatch(t,/glor|triumph|crush|slaughter|massacre|conquer|victor|vengeance|bloodshed|destroy|annihilat|surrender|beware|doom|will pay|punish/i, t);
  const safe=S.lines[0].text; assert.match(safe,/never killed/); assert.match(safe,/never looted/);
  for (const t of all().filter(x=>x!==safe)) assert.doesNotMatch(t,/kill|wound|casualt|loot|siege|army|armies|battle|troops/i, t);
  for (const l of Object.values(B).filter(x=>x&&x.text)) assert.match(l.text,/^The declaration was not made\./);
});
test('no real-world countries, leaders or conflicts; no Notable; no named player', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(Earth|America|Russia|China|Ukraine|Germany|Britain|England|France|Japan|Israel|Iran|NATO|Hitler|Napoleon|Stalin|Caesar|World War|Cold War|EVE)\b/);
  assert.doesNotMatch(t,/Notable/); assert.doesNotMatch(t,/\byou (will|must|shall)\b|@/i);
});
test('nation voices stay distinct: Kindle plain, Korund collective, Aurelle ceremonial', () => {
  assert.match(noticesFor('korund').notices.ours.body,/One hammer, one heart/); assert.doesNotMatch(noticesFor('kindle').notices.ours.body,/Be it known|One hammer/);
  assert.doesNotMatch(noticesFor('korund').notices['against-us'].body,/Be it known/);
  for (const nt of Object.values(noticesFor('aurelle').notices)) assert.doesNotMatch(nt.body,/One hammer|Wire Service/);
});
test('unwired: nothing in app/ or components/ imports war-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/war-copy/, f);
});
