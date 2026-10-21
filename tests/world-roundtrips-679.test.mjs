/** #679: GET /api/world must not queue its database round trips. Every statement is delayed by D ms (as a slow Hyperdrive round trip would be), so
 *  elapsed / D is the number of sequential round trips on the request's critical path. Preview flag set from wrangler.jsonc, PGlite. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 40;
const previewFlags = [...readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').matchAll(/"(HARIMU_[A-Z_]+)": *"true"/g)].map(m => m[1]);
const sleep = () => new Promise(resolve => setTimeout(resolve, D));
const slow = (statement) => new Proxy(statement, { get(target, key) {
  const value = target[key]; if (typeof value !== 'function') return value;
  if (key === 'bind') return (...args) => slow(value.apply(target, args));
  if (['first', 'all', 'run', 'raw'].includes(key)) return async (...args) => { await sleep(); return value.apply(target, args); };
  return value.bind(target);
} });

async function roundTrips(t, hoursLater) {
  const r = await localRuntime({ backend: 'postgres' }); t.after(() => r.close());
  for (const flag of previewFlags) r.setFixtureEnv(flag, 'true');
  assert.equal((await r.call('world')).status, 200); // first call sets the world clock
  const prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => slow(prepare(sql)); r.db.batch = async statements => { await sleep(); return batch(statements); };
  try {
    r.setNow(r.now + hoursLater * 3600000);
    const started = Date.now(), response = await r.call('world');
    assert.equal(response.status, 200);
    return { trips: (Date.now() - started) / D, clock: response.data.simulation.clock };
  } finally { r.db.prepare = prepare; r.db.batch = batch; }
}

test('with the preview flags on, a GET with no tick due waits for at most 26 sequential round trips (it was ~38)', async t => {
  assert.ok(previewFlags.length >= 20, 'the preview flag set is on');
  const { trips, clock } = await roundTrips(t, 0);
  assert.equal(clock.pendingTicks, 0);
  assert.ok(trips <= 26, `critical path ~${trips.toFixed(1)} round trips`);
});

test('with three ticks to catch up, the GET waits for at most 68 sequential round trips (it was ~95)', async t => {
  const { trips, clock } = await roundTrips(t, 30);
  assert.equal(clock.latestTick, 3, 'the catch-up still processes three ticks');
  assert.ok(trips <= 68, `critical path ~${trips.toFixed(1)} round trips`);
});
