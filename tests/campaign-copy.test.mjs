import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindleParties } from '../lib/kindle-parties.ts';

// lib/campaign-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next). Node's type
// stripping cannot resolve that, so load it as tests/debate-copy.test.mjs does: rewrite the specifier and transpile.
const src=readFileSync('lib/campaign-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'campaign-copy-')),'campaign-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const { primariesCopy:P, townHallCopy:T, canvassingCopy:C, CAMPAIGN_PLACEHOLDERS, CAMPAIGN_NAME_MAX, CAMPAIGN_LABEL_MAX, CAMPAIGN_BODY_MAX } = await import(pathToFileURL(out).href);

const labels=()=>[P.title,T.title,C.questTitle,P.hopefulCard.nameLine.text,P.hopefulCard.partyLine.text];
const bodies=()=>[...P.explainer,P.hopefulCard.intro,...P.nomineeAnnounced,...T.callForQuestions,...T.questionsClosed,...T.answersIntro,T.aiDisclosure,...C.tasks,C.note,C.completion].map(l=>l.text);
const all=()=>[...labels(),...bodies()];
const lines=()=>[...P.explainer,P.hopefulCard.nameLine,P.hopefulCard.partyLine,P.hopefulCard.intro,...P.nomineeAnnounced,...T.callForQuestions,...T.questionsClosed,...T.answersIntro,T.aiDisclosure,...C.tasks,C.note,C.completion];
const fill=t=>CAMPAIGN_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(CAMPAIGN_NAME_MAX)),t);

test('shape: variants per the issue, every line proposal, AI flags on hopeful and candidate lines', () => {
  assert.ok(P.explainer.length>=2&&P.explainer.length<=3);
  for (const k of [P.nomineeAnnounced,T.callForQuestions,T.questionsClosed,T.answersIntro]) assert.ok(k.length>=2&&k.length<=3);
  assert.ok(C.tasks.length>=3&&C.tasks.length<=4);
  for (const l of lines()) assert.equal(l.proposal,true);
  for (const o of [P,T,C]) assert.equal(o.proposal,true);
  assert.equal(P.hopefulCard.aiBadge,true); assert.equal(T.aiBadge,true); assert.match(T.aiDisclosure.text,/AI candidate/); assert.match(P.hopefulCard.intro.text,/AI hopeful/);
});
test('re-exports the shared name cap; 40/140 hold with every placeholder filled at it', () => {
  assert.equal(CAMPAIGN_NAME_MAX,COUP_NAME_MAX); assert.equal(CAMPAIGN_NAME_MAX,24);
  for (const t of labels()) assert.ok(fill(t).length<=CAMPAIGN_LABEL_MAX, t);
  for (const t of bodies()) assert.ok(fill(t).length<=CAMPAIGN_BODY_MAX, t);
});
test('placeholders: only known ones; every one used; party only via {party}', () => {
  const t=all().join(' ');
  for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(CAMPAIGN_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const p of CAMPAIGN_PLACEHOLDERS) assert.ok(t.includes(p), p);
  for (const p of kindleParties) { assert.ok(!t.includes(p.name), p.name); assert.ok(!t.includes(p.id)); }
});
test('no figures; the town-hall window, question count and petition threshold stay out', () => {
  for (const t of all()) assert.doesNotMatch(t,/\d|%|percent|hours?|days?|\b(one|two|three|four|five|six|ten|first|second|top ten)\b|threshold|petition|quorum/i, t);
});
test('canvassing never changes votes; no rewards or currency language', () => {
  assert.match(C.note.text,/visibility, not votes/); assert.match(C.completion.text,/more visible/);
  for (const t of [...C.tasks.map(l=>l.text),C.note.text,C.completion.text,C.questTitle]) {
    assert.doesNotMatch(t.replace('visibility, not votes',''),/\bvotes?\b|persuade|convince|sway|swing|win over|turnout/i, t);
  }
  for (const t of all()) assert.doesNotMatch(t,/reward|earn|bonus|prize|coin|Spark|Crown|currency|money|payout|\bpay\b|dues|donat|cosmetic/i, t);
});
test('canvassing placeholders (ARC #305): tasks use {party}; the visibility line uses {candidate}; not members-only', () => {
  for (const l of C.tasks) assert.doesNotMatch(l.text,/\{(candidate|hopeful|district)\}/, l.text);
  assert.ok(C.tasks.some(l=>l.text.includes('{party}')));
  assert.equal(C.questTitle,'Canvass for {party}');
  assert.ok(C.completion.text.includes('{candidate}')); assert.doesNotMatch(C.completion.text,/\{party\}/);
  for (const t of [C.questTitle,...C.tasks.map(l=>l.text),C.note.text,C.completion.text]) assert.doesNotMatch(t,/members?\b|only|join|dues|enrol/i, t);
});
test('AI citizens never vote in primaries; primaries are members-only', () => {
  const e=P.explainer.map(l=>l.text).join(' ');
  assert.match(e,/for party members/); assert.match(e,/AI citizens do not vote in primaries/); assert.match(e,/Only human party members do/);
  for (const t of all()) if (/AI citizens?/i.test(t)) assert.match(t,/do not vote in primaries/);
  assert.doesNotMatch(all().join(' '),/instant|runoff|ranked-choice/i);
});
test('town hall: asynchronous, top-ranked, no method or up-vote claim; AI disclosed', () => {
  for (const l of [...T.questionsClosed,...T.answersIntro]) assert.match(l.text,/top-ranked|ranked highest/);
  for (const t of [...T.callForQuestions,...T.questionsClosed,...T.answersIntro].map(l=>l.text)) assert.doesNotMatch(t,/up-?vote|live|debate/i, t);
});
test('hopefuls and candidates are never quoted; no endorsing body, no Notable, no real-world references', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/["“”]|\bsaid\b|\bsays\b|spokes/i); assert.doesNotMatch(t,/endors|journalist|newspaper|union|guild|church|bank/i);
  assert.doesNotMatch(t,/\b(Earth|America|Congress|Senate|Parliament|Democrat|Republican|Labour|Tory|London|Washington)\b/); assert.doesNotMatch(t,/Notable/);
});
// #307 wired the primary card; #441 wires the town hall panel (townHallCopy). Any other UI importer still fails this guard.
const wiredCopyImporters=new Set(['app/primary-card.tsx','app/town-hall.tsx']);
test('wired by #307 and #441 only: the primary card and the town hall panel are the UI importers of campaign-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f) && !wiredCopyImporters.has(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/campaign-copy/, f);
});
