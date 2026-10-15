import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

// The module re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the specifier and transpile.
const src=readFileSync('lib/grace-period-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'grace-period-copy-')),'grace-period-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const G = await import(pathToFileURL(out).href);
const { graceButton:B, graceConfirm:CF, graceLocked:LK, graceExplainer:EX, GRACE_LOCKED_REASONS, GRACE_NAME_MAX, GRACE_PLACEHOLDERS, GRACE_LABEL_MAX, GRACE_LINE_MAX, GRACE_BODY_MAX, GRACE_PERIOD_HOURS } = G;

const labels=()=>[B.label,B.accessibleName,CF.confirm,CF.cancel];
const lines=()=>[B.countdown.text,...GRACE_LOCKED_REASONS.map(k=>LK[k].text),EX.done.text];
const bodies=()=>[B.window.text,CF.prompt.text,EX.endsOn.text,EX.lifetime.text];
const all=()=>[...labels(),...lines(),...bodies()];
const fill=t=>GRACE_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(GRACE_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80/140; two placeholders; the docs\' 48 real hours', () => {
  assert.equal(GRACE_NAME_MAX,COUP_NAME_MAX); assert.equal(GRACE_LABEL_MAX,40); assert.equal(GRACE_LINE_MAX,80); assert.equal(GRACE_BODY_MAX,140); assert.equal(GRACE_PERIOD_HOURS,48);
  assert.deepEqual([...GRACE_PLACEHOLDERS],['{endsAt}','{nation}']);
});
test('exports every #498 item: button, countdown, confirmation, three locked reasons, what ends it, lifetime line, done line; all proposal true and distinct', () => {
  assert.equal(B.label,'Change nation'); assert.match(B.accessibleName,/^Change nation/); assert.match(B.countdown.text,/\{endsAt\}/); assert.match(CF.prompt.text,/single free change/);
  assert.equal(typeof CF.confirm,'string'); assert.equal(typeof CF.cancel,'string'); assert.notEqual(CF.confirm,CF.cancel);
  assert.deepEqual([...GRACE_LOCKED_REASONS],['political-action','change-used','grace-expired']); assert.deepEqual(Object.keys(LK).sort(),[...GRACE_LOCKED_REASONS].sort());
  for (const l of [B.countdown,B.window,CF.prompt,EX.endsOn,EX.lifetime,EX.done,...GRACE_LOCKED_REASONS.map(k=>LK[k])]) assert.equal(l.proposal,true); for (const o of [B,CF,EX]) assert.equal(o.proposal,true);
  assert.equal(new Set(all()).size,all().length);
});
test('the three reason keys stay in step with the citizenship status type in the app', () => {
  const page=readFileSync('app/page.tsx','utf8');
  const m=page.match(/lockedReason:\s*((?:'[a-z-]+'\s*\|\s*)+null)/); assert.ok(m,'lockedReason type not found in app/page.tsx');
  assert.deepEqual([...m[1].matchAll(/'([a-z-]+)'/g)].map(x=>x[1]).sort(),[...GRACE_LOCKED_REASONS].sort());
  const lib=readFileSync('lib/citizenship.ts','utf8'); for (const k of GRACE_LOCKED_REASONS) assert.ok(lib.includes(`'${k}'`),k);
});
test('limits: labels 40, lines 80, bodies 140, with placeholders filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=GRACE_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=GRACE_LINE_MAX,`${t} (${fill(t).length})`);
  for (const t of bodies()) assert.ok(fill(t).length<=GRACE_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only {endsAt} (countdown) and {nation} (done line)', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(GRACE_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  assert.ok(B.countdown.text.includes('{endsAt}')); assert.ok(EX.done.text.includes('{nation}'));
  for (const t of all().filter(x=>x!==B.countdown.text&&x!==EX.done.text)) assert.doesNotMatch(t,/\{/,t);
});
test('48 is the only figure, written only in the window line and the expired line; no other digits or number words', () => {
  const has48=all().filter(t=>/\b48\b/.test(t)); assert.deepEqual(has48.sort(),[B.window.text,LK['grace-expired'].text].sort());
  assert.match(B.window.text,/first 48 real hours/);
  for (const t of all()) { const bare=t.replace(/\{[^}]*\}/g,'').replace(/\b48(-hour)?\b/g,''); assert.doesNotMatch(bare,/\d|%|\b(one|two|three|four|five|six|ten|twice|once|half)\b|\b(minutes?|days?|weeks?|months?|years?)\b/i,t); }
});
test('the explainer names the docs\' political actions and nothing else', () => {
  for (const w of [/vote/,/petition signature/,/pledge/,/joining a party/,/congregation office/]) assert.match(EX.endsOn.text,w);
  assert.doesNotMatch(EX.endsOn.text,/\b(priority request|donat\w*|trade|market|work|quest|purchase\w*|chat|message|war|treaty|election)\b/i);
  assert.match(EX.lifetime.text,/does not count as your lifetime change/); assert.match(EX.lifetime.text,/Purchased cosmetics are kept/);
});
test('no promise beyond the docs: nothing on the lifetime limit, immigration, asylum, refunds or later changes', () => {
  for (const t of all()) assert.doesNotMatch(t,/\b(immigrat\w*|asylum|refund\w*|later|again|another change|second change|guarantee\w*|promise\w*|forever|never)\b/i,t);
  for (const t of all()) assert.doesNotMatch(t,/Tessera|on-chain|token\w*|wallet\w*|NFT|land\b/i,t);
});
test('one neutral system voice: no byline, no AI badge, no nation or leader voice, no pressure', () => {
  for (const o of [B,CF,EX]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const t of all()) { assert.doesNotMatch(t,/Republic Wire|State Media|Court Gazette|Be it known|Chairman|Crown|Kindle|Korund|Aurelle|AI-generated|Notable|@|!/,t); assert.doesNotMatch(t,/\b(hurry|last chance|must|regret\w*|mistake|punish\w*|fail\w*)\b/i,t); }
});
test('unwired: nothing in app/, components/ or lib/ imports grace-period-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('grace-period-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/grace-period-copy/, f);
});
