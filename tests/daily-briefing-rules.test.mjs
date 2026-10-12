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
