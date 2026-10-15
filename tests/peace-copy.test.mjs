import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress, korundStateMedia, aurelleGazette } from '../lib/press-templates.ts';

// lib/peace-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the specifier and
// transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/peace-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'peace-copy-')),'peace-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const { peaceOffer:O, peaceLockBanner:B, peacePress:PR, peacePressFor, PEACE_NATIONS, PEACE_EVENTS, PEACE_PLACEHOLDERS, PEACE_NAME_MAX, PEACE_LABEL_MAX, PEACE_LINE_MAX } = await import(pathToFileURL(out).href);

const privLines=()=>[O.offerPrompt,O.incomingPrompt,O.accepted,O.declined,B.line,B.explainer];
const pressLines=()=>PR.flatMap(x=>[...Object.values(x.report),...(x.crown?Object.values(x.crown):[])]);
const labels=()=>[O.offerButton,O.acceptButton,O.declineButton,B.header,...PR.flatMap(x=>Object.values(x.headline))];
const lines=()=>[...privLines().map(l=>l.text),...pressLines().map(l=>l.text)];
const all=()=>[...labels(),...lines()];
const fill=t=>PEACE_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(PEACE_NAME_MAX)),t);

test('shape: offer, accept/decline, lock banner and press lines exist for all three nations; every line proposal', () => {
  assert.deepEqual(PR.map(x=>x.nationId),[...PEACE_NATIONS]); assert.deepEqual([...PEACE_NATIONS],['kindle','korund','aurelle']);
  for (const o of [O,B]) assert.equal(o.proposal,true);
  for (const l of privLines()) { assert.equal(l.proposal,true); assert.ok(l.text.length>0); }
  assert.equal(O.offerButton,'Offer peace'); assert.equal(O.acceptButton,'Accept'); assert.equal(O.declineButton,'Decline'); assert.equal(B.header,'Peace lock');
  for (const x of PR) {
    assert.equal(x.proposal,true); assert.equal(peacePressFor(x.nationId),x);
    assert.deepEqual(Object.keys(x.headline).sort(),[...PEACE_EVENTS].sort()); assert.deepEqual(Object.keys(x.report).sort(),[...PEACE_EVENTS].sort());
    for (const l of Object.values(x.report)) { assert.equal(l.proposal,true); assert.equal(typeof l.aiBadge,'boolean'); }
  }
});
test('re-exports the shared name cap; labels and headlines 40, lines 80, with every placeholder filled to 24 characters', () => {
  assert.equal(PEACE_NAME_MAX,COUP_NAME_MAX); assert.equal(PEACE_NAME_MAX,24); assert.equal(PEACE_LABEL_MAX,40); assert.equal(PEACE_LINE_MAX,80);
  for (const t of labels()) assert.ok(fill(t).length<=PEACE_LABEL_MAX, t);
  for (const t of lines()) assert.ok(fill(t).length<=PEACE_LINE_MAX, `${t} (${fill(t).length})`);
  for (const x of PR) for (const h of Object.values(x.headline)) assert.doesNotMatch(h,/\{/, 'headlines are fixed text');
});
test('placeholders: only {other} and {readyAt}; {readyAt} only in the lock lines; press uses {other} only', () => {
  assert.deepEqual([...PEACE_PLACEHOLDERS],['{other}','{readyAt}']);
  const t=all().join(' ');
  for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(PEACE_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const p of PEACE_PLACEHOLDERS) assert.ok(t.includes(p), p);
  assert.deepEqual(lines().filter(x=>x.includes('{readyAt}')),[B.line.text,B.explainer.text]);
  for (const l of pressLines()) assert.deepEqual(l.text.match(/\{[^}]+\}/g),['{other}'], l.text);
  for (const l of [O.offerPrompt,O.incomingPrompt,O.accepted,O.declined]) assert.deepEqual(l.text.match(/\{[^}]+\}/g),['{other}'], l.text);
  for (const l of [B.line,B.explainer]) assert.deepEqual(l.text.match(/\{[^}]+\}/g),['{readyAt}']);
});
test('the lock duration appears only through {readyAt}: no digits, number or duration words; no reparation or cession sizes', () => {
  for (const t of lines()) {
    assert.doesNotMatch(t,/\d|%|percent/i, t);
    assert.doesNotMatch(t,/\b(one|two|three|four|five|six|ten|dozen|many|several|days?|weeks?|hours?|minutes?|months?|years?)\b/i, t);
    assert.doesNotMatch(t,/reparation|cession|cede|ceded|demilitari|indemnit|tribute|square|city|cities/i, t);
  }
  assert.doesNotMatch(B.line.text+B.explainer.text,/\b(UTC|GMT|AM|PM)\b/); assert.match(B.line.text,/until \{readyAt\}/); assert.match(B.explainer.text,/locks war declarations/);
});
test('what the docs say: peace ends the war; accept and decline outcomes; the lock follows a peace treaty', () => {
  assert.match(O.offerPrompt.text,/ends the war/); assert.match(O.incomingPrompt.text,/ends the war/); assert.match(O.accepted.text,/war is over/); assert.match(O.declined.text,/goes on/);
  assert.match(B.line.text,/no war declarations/);
});
test('bylines match the canon press packs; AI badge on Crown "Be it known" lines and Korund State Media lines (#381)', () => {
  assert.deepEqual(peacePressFor('kindle').byline,kindlePress.byline); assert.deepEqual(peacePressFor('korund').byline,korundStateMedia.byline); assert.deepEqual(peacePressFor('aurelle').byline,aurelleGazette.byline);
  for (const x of PR) {
    for (const l of Object.values(x.report)) { assert.equal(l.aiBadge,x.nationId==='korund'); assert.doesNotMatch(l.text,/Be it known/); }
    if (x.crown) for (const l of Object.values(x.crown)) { assert.equal(l.aiBadge,true); assert.match(l.text,/^Be it known/); }
  }
  assert.ok(!peacePressFor('kindle').crown&&!peacePressFor('korund').crown); assert.ok(peacePressFor('aurelle').crown);
  assert.match(peacePressFor('korund').report.signed.text,/^State Media:/); assert.match(peacePressFor('aurelle').report.signed.text,/^Court Gazette:/);
});
test('voices stay distinct; no real-world treaty, country or leader; no Notable; nothing glorifies war or threatens', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/Notable/); assert.doesNotMatch(t,/\b(Earth|America|Russia|China|Versailles|Geneva|Yalta|Washington|London|Moscow|NATO|UN)\b/);
  assert.doesNotMatch(peacePressFor('kindle').report.signed.text+peacePressFor('kindle').report.ceasefireBroken.text,/State Media|Be it known|Gazette/);
  assert.doesNotMatch(peacePressFor('korund').report.signed.text,/Be it known|Gazette/);
  for (const l of lines()) assert.doesNotMatch(l,/\b(victory|triumph|glory|crush|surrender|defeat|revenge|enemy|punish|you will pay)\b/i, l);
});
test('unwired: nothing in app/ or components/ imports peace-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/peace-copy/, f);
});
