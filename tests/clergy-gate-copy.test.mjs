import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { clergyGateHelp, CLERGY_GATE_LABEL_MAX, CLERGY_GATE_BODY_MAX, CLERGY_GATE_DEVOTION, CLERGY_GATE_TIER } from '../lib/clergy-gate-copy.ts';
import { devotionTierCopy, devotionTier } from '../lib/faith-copy.ts';

test('shape and length', () => {
  assert.deepEqual(Object.keys(clergyGateHelp).sort(),['label','line','proposal']);
  assert.equal(clergyGateHelp.proposal,true);
  assert.ok(clergyGateHelp.label.length<=CLERGY_GATE_LABEL_MAX); assert.ok(clergyGateHelp.line.length<=CLERGY_GATE_BODY_MAX);
});
test('the only figure is ARC\'s 50 (#261), stated once', () => {
  assert.equal(CLERGY_GATE_DEVOTION,50);
  const t=`${clergyGateHelp.label} ${clergyGateHelp.line}`;
  assert.deepEqual(t.match(/\d+/g),['50']);
  assert.doesNotMatch(t,/%|percent|\b(one|two|three|four|five|ten|hundred|half)\b/i);
});
test('consistent with the shared tiers: 50 starts Devoted; all tier names canon', () => {
  assert.equal(devotionTier(CLERGY_GATE_DEVOTION).label,CLERGY_GATE_TIER);
  assert.equal(devotionTierCopy.find(t=>t.label===CLERGY_GATE_TIER).min,CLERGY_GATE_DEVOTION);
  assert.equal(devotionTier(CLERGY_GATE_DEVOTION-1).label,'Member');
  assert.match(clergyGateHelp.line,new RegExp(`\\b${CLERGY_GATE_TIER}\\b`));
  for (const n of ['Newcomer','Member','Devoted','Pillar']) assert.ok(devotionTierCopy.some(t=>t.label===n));
});
test('faith-neutral, social only, no real-world references', () => {
  const t=`${clergyGateHelp.label} ${clergyGateHelp.line}`;
  assert.doesNotMatch(t,/wage|production|output|price|combat|weapon|attack|reward|bonus|Kinward|Fair-Wind|Open Hand|Hearth|Notable/i);
  assert.doesNotMatch(t,/\b(Christian|Muslim|Jewish|Hindu|Buddhist|church|priest|bishop|Earth)\b/i);
});
test('unwired: nothing in app/ or components/ imports clergy-gate-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/clergy-gate-copy/, f);
});
