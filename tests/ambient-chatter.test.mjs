import test from 'node:test';
import assert from 'node:assert/strict';
import { ambientChatterLines, ambientChatter, CHATTER_NATIONS, CHATTER_MIN_PER_NATION, CHATTER_LINE_MAX } from '../lib/ambient-chatter.ts';
import { citizenNameLists } from '../lib/citizen-names.ts';

test('MVP trio, at least 20 lines each, unique ids and text', () => {
  assert.deepEqual([...CHATTER_NATIONS].sort(),['aurelle','kindle','korund']);
  for (const n of CHATTER_NATIONS) assert.ok(ambientChatter(n).length>=CHATTER_MIN_PER_NATION, n);
  assert.equal(new Set(ambientChatterLines.map(l=>l.id)).size, ambientChatterLines.length);
  assert.equal(new Set(ambientChatterLines.map(l=>l.text)).size, ambientChatterLines.length);
});
test('every line is AI-labeled (AiTextTag deterministic) and a proposal', () => {
  for (const l of ambientChatterLines) { assert.equal(l.aiText,true); assert.equal(l.provenance,'deterministic'); assert.equal(l.proposal,true); }
});
test('opt-out hides all chatter', () => {
  for (const n of CHATTER_NATIONS) assert.deepEqual(ambientChatter(n,{hideAiChatter:true}),[]);
  assert.deepEqual(ambientChatter('varkand'),[]);
});
test('length limit and nation voice markers', () => {
  for (const l of ambientChatterLines) assert.ok(l.text.length<=CHATTER_LINE_MAX, `${l.id}: ${l.text.length}`);
  const voice={kindle:/Spark|Ballot|jury|Juries|stall|board|Forge|Market Bell|Emberstone|Kolt/i, korund:/quota|coupon|brigade|ration|Plan|state store|canteen|permit|Ironroot|hammer/i,
    aurelle:/Crown|Mint|Hearth|fief|lord|rank|court|loom|Skysilk|Charter|pretender|gazette|steward|royal/i};
  for (const n of CHATTER_NATIONS) { const hits=ambientChatter(n).filter(l=>voice[n].test(l.text)).length;
    assert.ok(hits>=10, `${n}: only ${hits} lines carry nation markers`); }
});
test('no real-world references, no Notable, no citizen or canon names', () => {
  const real=['earth','europe','asia','africa','america','china','japan','russia','france','britain','london','paris','rome','moscow','dollar','euro','yen','ruble','pound','king charles','stalin','lenin','mao','trump','biden','putin','christmas','easter','ramadan','facebook','google','twitter','instagram','tiktok','iphone'];
  const names=new Set(Object.values(citizenNameLists).flatMap(l=>[...l.given,...l.family]));
  for (const l of ambientChatterLines) { const s=l.text.toLowerCase();
    for (const r of real) assert.ok(!new RegExp(`\\b${r}\\b`).test(s), `${l.id} mentions ${r}`);
    assert.ok(!/\bNotable\b/i.test(l.text), l.id);
    for (const w of l.text.match(/\b[A-Z][a-z]+\b/g)??[]) assert.ok(!names.has(w), `${l.id} uses citizen name ${w}`); }
});
