import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { palaceCoupCopy, coupStage, COUP_STAGES, COUP_PLACEHOLDERS, COUP_LABEL_MAX, COUP_BODY_MAX, COUP_GAZETTE_BYLINE, COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

const texts=s=>[...s.gazette.flatMap(i=>[i.headline,i.body]),s.leaderPanel.label,s.leaderPanel.line];
const all=()=>palaceCoupCopy.flatMap(texts);

test('shape: four stages in order, every entry proposal, canon byline', () => {
  assert.deepEqual(palaceCoupCopy.map(s=>s.stage),[...COUP_STAGES]);
  assert.deepEqual([...COUP_STAGES],['plot-rumours','crisis-window-open','coup-succeeded','coup-failed']);
  assert.deepEqual(COUP_GAZETTE_BYLINE,{name:'Court Gazette',proposal:false});
  const ids=new Set();
  for (const s of palaceCoupCopy) {
    assert.equal(s.proposal,true); assert.equal(coupStage(s.stage),s); assert.equal(s.leaderPanel.proposal,true);
    assert.ok(s.gazette.length>=2 && s.gazette.length<=3, s.stage);
    for (const i of s.gazette) { assert.equal(i.proposal,true); assert.equal(typeof i.aiBadge,'boolean'); assert.ok(!ids.has(i.id)); ids.add(i.id); }
  }
});
test('length limits: headlines and panel labels <= 40, bodies and panel lines <= 140', () => {
  for (const s of palaceCoupCopy) {
    for (const i of s.gazette) { assert.ok(i.headline.length<=COUP_LABEL_MAX, i.headline); assert.ok(i.body.length<=COUP_BODY_MAX, i.body); }
    assert.ok(s.leaderPanel.label.length<=COUP_LABEL_MAX); assert.ok(s.leaderPanel.line.length<=COUP_BODY_MAX);
  }
});
test('filled limits: every placeholder at the 24-char name cap still fits 40/140 (ARC #288)', () => {
  assert.equal(COUP_NAME_MAX,24);
  const fill=t=>COUP_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(COUP_NAME_MAX)),t);
  for (const s of palaceCoupCopy) {
    for (const i of s.gazette) { assert.ok(fill(i.headline).length<=COUP_LABEL_MAX, i.headline); assert.ok(fill(i.body).length<=COUP_BODY_MAX, i.body); }
    assert.ok(fill(s.leaderPanel.label).length<=COUP_LABEL_MAX, s.leaderPanel.label); assert.ok(fill(s.leaderPanel.line).length<=COUP_BODY_MAX, s.leaderPanel.line);
  }
});
test('items that speak for the Crown are AI-badged', () => {
  for (const s of palaceCoupCopy) for (const i of s.gazette) if (/Be it known|By royal decree/.test(i.body)) assert.equal(i.aiBadge,true, i.id);
  for (const s of palaceCoupCopy) assert.ok(s.gazette.some(i=>i.aiBadge), s.stage);
});
test('no figures, thresholds or rewards language', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\d|%|percent|threshold|half|majority|\b(one|two|three|four|five)\b|hours?|days?/i, t);
    assert.doesNotMatch(t,/reward|bonus|prize|earn|Favor|payout|bounty/i, t);
  }
});
test('placeholders: only known ones, each used; rumours and window name no plotter', () => {
  const t=all().join(' ');
  for (const p of COUP_PLACEHOLDERS) assert.ok(t.includes(p), p);
  for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(COUP_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const st of ['plot-rumours','crisis-window-open']) for (const x of texts(coupStage(st))) assert.doesNotMatch(x,/\{newLeader\}|\{house\}/, x);
  assert.doesNotMatch(t,/\bHouse [A-Z]|Solenne|Vaelcourt|Brightvane|Larkspire|Captain/);
});
test('outcomes follow §10.2 / §8.12', () => {
  assert.match(coupStage('crisis-window-open').leaderPanel.line,/Crisis Window is open/);
  assert.ok(coupStage('coup-succeeded').gazette.some(i=>/\{newLeader\} of \{house\}/.test(i.body)));
  assert.ok(coupStage('coup-succeeded').gazette.some(i=>/Crown endures|monarchy stands/.test(i.body)));
  assert.match(coupStage('coup-succeeded').leaderPanel.line,/\{newLeader\} of \{house\}/);
  assert.ok(coupStage('coup-failed').gazette.some(i=>/purged/.test(i.body)));
});
test('no violence glorified, no human penalties, no real-world references, no Notable', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/blood|slaughter|execut|behead|kill|massacre|traitor|glori|prison|jail|arrest/i);
  assert.doesNotMatch(t,/\b(players?|citizens?|soldiers?)\b/i);
  assert.doesNotMatch(t,/\b(Earth|Saudi|Thailand|England|France|Europe|London|Paris)\b/); assert.doesNotMatch(t,/Notable/);
});
test('wired by #281 only: the Aurelle Rising panel is the one UI importer of palace-coup-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f) && f !== 'app/aurelle-rising.tsx') assert.doesNotMatch(readFileSync(f,'utf8'),/palace-coup-copy/, f);
});
