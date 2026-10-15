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
const { declarationNotices, mobilizationStatus:M, blockedDeclaration:B, defenseWindow:D, citizenSafety:S, noticesFor, WAR_NATIONS, DECLARATION_SIDES, WAR_PLACEHOLDERS, WAR_NAME_MAX, WAR_LABEL_MAX, WAR_BODY_MAX, mobilizationEndedNotices, endedNoticesFor, warBanner:BN } = W;

const notices=()=>declarationNotices.flatMap(x=>Object.values(x.notices));
const bodies=()=>[...endNotices().map(x=>x.body),BN.countdownCaption,...notices().flatMap(x=>[x.body,x.bodyNoGrievance]),...M.mobilizing,...M.active,M.ended.treaty,M.ended.other,B.foundingPeriod,B.nonAggression,B.peaceLock,D.line,...D.explainer,...S.lines].map(x=>typeof x==='string'?x:x.text);
const endNotices=()=>mobilizationEndedNotices.flatMap(x=>Object.values(x.notices));
const heads=()=>[...notices().map(x=>x.headline),...endNotices().map(x=>x.headline),BN.header.ours,BN.header.againstUs,BN.countdownLabel];
const all=()=>[...heads(),...bodies()];
const fill=t=>WAR_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(WAR_NAME_MAX)),t);
const SAFETY=()=>S.lines.map(l=>l.text);
const docFigures=t=>t.replaceAll('48 real hours','').replaceAll('4-hour','').replaceAll('30 days','').replaceAll('One hammer, one heart','');

test('shape: every nation has ours / against-us / world notices, every line proposal', () => {
  assert.deepEqual(declarationNotices.map(x=>x.nationId),[...WAR_NATIONS]);
  const ids=new Set();
  for (const x of declarationNotices) {
    assert.equal(x.proposal,true); assert.equal(noticesFor(x.nationId),x); assert.deepEqual(Object.keys(x.notices).sort(),[...DECLARATION_SIDES].sort());
    for (const nt of Object.values(x.notices)) { assert.equal(nt.proposal,true); assert.equal(typeof nt.aiBadge,'boolean'); assert.ok(!ids.has(nt.id)); ids.add(nt.id); }
  }
  for (const k of ['mobilizing','active']) { assert.ok(M[k].length>=2&&M[k].length<=3, k); for (const l of M[k]) assert.equal(l.proposal,true); }
  assert.equal(M.ended.treaty.proposal,true); assert.equal(M.ended.other.proposal,true);
  for (const l of [B.foundingPeriod,B.nonAggression,B.peaceLock,D.line,...D.explainer,...S.lines]) assert.equal(l.proposal,true);
  for (const o of [M,B,D,S]) assert.equal(o.proposal,true);
});
test('bylines reuse the three press packs; Crown-speaking Aurelle lines are AI-badged', () => {
  assert.deepEqual(noticesFor('kindle').byline,kindlePress.byline);
  assert.deepEqual(noticesFor('korund').byline,korundStateMedia.byline);
  assert.deepEqual(noticesFor('aurelle').byline,aurelleGazette.byline);
  for (const nt of Object.values(noticesFor('aurelle').notices)) if (/Be it known/.test(nt.body)) assert.equal(nt.aiBadge,true, nt.id);
  assert.match(noticesFor('korund').notices.ours.body,/Korund State Media reports/); assert.match(noticesFor('kindle').notices.world.bodyNoGrievance,/\bBoth sides\b/);
});
test('re-exports the shared name cap; 40/140 hold with every placeholder filled at it', () => {
  assert.equal(WAR_NAME_MAX,COUP_NAME_MAX); assert.equal(WAR_NAME_MAX,24);
  for (const t of heads()) assert.ok(fill(t).length<=WAR_LABEL_MAX, t);
  for (const t of bodies()) assert.ok(fill(t).length<=WAR_BODY_MAX, t);
});
test('placeholders: only known ones; every one used; all are pre-formatted tokens, never formatted in the copy', () => {
  assert.deepEqual([...WAR_PLACEHOLDERS],['{attacker}','{defender}','{casusBelli}','{endsAt}','{start}','{end}','{peaceLockEnds}']);
  const t=all().join(' ');
  for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(WAR_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const p of WAR_PLACEHOLDERS) assert.ok(t.includes(p), p);
  for (const l of M.mobilizing) assert.ok(l.text.includes('{endsAt}'));
  assert.match(D.line.text,/\{start\}.*\{end\}/);
  assert.doesNotMatch(t,/\{(endsAt|start|end|peaceLockEnds)\}\s*(UTC|GMT|AM|PM|a\.m\.|p\.m\.|o'clock)|\b(UTC|GMT)\b/i);
});
test('casusBelli: in every nation\'s declaration notices, and each has a variant without it; never in block reasons or status lines', () => {
  for (const x of declarationNotices) for (const [side,nt] of Object.entries(x.notices)) {
    assert.ok(nt.body.includes('{casusBelli}'), `${x.nationId}/${side}`); assert.doesNotMatch(nt.bodyNoGrievance,/\{casusBelli\}/, nt.id);
    assert.notEqual(nt.body,nt.bodyNoGrievance);
  }
  for (const t of [...M.mobilizing,...M.active,M.ended.treaty,M.ended.other,B.foundingPeriod,B.nonAggression,B.peaceLock,...D.explainer,...S.lines].map(l=>l.text)) assert.doesNotMatch(t,/\{casusBelli\}/, t);
  assert.doesNotMatch(all().join(' '),/border incident|broken treat|Commons dispute|sanction/i);
});
test('peace lock stays number-free; {peaceLockEnds} only in the treaty ending', () => {
  for (const t of all()) if (t.includes('{peaceLockEnds}')) assert.equal(t,M.ended.treaty.text);
  assert.match(M.ended.treaty.text,/ceasefire or peace treaty/); assert.match(M.ended.treaty.text,/terms apply/); assert.match(M.ended.treaty.text,/peace treaty locks declarations/);
  assert.equal(M.ended.other.text,'The war has ended.'); assert.doesNotMatch(M.ended.other.text,/treaty|peace|ceasefire|\{/);
  assert.doesNotMatch(B.peaceLock.text,/\{peaceLockEnds\}|\d/);
});
test('figures: only 48 real hours, the 4-hour window and the 30-day Founding Period; mobilization says 48 real hours', () => {
  for (const nt of notices()) { assert.match(nt.body,/48 real hours/, nt.id); assert.match(nt.bodyNoGrievance,/48 real hours/, nt.id); }
  assert.match(B.foundingPeriod.text,/Founding Period, a shard's first 30 days/); assert.match(D.explainer[0].text,/4-hour defense window/);
  for (const t of all()) assert.doesNotMatch(docFigures(t),/\d|%|percent|\b(one|two|three|four|five|ten|twelve|hundred)\b/i, t);
  assert.doesNotMatch(all().join(' '),/peace lock|ten days|10 days|14 days|\b2 active/i);
});
test('window lines cover cities and forts (§15.3), and never say all fighting stops outside the window', () => {
  assert.doesNotMatch([M.active[0].text,M.active[1].text,...D.explainer.map(l=>l.text)].join(' '),/no fighting|all fighting|fighting stops|nothing happens outside|only inside the window/i);
  assert.match(D.explainer[1].text,/anytime/);
  for (const l of [M.active[0],D.explainer[0]]) assert.match(l.text,/Assaults on cities and forts/);
  assert.doesNotMatch(all().join(' '),/city assaults/i);
});
test('reasons, not threats; no violence glorified; citizens never killed; no casualties, battles or loot beyond the safety line', () => {
  for (const t of all()) assert.doesNotMatch(t,/glor|triumph|crush|slaughter|massacre|conquer|victor|vengeance|bloodshed|destroy|annihilat|surrender|beware|doom|will pay|punish/i, t);
  const safe=SAFETY(); assert.match(safe[0],/never killed/); assert.match(safe[0],/never looted/); assert.match(safe[1],/wounded, not killed/);
  for (const t of all().filter(x=>!safe.includes(x))) assert.doesNotMatch(t,/kill|wound|casualt|loot|siege|army|armies|battle|troops/i, t);
  for (const l of Object.values(B).filter(x=>x&&x.text)) assert.match(l.text,/^The declaration was not made\./);
});
test('no real-world countries, leaders or conflicts; no Notable; no named player', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(Earth|America|Russia|China|Ukraine|Germany|Britain|England|France|Japan|Israel|Iran|NATO|Hitler|Napoleon|Stalin|Caesar|World War|Cold War|EVE)\b/);
  assert.doesNotMatch(t,/Notable/); assert.doesNotMatch(t,/\byou (will|must|shall)\b|@/i);
});
test('nation voices stay distinct: Kindle plain, Korund collective, Aurelle ceremonial', () => {
  assert.match(noticesFor('korund').notices.ours.bodyNoGrievance,/One hammer, one heart/); assert.doesNotMatch(noticesFor('kindle').notices.ours.body,/Be it known|One hammer/);
  assert.doesNotMatch(noticesFor('korund').notices['against-us'].body,/Be it known/);
  for (const nt of Object.values(noticesFor('aurelle').notices)) assert.doesNotMatch(nt.body,/One hammer|Wire Service/);
});
test('war-copy is imported only by the #309 war banner (flagged off); nothing else in app/ or components/ uses it', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f) && f !== 'app/war-banner.tsx') assert.doesNotMatch(readFileSync(f,'utf8'),/war-copy/, f);
});

test('#334 mobilization-ended news: each nation has ours / against-us / world notices with the canon bylines', () => {
  assert.deepEqual(mobilizationEndedNotices.map(x=>x.nationId),[...WAR_NATIONS]);
  const ids=new Set(notices().map(x=>x.id));
  for (const x of mobilizationEndedNotices) {
    assert.equal(x.proposal,true); assert.equal(endedNoticesFor(x.nationId),x); assert.deepEqual(Object.keys(x.notices).sort(),[...DECLARATION_SIDES].sort());
    assert.deepEqual(x.byline,noticesFor(x.nationId).byline);
    for (const nt of Object.values(x.notices)) { assert.equal(nt.proposal,true); assert.equal(typeof nt.aiBadge,'boolean'); assert.ok(!ids.has(nt.id)); ids.add(nt.id); assert.match(nt.body,/\bactive\b|\bat war\b/,nt.id); }
  }
  assert.deepEqual(noticesFor('kindle').byline,kindlePress.byline); assert.deepEqual(noticesFor('korund').byline,korundStateMedia.byline); assert.deepEqual(noticesFor('aurelle').byline,aurelleGazette.byline);
});
test('#334 AI badge only on Aurelle "Be it known" Crown lines', () => {
  for (const x of mobilizationEndedNotices) for (const nt of Object.values(x.notices)) assert.equal(nt.aiBadge,/^Be it known/.test(nt.body),nt.id);
  assert.equal(endedNoticesFor('aurelle').notices.world.aiBadge,false); assert.equal(endedNoticesFor('aurelle').notices.ours.aiBadge,true);
  for (const id of ['kindle','korund']) for (const nt of Object.values(endedNoticesFor(id).notices)) assert.equal(nt.aiBadge,false);
});
test('#334 ended notices use only {attacker} and {defender}; no time placeholder and no grievance or lock placeholder', () => {
  for (const nt of endNotices()) for (const m of (nt.headline+nt.body).match(/\{[^}]*\}/g)??[]) assert.ok(['{attacker}','{defender}'].includes(m),`${m} in ${nt.id}`);
  for (const nt of Object.values(endedNoticesFor('kindle').notices)) assert.doesNotMatch(nt.body,/\{casusBelli\}|\{peaceLockEnds\}|\{endsAt\}/);
  assert.match(endedNoticesFor('kindle').notices['against-us'].body,/\{attacker\}/); assert.match(endedNoticesFor('korund').notices.ours.body,/\{defender\}/);
});
test('#334 ended notices keep the assault rule to cities and forts, and say nothing new about the window', () => {
  for (const nt of endNotices()) { assert.doesNotMatch(nt.body,/no fighting|all fighting|fighting stops|city assaults|every attack|any time|anytime/i,nt.id); if (/assault/i.test(nt.body)) assert.match(nt.body,/Assaults on cities and forts resolve only in our defense window/); }
});
test('#334 war banner: header for each side names the other nation; countdown label and caption carry {endsAt} only', () => {
  assert.equal(BN.proposal,true); assert.equal(BN.header.ours,'At war with {defender}'); assert.equal(BN.header.againstUs,'At war with {attacker}');
  assert.match(BN.countdownLabel,/\{endsAt\}/); assert.match(BN.countdownCaption.text,/\{endsAt\}/); assert.equal(BN.countdownCaption.proposal,true);
  for (const t of [BN.countdownLabel,BN.countdownCaption.text]) assert.deepEqual(t.match(/\{[^}]*\}/g),['{endsAt}']);
  for (const t of [BN.header.ours,BN.header.againstUs,BN.countdownLabel]) assert.ok(fill(t).length<=WAR_LABEL_MAX,t);
  assert.ok(fill(BN.countdownCaption.text).length<=WAR_BODY_MAX); assert.match(BN.countdownCaption.text,/No attack can begin before then/);
  assert.doesNotMatch(BN.countdownLabel+BN.countdownCaption.text,/\b(UTC|GMT)\b|\d/);
});
