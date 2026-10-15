import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
// lib/debate-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next). Node's
// type stripping cannot resolve that, so load it the way tests/helpers/local-runtime.mjs does: rewrite the specifier and transpile.
const src=readFileSync('lib/debate-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'debate-copy-')),'debate-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const { moderatorCopy, questionIntakeCopy, factCheckCopy, fallbackLines, fallbackNotice, fallbackFor, DEBATE_PLACEHOLDERS, DEBATE_NAME_MAX, DEBATE_LABEL_MAX, DEBATE_BODY_MAX } = await import(pathToFileURL(out).href);
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindleCandidatePlatforms, pledge } from '../lib/kindle-parties.ts';

const q=questionIntakeCopy;
const labels=()=>[q.submitLabel,q.submitButton,q.upvoteButton,factCheckCopy.panelTitle,...Object.values(factCheckCopy.labels)];
const lines=()=>[...moderatorCopy.open,...moderatorCopy.questionIntro,...moderatorCopy.close,q.submitPrompt,q.upvoteHint,q.alreadyVoted,q.notEligible,q.moderationRejected,q.submitted,factCheckCopy.explainer,fallbackNotice,...fallbackLines];
const all=()=>[...labels(),...lines().map(l=>l.text)];
const fill=t=>DEBATE_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(DEBATE_NAME_MAX)),t);

test('shape: 2-3 moderator variants each, every line proposal, required labels', () => {
  for (const k of ['open','questionIntro','close']) assert.ok(moderatorCopy[k].length>=2&&moderatorCopy[k].length<=3, k);
  for (const l of lines()) assert.equal(l.proposal,true);
  for (const o of [moderatorCopy,q,factCheckCopy]) assert.equal(o.proposal,true);
  assert.deepEqual(factCheckCopy.labels,{claim:'Claim',systemFigure:'System figure',matches:'Matches',differs:'Differs'});
});
test('length limits, raw and filled at the 24-char name cap', () => {
  assert.equal(DEBATE_NAME_MAX,COUP_NAME_MAX); assert.equal(DEBATE_NAME_MAX,24);
  for (const t of labels()) assert.ok(fill(t).length<=DEBATE_LABEL_MAX, t);
  for (const l of lines()) assert.ok(fill(l.text).length<=DEBATE_BODY_MAX, l.text);
});
test('placeholders: only {candidate}, used in every fallback', () => {
  for (const t of all()) for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(DEBATE_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const f of fallbackLines) assert.ok(f.text.includes('{candidate}'));
});
test('no figures (Tier-1 and "one vote" are docs wording; quoted pledge cards are canon)', () => {
  for (const t of all()) { const bare=t.replaceAll('Tier-1','').replace(/"[^"]+"/g,'').replaceAll('one vote per question',''); assert.doesNotMatch(bare,/\d|%|percent|threshold|\b(one|two|three|four|five|top)\b/i, t); }
});
test('one fallback per candidate, quoting only pledges on its platform card', () => {
  assert.deepEqual(fallbackLines.map(f=>f.candidateId).sort(),Object.keys(kindleCandidatePlatforms).sort());
  for (const id of Object.keys(kindleCandidatePlatforms)) assert.equal(fallbackFor(id).candidateId,id);
  const cards=new Map(Object.values(kindleCandidatePlatforms).flatMap(p=>p.pledges).map(k=>[pledge(k).card,k]));
  for (const f of fallbackLines) {
    const own=kindleCandidatePlatforms[f.candidateId].pledges;
    for (const k of f.pledges) { assert.ok(own.includes(k), k); assert.ok(f.text.includes(`"${pledge(k).card}"`), k); }
    const quoted=[...f.text.matchAll(/"([^"]+)"/g)].map(m=>m[1]);
    assert.deepEqual(quoted,f.pledges.map(k=>pledge(k).card));
    for (const [card,k] of cards) if (!own.includes(k)) assert.ok(!f.text.includes(card), card);
  }
});
test('refusals say why in plain words', () => {
  assert.match(q.notEligible.text,/Only Tier-1 verified citizens/); assert.match(q.alreadyVoted.text,/one vote per question/);
  assert.match(q.moderationRejected.text,/because/); assert.match(fallbackNotice.text,/unavailable/);
});
test('no endorsing body, no Notable, no real-world references', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/endors|Notable|journalist/i);
  assert.doesNotMatch(t,/\b(Earth|America|Congress|Senate|Democrat|Republican|Labour|Tory|London|Washington)\b/);
});
// #282 wires the debate panel (app/debate.tsx); any other UI importer still fails this guard.
test('wired by #282 only: nothing in app/ or components/ imports debate-copy except the debate panel', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f) && f!=='app/debate.tsx') assert.doesNotMatch(readFileSync(f,'utf8'),/debate-copy/, f);
});
