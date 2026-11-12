/** #1364: a same-nation buy pays the anti-snowball price for the count at insert time. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = 'HARIMU_SQUARE_PRICE_ANTI_SNOWBALL_ENABLED';
const buy = (r, user, x, y, requestId = randomUUID()) => r.call('world/registry', user, { action: 'buy-square', x, y, requestId });
const priceOf = async (r, id) => Number((await r.db.prepare('SELECT price_minor FROM world_square_purchases WHERE request_id=?').bind(id).first()).price_minor);
const ledger = async (r, id) => await r.db.prepare('SELECT delta_minor FROM citizen_tessera_ledger WHERE id=?').bind(`tsr-square-${id}`).first();

async function setTessera(r, user, minor) {
  await r.db.prepare('DELETE FROM citizen_tessera_ledger WHERE clerk_user_id=?').bind(user).run();
  await r.db.prepare('DELETE FROM citizen_tessera_exchanges WHERE clerk_user_id=?').bind(user).run();
  if (minor > 0) await r.db.prepare("INSERT INTO citizen_tessera_exchanges(request_id,clerk_user_id,nation_id,spark_minor,tessera_minor,occurred_at) VALUES (?,?,'kindle',?,?,0)").bind(randomUUID(), user, minor * 4, minor).run();
}
async function oneOwned(r) {
  await r.db.prepare("UPDATE world_squares SET owner=NULL WHERE owner='kindle'").run();
  await r.db.prepare('DELETE FROM world_squares WHERE y<0').run();
  await r.db.prepare("UPDATE world_squares SET owner=NULL, zone='wildlands' WHERE (x=9 AND y=8) OR (x=8 AND y=8)").run();
  await r.db.prepare('DELETE FROM world_square_purchases').run();
  await r.db.prepare("UPDATE world_squares SET owner='kindle' WHERE x=8 AND y=7").run();
}

for (const backend of ['sqlite', 'postgres']) test(`concurrent same-nation buys pay the count at insert time (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setSquarePurchase(true); r.setFixtureEnv(FLAG, 'true');
  await oneOwned(r); await setTessera(r, 'alice', 10000);
  const [a, b] = [randomUUID(), randomUUID()];
  const [first, second] = await Promise.all([buy(r, 'alice', 9, 8, a), buy(r, 'alice', 8, 8, b)]);
  assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(second.status, 200, JSON.stringify(second.data));
  assert.deepEqual([await priceOf(r, a), await priceOf(r, b)].sort((x, y) => x - y), [2503, 2505]);
  assert.deepEqual([first.data.priceMinor, second.data.priceMinor].sort((x, y) => x - y), [2503, 2505]);
  assert.equal(Number((await ledger(r, a)).delta_minor) + Number((await ledger(r, b)).delta_minor), -(2503 + 2505));
  assert.equal(Number((await r.db.prepare("SELECT COUNT(*) AS n FROM world_squares WHERE owner='kindle' AND x IN (8,9) AND y=8").first()).n), 2);
});

for (const backend of ['sqlite', 'postgres']) test(`the insert balance guard uses the computed price (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setSquarePurchase(true); r.setFixtureEnv(FLAG, 'true');
  await oneOwned(r); await setTessera(r, 'alice', 2500);
  const prepare = r.db.prepare.bind(r.db); const seen = [];
  r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
  const broke = await buy(r, 'alice', 9, 8);
  r.db.prepare = prepare;
  assert.equal(broke.data.reason, 'insufficient_tessera'); assert.match(broke.data.error, /costs 25\.03 TSR; you hold 25\.00 TSR/);
  const insert = seen.find(sql => sql.startsWith('INSERT INTO world_square_purchases'));
  assert.match(insert, /SELECT COUNT\(\*\) FROM world_squares WHERE owner=\?/);
  assert.match(insert, />= \(\(2500\*\(1000\+\(SELECT COUNT\(\*\) FROM world_squares WHERE owner=\?\)\)\+500\)\/1000\)/);
  assert.equal(await r.db.prepare('SELECT request_id FROM world_square_purchases WHERE x=9 AND y=8').first(), null);
  assert.equal(await r.db.prepare("SELECT COUNT(*) AS n FROM citizen_tessera_ledger WHERE reason='square-purchase'").first().then(row => Number(row.n)), 0);
  assert.equal((await r.db.prepare('SELECT owner FROM world_squares WHERE x=9 AND y=8').first()).owner, null);
});
