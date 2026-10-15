import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { clergyGateHelp, CLERGY_GATE_LABEL_MAX, CLERGY_GATE_BODY_MAX } from '../lib/clergy-gate-copy.ts';

test('shape and length', () => {
  assert.deepEqual(Object.keys(clergyGateHelp).sort(),['label','line','proposal']);
  assert.equal(clergyGateHelp.proposal,true);
  assert.ok(clergyGateHelp.label.length<=CLERGY_GATE_LABEL_MAX); assert.ok(clergyGateHelp.line.length<=CLERGY_GATE_BODY_MAX);
});
test('number-free and tier-free: docs §14.4 give no cutoff and #286 sets no minimum (ARC #297)', () => {
  const t=`${clergyGateHelp.label} ${clergyGateHelp.line}`;
  assert.doesNotMatch(t,/\d|%|percent|threshold|\b(one|two|three|four|five|ten|fifty|hundred|half)\b/i);
  assert.doesNotMatch(t,/\b(Newcomer|Member tier|Devoted|Pillar|tier)\b/);
  assert.match(t,/Officiant seat/);
});
test('module has no imports', () => {
  assert.doesNotMatch(readFileSync('lib/clergy-gate-copy.ts','utf8'),/^\s*(import|export .* from)\b/m);
});
test('faith-neutral, social only, no real-world references', () => {
  const t=`${clergyGateHelp.label} ${clergyGateHelp.line}`;
  assert.doesNotMatch(t,/wage|production|output|price|combat|weapon|attack|reward|bonus|Kinward|Fair-Wind|Open Hand|Hearth|Notable/i);
  assert.doesNotMatch(t,/\b(Christian|Muslim|Jewish|Hindu|Buddhist|church|priest|bishop|Earth)\b/i);
});
test('wired only into the faith panel (#280): nothing else in app/ or components/ imports clergy-gate-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f) && f !== 'app/faith-panel.tsx') assert.doesNotMatch(readFileSync(f,'utf8'),/clergy-gate-copy/, f);
});
