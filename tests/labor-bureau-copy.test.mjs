import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { korundStateMedia } from '../lib/press-templates.ts';

// lib/labor-bureau-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/labor-bureau-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'labor-bureau-copy-')),'labor-bureau-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const B = await import(pathToFileURL(out).href);
const { preferenceForm:F, assignmentNotices:A, reassignment:R, noticesFor, ASSIGNMENT_OUTCOMES, LABOR_BUREAU_PLACEHOLDERS, LABOR_BUREAU_NAME_MAX, LABOR_BUREAU_LABEL_MAX, LABOR_BUREAU_BODY_MAX, LABOR_BUREAU_BYLINE } = B;

const notices=()=>ASSIGNMENT_OUTCOMES.flatMap(o=>A[o]);
const labels=()=>[F.header,...F.slotLabels,F.submitButton,R.requestButton,...notices().map(x=>x.headline)];
const lines=()=>[...F.explainer,F.confirmation,R.confirmation,R.nextRequest,R.refusal].map(l=>l.text).concat(notices().map(x=>x.body));
const all=()=>[...labels(),...lines()];
const fill=t=>LABOR_BUREAU_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(LABOR_BUREAU_NAME_MAX)),t);

test('shared name cap is re-exported; limits 40/140; the four placeholders', () => {
  assert.equal(LABOR_BUREAU_NAME_MAX,COUP_NAME_MAX); assert.equal(LABOR_BUREAU_NAME_MAX,24);
  assert.equal(LABOR_BUREAU_LABEL_MAX,40); assert.equal(LABOR_BUREAU_BODY_MAX,140);
  assert.deepEqual([...LABOR_BUREAU_PLACEHOLDERS],['{job}','{workplace}','{city}','{nextRequestAt}']);
});
test('shape: form with 3 ranked slots, 2 notices per outcome, reassignment lines, every line proposal', () => {
  assert.equal(F.header,'Job preferences'); assert.deepEqual([...F.slotLabels],['First choice','Second choice','Third choice']);
  assert.equal(F.explainer.length,2); assert.deepEqual([...ASSIGNMENT_OUTCOMES],['first-choice','lower-choice','quota-posting']);
  const ids=new Set();
  for (const o of ASSIGNMENT_OUTCOMES) { assert.equal(A[o].length,2,o); assert.equal(noticesFor(o),A[o]);
    for (const x of A[o]) { assert.equal(x.proposal,true); assert.equal(x.aiBadge,false); assert.ok(!ids.has(x.id)); ids.add(x.id); } }
  for (const l of [...F.explainer,F.confirmation,R.confirmation,R.nextRequest,R.refusal]) assert.equal(l.proposal,true);
  for (const o of [F,R]) assert.equal(o.proposal,true);
});
test('40/140 limits hold with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=LABOR_BUREAU_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=LABOR_BUREAU_BODY_MAX,`${t} (${fill(t).length})`);
});
test('placeholders: only known; {job} in every notice; {nextRequestAt} only in the two reassignment date lines', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(LABOR_BUREAU_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const x of notices()) { assert.match(x.body,/\{job\}/,x.id); assert.match(x.body,/\{workplace\}|\{city\}/,x.id); assert.doesNotMatch(x.headline+x.body,/\{nextRequestAt\}/); }
  assert.match(R.nextRequest.text,/\{nextRequestAt\}/); assert.match(R.refusal.text,/\{nextRequestAt\}/);
  for (const t of all()) if (!/^Next request available|^Reassignment is not available/.test(t)) assert.doesNotMatch(t,/\{nextRequestAt\}/,t);
  for (const t of [...F.explainer.map(l=>l.text),F.confirmation.text,R.confirmation.text,...labels()]) assert.doesNotMatch(t,/\{/,t);
});
test('no invented numbers: no digits; "three" only for the preference list; the 30-day rule appears only through {nextRequestAt}', () => {
  for (const t of all()) { const bare=t.replace(/\{[^}]*\}/g,''); assert.doesNotMatch(bare,/\d|%|percent|\bthirty\b|\b(days?|weeks?|months?|hours?)\b|\bwages?\b|\bscore|\brank(ed|ing)?s?\b|\bpoints?\b|\bLabor Notes?\b/i,t); }
  for (const t of all()) assert.doesNotMatch(t.replace(/List three jobs/,''),/\b(one|two|three|four|five|ten)\b/i,t);
  assert.match(F.explainer[0].text,/List three jobs in order/);
});
test('every assignment line is AI-Bureau voiced, names a bounded reason, and implies no human official', () => {
  for (const x of notices()) { assert.match(x.body,/the AI Labor Bureau (assigned|placed|weighed)/i,x.id); assert.match(x.body,/skills|Standing|quota gap/i,x.id); }
  for (const t of all()) assert.doesNotMatch(t,/\b(official|officer|chief|clerk|commissioner|director|manager|supervisor|boss|foreman|comrade|I |we )\b/i,t);
  for (const x of A['first-choice']) assert.match(x.body,/skills|Standing/i);
  for (const x of A['quota-posting']) { assert.match(x.body,/quota gap/i); assert.match(x.body,/outside your list/); }
  for (const x of A['lower-choice']) assert.match(x.body,/quota gaps|lower choice/i);
  assert.match(F.explainer[0].text,/skills, Standing and the plan's quota gaps/);
});
test('bylines: State Media notices use the canon byline and carry no aiBadge', () => {
  assert.deepEqual(LABOR_BUREAU_BYLINE,korundStateMedia.byline);
  assert.match(korundStateMedia.voice,/plan/); assert.ok(notices().every(x=>x.aiBadge===false));
});
test('Korund voice: the plan and the Bureau; no gray market, no faith, no other nation, no Labor Note wages', () => {
  assert.match(lines().join(' '),/\bthe plan\b/i);
  const t=all().join(' ');
  assert.doesNotMatch(t,/gray|grey|black[- ]?market|street|\b(god|pray|faith|worship|church|temple)\b/i);
  assert.doesNotMatch(t,/\b(Kindle|Aurelle|Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b/);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|China|Russia|Moscow|Soviet|Stalin|Gulag|NATO)\b|Notable|@/);
});
test('reassignment lines: request, confirmation, next-request and refusal in plain words', () => {
  assert.equal(R.requestButton,'Request reassignment'); assert.match(R.confirmation.text,/filed with the AI Labor Bureau/);
  assert.match(R.nextRequest.text,/^Next request available on \{nextRequestAt\}\.$/); assert.match(R.refusal.text,/not available yet/);
});
test('unwired: nothing in app/ or components/ imports labor-bureau-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/labor-bureau-copy/, f);
});
