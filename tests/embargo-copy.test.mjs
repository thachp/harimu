import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress, korundStateMedia, aurelleGazette } from '../lib/press-templates.ts';

// lib/embargo-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the specifier and
// transpile, as tests/diplomacy-copy.test.mjs does.
const src=readFileSync('lib/embargo-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'embargo-copy-')),'embargo-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const { embargoPrivate:E, tradeClosed:T, targetedSanctions:S, embargoPress:PR, pressFor, EMBARGO_NATIONS, EMBARGO_EVENTS, EMBARGO_PLACEHOLDERS, EMBARGO_NAME_MAX, EMBARGO_LABEL_MAX, EMBARGO_LINE_MAX } = await import(pathToFileURL(out).href);

const privLines=()=>[E.imposePrompt,E.costNote,E.clearingNote,E.imposed,E.endsLine,E.liftPrompt,E.lifted,T.post,T.fill,S.good,S.office];
const pressLines=()=>PR.flatMap(x=>[...Object.values(x.report),...Object.values(x.chairman??{}),...Object.values(x.crown??{})]);
const labels=()=>[E.imposeButton,E.liftButton,...PR.flatMap(x=>Object.values(x.headline))];
const lines=()=>[...privLines().map(l=>l.text),...pressLines().map(l=>l.text)];
const all=()=>[...labels(),...lines()];
const fill=t=>EMBARGO_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(EMBARGO_NAME_MAX)),t);

test('shape: impose, lift, trade-closed, sanction and press lines exist for all three nations; every line proposal', () => {
  assert.deepEqual(PR.map(x=>x.nationId),[...EMBARGO_NATIONS]); assert.deepEqual([...EMBARGO_NATIONS],['kindle','korund','aurelle']);
  for (const o of [E,T,S]) assert.equal(o.proposal,true);
  for (const l of privLines()) { assert.equal(l.proposal,true); assert.ok(l.text.length>0); }
  assert.equal(E.imposeButton,'Impose embargo'); assert.equal(E.liftButton,'Lift embargo');
  for (const x of PR) {
    assert.equal(x.proposal,true); assert.equal(pressFor(x.nationId),x);
    assert.deepEqual(Object.keys(x.headline).sort(),[...EMBARGO_EVENTS].sort()); assert.deepEqual(Object.keys(x.report).sort(),[...EMBARGO_EVENTS].sort());
    for (const l of Object.values(x.report)) { assert.equal(l.proposal,true); assert.equal(typeof l.aiBadge,'boolean'); }
  }
});
test('re-exports the shared name cap; labels and headlines 40, lines 80, with every placeholder filled to 24 characters', () => {
  assert.equal(EMBARGO_NAME_MAX,COUP_NAME_MAX); assert.equal(EMBARGO_NAME_MAX,24); assert.equal(EMBARGO_LABEL_MAX,40); assert.equal(EMBARGO_LINE_MAX,80);
  for (const t of labels()) assert.ok(fill(t).length<=EMBARGO_LABEL_MAX, t);
  for (const t of lines()) assert.ok(fill(t).length<=EMBARGO_LINE_MAX, `${t} (${fill(t).length})`);
  for (const x of PR) for (const h of Object.values(x.headline)) assert.doesNotMatch(h,/\{/, 'headlines are fixed text');
});
test('placeholders: only the six known ones, each used; press uses {actor}/{target} only; sanctions name {good} or {office} only', () => {
  assert.deepEqual([...EMBARGO_PLACEHOLDERS],['{nation}','{actor}','{target}','{good}','{office}','{endsAt}']);
  const t=all().join(' ');
  for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(EMBARGO_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const p of EMBARGO_PLACEHOLDERS) assert.ok(t.includes(p), p);
  for (const x of PR) for (const l of Object.values(x.report)) assert.deepEqual([...l.text.matchAll(/\{[^}]+\}/g)].map(m=>m[0]).sort(),['{actor}','{target}'], l.text);
  for (const x of PR) for (const l of Object.values(x.crown??{})) assert.deepEqual(l.text.match(/\{[^}]+\}/g),['{target}'], l.text);
  assert.deepEqual(S.good.text.match(/\{[^}]+\}/g),['{good}']); assert.deepEqual(S.office.text.match(/\{[^}]+\}/g),['{office}']);
  assert.deepEqual(E.endsLine.text.match(/\{[^}]+\}/g),['{nation}','{endsAt}']);
  for (const l of [E.costNote,E.clearingNote]) assert.doesNotMatch(l.text,/\{/);
});
test('no invented figures: no digits, percentages, rates or duration words; a duration only through {endsAt}', () => {
  for (const t of lines()) {
    assert.doesNotMatch(t,/\d|%|percent|tariff|rate|reserve|premium|volume|quota/i, t);
    assert.doesNotMatch(t,/\b(one|two|three|four|five|six|ten|dozen|many|several|days?|weeks?|hours?|minutes?|months?|years?)\b/i, t);
  }
  assert.doesNotMatch(E.endsLine.text,/\b(UTC|GMT|AM|PM)\b/);
  for (const t of lines()) if (/until|ends?\b.*\{endsAt\}/.test(t)) assert.ok(t.includes('{endsAt}'), t);
});
test('what the docs say: embargo stops all trade; costs the sanctioner; Clearing House netting stops; sanctions are goods or named officials', () => {
  assert.match(E.imposePrompt.text,/All trade with it will stop/); assert.match(E.costNote.text,/costs the sanctioner its own exports/);
  assert.match(E.clearingNote.text,/Clearing House stops netting/); assert.match(S.good.text,/\{good\} is banned/); assert.match(S.office.text,/foreign assets and exchange access/);
  assert.match(T.post.text,/Trade with \{nation\} is closed/); assert.match(T.fill.text,/Trade with \{nation\} is closed/);
  assert.match(E.liftPrompt.text,/Trade with it can resume/);
});
test('out of scope stays out: no multilateral sanctions, suspension, smuggling or evasion', () => {
  for (const t of all()) assert.doesNotMatch(t,/multilateral|suspend|suspension|smuggl|evad|barter|black.?market|reserve freeze|treaty of/i, t);
});
test('bylines match the canon press packs; AI badge on Crown "Be it known" lines and Korund State Media lines (#381)', () => {
  assert.deepEqual(pressFor('kindle').byline,kindlePress.byline); assert.deepEqual(pressFor('korund').byline,korundStateMedia.byline); assert.deepEqual(pressFor('aurelle').byline,aurelleGazette.byline);
  for (const x of PR) {
    for (const l of Object.values(x.report)) { assert.equal(l.aiBadge,false, 'a generic report names any {actor}, so it is not an AI leader speaking'); assert.doesNotMatch(l.text,/Be it known/); }
    for (const l of Object.values(x.chairman??{})) { assert.equal(l.aiBadge,true); assert.match(l.text,/^State Media: the Chairman /); assert.deepEqual(l.text.match(/\{[^}]+\}/g),['{target}']); assert.ok(l.text.length<=80); }
    for (const l of Object.values(x.crown??{})) { assert.equal(l.aiBadge,true); assert.match(l.text,/^Be it known/); }
  }
  assert.ok(!pressFor('kindle').crown&&!pressFor('korund').crown); assert.ok(pressFor('aurelle').crown);
  assert.ok(!pressFor('kindle').chairman&&!pressFor('aurelle').chairman); assert.deepEqual(Object.keys(pressFor('korund').chairman),['imposed','lifted']);
  assert.match(pressFor('korund').report.imposed.text,/^State Media:/); assert.match(pressFor('aurelle').report.imposed.text,/^Court Gazette:/);
});
test('voices stay distinct; no real-world country, treaty or leader; no Notable; no player named; no threats', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/Notable/); assert.doesNotMatch(t,/\b(Earth|America|Russia|China|Iran|Cuba|Washington|London|Moscow|NATO|UN)\b/);
  assert.doesNotMatch(pressFor('kindle').report.imposed.text+pressFor('kindle').report.lifted.text,/State Media|Be it known|Gazette/);
  assert.doesNotMatch(pressFor('korund').report.imposed.text,/Be it known|Gazette/);
  for (const l of lines()) assert.doesNotMatch(l,/\b(punish|crush|starve|destroy|revenge|enemy|you will pay)\b/i, l);
});
test('wired by #363 only: the Foreign affairs panel is the one app/ importer of embargo-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f) && f !== 'app/foreign-affairs-panel.tsx') assert.doesNotMatch(readFileSync(f,'utf8'),/embargo-copy/, f);
});
