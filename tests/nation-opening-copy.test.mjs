import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

// The module re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the specifier and transpile.
const src=readFileSync('lib/nation-opening-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'nation-opening-copy-')),'nation-opening-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const N = await import(pathToFileURL(out).href);
const { nationComingSoon:CS, nationClosedRefusals:R, nationClosedWhy:W, OPENING_NAME_MAX, OPENING_PLACEHOLDERS, OPENING_LABEL_MAX, OPENING_LINE_MAX, OPENING_BODY_MAX } = N;

const labels=()=>[CS.label];
const lines=()=>[CS.accessibleName.text,R.enroll.text,R.change.text,R.generic.text,W.why.text,W.unchanged.text];
const all=()=>[...labels(),...lines()];
const fill=t=>t.replaceAll('{nation}','W'.repeat(OPENING_NAME_MAX));

test('shared name cap re-exported; limits 40/80/140; one placeholder', () => {
  assert.equal(OPENING_NAME_MAX,COUP_NAME_MAX); assert.equal(OPENING_LABEL_MAX,40); assert.equal(OPENING_LINE_MAX,80); assert.equal(OPENING_BODY_MAX,140); assert.deepEqual([...OPENING_PLACEHOLDERS],['{nation}']);
});
test('covers the label, the enroll and change refusals, a name-free refusal, a why line and the unchanged line; all proposal true and distinct', () => {
  assert.equal(CS.label,'Coming soon'); assert.equal(R.generic.text,'That nation is not open yet.');
  for (const l of [CS.accessibleName,R.enroll,R.change,R.generic,W.why,W.unchanged]) assert.equal(l.proposal,true); for (const o of [CS,R,W]) assert.equal(o.proposal,true);
  assert.equal(new Set(all()).size,all().length);
  assert.match(R.enroll.text,/enroll/); assert.match(R.change.text,/cannot change to it/); assert.match(W.unchanged.text,/citizenship is unchanged/);
});
test('limits: labels 40, lines 80, with {nation} filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=OPENING_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=OPENING_LINE_MAX,`${t} (${fill(t).length})`);
});
test('only {nation}; the name-free lines carry none, and the refusals and accessible name carry it', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(OPENING_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const t of [CS.accessibleName.text,R.enroll.text,R.change.text]) assert.ok(t.includes('{nation}'),t);
  for (const t of [CS.label,R.generic.text,W.why.text,W.unchanged.text]) assert.doesNotMatch(t,/\{/,t);
});
test('no figures, no promise of an opening date: "coming soon" only in the label and its accessible name', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|\b(one|two|three|four|five|six|seven|ten|twice|once|half)\b/i,t);
  for (const t of all()) assert.doesNotMatch(t,/\b(date|dates|tomorrow|today|tonight|week|weeks|month|months|year|years|days?|hours?|soon|shortly|eventually|next|when|until|will|guarantee\w*|promise\w*)\b/i.test(t)&&t!==CS.label&&t!==CS.accessibleName.text?/./:/(?!)/,t);
  assert.match(CS.accessibleName.text,/coming soon/);
  for (const t of lines().filter(x=>x!==CS.accessibleName.text)) assert.doesNotMatch(t,/coming soon|\bsoon\b/i,t);
});
test('no real-world country or people names and no nation named in a line; refusals are out of character', () => {
  for (const t of all()) { assert.doesNotMatch(t,/\b(America\w*|Europe\w*|England|English|France|French|Germany|German|Japan\w*|China|Chinese|Russia\w*|India\w*|Korea\w*|Brazil\w*|Canada|Canadian|Mexic\w*|Spain|Spanish|Italy|Italian|Egypt\w*|Rome|Roman|Persia\w*|Ottoman)\b/,t); assert.doesNotMatch(t,/\b(Kindle|Korund|Aurelle|Varkand|Meridian|Ilmar|Veldwood|Hoarvale|Fulmara|Confluence)\b/,t); }
  for (const t of [R.enroll.text,R.change.text,R.generic.text]) assert.match(t,/not open yet/,t);
  for (const t of all()) assert.doesNotMatch(t,/Chairman|Crown|President|Assembly|Republic Wire|State Media|Court Gazette|Be it known|Notable|@/,t);
});
test('system lines only: no byline, no AI badge; plain tone', () => {
  for (const o of [CS,R,W]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const t of all()) assert.doesNotMatch(t,/!|\b(sorry|unfortunately|denied|forbidden|banned|illegal|punish\w*|must)\b/i,t);
});
test('does not touch mechanics: no flag, allowlist, registry or QA wording', () => {
  for (const t of all()) assert.doesNotMatch(t,/\b(flag\w*|allowlist\w*|whitelist\w*|registry|QA|beta|alpha|tester\w*|NFT\w*|token\w*|chain|wallet\w*|Tessera|land)\b/i,t);
});
test('unwired: nothing in app/, components/ or lib/ imports nation-opening-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('nation-opening-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/nation-opening-copy/, f);
});
