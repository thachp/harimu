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
const { debateChrome:C, DEBATE_CHROME_NAME_MAX, DEBATE_CHROME_LABEL_MAX, DEBATE_CHROME_LINE_MAX } = D;

const labels=()=>[C.title,C.questionsCloseLabel];
const lines=()=>[C.waiting.text,C.emptyOpen.text,C.emptyClosed.text];
const all=()=>[...labels(),...lines()];

test('shared name cap re-exported; limits 40/80', () => {
  assert.equal(DEBATE_CHROME_NAME_MAX,COUP_NAME_MAX); assert.equal(DEBATE_CHROME_LABEL_MAX,40); assert.equal(DEBATE_CHROME_LINE_MAX,80);
});
test('covers the five #511 lines under the panel\'s names: title, waiting, emptyOpen, emptyClosed, questionsCloseLabel; every line a proposal, all distinct', () => {
  assert.deepEqual(Object.keys(C).sort(),['emptyClosed','emptyOpen','proposal','questionsCloseLabel','title','waiting']);
  assert.equal(C.title,'Presidential debate'); assert.equal(C.questionsCloseLabel,'Questions close');
  assert.match(C.waiting.text,/not open yet/); assert.match(C.emptyOpen.text,/^No questions yet/); assert.match(C.emptyClosed.text,/^No questions were asked/);
  for (const l of [C.waiting,C.emptyOpen,C.emptyClosed]) assert.equal(l.proposal,true); assert.equal(C.proposal,true);
  assert.equal(new Set(all()).size,all().length);
});
test('limits: labels 40, lines 80', () => {
  for (const t of labels()) assert.ok(t.length<=DEBATE_CHROME_LABEL_MAX,t);
  for (const t of lines()) assert.ok(t.length<=DEBATE_CHROME_LINE_MAX,`${t} (${t.length})`);
});
test('no placeholders, no figures, no schedule promise', () => {
  for (const t of all()) { assert.doesNotMatch(t,/\{|\}/,t); assert.doesNotMatch(t,/\d|%|\b(two|three|four|five|six|seven|ten|twice|once|half)\b/i,t); }
  for (const t of all()) assert.doesNotMatch(t,/\b(tonight|today|tomorrow|soon|shortly|will open|opens|date|hours?|days?|minutes?|guarantee\w*|promise\w*)\b/i,t);
});
test('system chrome: no byline, no AI badge, no in-character voice', () => {
  assert.equal('aiBadge' in C,false); assert.equal('byline' in C,false);
  for (const t of all()) assert.doesNotMatch(t,/Republic Wire|State Media|Court Gazette|Be it known|Chairman|Crown|AI-generated|AI answer|model|Notable|@|!/,t);
});
test('does not repeat the existing debate copy and leaves vote counts alone', () => {
  const dc=readFileSync('lib/debate-copy.ts','utf8');
  for (const t of all()) assert.ok(!dc.includes(t),t);
  for (const t of all()) assert.doesNotMatch(t,/\bvotes?\b|up-vote/i,t);
});
test('tone: plain; no pressure, no real-world names', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(hurry|last chance|must|fail\w*|reject\w*|punish\w*|winner\w*|win)\b/i);
  assert.doesNotMatch(t,/\b(America\w*|Europe\w*|England|France|Japan|China|Russia)\b/);
});
test('unwired: nothing in app/, components/ or lib/ imports debate-chrome-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('debate-chrome-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/debate-chrome-copy/, f);
});
