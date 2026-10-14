import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { workOrderDockStatus } from '../lib/work-dock.ts';

// Regression for #54: the jobs dock showed "Shift in progress" on every job, even after the shift finished.
const orders = [{ id: 'harvest', name: 'Savanna harvest', cost: 4 }, { id: 'freight', name: 'Foundry convoy', cost: 6 }, { id: 'archive', name: 'Civic archive', cost: 3 }];
const shift = (extra = {}) => ({ id: 's1', workOrderId: 'harvest', orderName: 'Savanna harvest', output: '', capacitySpent: 4, startedAt: '2026-10-14T10:00:00.000Z', completesAt: '2026-10-14T12:00:00.000Z', claimedAt: null, ...extra });
const before = Date.parse('2026-10-14T11:00:00.000Z'), after = Date.parse('2026-10-14T12:00:00.000Z');

test('only the active job is labelled in progress; others say to collect first', () => {
  const labels = orders.map(o => workOrderDockStatus(o, [shift()], 24, before));
  assert.deepEqual(labels, ['Shift in progress', 'Collect your active shift first', 'Collect your active shift first']);
});
test('a finished shift matches the panel: ready to collect, never in progress', () => {
  const labels = orders.map(o => workOrderDockStatus(o, [shift()], 24, after));
  assert.equal(labels[0], 'Shift complete · ready to collect');
  assert.ok(labels.every(l => l !== 'Shift in progress'));
});
test('claimed shifts free the dock; capacity hint returns; name fallback without workOrderId', () => {
  assert.equal(workOrderDockStatus(orders[1], [shift({ claimedAt: '2026-10-14T12:01:00.000Z' })], 24, after), '');
  assert.equal(workOrderDockStatus(orders[1], [], 2, after), 'More capacity needed');
  assert.equal(workOrderDockStatus(orders[0], [shift({ workOrderId: undefined })], 24, before), 'Shift in progress');
  assert.equal(workOrderDockStatus(orders[2], [shift({ workOrderId: undefined })], 24, before), 'Collect your active shift first');
});
test('page dock uses the per-job status rather than a global in-progress flag', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /hasActiveShift \? ' · Shift in progress'/);
  assert.match(page, /\$\{dockStatus\(order\)\}/);
});
