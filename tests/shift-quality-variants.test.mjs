import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { harvestAnswerVariants, ANSWER_VARIANT_MIN, ANSWER_VARIANT_MAX_CHARS } from '../lib/shift-quality-variants.ts';
import { harvestQuestions } from '../lib/shift-quality.ts';

test('matches harvestQuestions: same prompts and option count (ARC #276: variant 0 may differ from the current text)', () => {
  assert.equal(harvestAnswerVariants.length,harvestQuestions.length);
  harvestAnswerVariants.forEach((q,qi)=>{
    assert.equal(q.prompt,harvestQuestions[qi].prompt);
    assert.equal(q.options.length,harvestQuestions[qi].options.length);
  });
});
test('3+ unique variants per option, within length, proposal', () => {
  assert.equal(ANSWER_VARIANT_MIN,3);
  const seen=new Set();
  for (const q of harvestAnswerVariants) for (const opt of q.options) {
    assert.equal(opt.proposal,true); assert.ok(opt.variants.length>=ANSWER_VARIANT_MIN);
    assert.equal(new Set(opt.variants).size,opt.variants.length);
    for (const v of opt.variants) { assert.ok(v.trim()&&v.length<=ANSWER_VARIANT_MAX_CHARS, v); assert.ok(!seen.has(v), `duplicate ${v}`); seen.add(v); }
  }
});
test('no figures, and no wording that gives away the best answer', () => {
  for (const q of harvestAnswerVariants) for (const opt of q.options) for (const v of opt.variants) {
    assert.doesNotMatch(v,/\d|%/, v);
    assert.doesNotMatch(v,/\b(best|correct|right answer|wrong|smart|wise|safest|obvious(ly)?|recommended)\b/i, v);
  }
});
test('client-safe and unwired: no answer key here, and no app/ or components/ import', () => {
  const src=readFileSync(new URL('../lib/shift-quality-variants.ts',import.meta.url),'utf8');
  assert.doesNotMatch(src,/shift-quality-key|canonicalBest|answerKey|best:/);
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/shift-quality-variants/, f);
});
import { qualityGrades, gradeByScore } from '../lib/shift-quality.ts';
test('ARC #274: at least 3 variants per answer; figures and outcomes unchanged', () => {
  for (const q of harvestAnswerVariants) for (const opt of q.options) assert.ok(opt.variants.length>=3);
  assert.deepEqual(Object.fromEntries(Object.entries(qualityGrades).map(([k,v])=>[k,v.multiplierPct])),{poor:100,fair:110,good:125,excellent:150});
  assert.deepEqual([...gradeByScore],['poor','fair','good','excellent']);
  assert.deepEqual(harvestQuestions.map(q=>q.options.length),[3,3,3]);
  const key=readFileSync(new URL('../lib/shift-quality-key.ts',import.meta.url),'utf8');
  assert.match(key,/canonicalBest: readonly number\[\] = \[1, 1, 2\]/);
  assert.match(key,/multiplierPct: Record<QualityGrade, number> = \{ poor: 100, fair: 110, good: 125, excellent: 150 \}/);
});
import { shiftOptionOrder, shiftAnswerKey } from '../lib/shift-quality-key.ts';
test('ARC #276 / QA3: every wording combination a player can see keeps the best answer within ~15% of each other answer', async () => {
  // Worst case, not averages: one wording per answer is shown, so check every combination of chosen variants.
  const secret='test-secret-0123456789', shiftId='00000000-0000-4000-8000-000000000000';
  const [order,key]=[await shiftOptionOrder(secret,shiftId,harvestQuestions),await shiftAnswerKey(secret,shiftId,harvestQuestions)];
  const best=key.map((pos,qi)=>order[qi][pos]); // canonical index of the best option, from the server key
  const fails=[];
  harvestAnswerVariants.forEach((q,qi)=>{
    const combos=q.options.reduce((acc,o)=>acc.flatMap(c=>o.variants.map((_,vi)=>[...c,vi])),[[]]);
    for (const c of combos) {
      const len=c.map((vi,oi)=>q.options[oi].variants[vi].length);
      for (let oi=0;oi<len.length;oi++) if (oi!==best[qi]) {
        const ratio=len[best[qi]]/len[oi];
        if (ratio<0.85||ratio>1.15) fails.push(`q${qi} v[${c}] best ${len[best[qi]]} vs o${oi} ${len[oi]} (${ratio.toFixed(2)})`);
      }
    }
  });
  assert.deepEqual(fails,[], `${fails.length} failing combinations:\n${fails.slice(0,20).join('\n')}`);
});
