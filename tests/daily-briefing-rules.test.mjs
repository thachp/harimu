import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyPriority } from '../lib/daily-briefing.ts';

const input = { now: 1000, capacity: 12, food: 2, mealFood: 2, mealReadyAt: null, marketAvailable: true, activeShift: undefined };
test('finished shift takes priority over a food shortage at completion boundary', () => {
  assert.equal(dailyPriority({ ...input, food: 0, activeShift: { completesAt: new Date(1000).toISOString() } }).action, 'work');
  assert.match(dailyPriority({ ...input, activeShift: { completesAt: new Date(1000).toISOString() } }).title, /Collect/);
});
test('food shortage gives actionable market guidance', () => {
  assert.match(dailyPriority({ ...input, food: 1 }).title, /Replenish/);
});
test('meal cooldown blocks meal guidance until its absolute timestamp', () => {
  const shift = { completesAt: new Date(3000).toISOString() };
  assert.match(dailyPriority({ ...input, mealReadyAt: new Date(2000).toISOString(), activeShift: shift }).title, /underway/);
  assert.match(dailyPriority({ ...input, now: 2000, mealReadyAt: new Date(2000).toISOString(), activeShift: shift }).title, /meal/);
});
test('full capacity conserves food and unavailable market never suggests meals', () => {
  assert.match(dailyPriority({ ...input, capacity: 24 }).title, /shift/);
  assert.equal(dailyPriority({ ...input, food: 0, marketAvailable: false }).action, 'work');
});
test('no capacity and meal cooldown directs refresh without promising a new shift', () => {
  assert.equal(dailyPriority({ ...input, capacity: 0, mealReadyAt: new Date(2000).toISOString() }).action, 'refresh');
});

// #118 voice pass: nation copy changes words only, never the chosen action or the figures.
import { briefingVoices } from '../lib/daily-briefing.ts';
const states = [
  { ...input, activeShift: { completesAt: new Date(1000).toISOString() } },
  { ...input, food: 1, mealFood: 3 },
  { ...input, food: 3, mealFood: 3 },
  { ...input, capacity: 24, activeShift: { completesAt: new Date(5000).toISOString() } },
  { ...input, capacity: 24 },
  { ...input, capacity: 0, mealReadyAt: new Date(2000).toISOString() },
];
for (const nationId of ['kindle', 'korund', 'aurelle']) test(`${nationId} briefing voice keeps rules, figures and house terms`, () => {
  const titles = new Set();
  for (const s of states) {
    const base = dailyPriority(s), voiced = dailyPriority({ ...s, nationId });
    assert.equal(voiced.action, base.action);
    assert.deepEqual(voiced.reason.match(/\d+/g), base.reason.match(/\d+/g));
    assert.ok(voiced.title && voiced.reason);
    assert.doesNotMatch(voiced.title + voiced.reason, /Notable|guarantee|bonus|reward(s)? of \d/i);
    titles.add(voiced.title);
  }
  assert.equal(titles.size, states.length);
  assert.equal(Object.keys(briefingVoices[nationId]).length, 6);
});
test('nation voices are distinct and unknown nations fall back to neutral copy', () => {
  const s = { ...input, capacity: 24 };
  const titles = ['kindle', 'korund', 'aurelle'].map(nationId => dailyPriority({ ...s, nationId }).title);
  assert.equal(new Set(titles).size, 3);
  assert.deepEqual(dailyPriority({ ...s, nationId: 'fulmara' }), dailyPriority(s));
  assert.deepEqual(dailyPriority({ ...s, nationId: '__proto__' }), dailyPriority(s));
  assert.match(dailyPriority({ ...input, food: 1, nationId: 'korund' }).reason, /\b2 food\b/);
});
