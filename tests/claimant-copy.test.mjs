import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { pledgeCard, pledgeToasts, risingStageCopy, risingStage, RISING_STAGES, CLAIMANT_PLACEHOLDERS, CLAIMANT_LABEL_MAX, CLAIMANT_BODY_MAX, PLEDGE_CHANGE_DAYS } from '../lib/claimant-copy.ts';

const stageTexts=s=>[s.notice,s.crownGazette,s.claimantVoice];
const allTexts=()=>[pledgeCard.nameLine.text,pledgeCard.motto.text,pledgeCard.body.text,...Object.values(pledgeCard.buttons),
  ...Object.values(pledgeToasts).map(l=>l.text),...risingStageCopy.flatMap(stageTexts)];

test('locks the four Rising stages; every entry proposal', () => {
  assert.deepEqual(risingStageCopy.map(s=>s.stage),[...RISING_STAGES]);
  assert.deepEqual([...RISING_STAGES],['support-growing','crisis-window-open','rising-succeeded','rising-failed']);
  for (const s of risingStageCopy) { assert.equal(s.proposal,true); assert.equal(risingStage(s.stage),s); }
  for (const l of [pledgeCard.nameLine,pledgeCard.motto,pledgeCard.body,...Object.values(pledgeToasts)]) assert.equal(l.proposal,true);
  assert.equal(pledgeCard.proposal,true); assert.deepEqual(pledgeCard.buttons,{pledge:'Pledge',withdraw:'Withdraw'});
});
test('length limits: labels <= 40, bodies <= 140', () => {
  for (const b of Object.values(pledgeCard.buttons)) assert.ok(b.length<=CLAIMANT_LABEL_MAX);
  assert.ok(pledgeCard.nameLine.text.length<=CLAIMANT_LABEL_MAX);
  for (const t of allTexts()) assert.ok(t.length<=CLAIMANT_BODY_MAX, t);
});
test('pledge copy: private, aggregate, 7-day change limit', () => {
  assert.equal(PLEDGE_CHANGE_DAYS,7);
  assert.match(pledgeCard.body.text,/private from other players/); assert.match(pledgeCard.body.text,/aggregate/); assert.match(pledgeCard.body.text,/7 real days/);
  assert.match(pledgeToasts.cooldown.text,/7 real days/); assert.match(pledgeToasts.pledged.text,/No other player can see/);
});
test('no figures in stage copy', () => {
  for (const s of risingStageCopy) for (const t of stageTexts(s)) assert.doesNotMatch(t,/\d|%|percent|threshold/i, t);
});
test('stage outcomes follow §8.12/§10.3', () => {
  assert.match(risingStage('crisis-window-open').notice,/Crisis Window is open/);
  assert.match(risingStage('rising-succeeded').notice,/new royal house/); assert.match(risingStage('rising-succeeded').crownGazette,/Crown endures/);
  assert.match(risingStage('rising-failed').notice,/Grievance remains/);
});
test('no invented houses, heirs or mottos: names come only from placeholders', () => {
  const t=allTexts().join(' ');
  for (const p of ['{claimant}','{house}','{motto}']) assert.ok(t.includes(p), p);
  for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(CLAIMANT_PLACEHOLDERS.includes(m[0]), m[0]);
  assert.doesNotMatch(t,/\bHouse [A-Z]|\bof the [A-Z]\w+ House|Solenne|\bheir\b|Heir's/);
});
test('only humans pledge: never says AI citizens pledge', () => {
  for (const t of allTexts()) assert.doesNotMatch(t,/\bAI\b.*\bpledg|\bpledg.*\bAI\b|AI citizens?/i, t);
});
test('no violence glorified, no real-world places, no Notable', () => {
  const t=allTexts().join(' ');
  assert.doesNotMatch(t,/blood|slaughter|execut|behead|kill|massacre|traitor|glori/i);
  assert.doesNotMatch(t,/\b(Earth|Saudi|Thailand|England|France|Europe|London|Paris)\b/); assert.doesNotMatch(t,/Notable/);
});
test('unwired: nothing in app/ or components/ imports claimant-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/claimant-copy/, f);
});
