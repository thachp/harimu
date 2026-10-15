import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

// The module re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the specifier and transpile.
const src=readFileSync('lib/gray-market-chrome-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'gray-market-chrome-copy-')),'gray-market-chrome-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const G = await import(pathToFileURL(out).href);
const { grayChrome:C, grayRefusalCopy:R, GRAY_REFUSAL_REASONS, GRAY_CHROME_NAME_MAX, GRAY_CHROME_PLACEHOLDERS, GRAY_CHROME_VALUE_MAX, GRAY_CHROME_LABEL_MAX, GRAY_CHROME_LINE_MAX, GRAY_CHROME_BODY_MAX } = G;

const labels=()=>[C.cashLabel,C.amountLabel,C.rateLabel,C.postButton,C.acceptButton,C.yourOffer,C.boardTitle];
const lines=()=>[C.acceptAccessibleName.text,C.noRumor.text,...GRAY_REFUSAL_REASONS.map(k=>R[k].text)];
const bodies=()=>[C.cashHelp.text];
const all=()=>[...labels(),...lines(),...bodies()];
const fill=t=>GRAY_CHROME_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'9'.repeat(GRAY_CHROME_VALUE_MAX)),t);
const lengthOf=t=>fill(t).length;
const capFor=t=>labels().includes(t)?GRAY_CHROME_LABEL_MAX:bodies().includes(t)||t===R.out_of_range.text?GRAY_CHROME_BODY_MAX:GRAY_CHROME_LINE_MAX;

test('shared name cap re-exported; limits 40/80/140; six placeholders', () => {
  assert.equal(GRAY_CHROME_NAME_MAX,COUP_NAME_MAX); assert.equal(GRAY_CHROME_LABEL_MAX,40); assert.equal(GRAY_CHROME_LINE_MAX,80); assert.equal(GRAY_CHROME_BODY_MAX,140); assert.equal(GRAY_CHROME_VALUE_MAX,20);
  assert.deepEqual([...GRAY_CHROME_PLACEHOLDERS],['{minAmount}','{maxAmount}','{minRate}','{maxRate}','{amount}','{askRate}']);
});
test('key names match the panel\'s text table and server reasons exactly, so the swap is an import rename', () => {
  assert.deepEqual(Object.keys(C).sort(),['acceptAccessibleName','acceptButton','amountLabel','boardTitle','cashHelp','cashLabel','noRumor','postButton','proposal','rateLabel','yourOffer'].sort());
  assert.deepEqual([...GRAY_REFUSAL_REASONS],['out_of_range','offer_open','insufficient_ln','insufficient_cash','seller_short','taken','expired','no_offer','own_offer','request_reused','korund_only']);
  assert.deepEqual(Object.keys(R).sort(),[...GRAY_REFUSAL_REASONS].sort());
  assert.equal(C.cashLabel,'Smuggled foreign cash'); assert.equal(C.amountLabel,'Labor Notes to sell'); assert.equal(C.rateLabel,'Asking rate (FC per LN)'); assert.equal(C.postButton,'Post offer'); assert.equal(C.acceptButton,'Accept offer'); assert.equal(C.yourOffer,'Your offer'); assert.equal(C.boardTitle,'Offers on the street');
  assert.equal(C.noRumor.text,'No rumor yet: nobody has traded.');
  for (const l of [C.cashHelp,C.acceptAccessibleName,C.noRumor,...GRAY_REFUSAL_REASONS.map(k=>R[k])]) assert.equal(l.proposal,true); assert.equal(C.proposal,true);
});
test('limits with every placeholder filled to 20 characters', () => {
  for (const t of all()) assert.ok(lengthOf(t)<=capFor(t),`${t} (${lengthOf(t)} > ${capFor(t)})`);
});
test('only the known placeholders, each in the right place', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(GRAY_CHROME_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  assert.deepEqual([...R.out_of_range.text.matchAll(/\{[^}]*\}/g)].map(m=>m[0]),['{minAmount}','{maxAmount}','{minRate}','{maxRate}']);
  assert.deepEqual([...C.acceptAccessibleName.text.matchAll(/\{[^}]*\}/g)].map(m=>m[0]),['{amount}','{askRate}']);
  for (const t of all().filter(x=>x!==R.out_of_range.text&&x!==C.acceptAccessibleName.text)) assert.doesNotMatch(t,/\{/,t);
});
test('no figure is written into any line: limits and amounts are runtime placeholders', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|\b(one|two|three|four|five|six|seven|eight|nine|ten|twice|once|half|dozen)\b/i,t);
});
test('FC stays smuggled foreign cash: never a Korund currency, never convertible, no official exchange or settlement', () => {
  assert.match(C.cashHelp.text,/smuggled foreign cash/); assert.match(C.cashHelp.text,/not a Korund currency/); assert.match(C.cashHelp.text,/cannot be converted/); assert.match(C.cashHelp.text,/only changes hands in a trade/); assert.match(C.cashHelp.text,/off the books/);
  for (const t of all().filter(x=>x!==C.cashHelp.text)) assert.doesNotMatch(t,/Korund (currency|money|cash|dollar|coin)|\b(convert\w*|exchange\w*|bank\w*|official\w*|legal tender|redeem\w*|cash out|withdraw\w*|deposit\w*|settlement|Tessera|on-chain|token\w*|wallet\w*|NFT)\b/i,t);
  for (const t of all()) assert.doesNotMatch(t,/\b(guarantee\w*|promise\w*|safe|profit\w*|earn\w*|rich|wealth\w*)\b/i,t);
});
test('nothing about Suspicion, seizure, checkpoints, police or ration trade; no real-world money or crime slang', () => {
  for (const t of all()) { assert.doesNotMatch(t,/\b(Suspicion|seiz\w*|checkpoint\w*|raid\w*|police|arrest\w*|crime\w*|penalt\w*|ration\w*|informer\w*|smuggler\w*|drug\w*|dollar\w*|euro\w*|bitcoin|USD)\b/i,t); }
});
test('system chrome: no byline, no AI badge, no State Media or press voice; plain, no blame or pressure', () => {
  assert.equal('aiBadge' in C,false); assert.equal('byline' in C,false);
  for (const t of all()) { assert.doesNotMatch(t,/Republic Wire|State Media|Court Gazette|Be it known|Chairman|Crown|AI-generated|Notable|@|!/,t); assert.doesNotMatch(t,/\b(must|hurry|stupid|fool\w*|cheat\w*|punish\w*|illegal|risky)\b/i,t); }
  assert.equal(new Set(all()).size,all().length);
});
test('does not repeat the existing gray market copy lines', () => {
  const gm=readFileSync('lib/gray-market-copy.ts','utf8');
  for (const t of [...lines(),...bodies()]) assert.ok(!gm.includes(t),t);
});
test('unwired: nothing in app/, components/ or lib/ imports gray-market-chrome-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('gray-market-chrome-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/gray-market-chrome-copy/, f);
});
