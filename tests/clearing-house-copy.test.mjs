import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { korundStateMedia } from '../lib/press-templates.ts';

// lib/clearing-house-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/clearing-house-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'clearing-house-copy-')),'clearing-house-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const C = await import(pathToFileURL(out).href);
const { kioskPanel:K, purchaseCopy:Pu, refusals:Rf, refusalFor, REFUSAL_KEYS, CLEARING_HOUSE_PLACEHOLDERS, CLEARING_HOUSE_NAME_MAX, CLEARING_HOUSE_LABEL_MAX, CLEARING_HOUSE_BODY_MAX, CLEARING_HOUSE_BYLINE } = C;

const labels=()=>[K.header,...K.buyButtons];
const lines=()=>[K.explainer,K.neutral,K.rateLine,K.comingSoon,...Pu.receipt,...Pu.history,...REFUSAL_KEYS.flatMap(k=>Rf[k])].map(l=>l.text);
const all=()=>[...labels(),...lines()];
const fill=t=>CLEARING_HOUSE_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(CLEARING_HOUSE_NAME_MAX)),t);

test('shared name cap is re-exported; limits are 40/140', () => {
  assert.equal(CLEARING_HOUSE_NAME_MAX,COUP_NAME_MAX); assert.equal(CLEARING_HOUSE_NAME_MAX,24);
  assert.equal(CLEARING_HOUSE_LABEL_MAX,40); assert.equal(CLEARING_HOUSE_BODY_MAX,140);
  assert.deepEqual([...CLEARING_HOUSE_PLACEHOLDERS],['{rate}','{amount}','{cost}','{min}','{max}']);
});
test('shape: panel pieces, 2 receipt and 2 history variants, 2 variants for each of 5 refusals, every line proposal', () => {
  assert.equal(K.header,'Clearing House kiosk'); assert.ok(K.buyButtons.length>=2);
  assert.equal(Pu.receipt.length,2); assert.equal(Pu.history.length,2);
  assert.deepEqual([...REFUSAL_KEYS],['closed','insufficient-spark','out-of-range','korund','other-nation']); assert.deepEqual(Object.keys(Rf).sort(),[...REFUSAL_KEYS].sort());
  for (const k of REFUSAL_KEYS) { assert.equal(Rf[k].length,2,k); assert.equal(refusalFor(k),Rf[k]); }
  for (const l of [K.explainer,K.neutral,K.rateLine,K.comingSoon,...Pu.receipt,...Pu.history,...REFUSAL_KEYS.flatMap(k=>Rf[k])]) assert.equal(l.proposal,true);
  for (const o of [K,Pu]) assert.equal(o.proposal,true);
});
test('40/140 limits hold with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=CLEARING_HOUSE_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=CLEARING_HOUSE_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only known placeholders, in the right lines', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(CLEARING_HOUSE_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  assert.match(K.rateLine.text,/\{rate\}/); for (const b of K.buyButtons.slice(0,1)) assert.match(b,/\{amount\}/);
  for (const l of [...Pu.receipt,...Pu.history]) { assert.match(l.text,/\{amount\}/); assert.match(l.text,/\{cost\}/); }
  for (const l of Rf['out-of-range']) { assert.match(l.text,/\{min\}/); assert.match(l.text,/\{max\}/); }
  for (const l of Rf['insufficient-spark']) assert.match(l.text,/\{amount\}/);
  for (const k of ['closed','korund','other-nation']) for (const l of Rf[k]) assert.doesNotMatch(l.text,/\{/,l.text);
  for (const t of all()) if (!/\{rate\}/.test(t)) assert.doesNotMatch(t,/\{rate\}/);
});
test('no numbers, rates, fees or caps in the copy; placeholders carry the figures', () => {
  for (const t of all()) { assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|percent|per ?cent|\bfees?\b|\bcaps?\b|\blimit\b|\b(one|two|three|four|five|ten|hundred)\b/i,t); }
  assert.doesNotMatch(all().join(' '),/0\.25|1 SPK|\d+ TSR/);
});
test('no units after placeholders: values arrive pre-formatted with their unit', () => {
  for (const t of all()) assert.doesNotMatch(t,/\{(amount|cost|min|max|rate)\}\s*(TSR|SPK|Tessera|Spark)\b/i,t);
});
test('Clearing House voice: system rules, no officials implied; Tessera and Spark named', () => {
  assert.match(K.neutral.text,/system rules/); assert.match(K.neutral.text,/no officials/);
  for (const t of all()) assert.doesNotMatch(t,/\b(clerk|officer|official(s)? (will|has|decided|approved)|banker|manager|staff|we |our team|AI|human)\b/i,t);
  assert.match(K.explainer.text,/Tessera/); assert.match(K.explainer.text,/Spark/); assert.match(K.explainer.text,/world trade/);
});
test('Korund refusal: State Media notice saying the Labor Note cannot be converted; never a street rate, black or gray market', () => {
  assert.deepEqual(CLEARING_HOUSE_BYLINE,korundStateMedia.byline);
  for (const l of Rf.korund) { assert.match(l.text,/^Korund State Media:/); assert.match(l.text,/Labor Note cannot be converted/); }
  assert.match(Rf.korund[0].text,/State Trade Bureau/);
  for (const t of all()) assert.doesNotMatch(t,/street|black[- ]?market|gray|grey|illegal|illicit|smuggl|foreign cash|underground/i,t);
  for (const k of REFUSAL_KEYS.filter(x=>x!=='korund')) for (const l of Rf[k]) assert.doesNotMatch(l.text,/State Media|Labor Note/,l.text);
});
test('other nations: no kiosk yet, and no Crown conversion beyond one coming-soon line', () => {
  for (const l of Rf['other-nation']) assert.match(l.text,/\bno\b.*(kiosk).*nation yet|kiosk in your nation yet/i);
  assert.match(K.comingSoon.text,/coming soon/);
  assert.equal(all().filter(t=>/Crown/.test(t)).length,1);
  assert.doesNotMatch(all().join(' '),/sell (it )?back|refund|exchange rate to/i);
});
test('faith-neutral, no real-world currency, bank or place; no Notable', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(god|gods|pray|prayer|faith|church|temple|worship|sacred|blessed|holy)\b/i);
  assert.doesNotMatch(t,/\b(dollar|euro|yen|pound|ruble|yuan|bitcoin|crypto|USD|EUR|IMF|World Bank|Fed|Federal Reserve|Earth|America|Europe|China|Russia|Wall Street)\b/i);
  assert.doesNotMatch(t,/Notable|@/);
});
test('unwired: nothing in app/ or components/ imports clearing-house-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/clearing-house-copy/, f);
});
