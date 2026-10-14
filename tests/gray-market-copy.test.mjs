import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { korundStateMedia } from '../lib/press-templates.ts';

// lib/gray-market-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next). Node's
// type stripping cannot resolve that, so load it as tests/debate-copy.test.mjs does: rewrite the specifier and transpile.
const src=readFileSync('lib/gray-market-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'gray-market-copy-')),'gray-market-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const { grayMarketEntry:E, riskWarning:W, rumoredRate:R, offerLines:O, streetWhispers:S, GRAY_MARKET_PLACEHOLDERS, GRAY_MARKET_NAME_MAX, GRAY_MARKET_LABEL_MAX, GRAY_MARKET_BODY_MAX } = await import(pathToFileURL(out).href);

const offers=()=>[...O.posted,...O.accepted,...O.withdrawn,...O.expired,...O.none];
const lines=()=>[E.subtitle,...W.lines,...R.lines,...offers(),...S];
const labels=()=>[E.label,W.title,R.label];
const all=()=>[...labels(),...lines().map(l=>l.text)];
const fill=t=>GRAY_MARKET_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(GRAY_MARKET_NAME_MAX)),t);

test('shape: variants per the issue, every line proposal', () => {
  assert.ok(R.lines.length>=2&&R.lines.length<=3);
  for (const k of ['posted','accepted','withdrawn','expired','none']) assert.ok(O[k].length>=2&&O[k].length<=3, k);
  assert.ok(S.length>=3&&S.length<=4);
  for (const l of lines()) assert.equal(l.proposal,true);
  for (const o of [E,W,R,O]) assert.equal(o.proposal,true);
});
test('re-exports the shared name cap; 40/140 hold with {rate} filled at it', () => {
  assert.equal(GRAY_MARKET_NAME_MAX,COUP_NAME_MAX); assert.equal(GRAY_MARKET_NAME_MAX,24);
  for (const t of labels()) assert.ok(fill(t).length<=GRAY_MARKET_LABEL_MAX, t);
  for (const l of lines()) assert.ok(fill(l.text).length<=GRAY_MARKET_BODY_MAX, l.text);
});
test('the rate appears only through {rate}, and always as a rumor, never official or exact', () => {
  for (const t of all()) for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(GRAY_MARKET_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const l of R.lines) { assert.ok(l.text.includes('{rate}')); assert.match(l.text,/rumou?r|word on the street|street talk/i); assert.match(l.text,/about|near|roughly|not exact|may be wrong|rarely exact/i); }
  for (const t of all()) assert.doesNotMatch(t,/official|exactly|guaranteed|fixed rate|the rate is \{rate\}/i, t);
  for (const l of [...W.lines,...offers(),...S]) assert.doesNotMatch(l.text,/\{rate\}/);
  assert.match(R.label,/Rumored/);
});
test('warning: illegal, adds Suspicion, penalties capped, no numbers', () => {
  const w=W.lines.map(l=>l.text).join(' ');
  assert.match(w,/illegal in Korund/); assert.match(w,/adds Suspicion/); assert.match(w,/Penalties are capped/);
  assert.match(E.subtitle.text,/illegal/); assert.match(E.subtitle.text,/risky/);
});
test('no figures anywhere, and whispers hint movement without a number', () => {
  for (const t of all()) assert.doesNotMatch(t,/\d|%|percent|\b(one|two|three|four|five|six|seven|ten|hundred|dozen|double|half)\b|\bdays?\b|hours?/i, t);
  for (const l of S) assert.doesNotMatch(l.text,/\{|rate of|per |to one/i, l.text);
  assert.ok(S.some(l=>/rate/.test(l.text)));
});
test('no real-world currency, drug or crime slang; no informer, player or person named; no raids', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/dollar|euro|pound|yen|bitcoin|crypto|\bUSD\b|drug|narc|dope|weed|smuggl|launder|fence|stash|hustl|mule|dealer|cartel|mafia|bootleg/i);
  assert.doesNotMatch(t,/informer|snitch|spy|agent|police|raid|arrest|prison|guard/i);
  assert.doesNotMatch(t,/Comrade|Chairman|[A-Z][a-z]+ [A-Z][a-z]+ said/); assert.doesNotMatch(t,/["“”]/);
});
test('street voice is private, not State Media; faith-neutral; no Notable or real-world references', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/State Media|broadcast|bulletin|plan advances|One hammer|Presidium/i); assert.ok(!t.includes(korundStateMedia.byline.name));
  assert.doesNotMatch(t,/faith|shrine|worship|congregation|church|prayer|bless/i);
  assert.doesNotMatch(t,/\b(Earth|Soviet|Moscow|Kremlin|USSR|China|America|London)\b/); assert.doesNotMatch(t,/Notable/);
});
test('unwired: nothing in app/ or components/ imports gray-market-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/gray-market-copy/, f);
});
