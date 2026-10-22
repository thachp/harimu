/** #679: lib/async-limits.ts mapLimited stops after the first failure, settles in-flight items, rethrows the first error and validates its limit. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/async-limits.ts', import.meta.url), 'utf8');
const { mapLimited, parked } = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);
const tick = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));

test('#679 mapLimited keeps order and never exceeds the limit', async () => {
  let inFlight = 0, peak = 0;
  const out = await mapLimited([5, 1, 4, 2, 3, 0], 2, async n => { inFlight++; peak = Math.max(peak, inFlight); await tick(n); inFlight--; return n * 10; });
  assert.deepEqual(out, [50, 10, 40, 20, 30, 0]); assert.equal(peak, 2);
  assert.deepEqual(await mapLimited([], 3, async () => 1), []);
});

test('#679 mapLimited starts no new item after the first failure, lets in-flight items settle, and rethrows the first error', async () => {
  const started = [], settled = [];
  const first = Error('first'), second = Error('second');
  await assert.rejects(mapLimited([0, 1, 2, 3, 4, 5, 6, 7], 3, async i => {
    started.push(i);
    if (i === 0) { await tick(1); throw first; }
    if (i === 1) { await tick(10); settled.push(i); throw second; }
    await tick(20); settled.push(i); return i;
  }), error => error === first);
  assert.deepEqual(started, [0, 1, 2], 'nothing starts after item 0 fails');
  assert.deepEqual(settled.sort(), [1, 2], 'items already in flight settled before the rejection');
});

test('#679 mapLimited rejects a NaN, non-integer or non-positive limit with a clear error', async () => {
  for (const limit of [NaN, 0, -1, 1.5, Infinity, '2']) {
    let ran = false;
    await assert.rejects(mapLimited([1], limit, async () => { ran = true; }), { name: 'RangeError', message: /limit must be a positive integer/ }, String(limit));
    assert.equal(ran, false, String(limit));
  }
});

test('#679 parked marks a rejection handled but still rethrows when awaited', async () => {
  const promise = parked(Promise.reject(Error('late')));
  await tick();
  await assert.rejects(promise, /late/);
});
