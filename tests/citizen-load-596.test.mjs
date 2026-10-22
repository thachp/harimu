/** #596: signed-in load. One /api/citizen read on load (no deadline refresh for a shift that was already finished when the snapshot was requested), and the GET reads run concurrently. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { deadlineNeedsRefresh, shiftDeadlineDelay, shiftDeadlineText, shiftDeadlineReady, shiftDeadlineConfirming } from '../lib/shift-deadline.ts';

const iso = ms => new Date(ms).toISOString();
test('deadlineNeedsRefresh: only a deadline after the snapshot request (or an unknown request time) refreshes', () => {
  const T = Date.UTC(2026, 9, 15, 14, 0, 0);
  assert.equal(deadlineNeedsRefresh(iso(T), T + 1), false, 'finished before the request started');
  assert.equal(deadlineNeedsRefresh(iso(T), T), false, 'finished exactly at the request');
  assert.equal(deadlineNeedsRefresh(iso(T + 1), T), true, 'finishes after the request: refresh at the deadline');
  assert.equal(deadlineNeedsRefresh(iso(T), null), true, 'unknown request time (saved local snapshot): old behaviour');
  assert.equal(deadlineNeedsRefresh('not a date', T), false); assert.equal(deadlineNeedsRefresh('not a date', null), false);
  assert.equal(shiftDeadlineDelay(iso(T), T + 5000), 0, 'the timer helper is unchanged: a past deadline is an immediate (0 ms) refresh');
  assert.notEqual(shiftDeadlineReady, shiftDeadlineConfirming);
  assert.equal(shiftDeadlineText('s1', null), shiftDeadlineConfirming); assert.equal(shiftDeadlineText('s1', 's1'), shiftDeadlineReady);
});

test('app/page.tsx: one /api/citizen read on load, the deadline timer is gated, and "ready" shows without a refresh', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.equal([...page.matchAll(/fetchWithRetry\('\/api\/citizen'/g)].length, 1, 'the loader is the only retrying citizen read');
  assert.match(page, /const requestedAt = Date\.now\(\);[^\n]*\n\s*const response = await fetchWithRetry\('\/api\/citizen'/, 'the request start is taken before the fetch');
  assert.match(page, /onHydrate\(snapshot, requestedAt\);/);
  assert.match(page, /setSnapshotRequestedAt\(requestedAtMs \?\? null\)/);
  assert.match(page, /if \(!deadlineShiftId \|\| !deadlineShiftEnds \|\| !deadlineNeedsRefresh\(deadlineShiftEnds, snapshotRequestedAt\)\) return;/);
  assert.match(page, /\[deadlineShiftId, deadlineShiftEnds, snapshotRequestedAt\]\);/);
  assert.match(page, /shiftDeadlineText\(activeShift\.id, deadlineConfirmedId \?\? \(deadlineNeedsRefresh\(activeShift\.completesAt, snapshotRequestedAt\) \? null : activeShift\.id\)\)/);
  assert.match(page, /if \(result\.shifts\) \{ setWorkShifts\(result\.shifts\); setSnapshotRequestedAt\(requestedAt\); \}/);
});

async function citizenWithFinishedShift(t, backend) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  const started = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' });
  assert.equal(started.status, 200); const shift = started.data.shifts[0];
  r.setNow(Date.parse(shift.completesAt) + 1000);
  return { r, shift };
}
function slowDatabase(r, delayMs) {
  const stats = { statements: 0, inFlight: 0, maxInFlight: 0 }, prepare = r.db.prepare.bind(r.db);
  const slow = fn => async (...a) => { stats.statements++; stats.maxInFlight = Math.max(stats.maxInFlight, ++stats.inFlight); await new Promise(res => setTimeout(res, delayMs)); try { return await fn(...a); } finally { stats.inFlight--; } };
  const wrap = st => ({ bind: (...a) => wrap(st.bind(...a)), first: slow(() => st.first()), all: slow(() => st.all()), run: slow(() => st.run()) });
  r.db.prepare = sql => wrap(prepare(sql));
  return { stats, restore: () => { r.db.prepare = prepare; } };
}

for (const backend of ['sqlite', 'postgres']) test(`GET /api/citizen reads run together, write nothing, and answer the same shape (${backend})`, async t => {
  const { r, shift } = await citizenWithFinishedShift(t, backend);
  const writes = [], prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 40)); return prepare(sql); }; r.db.batch = x => { writes.push('batch'); return batch(x); };
  const plain = await r.call('citizen', 'alice'); r.db.prepare = prepare; r.db.batch = batch;
  assert.equal(plain.status, 200); assert.deepEqual(writes, [], 'GET stays read-only');
  assert.deepEqual(Object.keys(plain.data), ['aurellePlan', 'election', 'collectivePetitions', 'korundPlan', 'firstWeek', 'flags', 'simulation', 'verification', 'economy', 'market', 'playerMarket', 'government', 'shifts', 'profile', 'plan', 'decision'].filter(k => k in plain.data), 'key order is unchanged');
  assert.equal(plain.data.shifts[0].id, shift.id); assert.equal(plain.data.shifts[0].claimedAt, null);
  const slow = slowDatabase(r, 15), started = Date.now(), again = await r.call('citizen', 'alice'); slow.restore();
  const elapsed = Date.now() - started;
  assert.equal(JSON.stringify(again.data), JSON.stringify(plain.data), 'the same bytes with and without latency');
  assert.ok(slow.stats.maxInFlight >= 6, `reads overlap (max in flight ${slow.stats.maxInFlight})`);
  assert.ok(elapsed < slow.stats.statements * 15 * 0.6, `${slow.stats.statements} statements at 15 ms took ${elapsed} ms: concurrent, not serial`);
});
