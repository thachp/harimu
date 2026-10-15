/** #626 (Decision 111): the Spark-to-Tessera kiosk exchange has its own default-off flag, HARIMU_TESSERA_EXCHANGE_ENABLED; HARIMU_SQUARE_PURCHASE_ENABLED is squares only.
 *  HARIMU_TEST_STORAGE=postgres runs it on PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const exchange = (r, user, tesseraMinor = 100) => r.call('world/registry', user, { action: 'buy-tessera', tesseraMinor, requestId: randomUUID() });
const square = (r, user, x, y) => r.call('world/registry', user, { action: 'buy-square', x, y, requestId: randomUUID() });
const count = async (r, table) => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);
const kioskOpen = async (r, user = 'alice') => (await r.call('world/registry', user)).data;
/** One Kindle harvest shift (800 SPK minor) so the kiosk has Spark to take. */
async function earn(r, user) {
  await r.call('citizen', user, { action: 'commit-work', workOrderId: 'harvest' });
  const shift = (await r.call('citizen', user)).data.shifts.find(s => !s.claimedAt); r.setNow(Date.parse(shift.completesAt));
  assert.equal((await r.call('citizen', user, { action: 'claim-work', shiftId: shift.id })).status, 200);
}
/** Tessera for squares without the kiosk (a seeded exchange row, as tests/world-registry.test.mjs does). */
const fund = (r, user, tesseraMinor) => r.db.prepare("INSERT INTO citizen_tessera_exchanges(request_id,clerk_user_id,nation_id,spark_minor,tessera_minor,occurred_at) VALUES (?,?,'kindle',?,?,0)").bind(randomUUID(), user, tesseraMinor * 4, tesseraMinor).run();

test('the flag ships "false", is its own var, and the registry route reads it for the exchange and the square flag for squares only', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_TESSERA_EXCHANGE_ENABLED"\s*:\s*"([^"]*)"/g)].map(x => x[1]), ['false']);
  assert.deepEqual([...cfg.matchAll(/"HARIMU_SQUARE_PURCHASE_ENABLED"\s*:\s*"([^"]*)"/g)].map(x => x[1]), ['false']);
  const route = (await readFile(new URL('../app/api/world/registry/route.ts', import.meta.url), 'utf8')).replace(/\/\/.*$/gm, '');
  assert.match(route, /buyTessera\([^;]*exchangeEnabled\(\)\)/); assert.match(route, /buySquare\([^;]*enabled\(\)\)/); assert.match(route, /kiosk: \{ open: exchangeEnabled\(\)/);
  assert.doesNotMatch(route, /buyTessera\([^;]*[^e]enabled\(\)\)/, 'the exchange never reads the square flag');
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'); assert.match(page, /setKioskOpen\(data\?\.kiosk\?\.open === true\)/);
});

test('with the square flag ON and the exchange flag OFF the exchange is refused (disabled, nothing written); only the exchange flag opens it', async t => {
  const r = await localRuntime(); t.after(() => r.close()); await earn(r, 'alice'); r.setSquarePurchase(true);
  const refused = await exchange(r, 'alice'); assert.equal(refused.status, 403); assert.equal(refused.data.reason, 'disabled');
  assert.equal(await count(r, 'citizen_tessera_exchanges'), 0); assert.equal((await kioskOpen(r)).tesseraMinor, 0);
  r.setTesseraExchange(true); const allowed = await exchange(r, 'alice'); assert.equal(allowed.status, 200, JSON.stringify(allowed.data)); assert.equal(await count(r, 'citizen_tessera_exchanges'), 1);
  r.setSquarePurchase(false); await earn(r, 'alice'); const alone = await exchange(r, 'alice'); assert.equal(alone.status, 200, 'the exchange flag alone is enough, the square flag is not involved');
  r.setTesseraExchange(false); const closed = await exchange(r, 'alice'); assert.equal(closed.data.reason, 'disabled'); assert.equal(await count(r, 'citizen_tessera_exchanges'), 2);
});

test('square purchases are unaffected by the exchange flag, and the exchange flag does not open them', async t => {
  const r = await localRuntime(); t.after(() => r.close()); await fund(r, 'alice', 5000);
  for (const exchangeOn of [false, true]) {
    r.setTesseraExchange(exchangeOn); r.setSquarePurchase(false);
    assert.equal((await square(r, 'alice', 9, 8)).data.reason, 'disabled', `squares stay closed with the exchange flag ${exchangeOn}`);
  }
  r.setTesseraExchange(false); r.setSquarePurchase(true);
  const bought = await square(r, 'alice', 9, 8); assert.equal(bought.status, 200, JSON.stringify(bought.data));
  r.setTesseraExchange(true); assert.equal((await square(r, 'alice', 9, 9)).status, 200, 'and with both on');
});

test('the kiosk open state (GET kiosk.open) reports the exchange flag, and the top-level open stays the square flag', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  let view = await kioskOpen(r); assert.equal(view.open, false); assert.equal(view.kiosk.open, false);
  r.setSquarePurchase(true); view = await kioskOpen(r); assert.equal(view.open, true, 'squares open'); assert.equal(view.kiosk.open, false, 'the kiosk does not');
  r.setSquarePurchase(false); r.setTesseraExchange(true); view = await kioskOpen(r); assert.equal(view.open, false); assert.equal(view.kiosk.open, true);
  assert.deepEqual(Object.keys(view.kiosk).sort(), ['maxTesseraMinor', 'minTesseraMinor', 'open', 'sparkPerTessera']);
});
