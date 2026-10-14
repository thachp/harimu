/** #122: buy an unclaimed Wildlands square from the World Registry via the real route. HARIMU_TEST_STORAGE=postgres
 *  runs the same suite on PGlite for SQLite/Postgres parity. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const buy = (r, user, x, y, requestId = randomUUID()) => r.call('world/registry', user, { action: 'buy-square', x, y, requestId });
const square = (r, x, y) => r.db.prepare('SELECT owner,zone FROM world_squares WHERE x=? AND y=?').bind(x, y).first();
const tessera = async (r, user) => (await r.call('world/registry', user)).data.tesseraMinor;
async function runtime(t) { const r = await localRuntime(); t.after(() => r.close()); r.setSquarePurchase(true); return r; }

test('happy path: buys a Wildlands square next to the nation\'s land; owner, zone and Tessera update; double-submit is idempotent', async t => {
  const r = await runtime(t);
  const requestId = randomUUID();
  const [first, second] = await Promise.all([buy(r, 'alice', 9, 8, requestId), buy(r, 'alice', 9, 8, requestId)]);
  for (const res of [first, second]) assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(first.data.square, { x: 9, y: 8, owner: 'kindle', zone: 'frontier' });
  assert.equal(first.data.priceMinor, 2500);
  assert.deepEqual({ ...(await square(r, 9, 8)) }, { owner: 'kindle', zone: 'frontier' });
  assert.equal(await tessera(r, 'alice'), 2500, '50.00 TSR starter grant minus one 25.00 TSR square');
  const replay = await buy(r, 'alice', 9, 8, requestId); assert.equal(replay.data.replay, true);
  assert.equal(await tessera(r, 'alice'), 2500, 'no second debit');
  assert.equal(Number((await r.db.prepare("SELECT COUNT(*) AS n FROM citizen_tessera_ledger WHERE reason='square-purchase'").first()).n), 1);
  // The bought square extends adjacency; the citizen snapshot shows the new Tessera balance.
  assert.equal((await buy(r, 'alice', 10, 9)).status, 200);
  assert.equal(await tessera(r, 'alice'), 0);
  assert.equal((await r.call('citizen', 'alice')).data.economy.tesseraMinor, 0);
});

test('each rejection gives a specific reason and charges nothing', async t => {
  const r = await runtime(t);
  assert.equal((await buy(r, 'alice', 9, 8)).status, 200);
  const before = await tessera(r, 'alice'); const owned = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM world_squares WHERE owner IS NOT NULL').first()).n);
  const ownedBefore = await owned();
  for (const [x, y, reason, message] of [
    [5, 5, 'heartland', /Heartland squares are never sold/],
    [12, 6, 'commons', /Commons cannot be bought/],
    [8, 4, 'frontier', /Only Wildlands/],
    [0, 0, 'not_adjacent', /next to land your nation already owns/],
    [40, 2, 'out_of_bounds', /off the map/],
  ]) {
    const res = await buy(r, 'alice', x, y);
    assert.equal(res.data.reason, reason, `${x},${y} ${JSON.stringify(res.data)}`); assert.match(res.data.error, message);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  const taken = await buy(r, 'bob', 9, 8); assert.equal(taken.data.reason, 'owned'); assert.match(taken.data.error, /belongs to kindle/);
  assert.equal((await buy(r, 'alice', 10, 9)).status, 200); // spends the rest
  const broke = await buy(r, 'alice', 11, 10); assert.equal(broke.data.reason, 'insufficient_tessera'); assert.match(broke.data.error, /costs 25\.00 TSR; you hold 0\.00 TSR/);
  assert.equal(await tessera(r, 'alice'), before - 2500, 'only the successful purchase was charged');
  assert.equal(await owned(), ownedBefore + 1);
  assert.equal((await square(r, 11, 10)).owner, null);
});

test('gate, validation, request reuse and origin', async t => {
  const r = await runtime(t);
  r.setSquarePurchase(false); assert.equal((await buy(r, 'alice', 9, 8)).data.reason, 'disabled'); r.setSquarePurchase(true);
  assert.equal((await buy(r, 'nobody', 9, 8)).data.reason, 'no_nation');
  assert.equal((await r.call('world/registry', 'alice', { action: 'buy-square', x: 9.5, y: 8, requestId: randomUUID() })).status, 400);
  assert.equal((await r.call('world/registry', 'alice', { action: 'buy-square', x: 9, y: 8, requestId: 'x' })).status, 400);
  assert.equal((await r.call('world/registry', 'alice', { action: 'sell-square', x: 9, y: 8, requestId: randomUUID() })).status, 400);
  assert.equal((await r.call('world/registry', 'alice', { action: 'buy-square', x: 9, y: 8, requestId: randomUUID() }, 'https://foreign.invalid')).status, 403);
  assert.equal((await r.call('world/registry', null, { action: 'buy-square', x: 9, y: 8, requestId: randomUUID() })).status, 401);
  const id = randomUUID(); assert.equal((await buy(r, 'alice', 9, 8, id)).status, 200);
  assert.equal((await buy(r, 'alice', 10, 9, id)).data.reason, 'request_reused');
  assert.equal(await tessera(r, 'alice'), 2500);
});

test('pure site check and shipped default', async t => {
  const r = await runtime(t);
  const m = await r.importModule('lib/world-registry.ts'); const z = await r.importModule('lib/map-zones.ts');
  const seed = z.seedWorldSquares();
  assert.equal(m.checkPurchaseSite(seed, 'kindle', 9, 8), null);
  assert.equal(m.checkPurchaseSite(seed, 'korund', 9, 8).reason, 'not_adjacent');
  assert.equal(m.checkPurchaseSite(seed, 'korund', 14, 8), null, 'Korund outpost-adjacent');
  assert.equal(m.checkPurchaseSite(seed, 'aurelle', 13, 10), null, 'Aurelle outpost-adjacent');
  const { readFile } = await import('node:fs/promises');
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_SQUARE_PURCHASE_ENABLED"\s*:\s*"([^"]*)"/g)].map(x => x[1]), ['false']);
});
