import test from 'node:test';
import assert from 'node:assert/strict';
import { broadcastFramings, broadcastFraming, BROADCAST_EVENT_KEYS, BROADCAST_TITLE_MAX, BROADCAST_LINE_MAX } from '../lib/broadcast-framing.ts';
import { citizenNameLists } from '../lib/citizen-names.ts';

const all=x=>[x.titleCard,...x.intro,...x.outro,x.aiDisclosure];

test('locks nation ids and event keys', () => {
  assert.deepEqual(broadcastFramings.map(x=>x.key),[...BROADCAST_EVENT_KEYS]);
  assert.deepEqual([...new Set(broadcastFramings.map(x=>x.nationId))],['kindle','korund','aurelle']);
  for (const x of broadcastFramings) { assert.equal(x.key.split(':')[0],x.nationId); assert.equal(x.proposal,true); assert.equal(broadcastFraming(x.key),x); }
});
test('shape: 2-3 intro lines, 1-2 outro lines; length limits', () => {
  for (const x of broadcastFramings) {
    assert.ok(x.intro.length>=2&&x.intro.length<=3, x.key); assert.ok(x.outro.length>=1&&x.outro.length<=2, x.key);
    assert.ok(x.titleCard.length<=BROADCAST_TITLE_MAX, x.titleCard);
    for (const l of all(x)) assert.ok(l.length<=BROADCAST_LINE_MAX && l.trim().length>0, l);
  }
});
test('every event plainly says the speaker is an AI', () => {
  for (const x of broadcastFramings) { assert.match(x.aiDisclosure,/\bAI\b/); assert.match(x.aiDisclosure,/\bis an AI\b|\bare AI\b/); assert.match(x.aiDisclosure,/AI-generated/); }
});
test('outros mention the archive and transcript', () => {
  for (const x of broadcastFramings) assert.match(x.outro.join(' '),/archive/i);
});
test('never announces an outcome', () => {
  for (const x of broadcastFramings) for (const l of all(x)) {
    assert.doesNotMatch(l,/\d/, l);
    assert.doesNotMatch(l,/\b(won|wins|winner|elected|result|passed|approved|quota (met|exceeded)|record|declares war|peace signed|debased?)\b/i, l);
  }
});
test('no house or claimant names, no Notable, no real-world places, no citizen names', () => {
  const names=Object.values(citizenNameLists).flat().filter(n=>typeof n==='string'&&n.length>3);
  for (const x of broadcastFramings) for (const l of all(x)) {
    assert.doesNotMatch(l,/\bHouse\b|claimant|pretender|\bheirs?\b/i, l); assert.doesNotMatch(l,/Notable/);
    assert.doesNotMatch(l,/\b(Earth|America|Europe|China|Russia|Moscow|Washington|London|Paris|Saudi|Thailand)\b/, l);
    for (const n of names) assert.ok(!l.includes(n), `${x.key}: ${n}`);
  }
});
test('each nation keeps its own voice', () => {
  const t=n=>broadcastFramings.filter(x=>x.nationId===n).flatMap(all).join(' ');
  assert.match(t('kindle'),/Republic/); assert.match(t('kindle'),/journalists/); assert.doesNotMatch(t('kindle'),/State Media|Crown|Monarch/);
  assert.match(t('korund'),/Korund State Media/); assert.match(t('korund'),/One hammer, one heart/); assert.doesNotMatch(t('korund'),/Chairman (is|was) (wise|great|beloved)|glori/i);
  assert.doesNotMatch(t('korund'),/Republic|Crown|Monarch/);
  assert.match(t('aurelle'),/Sky Throne/); assert.match(t('aurelle'),/royal archive/); assert.doesNotMatch(t('aurelle'),/State Media|Republic/);
});
