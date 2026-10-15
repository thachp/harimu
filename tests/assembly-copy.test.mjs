import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress } from '../lib/press-templates.ts';
import { kindleParties } from '../lib/kindle-parties.ts';

// lib/assembly-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next). Node's type
// stripping cannot resolve that, so load it as tests/debate-copy.test.mjs does: rewrite the specifier and transpile.
const src=readFileSync('lib/assembly-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'assembly-copy-')),'assembly-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const { ballotExplainer, resultsCaption, assemblyPress, assemblyStage, ASSEMBLY_STAGES, ASSEMBLY_PLACEHOLDERS, ASSEMBLY_NAME_MAX, ASSEMBLY_LABEL_MAX, ASSEMBLY_BODY_MAX, ASSEMBLY_BYLINE } = await import(pathToFileURL(out).href);

const lines=()=>[...ballotExplainer.lines,ballotExplainer.aiNote,resultsCaption.humanVotesOnly,resultsCaption.districtCounts];
const pressTexts=()=>assemblyPress.flatMap(s=>s.items.flatMap(i=>[i.headline,i.body]));
const all=()=>[ballotExplainer.title,...lines().map(l=>l.text),...pressTexts()];
const fill=t=>ASSEMBLY_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(ASSEMBLY_NAME_MAX)),t);

test('shape: stages in order, 2-3 variants, every line proposal, byline matches the Kindle pack', () => {
  assert.deepEqual(assemblyPress.map(s=>s.stage),[...ASSEMBLY_STAGES]);
  assert.deepEqual(ASSEMBLY_BYLINE,kindlePress.byline); assert.equal(ASSEMBLY_BYLINE.name,'Republic Wire Service');
  const ids=new Set();
  for (const s of assemblyPress) { assert.equal(s.proposal,true); assert.equal(assemblyStage(s.stage),s); assert.ok(s.items.length>=2&&s.items.length<=3, s.stage);
    for (const i of s.items) { assert.equal(i.proposal,true); assert.ok(!ids.has(i.id)); ids.add(i.id); } }
  assert.ok(ballotExplainer.lines.length>=2&&ballotExplainer.lines.length<=3);
  for (const l of lines()) assert.equal(l.proposal,true);
  assert.equal(ballotExplainer.proposal,true); assert.equal(resultsCaption.proposal,true);
});
test('re-exports the shared name cap and fits 40/140 with every placeholder filled at it', () => {
  assert.equal(ASSEMBLY_NAME_MAX,COUP_NAME_MAX); assert.equal(ASSEMBLY_NAME_MAX,24);
  assert.ok(fill(ballotExplainer.title).length<=ASSEMBLY_LABEL_MAX);
  for (const l of lines()) assert.ok(fill(l.text).length<=ASSEMBLY_BODY_MAX, l.text);
  for (const s of assemblyPress) for (const i of s.items) { assert.ok(fill(i.headline).length<=ASSEMBLY_LABEL_MAX, i.headline); assert.ok(fill(i.body).length<=ASSEMBLY_BODY_MAX, i.body); }
});
test('{seats} reads as seats held after the count: no change figure, no "won"/"gained N" wording', () => {
  for (const s of ['results-gain','results-hold','results-loss']) for (const i of assemblyStage(s).items) {
    if (i.body.includes('{seats}')) assert.match(i.body,/(Seats held now|It now holds|kept its seats): \{seats\}|It now holds \{seats\}/, i.id);
    assert.doesNotMatch(i.body,/\{seats\} (seats|more|fewer|new)|won \{seats\}|gained \{seats\}|lost \{seats\}|by \{seats\}/, i.id);
  }
});
test('placeholders: only known ones; results stages use all three; no party hard-coded', () => {
  for (const t of all()) for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(ASSEMBLY_PLACEHOLDERS.includes(m[0]), m[0]);
  const res=['results-gain','results-hold','results-loss'].flatMap(k=>assemblyStage(k).items.map(i=>i.body)).join(' ');
  for (const p of ASSEMBLY_PLACEHOLDERS) assert.ok(res.includes(p), p);
  for (const k of ['midterm-announced','voting-open']) for (const i of assemblyStage(k).items) assert.doesNotMatch(`${i.headline} ${i.body}`,/\{/);
  const t=all().join(' ');
  for (const p of kindleParties) { assert.ok(!t.includes(p.name), p.name); assert.ok(!t.includes(p.id)); }
});
test('no figures: seat counts only through {seats}; "half" and "one list" are docs wording', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\d|%|percent|quorum|turnout|threshold|majority|\b(two|three|four|five|six|seven|ten|hundred)\b/i, t);
    assert.doesNotMatch(t.replace('Half the','').replace('Half the','').replace(/\bone (party )?list\b/gi,'').replace('One list per voter',''),/\b(half|one)\b/i, t);
  }
});
test('docs-supported claims: half the seats, one list per own district, proportional, secret, human votes only (§9.3, Decision 65)', () => {
  const e=ballotExplainer.lines.map(l=>l.text).join(' ');
  assert.match(e,/Half the Assembly seats/); assert.match(e,/one party list, in your own district/); assert.match(e,/in proportion to votes in each district/);
  assert.match(e,/ballot is secret/); assert.match(e,/hidden until voting closes/);
  assert.match(resultsCaption.humanVotesOnly.text,/Only human votes are counted in each district/); assert.doesNotMatch(resultsCaption.humanVotesOnly.text,/Simulated Public/);
  assert.match(ballotExplainer.aiNote.text,/AI candidates/);
  assert.doesNotMatch(all().join(' '),/D'Hondt|Hare|Sainte|Droop|first-past/i);
});
test('AI honesty: parties not quoted, no AI citizens voting as individuals, no endorsing body', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/["“”]|\bsaid\b|\bsays\b|spokes/i);
  assert.doesNotMatch(t,/AI citizens?|Simulated Public/i); assert.doesNotMatch(t,/AI bloc/); assert.doesNotMatch(t,/endors|backed by|union|guild|church|bank/i);
});
test('no real-world references and no Notable', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(Earth|America|Congress|Senate|Parliament|Democrat|Republican|Labour|Tory|London|Washington|Brexit)\b/); assert.doesNotMatch(t,/Notable/);
});
test('wired by #283 only: the Assembly ballot panel is the one UI importer of assembly-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f) && f !== 'app/assembly-ballot.tsx') assert.doesNotMatch(readFileSync(f,'utf8'),/assembly-copy/, f);
});
