import assert from 'node:assert/strict';
import { simulateGovernment } from '../lib/government.ts';

const input = { nationId: 'kindle', availableBudgetMinor: 10_003, foodSecurity: 80, petitionCounts: {} };
assert.equal(simulateGovernment({ ...input, nationId: 'unknown' }), null);
assert.equal(simulateGovernment({ ...input, nationId: '__proto__' }), null);
for (const nationId of ['kindle', 'korund', 'aurelle']) {
  const state = simulateGovernment({ ...input, nationId });
  assert.equal(state.mode, 'rule-bound simulation');
  assert.equal(state.roles.length, 3);
  assert.ok(state.roles.every(role => role.controller.includes('AI/SI')));
  assert.equal(state.decision.proposedSpendMinor, 1000);
}
assert.match(simulateGovernment({ ...input, nationId: 'korund' }).influenceSummary, /one-party/);
assert.match(simulateGovernment({ ...input, nationId: 'aurelle' }).influenceSummary, /hereditary/);
assert.equal(simulateGovernment({ ...input, petitionCounts: { work: 9 } }).decision.title, 'Workplace support');
assert.equal(simulateGovernment({ ...input, petitionCounts: { infrastructure: 9, work: 9 } }).decision.title, 'Infrastructure maintenance');
assert.equal(simulateGovernment({ ...input, petitionCounts: { food: 9, infrastructure: 9 } }).decision.title, 'Food security reserve');
const emergency = simulateGovernment({ ...input, foodSecurity: 39, petitionCounts: { work: 500 } });
assert.equal(emergency.decision.title, 'Food security reserve');
assert.equal(emergency.decision.proposedSpendMinor, 2000);
assert.match(emergency.decision.reason, /39\/100/);
for (const availableBudgetMinor of [-1, NaN, Infinity, 4.5, Number.MAX_SAFE_INTEGER + 1, undefined]) {
  const state = simulateGovernment({ ...input, availableBudgetMinor });
  assert.equal(state.availableBudgetMinor, 0);
  assert.equal(state.decision.proposedSpendMinor, 0);
}
for (const availableBudgetMinor of [0, 1, 9, 10, 101, Number.MAX_SAFE_INTEGER]) {
  const state = simulateGovernment({ ...input, availableBudgetMinor, foodSecurity: 0 });
  assert.ok(Number.isSafeInteger(state.decision.proposedSpendMinor));
  assert.ok(state.decision.proposedSpendMinor <= availableBudgetMinor);
}
const malformed = simulateGovernment({ ...input, petitionCounts: { work: Infinity, infrastructure: -3, food: 1.5 } });
assert.equal(malformed.decision.title, 'Food security reserve');
assert.deepEqual(simulateGovernment(input), simulateGovernment(input));
assert.deepEqual(input.petitionCounts, {});
console.log('Government rules: institutions, petition priorities, emergency response, budget bounds and invalid inputs passed.');
