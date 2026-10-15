import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

// The module re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the specifier and transpile.
const src=readFileSync('lib/debate-chrome-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'debate-chrome-copy-')),'debate-chrome-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const D = await import(pathToFileURL(out).href);
const { debateChrome:C, debateEmpty:E, debateIntake:I, debateQuestionMeta:M, debateVotesLine, DEBATE_CHROME_NAME_MAX, DEBATE_CHROME_PLACEHOLDERS, DEBATE_CHROME_NUMBER_MAX, DEBATE_CHROME_LABEL_MAX, DEBATE_CHROME_LINE_MAX } = D;

const labels=()=>[C.title,C.questionsCloseLabel,M.yours];
const lines=()=>[C.waiting.text,E.noQuestionsYet.text,E.noQuestionsAsked.text,I.tooShort.text,M.voteOne.text,M.voteMany.text,M.yoursAccessibleName.text];
const all=()=>[...labels(),...lines()];
const fill=t=>t.replaceAll('{count}','9'.repeat(DEBATE_CHROME_NUMBER_MAX)).replaceAll('{min}','9'.repeat(DEBATE_CHROME_NUMBER_MAX));

test('shared name cap re-exported; limits 40/80; the two numeric placeholders', () => {
  assert.equal(DEBATE_CHROME_NAME_MAX,COUP_NAME_MAX); assert.equal(DEBATE_CHROME_LABEL_MAX,40); assert.equal(DEBATE_CHROME_LINE_MAX,80); assert.equal(DEBATE_CHROME_NUMBER_MAX,6);
  assert.deepEqual([...DEBATE_CHROME_PLACEHOLDERS],['{count}','{min}']);
});
test('covers every #508 placeholder label: title, not open yet, empty states, questions close, too short, vote counts, yours', () => {
  assert.equal(C.title,'Presidential debate'); assert.equal(C.questionsCloseLabel,'Questions close'); assert.equal(M.yours,'yours');
  assert.match(C.waiting.text,/not open yet/); assert.match(E.noQuestionsYet.text,/^No questions yet/); assert.match(E.noQuestionsAsked.text,/^No questions were asked/);
  assert.match(I.tooShort.text,/^Write at least \{min\} characters\.$/); assert.equal(M.voteOne.text,'{count} vote'); assert.equal(M.voteMany.text,'{count} votes');
  for (const l of [C.waiting,E.noQuestionsYet,E.noQuestionsAsked,I.tooShort,M.voteOne,M.voteMany,M.yoursAccessibleName]) assert.equal(l.proposal,true); for (const o of [C,E,I,M]) assert.equal(o.proposal,true);
  assert.equal(new Set(all()).size,all().length);
});
test('limits: labels 40, lines 80, with placeholders filled to six characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=DEBATE_CHROME_LABEL_MAX,t);
  for (const t of lines()) assert.ok(fill(t).length<=DEBATE_CHROME_LINE_MAX,`${t} (${fill(t).length})`);
});
test('only {count} and {min}, each where it belongs', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(DEBATE_CHROME_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  assert.ok(I.tooShort.text.includes('{min}')); assert.ok(M.voteOne.text.includes('{count}')); assert.ok(M.voteMany.text.includes('{count}'));
  for (const t of all().filter(x=>![I.tooShort.text,M.voteOne.text,M.voteMany.text].includes(x))) assert.doesNotMatch(t,/\{/,t);
});
test('the vote line is singular only for a count of exactly 1', () => {
  assert.equal(debateVotesLine(1),M.voteOne); for (const n of [0,2,3,10,1000]) assert.equal(debateVotesLine(n),M.voteMany);
});
test('no figure written into any line and no promise of an open time', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|\b(two|three|four|five|six|seven|ten|twice|once|half)\b/i,t);
  for (const t of all()) assert.doesNotMatch(t,/\b(tonight|today|tomorrow|soon|shortly|will open|opens|date|hours?|days?|minutes?|guarantee\w*|promise\w*)\b/i,t);
});
test('system chrome: no byline, no AI badge, no in-character voice, no mention of how answers are made', () => {
  for (const o of [C,E,I,M]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const t of all()) assert.doesNotMatch(t,/Republic Wire|State Media|Court Gazette|Be it known|Chairman|Crown|AI-generated|AI answer|model|Notable|@|!/,t);
});
test('does not repeat the existing debate or town hall copy', () => {
  const dc=readFileSync('lib/debate-copy.ts','utf8');
  for (const t of lines()) assert.ok(!dc.includes(t),t);
});
test('tone: plain; no pressure, no real-world names', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(hurry|last chance|must|fail\w*|reject\w*|punish\w*|vote for|winner\w*|win)\b/i);
  assert.doesNotMatch(t,/\b(America\w*|Europe\w*|England|France|Japan|China|Russia)\b/);
});
test('unwired: nothing in app/, components/ or lib/ imports debate-chrome-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('debate-chrome-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/debate-chrome-copy/, f);
});
