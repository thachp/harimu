import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstLoopStep } from '../lib/first-loop.ts';

test('first-day guidance follows owned currency rewards and stops after meals or three days', () => {
  const now = Date.parse('2026-10-13T00:00:00Z');
  const input = { nationId: 'korund', enrolledAt: new Date(now).toISOString(), now, shifts: [], food: 0 };
  assert.equal(firstLoopStep(input).step, 1);
  const foreign = { currency: 'SPK', claimedAt: new Date(now).toISOString() };
  assert.equal(firstLoopStep({ ...input, shifts: [foreign] }).step, 1);
  const own = { currency: 'LN', claimedAt: new Date(now).toISOString() };
  assert.equal(firstLoopStep({ ...input, shifts: [own] }).step, 2);
  assert.equal(firstLoopStep({ ...input, shifts: [own], food: 2 }).step, 3);
  assert.equal(firstLoopStep({ ...input, mealReadyAt: new Date(now).toISOString() }), null);
  assert.equal(firstLoopStep({ ...input, now: now + 3 * 86400000 }), null);
  assert.equal(firstLoopStep({ ...input, nationId: 'ilmar' }), null);
  assert.equal(firstLoopStep({ ...input, enrolledAt: 'invalid' }), null);
});
