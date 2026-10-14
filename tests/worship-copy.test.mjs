import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { worshipCopy, WORSHIP_FAITHS, WORSHIP_LABEL_MAX, WORSHIP_LINE_MAX } from '../lib/worship-copy.ts';

const lines=c=>[c.label,...c.body,c.completion];

test('locks the three MVP faith keys', () => {
  assert.deepEqual(Object.keys(worshipCopy),['kinward-rite','fair-wind-vow','open-hand']);
  assert.deepEqual([...WORSHIP_FAITHS],Object.keys(worshipCopy));
  for (const [k,c] of Object.entries(worshipCopy)) { assert.equal(c.faithId,k); assert.equal(c.proposal,true); }
});
test('label, 2-3 body lines and a completion line, within limits', () => {
  assert.equal(WORSHIP_LABEL_MAX,40); assert.equal(WORSHIP_LINE_MAX,140);
  for (const c of Object.values(worshipCopy)) {
    assert.ok(c.label.length>0&&c.label.length<=WORSHIP_LABEL_MAX, c.label);
    assert.ok(c.body.length>=2&&c.body.length<=3, c.faithId);
    for (const l of [...c.body,c.completion]) assert.ok(l.trim().length>0&&l.length<=WORSHIP_LINE_MAX, l);
  }
});
test('each faith uses its §14.1 practice', () => {
  assert.match(lines(worshipCopy['kinward-rite']).join(' '),/hearth/); assert.match(lines(worshipCopy['kinward-rite']).join(' '),/name-stones/);
  assert.match(lines(worshipCopy['fair-wind-vow']).join(' '),/vow/i); assert.match(lines(worshipCopy['fair-wind-vow']).join(' '),/Honest Measure, Safe Return and Good Fortune/);
  assert.match(lines(worshipCopy['open-hand']).join(' '),/bread hall/); assert.match(lines(worshipCopy['open-hand']).join(' '),/held in trust for those in need/);
});
test('social tone only: no production, combat, wage or output words; no tier or gating hints (#259)', () => {
  for (const c of Object.values(worshipCopy)) for (const l of lines(c)) {
    assert.doesNotMatch(l,/production|output|yield|combat|attack|defen[cs]e|damage|strength|bonus|boost|wages?|profit|income|faster|\d/i, l);
    assert.doesNotMatch(l,/\b(Devotion|Newcomer|Member|Devoted|Pillar|clergy|office|unlock\w*|tier|level)\b/i, l);
  }
});
test('no real-world religion terms and no Notable', () => {
  const t=Object.values(worshipCopy).flatMap(lines).join(' ');
  assert.doesNotMatch(t,/\b(church|mosque|temple|synagogue|priest|imam|rabbi|monk|nun|bishop|pope|christ\w*|islam\w*|jew\w*|buddh\w*|hindu\w*|bible|quran|torah|god|amen|pray\w*)\b/i);
  assert.doesNotMatch(t,/Notable/);
});
test('unwired: nothing in app/ or components/ imports worship-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/worship-copy/, f);
});
