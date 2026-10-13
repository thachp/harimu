import assert from 'node:assert/strict';
import { nextDailyAction } from '../app/daily-loop-choice.ts';
const initial = { supported: true, economyLoaded: true, activeShift: false, collected: false,
  readyToCollect: false, food: 2, mealFood: 2, canBuy: false, mealReady: true, eligibleJob: true };
assert.equal(nextDailyAction(initial), 'first-work', 'first paid shift comes before optional civic commitments');
assert.equal(nextDailyAction({ ...initial, food: 0 }), 'first-work', 'penniless food shortage directs earning rather than unavailable shopping');
assert.equal(nextDailyAction({ ...initial, activeShift: true }), 'waiting');
assert.equal(nextDailyAction({ ...initial, activeShift: true, readyToCollect: true, food: 0, canBuy: true }), 'collect', 'collect earned wages before buying');
assert.equal(nextDailyAction({ ...initial, collected: true, food: 0, canBuy: true }), 'buy');
assert.equal(nextDailyAction({ ...initial, collected: true }), 'meal');
assert.equal(nextDailyAction({ ...initial, collected: true, mealReady: false }), 'work', 'meal cooldown never suggests a blocked meal');
assert.equal(nextDailyAction({ ...initial, collected: true, mealReady: false, eligibleJob: false }), 'rest');
assert.equal(nextDailyAction({ ...initial, supported: false }), 'refresh', 'unsupported nations never offer a live starter job');
assert.equal(nextDailyAction({ ...initial, economyLoaded: false }), 'refresh');
console.log('Daily loop guidance: earning, collection, buying, meals, recovery and unsupported-state checks passed');
