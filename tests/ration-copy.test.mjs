import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { korundStateMedia } from '../lib/press-templates.ts';
import { korundCouponGoods, korundFoodCoupon } from '../lib/korund-coupons.ts';

// lib/ration-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/ration-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'ration-copy-')),'ration-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const R = await import(pathToFileURL(out).href);
const { couponIssue:CI, couponCard:CC, quotaBar:QB, queueCopy:Q, rationCut:RC, COUPON_KINDS, QUOTA_STATES, QUEUE_STATES, RATION_PLACEHOLDERS, RATION_NAME_MAX, RATION_LABEL_MAX, RATION_LINE_MAX, RATION_BYLINE } = R;

const labels=()=>[CI.label,...Object.values(CC.labels),...Object.values(CC.states),QB.label,Q.joinButton,Q.leaveButton,RC.label];
const lines=()=>[CI.notice,CC.notTransferable,QB.progress,...QUOTA_STATES.map(s=>QB.captions[s]),...QUEUE_STATES.map(s=>Q.states[s]),Q.queueSize,Q.shortage,RC.notice,RC.stability,RC.stateMedia,RC.citizen].map(l=>l.text);
const all=()=>[...labels(),...lines()];
const fill=t=>RATION_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(RATION_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80; placeholder set', () => {
  assert.equal(RATION_NAME_MAX,COUP_NAME_MAX); assert.equal(RATION_NAME_MAX,24); assert.equal(RATION_LABEL_MAX,40); assert.equal(RATION_LINE_MAX,80);
  assert.deepEqual([...RATION_PLACEHOLDERS],['{days}','{position}','{waiting}','{output}','{target}']);
});
test('every key is present: coupons, quota states, queue states, ration cut; every line proposal', () => {
  assert.deepEqual([...COUPON_KINDS],['food','clothing','goods']); assert.deepEqual(Object.keys(CC.labels).sort(),[...COUPON_KINDS].sort());
  assert.deepEqual(Object.keys(CC.states).sort(),['expired','expiresIn','used']);
  assert.deepEqual([...QUOTA_STATES],['under','on','over']); assert.deepEqual(Object.keys(QB.captions).sort(),[...QUOTA_STATES].sort());
  assert.deepEqual([...QUEUE_STATES],['joined','waiting','served','left','shelf-empty']); assert.deepEqual(Object.keys(Q.states).sort(),[...QUEUE_STATES].sort());
  for (const l of [CI.notice,CC.notTransferable,QB.progress,...QUOTA_STATES.map(s=>QB.captions[s]),...QUEUE_STATES.map(s=>Q.states[s]),Q.queueSize,Q.shortage,RC.notice,RC.stability,RC.stateMedia,RC.citizen]) assert.equal(l.proposal,true);
  for (const o of [CI,CC,QB,Q,RC]) assert.equal(o.proposal,true);
  assert.match(Q.states['shelf-empty'].text,/The shelf is empty\. Come back after the next plan delivery\./);
});
test('coupon labels match lib/korund-coupons.ts', () => {
  assert.equal(CC.labels.food,korundFoodCoupon.label); assert.equal(CC.labels.clothing,korundCouponGoods.clothing.label); assert.equal(CC.labels.goods,korundCouponGoods.goods.label);
  assert.match(CC.states.expiresIn,/\{days\}/); assert.match(CC.notTransferable.text,/not transferable/);
});
test('limits: labels 40, lines 80, with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=RATION_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=RATION_LINE_MAX,`${t} (${fill(t).length})`);
});
test('only known placeholders, in the right lines', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(RATION_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  assert.deepEqual(CC.states.expiresIn.match(/\{[^}]*\}/g),['{days}']); assert.match(Q.states.waiting.text,/\{position\}/); assert.match(Q.queueSize.text,/\{waiting\}/);
  assert.match(QB.progress.text,/\{output\}/); assert.match(QB.progress.text,/\{target\}/);
  for (const t of [CI.notice.text,CC.notTransferable.text,...QUOTA_STATES.map(s=>QB.captions[s].text),Q.states.joined.text,Q.states.served.text,Q.states.left.text,Q.states['shelf-empty'].text,Q.shortage.text,RC.notice.text,RC.stability.text,RC.stateMedia.text,RC.citizen.text]) assert.doesNotMatch(t,/\{/,t);
});
test('no digits or invented figures; counts and days only through placeholders', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|percent|\b(one|two|three|four|five|ten|twice|once|days?|hours?|minutes?)\b/i,t);
});
test('shortages are queues and empty shelves, never prices: no line mentions price, cost or inflation', () => {
  for (const t of all()) assert.doesNotMatch(t,/\b(price|prices|priced|cost|costs|dearer|cheaper|expensive|inflation|pay|paid|Labor Note|LN|SPK|fee|rate)\b/i,t);
  assert.match(Q.shortage.text,/queue/); assert.match(Q.states['shelf-empty'].text,/shelf is empty/);
});
test('quota bar captions (State Media voice) cover under, on and over target', () => {
  assert.match(QB.captions.under.text,/^Under target/); assert.match(QB.captions.on.text,/^On target/); assert.match(QB.captions.over.text,/^Over target/);
  for (const s of QUOTA_STATES) assert.match(QB.captions[s].text,/\bthe plan\b/i);
  assert.equal(QB.label,'Brigade quota');
});
test('ration cut: notice, one State Media framing line (with the byline) and one quiet citizen-voice line', () => {
  assert.deepEqual(RATION_BYLINE,korundStateMedia.byline);
  assert.match(RC.stateMedia.text,/^Korund State Media:/); assert.match(CI.notice.text,/^Korund State Media:/); assert.doesNotMatch(RC.citizen.text,/State Media|plan|\{/);
  assert.match(RC.notice.text,/output fell short/); assert.match(RC.notice.text,/rations are reduced/);
  assert.doesNotMatch(RC.citizen.text,/!|angry|protest|riot|starv|hunger|revolt|resist/i);
  assert.equal(all().filter(t=>/^Korund State Media:/.test(t)).length,2);
});
test('voice and scope: Korund only; no gray market, faith, other nation or real-world reference; no Notable', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/gray|grey|black[- ]?market|street|smuggl|underground|\b(god|pray|faith|worship|church|temple)\b/i);
  assert.doesNotMatch(t,/\b(Kindle|Aurelle|Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence|Tessera)\b/);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|China|Russia|Moscow|Soviet|Stalin|Gulag|NATO)\b|Notable|@/);
});
test('unwired: nothing in app/ or components/ imports ration-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/ration-copy/, f);
});
