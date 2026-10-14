import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fetchIdempotent } from '../lib/retry-fetch.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

// Regression for #53: a dropped first Collect request must recover without the player retrying.
const noSleep = { sleep: async () => {} };

test('a dropped connection is retried with the identical request and succeeds', async () => {
  const seen = []; let calls = 0;
  const fetchFn = async (url, init) => { seen.push(init.body); if (++calls === 1) throw new TypeError('Failed to fetch'); return new Response('{"ok":true}', { status: 200 }); };
  const response = await fetchIdempotent(fetchFn, '/api/citizen', { method: 'POST', body: '{"action":"claim-work","shiftId":"s1"}' }, noSleep);
  assert.equal(response.status, 200); assert.equal(calls, 2); assert.equal(seen[0], seen[1]);
});
test('a hung request times out and is retried', async () => {
  let calls = 0;
  const fetchFn = (url, init) => { calls++; return calls === 1 ? new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))) : Promise.resolve(new Response('{}', { status: 200 })); };
  const response = await fetchIdempotent(fetchFn, '/x', {}, { ...noSleep, timeoutMs: 20 });
  assert.equal(response.status, 200); assert.equal(calls, 2);
});
test('a body that stalls or drops after headers is retried within the attempt', async () => {
  let calls = 0;
  const stalled = signal => new Response(new ReadableStream({ start(c) { signal.addEventListener('abort', () => c.error(new Error('aborted'))); } }), { status: 200 });
  const dropped = () => new Response(new ReadableStream({ start(c) { c.error(new TypeError('network')); } }), { status: 200 });
  const fetchFn = async (url, init) => { calls++; return calls === 1 ? stalled(init.signal) : calls === 2 ? dropped() : new Response('{"ok":true}', { status: 200 }); };
  const response = await fetchIdempotent(fetchFn, '/x', {}, { ...noSleep, timeoutMs: 20 });
  assert.equal(calls, 3); assert.deepEqual(await response.json(), { ok: true });
});
test('5xx is retried but 4xx is a final server answer; persistent failure still surfaces', async () => {
  let calls = 0;
  assert.equal((await fetchIdempotent(async () => new Response('', { status: ++calls === 1 ? 503 : 200 }), '/x', {}, noSleep)).status, 200);
  calls = 0; assert.equal((await fetchIdempotent(async () => { calls++; return new Response('', { status: 409 }); }, '/x', {}, noSleep)).status, 409); assert.equal(calls, 1);
  calls = 0; await assert.rejects(fetchIdempotent(async () => { calls++; throw new TypeError('offline'); }, '/x', {}, noSleep), /offline/); assert.equal(calls, 3);
});
test('repeating a claim after a lost response credits wages exactly once', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' });
  const shift = (await r.call('citizen', 'alice')).data.shifts[0]; r.setNow(Date.parse(shift.completesAt));
  const first = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id }); // response "lost"
  const retry = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id });
  assert.equal(first.status, 200); assert.equal(retry.status, 200);
  assert.equal(retry.data.economy.walletMinor, first.data.economy.walletMinor);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM shift_settlements WHERE shift_id=?').bind(shift.id).first()).n, 1);
});
test('page retries claims/refreshes but never auto-retries starting a shift', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /action === 'commit-work' \? await fetch\('\/api\/citizen', init\) : await fetchIdempotent\(fetch, '\/api\/citizen', init\)/);
});
