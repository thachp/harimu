import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress } from '../lib/press-templates.ts';

// lib/reserve-board-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/reserve-board-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'reserve-board-copy-')),'reserve-board-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const R = await import(pathToFileURL(out).href);
const { reserveBoardLine:LN, issuanceNews:IN, issuanceNewsFor, priceIndexExplainer:PX, ISSUANCE_SIZES, RESERVE_PLACEHOLDERS, RESERVE_NAME_MAX, RESERVE_LABEL_MAX, RESERVE_LINE_MAX, RESERVE_BODY_MAX, RESERVE_BYLINE, RESERVE_BOARD_NAME } = R;

const notices=()=>IN.flatMap(x=>[{size:x.size,kind:'report',n:x.report},{size:x.size,kind:'statement',n:x.statement}]);
const labels=()=>[LN.header,...Object.values(LN.rows),PX.label,...notices().map(x=>x.n.headline)];
const lines=()=>[LN.caption,PX.lines[1]].map(l=>l.text);
const bodies=()=>[...notices().map(x=>x.n.body),PX.lines[0].text];
const all=()=>[...labels(),...lines(),...bodies()];
const fill=t=>RESERVE_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(RESERVE_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80/140; the three slots', () => {
  assert.equal(RESERVE_NAME_MAX,COUP_NAME_MAX); assert.equal(RESERVE_LABEL_MAX,40); assert.equal(RESERVE_LINE_MAX,80); assert.equal(RESERVE_BODY_MAX,140);
  assert.deepEqual([...RESERVE_PLACEHOLDERS],['{supply}','{issued}','{index}']); assert.equal(RESERVE_BOARD_NAME,'Reserve Board');
});
test('every key is present: header, three rows, caption, four issuance outcomes with a report and a statement, the Charter Limit rejection, explainer; every line a proposal', () => {
  assert.equal(LN.header,'Reserve Board'); assert.deepEqual(Object.keys(LN.rows),['moneySupply','lastIssuance','priceIndex']);
  assert.deepEqual([...ISSUANCE_SIZES],['none','small','near-cap','rejected']); assert.deepEqual(IN.map(x=>x.size),[...ISSUANCE_SIZES]);
  for (const x of IN) { assert.equal(x.proposal,true); assert.equal(issuanceNewsFor(x.size),x); }
  assert.equal(notices().length,8); for (const x of notices()) { assert.equal(x.n.proposal,true); assert.equal(typeof x.n.aiBadge,'boolean'); assert.ok(x.n.id.startsWith(x.kind)); }
  assert.equal(LN.caption.proposal,true); for (const l of PX.lines) assert.equal(l.proposal,true); for (const o of [LN,PX]) assert.equal(o.proposal,true);
  assert.match(issuanceNewsFor('rejected').report.body,/Charter Limit/); assert.match(issuanceNewsFor('rejected').statement.body,/Charter Limit/);
  assert.equal(new Set(notices().map(x=>x.n.id)).size,8);
});
test('limits: labels and headlines 40, lines 80, bodies and the explainer 140, with every slot filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=RESERVE_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=RESERVE_LINE_MAX,`${t} (${fill(t).length})`);
  for (const t of bodies()) assert.ok(fill(t).length<=RESERVE_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only the three slots, and every slot is used where it belongs', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(RESERVE_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  assert.match(LN.rows.moneySupply,/\{supply\}/); assert.match(LN.rows.lastIssuance,/\{issued\}/); assert.match(LN.rows.priceIndex,/\{index\}/);
  for (const s of ['small','near-cap']) for (const k of ['report','statement']) assert.match(issuanceNewsFor(s)[k].body,/\{issued\}/,`${s} ${k}`);
  for (const s of ['none','rejected']) for (const k of ['report','statement']) assert.doesNotMatch(issuanceNewsFor(s)[k].body,/\{/);
  for (const t of [LN.header,LN.caption.text,PX.label,...PX.lines.map(l=>l.text)]) assert.doesNotMatch(t,/\{/);
  const used=new Set(all().flatMap(t=>t.match(/\{[^}]*\}/g)??[])); assert.deepEqual([...used].sort(),[...RESERVE_PLACEHOLDERS].sort());
});
test('no hard-coded figures: no digits, percent, number words, or cap and Charter Limit amounts', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|percent|\b(one|two|three|four|five|six|ten|fifteen|thirty|twice|once|half|double)\b|\b(hours?|days?|years?)\b/i,t);
});
test('the explainer says what the Price Index is and that it follows money supply; it never promises wages or prices react', () => {
  assert.match(PX.lines[0].text,/Price Index tracks the national price level/); assert.match(PX.lines[0].text,/follows money supply over a few game weeks/);
  assert.match(PX.lines[1].text,/for information only/);
  for (const t of [...PX.lines.map(l=>l.text),...notices().map(x=>x.n.body)]) assert.doesNotMatch(t,/\b(wages?|salar\w*|prices?)\b.*\b(will|would|rise|fall|react|change|drop|climb)\b|\b(will|would)\b.*\b(wages?|prices?)\b/i,t);
  for (const t of all()) assert.doesNotMatch(t,/\b(will raise|will lower|will push|guarantee\w*|promise\w*)\b/i,t);
});
test('AI badge (#381, ui-ux 23.2): the Reserve Board\'s own statements are badged; the newspaper reports and system lines are not', () => {
  for (const x of notices()) { assert.equal(x.n.aiBadge,x.kind==='statement',x.n.id); if (x.kind==='statement') assert.match(x.n.body,/^Reserve Board: /); }
  for (const o of [LN,PX]) assert.equal('aiBadge' in o,false); for (const l of [LN.caption,...PX.lines]) assert.equal('aiBadge' in l,false);
  for (const x of notices().filter(y=>y.kind==='statement')) assert.equal(x.n.headline,'Reserve Board statement');
});
test('byline: reports carry the Kindle Press byline from lib/press-templates.ts; statements name the Board and no outlet', () => {
  assert.deepEqual(RESERVE_BYLINE,kindlePress.byline);
  for (const x of notices()) { if (x.kind==='report') assert.match(x.n.body,/^Kindle Press: /); else assert.doesNotMatch(x.n.body,/Kindle Press|Court Gazette|State Media/); }
});
test('scope: Kindle and Spark only; no Korund or Aurelle money, banks, loans, stimulus, redenomination or exchange rates; no Notable', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(Korund|Aurelle|Labor Note|Crown|Tessera|Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b/);
  assert.doesNotMatch(t,/\b(bank|banks|loan|loans|interest|stimulus|redenominat\w*|exchange rate|debase\w*)\b|Notable|@/i);
  assert.match(t,/Spark/); assert.doesNotMatch(t,/\b(Earth|America|Europe|England|France|Japan|China|Russia)\b/);
});
test('wired: only app/reserve-board-line.tsx and lib/reserve-board-view.ts import reserve-board-copy (#431)', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  assert.match(readFileSync('app/reserve-board-line.tsx','utf8'),/from '@\/lib\/reserve-board-copy'/,'the line component imports the copy');
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('reserve-board-copy.ts')&&!['app/reserve-board-line.tsx','lib/reserve-board-view.ts'].includes(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/reserve-board-copy/, f);
});
test('polish (QA1): issuance news says "game month", and no line forecasts the Price Index', () => {
  for (const x of notices()) if (/month/.test(x.n.body+x.n.headline)) assert.match(x.n.body+x.n.headline,/game month/,x.n.id);
  for (const t of all()) assert.doesNotMatch(t.replace(/game month/g,''),/\bmonth\b/,t);
  for (const t of all()) assert.doesNotMatch(t,/Critics|\bwarn\w*|\b(expect|forecast|predict|inflation|soar|surge|spike)\w*/i,t);
});
