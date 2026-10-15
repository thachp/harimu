import test from 'node:test';
import assert from 'node:assert/strict';
import { starterCopy, starterCopyFor } from '../lib/starter-copy.ts';
import { firstLoopStep } from '../lib/first-loop.ts';

const nations=['kindle','confluence','meridian','korund','aurelle','ilmar','hoarvale','varkand','veldwood','fulmara'];
test('starter copy covers all ten nations; MVP three are live', () => {
  assert.deepEqual(starterCopy.map(entry=>entry.nationId).sort(), [...nations].sort());
  assert.deepEqual(starterCopy.filter(entry=>entry.status==='live').map(entry=>entry.nationId).sort(), ['aurelle','kindle','korund']);
  for (const entry of starterCopy) {
    assert.ok(entry.welcome.length > 20 && entry.welcome.length <= 240, entry.nationId);
    for (const [key,label] of Object.entries(entry.steps)) assert.ok(label.trim().length > 5, `${entry.nationId}.${key}`);
    assert.match(entry.steps.begin, /Work/); assert.match(entry.steps.collect, /Work/);
    assert.match(entry.steps.food, /Market/); assert.match(entry.steps.meal, /Household/);
    assert.equal(new Set(Object.values(entry.steps)).size, 5);
  }
  const welcomes = new Set(starterCopy.map(entry=>entry.welcome));
  assert.equal(welcomes.size, 10);
  assert.equal(starterCopyFor('unknown'), null);
});
test('Kindle uses Emberwarden; no nation uses Notable as a rank', () => {
  assert.match(starterCopyFor('kindle').welcome, /Emberwarden/);
  for (const entry of starterCopy) assert.doesNotMatch(JSON.stringify(entry), /Notable/);
});
test('first loop uses nation copy and shows welcome on step 1', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const base = { enrolledAt: new Date(now - 1000).toISOString(), now, shifts: [], food: 0 };
  for (const id of ['kindle','korund','aurelle']) {
    const step = firstLoopStep({ ...base, nationId: id, copy: starterCopyFor(id) });
    assert.equal(step.step, 1); assert.equal(step.label, starterCopyFor(id).steps.begin); assert.equal(step.welcome, starterCopyFor(id).welcome);
  }
  assert.equal(firstLoopStep({ ...base, nationId: 'korund', copy: starterCopyFor('korund'), shifts: [{ currency: 'LN', claimedAt: 'x' }] }).label, starterCopyFor('korund').steps.food);
  assert.equal(firstLoopStep({ ...base, nationId: 'kindle', copy: starterCopyFor('korund') }).label, 'Begin your first shift in Work');
  assert.equal(firstLoopStep({ ...base, nationId: 'veldwood', copy: starterCopyFor('veldwood') }), null);
});

// #365: with the market flag off, the Kindle starter and first-loop copy must not send the citizen to the hidden Market.
import { starterFoodMarketOff } from '../lib/starter-copy.ts';
import { marketVisible } from '../lib/market-visibility.ts';
const loopBase = () => { const now = Date.parse('2026-10-14T12:00:00Z'); return { enrolledAt: new Date(now - 1000).toISOString(), now, shifts: [{ currency: 'SPK', claimedAt: 'x' }], food: 0 }; };
test('flag on or unspecified: starter copy is unchanged for every nation', () => {
  for (const entry of starterCopy) { assert.deepEqual(starterCopyFor(entry.nationId), entry); assert.deepEqual(starterCopyFor(entry.nationId, {}), entry); assert.deepEqual(starterCopyFor(entry.nationId, { marketOpen: true }), entry); }
  assert.match(starterCopyFor('kindle', { marketOpen: true }).steps.food, /Market/);
});
test('flag off: no Kindle starter line mentions the Market, and food points at the starter merchant', () => {
  const off = starterCopyFor('kindle', { marketOpen: false });
  assert.doesNotMatch(JSON.stringify(off), /market/i);
  assert.match(off.steps.food, /starter merchant/); assert.match(off.steps.food, /daily loop/);
  assert.equal(off.steps.food, starterFoodMarketOff.kindle); assert.ok(off.steps.food.length > 20 && off.steps.food.length <= 140);
  // Only the food step changes; welcome and the other steps are the live copy.
  const on = starterCopyFor('kindle');
  assert.equal(off.welcome, on.welcome); assert.deepEqual({ ...off.steps, food: '' }, { ...on.steps, food: '' }); assert.equal(new Set(Object.values(off.steps)).size, 5);
  assert.doesNotMatch(off.steps.food, /Notable/);
});
test('flag off: Korund and Aurelle copy is unchanged (State store and royal store stay)', () => {
  for (const id of ['korund', 'aurelle']) assert.deepEqual(starterCopyFor(id, { marketOpen: false }), starterCopyFor(id));
  assert.deepEqual(Object.keys(starterFoodMarketOff), ['kindle']);
  assert.equal(marketVisible('korund', false), true); assert.equal(marketVisible('aurelle', false), true); assert.equal(marketVisible('kindle', false), false);
});
test('first loop food step: flag off reads the merchant line, flag on reads Market, other nations unchanged', () => {
  const b = loopBase();
  assert.equal(firstLoopStep({ ...b, nationId: 'kindle', copy: starterCopyFor('kindle', { marketOpen: false }), marketOpen: false }).label, starterFoodMarketOff.kindle);
  assert.equal(firstLoopStep({ ...b, nationId: 'kindle', copy: starterCopyFor('kindle'), marketOpen: true }).label, starterCopyFor('kindle').steps.food);
  assert.match(firstLoopStep({ ...b, nationId: 'kindle', copy: starterCopyFor('kindle') }).label, /Market/);
  // Without copy, the Kindle fallback also avoids the Market while the flag is off.
  assert.equal(firstLoopStep({ ...b, nationId: 'kindle', copy: null, marketOpen: false }).label, 'Buy food from the starter merchant');
  assert.equal(firstLoopStep({ ...b, nationId: 'kindle', copy: null }).label, 'Get food in Market');
  const k = { ...b, shifts: [{ currency: 'LN', claimedAt: 'x' }] };
  assert.equal(firstLoopStep({ ...k, nationId: 'korund', copy: starterCopyFor('korund', { marketOpen: false }), marketOpen: false }).label, starterCopyFor('korund').steps.food);
  // Steps 1 and 3 never mention the Market.
  const s1 = firstLoopStep({ ...loopBase(), shifts: [], nationId: 'kindle', copy: starterCopyFor('kindle', { marketOpen: false }), marketOpen: false });
  assert.doesNotMatch(JSON.stringify(s1), /market/i);
});
