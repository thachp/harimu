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
