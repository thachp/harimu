import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// #383 (ARC): house style is US spelling in every player-facing line (mobilization, favor, honor, Canceled, traveling, Rumors).
// This scans the string VALUES exported by every lib/*-copy.ts and lib/press-templates.ts. Identifier-like strings (ids, API reason keys
// such as 'cancelled' or 'plot-rumours') are skipped because they mirror stored values, not displayed text. Modules re-export the shared
// name cap from './palace-coup-copy', which Node's type stripping cannot resolve, so each is loaded as tests/war-copy.test.mjs does.
const dir=mkdtempSync(join(tmpdir(),'us-spelling-'));
const palace=pathToFileURL(resolve('lib/palace-coup-copy.ts')).href;
const load=async name=>{
  const src=readFileSync(`lib/${name}.ts`,'utf8').replaceAll("from './palace-coup-copy'",`from ${JSON.stringify(palace)}`);
  const out=join(dir,`${name}.mjs`); writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  return import(pathToFileURL(out).href);
};
const files=[...readdirSync('lib').filter(f=>/-copy\.ts$/.test(f)).map(f=>f.slice(0,-3)),'press-templates'].sort();
const mods=Object.fromEntries(await Promise.all(files.map(async f=>[f,await load(f)])));

const strings=(v,out=[],seen=new Set())=>{ if(typeof v==='string')out.push(v); else if(v&&typeof v==='object'&&!seen.has(v)){ seen.add(v); for(const x of Object.values(v))strings(x,out,seen); } return out; };
const UK=/rumour|travell|cancell|colour|favour|honour|labour|neighbour|defence|programme|\bcentre|\bgrey\b|realis|organis|recognis|mobilis|licence|armour|behaviour|harbour|theatre|judgement/i;
// Strings that deliberately mirror the API's own error text (lib/order-book.ts) so the client can match them. Not displayed as written.
const API_MIRRORS=new Set(['Order not open, already cancelled, or not yours.']);

test('no player-facing line in any copy module uses UK spelling', () => {
  let n=0; const bad=[];
  for (const [f,m] of Object.entries(mods)) for (const s of strings(Object.fromEntries(Object.entries(m).filter(([k])=>!/^[A-Z_]+$/.test(k))))) {
    if(/^[a-z0-9:_.-]+$/.test(s)||API_MIRRORS.has(s))continue; n++;
    if(UK.test(s))bad.push(`${f}: ${s}`);
  }
  assert.ok(n>800, `only ${n} strings scanned`);
  assert.deepEqual(bad,[]);
});
test('market-board and palace-coup lines are the US spellings #383 names', () => {
  const mb=mods['market-board-copy'], pc=mods['palace-coup-copy'];
  assert.match(mb.orderStateLines.cancelled.text,/^Canceled\./); assert.match(mb.cancelConfirmation.text,/^Order canceled\./);
  assert.match(mb.rejections.find(r=>r.key==='traveling').line.text,/^You are traveling\./);
  const panel=pc.palaceCoupCopy.find(s=>s.stage==='plot-rumours').leaderPanel;
  assert.match(JSON.stringify(panel),/Rumors of discontent/);
});
test('the order-state key and the API-mirrored rejection text keep their stored spelling', () => {
  const mb=mods['market-board-copy'];
  assert.deepEqual([...mb.ORDER_STATES],['open','partly-filled','filled','cancelled','spoiled']); assert.deepEqual(Object.keys(mb.orderStateLines).sort(),[...mb.ORDER_STATES].sort());
  const r=mb.rejections.find(x=>x.key==='order_not_open'); assert.ok(JSON.stringify(r).includes('Order not open, already cancelled, or not yours.'));
  assert.ok(mods['palace-coup-copy'].COUP_STAGES.includes('plot-rumours'));
});
