import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

// lib/market-board-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/market-board-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'market-board-copy-')),'market-board-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const M = await import(pathToFileURL(out).href);
const { boardLabels:BL, escrowPreview:E, orderStateLines:OS, ORDER_STATES, fillNotice, cancelConfirmation, spoilageHints:SH, emptyStates:ES, rejections:RJ, REJECTION_KEYS, rejectionFor, rejectionForReason, MARKET_BOARD_PLACEHOLDERS, MARKET_BOARD_NAME_MAX, MARKET_BOARD_LABEL_MAX, MARKET_BOARD_BODY_MAX } = M;

const route=readFileSync('app/api/market/orders/route.ts','utf8');
const book=readFileSync('lib/order-book.ts','utf8');
const apiSource=route+'\n'+book;

const labels=()=>Object.entries(BL).filter(([k])=>k!=='proposal').map(([,v])=>v);
const lines=()=>[E.buy,E.sell,...ORDER_STATES.map(s=>OS[s]),fillNotice,cancelConfirmation,SH.fruit,SH.meat,ES.noOrdersOnGood,ES.noOpenOrders,...RJ.map(x=>x.line)].map(l=>l.text);
const all=()=>[...labels(),...lines()];
const fill=t=>MARKET_BOARD_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(MARKET_BOARD_NAME_MAX)),t);

test('shared name cap is re-exported; limits 40/140; placeholder set', () => {
  assert.equal(MARKET_BOARD_NAME_MAX,COUP_NAME_MAX); assert.equal(MARKET_BOARD_NAME_MAX,24);
  assert.equal(MARKET_BOARD_LABEL_MAX,40); assert.equal(MARKET_BOARD_BODY_MAX,140);
  assert.deepEqual([...MARKET_BOARD_PLACEHOLDERS],['{filled}','{qty}','{good}','{days}','{cost}','{maxQty}','{maxPrice}','{maxOrders}']);
});
test('shape: the eight board labels, five order states, two spoilage hints, two empty states, every line proposal', () => {
  assert.deepEqual(labels(),['Best bid','Best ask','Depth','Last trade','My open orders','Place order','Escrow preview','NPC order']);
  assert.deepEqual([...ORDER_STATES],['open','partly-filled','filled','cancelled','spoiled']); assert.deepEqual(Object.keys(OS).sort(),[...ORDER_STATES].sort());
  assert.match(OS['partly-filled'].text,/\{filled\} of \{qty\}/); assert.match(OS.spoiled.text,/Spoiled/);
  for (const l of [E.buy,E.sell,...ORDER_STATES.map(s=>OS[s]),fillNotice,cancelConfirmation,SH.fruit,SH.meat,ES.noOrdersOnGood,ES.noOpenOrders]) assert.equal(l.proposal,true);
  for (const o of [BL,E,SH,ES]) assert.equal(o.proposal,true);
  assert.match(ES.noOrdersOnGood.text,/No orders on this good yet/); assert.equal(ES.noOpenOrders.text,'You have no open orders.');
});
test('40/140 limits hold with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=MARKET_BOARD_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=MARKET_BOARD_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only known placeholders; spoilage hints use {days} only; escrow lines hold {cost} or {qty} {good}', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(MARKET_BOARD_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const l of [SH.fruit,SH.meat]) assert.deepEqual(l.text.match(/\{[^}]*\}/g),['{days}']);
  assert.match(SH.fruit.text,/^Fruit /); assert.match(SH.meat.text,/^Meat /); assert.deepEqual(Object.keys(SH).sort(),['fruit','meat','proposal']);
  assert.match(E.buy.text,/\{cost\}/); assert.match(E.sell.text,/\{qty\} \{good\}/);
  for (const t of labels()) assert.doesNotMatch(t,/\{/);
});
test('rejections: exactly one line per key, keys match the list, and every API reason code and message is covered', () => {
  assert.deepEqual(RJ.map(x=>x.key),[...REJECTION_KEYS]); assert.equal(new Set(RJ.map(x=>x.key)).size,RJ.length);
  for (const k of REJECTION_KEYS) { assert.equal(RJ.filter(x=>x.key===k).length,1,k); assert.equal(rejectionFor(k).key,k); assert.equal(rejectionFor(k).proposal,true); assert.equal(rejectionFor(k).line.proposal,true); }
  // every `reason:` code the API returns has exactly one line
  const reasons=[...new Set([...apiSource.matchAll(/reason:\s*'([a-z_]+)'/g)].map(m=>m[1]))];
  assert.deepEqual(reasons.sort(),['bad_request','closed','traveling']);
  for (const c of reasons) { assert.equal(RJ.filter(x=>x.code===c).length,1,c); assert.equal(rejectionForReason(c).code,c); }
  assert.deepEqual(RJ.filter(x=>x.code).map(x=>x.code).sort(),reasons.sort());
  // un-coded refusals (status plus message only): each message fragment is still in the API source, so drift is caught
  for (const x of RJ) assert.ok(apiSource.includes(x.source),`${x.key}: ${x.source}`);
  // every non-200 status the API returns is represented
  const statuses=new Set([...route.matchAll(/privateJson\([^;]*?,\s*(4\d\d)\)/g)].map(m=>Number(m[1])).concat([...book.matchAll(/status:\s*(4\d\d)/g)].map(m=>Number(m[1]))));
  assert.deepEqual([...statuses].sort(),[...new Set(RJ.map(x=>x.status))].sort());
  // the number of error messages the API sends equals the number of lines (one line per rejection)
  const errorSites=(route.match(/privateJson\(\{ error/g)??[]).length+(book.match(/status: 409, error:/g)??[]).length;
  assert.ok(errorSites>=RJ.length-1&&errorSites<=RJ.length+1, `${errorSites} sites vs ${RJ.length}`);
  assert.equal(rejectionForReason('nope'),undefined);
});
test('each rejection says what the player can do next, in plain words with no raw codes', () => {
  for (const x of RJ) { const t=x.line.text;
    assert.match(t,/\b(sign in|reload|try again|check|start|pick|refresh|arrive|back later|is no longer open)\b/i,t);
    assert.doesNotMatch(t,/\b(\d{3}|HTTP|API|error|reason|code|requestId|UUID|undefined|null|invalid|bad_request|same-origin)\b|_/i,t); }
  assert.match(rejectionFor('order_refused').line.text,/Spark or goods/); assert.match(rejectionFor('order_refused').line.text,/Kindle citizens/);
  assert.match(rejectionFor('bad_request').line.text,/\{maxQty\}/); assert.match(rejectionFor('bad_request').line.text,/\{maxPrice\}/); assert.match(rejectionFor('order_refused').line.text,/\{maxOrders\}/);
});
test('no invented figures: no digits or number words anywhere; limits and shelf life only through placeholders', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|percent|\b(one|two|three|four|five|ten|hundred|thousand|once|twice)\b|\b(days?|hours?|weeks?|minutes?|min)\b|\bfees?\b|\btax\b/i,t);
  assert.doesNotMatch(all().join(' '),/\b(1000|100000|10000|100)\b/);
});
test('Kindle voice only: plain words, no Korund or Aurelle market, no gray market, no real-world references', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(Korund|Aurelle|Labor Note|Crown|ration|coupon|State Media|gray|grey|black[- ]?market|Tessera|TSR)\b/i);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|China|Russia|Wall Street|NYSE|Nasdaq|bitcoin|crypto|dollar|euro|stock)\b|Notable|@/i);
  assert.doesNotMatch(t,/\b(shares?|equity)\b/i);
});
test('unwired: nothing in app/ or components/ imports market-board-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/market-board-copy/, f);
});
