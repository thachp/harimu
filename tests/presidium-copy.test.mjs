import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { presidiumCopy, presidiumStage, successorBiography, PRESIDIUM_STAGES, PRESIDIUM_PLACEHOLDERS, PRESIDIUM_LABEL_MAX, PRESIDIUM_BODY_MAX, PRESIDIUM_BYLINE } from '../lib/presidium-copy.ts';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { korundStateMedia } from '../lib/press-templates.ts';

const texts=s=>[...s.items.flatMap(i=>[i.headline,i.body]),s.leaderPanel.label,s.leaderPanel.line];
const all=()=>[...presidiumCopy.flatMap(texts),successorBiography.text];
const fill=t=>PRESIDIUM_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(COUP_NAME_MAX)),t);

test('shape: four stages, 2-3 variants, every line proposal, canon byline reused', () => {
  assert.deepEqual(presidiumCopy.map(s=>s.stage),[...PRESIDIUM_STAGES]);
  assert.deepEqual(PRESIDIUM_BYLINE,korundStateMedia.byline);
  const ids=new Set();
  for (const s of presidiumCopy) {
    assert.equal(s.proposal,true); assert.equal(s.leaderPanel.proposal,true); assert.equal(presidiumStage(s.stage),s);
    assert.ok(s.items.length>=2&&s.items.length<=3, s.stage);
    for (const i of s.items) { assert.equal(i.proposal,true); assert.ok(!ids.has(i.id)); ids.add(i.id); }
  }
  assert.equal(successorBiography.proposal,true); assert.equal(successorBiography.aiBadge,true);
});
test('length limits filled at the shared 24-char name cap', () => {
  assert.equal(COUP_NAME_MAX,24);
  for (const s of presidiumCopy) {
    for (const i of s.items) { assert.ok(fill(i.headline).length<=PRESIDIUM_LABEL_MAX, i.headline); assert.ok(fill(i.body).length<=PRESIDIUM_BODY_MAX, i.body); }
    assert.ok(fill(s.leaderPanel.label).length<=PRESIDIUM_LABEL_MAX); assert.ok(fill(s.leaderPanel.line).length<=PRESIDIUM_BODY_MAX, s.leaderPanel.line);
  }
  assert.ok(successorBiography.text.length<=PRESIDIUM_BODY_MAX);
});
test('placeholders: known only, all used; rumor stage names no successor or member', () => {
  const t=all().join(' ');
  for (const p of PRESIDIUM_PLACEHOLDERS) assert.ok(t.includes(p), p);
  for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(PRESIDIUM_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const x of texts(presidiumStage('session-rumored'))) assert.doesNotMatch(x,/\{successor\}|\{member\}/);
  assert.doesNotMatch(t,/Voss|Morrow|Holt|Kestrel|Brand/);
});
test('opening stage is rumor, not announcement, and not AI-badged as an official statement', () => {
  const r=presidiumStage('session-rumored');
  for (const i of r.items) { assert.match(`${i.headline} ${i.body}`,/rumor|said|say|talk/i); assert.equal(i.aiBadge,false); assert.doesNotMatch(i.body,/announces|confirmed|has met/i); }
});
test('lines speaking for the Presidium or Chairman are AI-badged', () => {
  for (const s of presidiumCopy) for (const i of s.items) if (/^The Presidium (has|announces)|Chairman \{\w+\} (remains|now)|The Chairman thanks/.test(i.body)) assert.equal(i.aiBadge,true, i.id);
});
test('no figures, thresholds, deliberations or vote splits', () => {
  for (const t of all()) {
    assert.doesNotMatch(t.replaceAll('Five-Year Plan','').replaceAll('One hammer, one heart',''),/\d|%|percent|threshold|\b(one|two|three|four|five|seven|hours?|days?|weeks?)\b/i, t);
    assert.doesNotMatch(t,/\bvot(e|ed|es|ing)\b|majority|backed|faction|debat|deliberat|split|weight/i, t);
  }
});
test('no violence, penalties, faith, real-world references or Notable', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/purg|arrest|execut|kill|prison|camp|trial|traitor|blood|punish/i);
  assert.doesNotMatch(t,/faith|shrine|congregation|worship|church|prayer/i);
  assert.doesNotMatch(t,/\b(Earth|Soviet|Moscow|Kremlin|Politburo|Stalin|Lenin|Mao|USSR|China)\b/); assert.doesNotMatch(t,/Notable/);
});
test('unwired: nothing in app/ or components/ imports presidium-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/presidium-copy/, f);
});
