import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { aurelleGazette } from '../lib/press-templates.ts';

// lib/aurelle-favor-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/aurelle-favor-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'aurelle-favor-copy-')),'aurelle-favor-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const A = await import(pathToFileURL(out).href);
const { royalFavor:RF, charterCard:CC, charterNotices:CN, charterReports:CR, favorChatter:FC, chatterFor, CHARTER_NOTICE_KEYS, CHATTER_EVENTS, AURELLE_FAVOR_PLACEHOLDERS, AURELLE_FAVOR_NAME_MAX, AURELLE_FAVOR_LABEL_MAX, AURELLE_FAVOR_LINE_MAX, AURELLE_FAVOR_BYLINE } = A;

const noticeList=()=>CHARTER_NOTICE_KEYS.map(k=>CN[k]);
const labels=()=>[RF.label,CC.header,CC.holder,CC.marketGood,CC.monopolyGood,CC.fixedPrice,CC.tribute,...noticeList().map(x=>x.headline)];
const lines=()=>[...RF.gain,...RF.spend,...RF.notEnough,RF.leaveKinward.cost,RF.leaveKinward.done,RF.leaveKinward.blocked,CC.renewBy,...CR,...noticeList().map(x=>({text:x.body})),...FC].map(l=>l.text);
const all=()=>[...labels(),...lines()];
const fill=t=>AURELLE_FAVOR_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(AURELLE_FAVOR_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80; placeholder set', () => {
  assert.equal(AURELLE_FAVOR_NAME_MAX,COUP_NAME_MAX); assert.equal(AURELLE_FAVOR_NAME_MAX,24); assert.equal(AURELLE_FAVOR_LABEL_MAX,40); assert.equal(AURELLE_FAVOR_LINE_MAX,80);
  assert.deepEqual([...AURELLE_FAVOR_PLACEHOLDERS],['{favor}','{cost}','{amount}','{holder}','{good}','{price}','{tribute}','{endsAt}']);
});
test('every key is present: favor label, gain, spend, refusal, Kinward-leave; charter card, three notices; one chatter line per event; every line proposal', () => {
  assert.equal(RF.label,'Royal Favor'); assert.equal(RF.gain.length,2); assert.equal(RF.spend.length,2); assert.equal(RF.notEnough.length,2);
  assert.deepEqual(Object.keys(RF.leaveKinward).sort(),['blocked','cost','done']);
  assert.deepEqual(Object.keys(CN).sort(),[...CHARTER_NOTICE_KEYS].sort()); assert.deepEqual([...CHARTER_NOTICE_KEYS],['granted','renewed','revoked']);
  assert.deepEqual(FC.map(x=>x.event),[...CHATTER_EVENTS]); for (const e of CHATTER_EVENTS) assert.equal(chatterFor(e).event,e);
  for (const l of [...RF.gain,...RF.spend,...RF.notEnough,RF.leaveKinward.cost,RF.leaveKinward.done,RF.leaveKinward.blocked,CC.renewBy,...CR]) assert.equal(l.proposal,true);
  for (const x of noticeList()) { assert.equal(x.proposal,true); assert.equal(typeof x.aiBadge,'boolean'); }
  for (const x of FC) { assert.equal(x.proposal,true); assert.equal(x.aiText,true); }
  for (const o of [RF,CC]) assert.equal(o.proposal,true);
  assert.equal(CC.header,'Royal charter');
});
test('limits: labels 40, lines 80, with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=AURELLE_FAVOR_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=AURELLE_FAVOR_LINE_MAX,`${t} (${fill(t).length})`);
});
test('only known placeholders, in the right lines', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(AURELLE_FAVOR_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const l of RF.gain) assert.match(l.text,/\{amount\}/); for (const l of RF.spend) assert.match(l.text,/\{cost\}/);
  assert.match(RF.spend[1].text,/\{favor\}/); assert.match(RF.notEnough[1].text,/\{favor\}/); assert.match(RF.leaveKinward.cost.text,/\{cost\}/); assert.match(RF.leaveKinward.done.text,/\{cost\}/);
  assert.match(CC.holder,/\{holder\}/); assert.match(CC.marketGood,/\{good\}/); assert.match(CC.monopolyGood,/\{good\}/); assert.match(CC.fixedPrice,/\{price\}/); assert.match(CC.tribute,/\{tribute\}/); assert.match(CC.renewBy.text,/\{endsAt\}/);
  for (const x of noticeList()) assert.match(x.body,/\{holder\}/);
  for (const x of FC) assert.doesNotMatch(x.text,/\{/);
});
test('no invented numbers: no digits, number words or amounts in any line; amounts and terms only through placeholders', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|percent|\b(one|two|three|four|five|ten|hundred|twice|once)\b|\b(days?|hours?|weeks?|months?|years?)\b|\bcap(ped)?\b/i,t);
});
test('Court Gazette voice: Crown decrees ("Be it known") are AI-badged; Gazette reports and chatter are not', () => {
  assert.deepEqual(AURELLE_FAVOR_BYLINE,aurelleGazette.byline);
  for (const x of noticeList()) assert.equal(x.aiBadge,/^Be it known/.test(x.body),x.key);
  assert.ok(noticeList().every(x=>x.aiBadge)); for (const l of CR) assert.match(l.text,/^The Court Gazette/);
  assert.deepEqual(CHARTER_NOTICE_KEYS.map(k=>CN[k].headline),['A charter is granted','A charter is renewed','A charter is revoked']);
  assert.match(aurelleGazette.voice,/Every thread in its place/);
});
test('Kinward-leave lines name the Rite and the Favor cost, with no amount', () => {
  for (const l of [RF.leaveKinward.cost,RF.leaveKinward.done,RF.leaveKinward.blocked]) assert.match(l.text,/Kinward Rite/);
  assert.match(RF.leaveKinward.cost.text,/costs \{cost\} Royal Favor/); assert.match(RF.leaveKinward.blocked.text,/Serve the Crown/);
});
test('charter card names holder, market or monopoly good, fixed price and tribute due', () => {
  assert.equal(CC.holder,'Holder: {holder}'); assert.equal(CC.fixedPrice,'Fixed price: {price}'); assert.equal(CC.tribute,'Tribute due: {tribute}');
  assert.match(CC.marketGood,/^Market good/); assert.match(CC.monopolyGood,/^Monopoly good/);
});
test('chatter: commoner voice, no Gazette formulas, no placeholders, 80 characters (#117 limit)', () => {
  for (const x of FC) { assert.ok(x.text.length<=80,x.text); assert.doesNotMatch(x.text,/Be it known|Court Gazette|Royal Favor|\{/); }
  assert.equal(new Set(FC.map(x=>x.text)).size,FC.length);
});
test('scope: Aurelle only; no Fulmara charters, other nations, real-world reference or Notable; no violence', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(Kindle|Korund|Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence|Tessera|Great Recharter)\b/);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|England|France|Japan|China|Russia|Versailles|Louis|Henry|Napoleon)\b|Notable|@/);
  assert.doesNotMatch(t,/\b(kill|blood|behead|hang|prison|punish)\w*/i);
});
test('unwired: nothing in app/ or components/ imports aurelle-favor-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/aurelle-favor-copy/, f);
});
