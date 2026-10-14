/** #123: travel between owned and city squares with a travel timer, via the real routes. HARIMU_TEST_STORAGE=postgres
 *  runs the same suite on PGlite for SQLite/Postgres parity. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const go = (r, user, x, y, requestId = randomUUID()) => r.call('travel', user, { action: 'start-travel', x, y, requestId });
const state = async (r, user) => (await r.call('travel', user)).data;
async function runtime(t) { const r = await localRuntime(); t.after(() => r.close()); r.setTravel(true); return r; }

test('start, blocked while travelling, arrive, then a second journey', async t => {
  const r = await runtime(t);
  const home = await state(r, 'alice');
  assert.deepEqual({ x: home.location.x, y: home.location.y, cityId: home.location.cityId }, { x: 5, y: 4, cityId: 'forgehaven' });
  // Capital (5,4) -> border outpost city (8,7): 3 squares x 5 min = 15 min.
  const start = await go(r, 'alice', 8, 7);
  assert.equal(start.status, 200, JSON.stringify(start.data)); assert.equal(start.data.durationSeconds, 900);
  const during = await state(r, 'alice');
  assert.equal(during.location, null); assert.equal(during.traveling.to.cityId, 'tarrek-foundry'); assert.equal(during.traveling.secondsLeft, 900);
  // Location-bound actions are refused with a reason; non-location reads still work.
  for (const [endpoint, body] of [
    ['citizen', { action: 'commit-work', workOrderId: 'harvest' }],
    ['citizen', { action: 'market-trade', side: 'buy', item: 'food', quantity: 1, requestId: randomUUID() }],
    ['square', { action: 'post', expectedNationId: 'kindle', id: randomUUID(), text: 'from the road' }],
    ['city', { action: 'travel', cityId: 'kolt-savanna' }],
  ]) {
    const res = await r.call(endpoint, 'alice', body);
    assert.equal(res.status, 409, `${endpoint} ${body.action}: ${JSON.stringify(res.data)}`); assert.equal(res.data.reason, 'traveling'); assert.match(res.data.error, /travelling; you arrive in 15 min/);
  }
  assert.equal((await go(r, 'alice', 5, 4)).data.reason, 'already_traveling');
  assert.equal((await r.call('citizen', 'bob', { action: 'commit-work', workOrderId: 'harvest' })).status, 200, 'other citizens unaffected');
  // Arrival is derived from the clock.
  r.setNow(r.now + 900 * 1000);
  const arrived = await state(r, 'alice');
  assert.equal(arrived.traveling, null); assert.deepEqual([arrived.location.x, arrived.location.y, arrived.location.cityId], [8, 7, 'tarrek-foundry']);
  assert.equal((await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' })).status, 200, 'unblocked on arrival');
  // Second journey: to an adjacent owned square (outpost neighbour bought via the registry fixture: set owner directly).
  await r.db.prepare("UPDATE world_squares SET owner='kindle', zone='frontier' WHERE x=9 AND y=8").run();
  const second = await go(r, 'alice', 9, 8);
  assert.equal(second.status, 200, JSON.stringify(second.data)); assert.equal(second.data.durationSeconds, 300);
  assert.equal(second.data.state.traveling.from.cityId, 'tarrek-foundry');
});

test('rejections give a clear reason and leave the location unchanged', async t => {
  const r = await runtime(t);
  for (const [x, y, reason, message] of [
    [5, 4, 'already_here', /already there/],
    [0, 0, 'not_owned', /cities or to squares your nation owns/],
    [12, 6, 'not_owned', /owns/],
    [18, 4, 'not_owned', /owns/], // Korund's capital is not a Kindle city
    [5, 6, 'not_adjacent', /adjacent owned square/], // owned Kindle heartland, two squares away
    [30, 2, 'out_of_bounds', /off the map/],
  ]) {
    const res = await go(r, 'alice', x, y);
    assert.equal(res.data.reason, reason, `${x},${y}: ${JSON.stringify(res.data)}`); assert.match(res.data.error, message);
  }
  const s = await state(r, 'alice'); assert.equal(s.traveling, null); assert.deepEqual([s.location.x, s.location.y], [5, 4]);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM citizen_travel').first()).n), 0);
  assert.equal((await go(r, 'alice', 5, 5)).status, 200, 'adjacent owned heartland square is allowed');
});

test('flag gate, validation, idempotent replay, unsupported nation and origin', async t => {
  const r = await runtime(t);
  r.setTravel(false);
  assert.equal((await go(r, 'alice', 8, 7)).data.reason, 'disabled');
  assert.equal((await state(r, 'alice')).enabled, false);
  r.setTravel(true);
  const id = randomUUID(); const a = await go(r, 'alice', 8, 7, id); const b = await go(r, 'alice', 8, 7, id);
  assert.equal(a.status, 200); assert.equal(b.data.replay, true);
  assert.equal((await go(r, 'alice', 5, 5, id)).data.reason, 'request_reused');
  assert.equal((await r.call('travel', 'alice', { action: 'start-travel', x: 1.5, y: 2, requestId: randomUUID() })).status, 400);
  assert.equal((await r.call('travel', 'alice', { action: 'start-travel', x: 8, y: 7, requestId: 'x' })).status, 400);
  assert.equal((await r.call('travel', 'alice', { action: 'start-travel', x: 8, y: 7, requestId: randomUUID() }, 'https://foreign.invalid')).status, 403);
  assert.equal((await r.call('travel', null)).status, 401);
  await r.db.prepare("UPDATE citizens SET nation_id='meridian' WHERE clerk_user_id='bob'").run();
  assert.equal((await go(r, 'bob', 8, 7)).data.reason, 'unsupported_nation');
  // With the flag off, an in-progress journey blocks nothing.
  r.setTravel(false);
  assert.equal((await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' })).status, 200);
});

test('wrangler.jsonc ships travel off by default', async () => {
  const { readFile } = await import('node:fs/promises');
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_TRAVEL_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
});
