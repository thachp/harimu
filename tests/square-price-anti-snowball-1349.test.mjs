/** #1349: World Registry square price rises with land the nation already owns (docs §15.1). SQLite and PGlite.
 *  Flag off keeps 25.00 TSR and the #122 purchase SQL. HARIMU_SQUARE_PURCHASE_ENABLED stays the purchase gate. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = 'HARIMU_SQUARE_PRICE_ANTI_SNOWBALL_ENABLED';
const COUNT_SQL = 'SELECT COUNT(*) AS n FROM world_squares WHERE owner=?';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const buy = (r, user, requestId = randomUUID()) => r.call('world/registry', user, { action: 'buy-square', x: 9, y: 8, requestId });
const priceOf = async (r, user) => (await r.call('world/registry', user)).data.priceMinor;
const tessera = async (r, user) => (await r.call('world/registry', user)).data.tesseraMinor;
const owned = async r => Number((await r.db.prepare("SELECT COUNT(*) AS n FROM world_squares WHERE owner='kindle'").first()).n);
const stored = async (r, id) => Number((await r.db.prepare('SELECT price_minor FROM world_square_purchases WHERE request_id=?').bind(id).first()).price_minor);

function purchaseSql(balanceSql) {
  return [
    'SELECT nation_id FROM citizens WHERE clerk_user_id=?',
    'SELECT clerk_user_id,nation_id,x,y,price_minor FROM world_square_purchases WHERE request_id=?',
    'SELECT x,y,zone,owner FROM world_squares',
    `SELECT ${balanceSql} AS balance`,
    `INSERT INTO world_square_purchases(request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM world_squares WHERE x=? AND y=? AND zone='wildlands' AND owner IS NULL)
      AND EXISTS (SELECT 1 FROM world_squares WHERE owner=? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND NOT (x=? AND y=?))
      AND ${balanceSql} >= ?
      ON CONFLICT DO NOTHING`,
    `INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at)
      SELECT ?,?,?,'square-purchase',? WHERE EXISTS (SELECT 1 FROM world_square_purchases WHERE request_id=? AND clerk_user_id=?)
      ON CONFLICT DO NOTHING`,
    "UPDATE world_squares SET owner=?, zone='frontier' WHERE x=? AND y=? AND EXISTS (SELECT 1 FROM world_square_purchases WHERE request_id=? AND x=? AND y=?)",
    'SELECT request_id FROM world_square_purchases WHERE request_id=?',
    `SELECT ${balanceSql} AS balance`,
  ];
}

async function spy(r, fn) {
  const prepare = r.db.prepare.bind(r.db), sql = [];
  r.db.prepare = q => { sql.push(q); return prepare(q); };
  try { return { result: await fn(), sql }; } finally { r.db.prepare = prepare; }
}

async function setTessera(r, user, minor) {
  await r.db.prepare('DELETE FROM citizen_tessera_ledger WHERE clerk_user_id=?').bind(user).run();
  await r.db.prepare('DELETE FROM citizen_tessera_exchanges WHERE clerk_user_id=?').bind(user).run();
  if (minor > 0) await r.db.prepare("INSERT INTO citizen_tessera_exchanges(request_id,clerk_user_id,nation_id,spark_minor,tessera_minor,occurred_at) VALUES (?,?,'kindle',?,?,0)").bind(randomUUID(), user, minor * 4, minor).run();
}

/** Leave Kindle owning exactly `n` squares, with (8,7) kept when n > 0 so (9,8) stays adjacent. Extras sit off the grid. */
async function setOwned(r, n) {
  await r.db.prepare("UPDATE world_squares SET owner=NULL WHERE owner='kindle'").run();
  await r.db.prepare('DELETE FROM world_squares WHERE y<0').run();
  await r.db.prepare("UPDATE world_squares SET owner=NULL, zone='wildlands' WHERE x=9 AND y=8").run();
  await r.db.prepare('DELETE FROM world_square_purchases').run();
  if (n > 0) await r.db.prepare("UPDATE world_squares SET owner='kindle' WHERE x=8 AND y=7").run();
  if (n > 1) {
    const values = Array.from({ length: n - 1 }, () => "(?,-1,'wildlands','kindle','plains',NULL,NULL)").join(',');
    await r.db.prepare(`INSERT INTO world_squares (x,y,zone,owner,terrain,resource,feature) VALUES ${values}`).bind(...Array.from({ length: n - 1 }, (_, i) => 1000 + i)).run();
  }
}

test('the anti-snowball flag is at index 87 in HARIMU_GRAY_PACK (after grace, before party chat), preview on and production off, and is not its own binding', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_BETTER_AUTH_ENABLED'), 81);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_WORLD_ID_ENABLED'), 82);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_SQUARE_POSTERS_ENABLED'), 83);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_CONGREGATION_DONATIONS_ENABLED'), 84);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_CONGREGATION_CHAT_ENABLED'), 85);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_GRACE_ALL_POLITICAL_ACTIONS_ENABLED'), 86);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG), 87);
  assert.equal(preview.vars[FLAG], undefined); assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_SQUARE_PURCHASE_ENABLED, 'false'); assert.equal(prod.vars.HARIMU_SQUARE_PURCHASE_ENABLED, 'false');
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true'); assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [FLAG]: 'false' }, FLAG), false, 'a direct string wins');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf('HARIMU_BETTER_AUTH_ENABLED'), 81);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf('HARIMU_BETTER_AUTH_ENABLED'), 81);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf('HARIMU_GRACE_ALL_POLITICAL_ACTIONS_ENABLED'), 86);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf('HARIMU_GRACE_ALL_POLITICAL_ACTIONS_ENABLED'), 86);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 87);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 87);
});

for (const backend of ['sqlite', 'postgres']) test(`square price follows owned land (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setSquarePurchase(true); r.setFixtureEnv(FLAG, 'true');
  const m = await r.importModule('lib/world-registry.ts');
  const balanceSql = (await r.importModule('lib/tessera-exchange.ts')).tesseraBalanceSql;
  const today = purchaseSql(balanceSql);
  assert.equal(m.squarePriceMinor, 2500);
  assert.equal(m.squareChargeMinor(0), 2500);
  assert.equal(m.squareChargeMinor(1), 2503); // 2500 × 1.001 = 2502.5, half up
  assert.equal(m.squareChargeMinor(2), 2505);
  assert.equal(m.squareChargeMinor(1000), 5000);

  await setOwned(r, 0); assert.equal(await owned(r), 0);
  await setTessera(r, 'alice', 10000);
  assert.equal(await priceOf(r, 'alice'), 2500); assert.equal((await r.call('world/registry', 'alice')).data.currency, 'TSR');
  const none = await buy(r, 'alice');
  assert.equal(none.data.reason, 'not_adjacent', 'owned 0 still cannot buy: adjacency is unchanged');
  assert.equal(await tessera(r, 'alice'), 10000, 'nothing is charged');

  await setOwned(r, 1); assert.equal(await owned(r), 1);
  await setTessera(r, 'alice', 2502);
  assert.equal(await priceOf(r, 'alice'), 2503);
  const broke = await buy(r, 'alice');
  assert.equal(broke.data.reason, 'insufficient_tessera'); assert.match(broke.data.error, /costs 25\.03 TSR; you hold 25\.02 TSR/);
  assert.equal(await r.db.prepare('SELECT request_id FROM world_square_purchases WHERE x=9 AND y=8').first(), null);

  await setTessera(r, 'alice', 2503);
  const listed = await priceOf(r, 'alice');
  const id = randomUUID();
  const bought = await spy(r, () => buy(r, 'alice', id));
  assert.equal(bought.result.status, 200, JSON.stringify(bought.result.data));
  assert.equal(bought.result.data.priceMinor, 2503); assert.equal(bought.result.data.priceMinor, listed, 'listing matches the charge');
  assert.equal(await stored(r, id), 2503);
  assert.equal(Number((await r.db.prepare('SELECT delta_minor FROM citizen_tessera_ledger WHERE id=?').bind(`tsr-square-${id}`).first()).delta_minor), -2503);
  assert.equal(await tessera(r, 'alice'), 0);
  const live = m.squareLivePriceSql;
  const onSql = [...today];
  onSql[4] = `INSERT INTO world_square_purchases(request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at)
      SELECT ?,?,?,?,?,${live},? WHERE EXISTS (SELECT 1 FROM world_squares WHERE x=? AND y=? AND zone='wildlands' AND owner IS NULL)
      AND EXISTS (SELECT 1 FROM world_squares WHERE owner=? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND NOT (x=? AND y=?))
      AND ${balanceSql} >= ${live}
      ON CONFLICT DO NOTHING`;
  onSql[5] = `INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at)
      SELECT ?,?,-price_minor,'square-purchase',? FROM world_square_purchases WHERE request_id=? AND clerk_user_id=?
      ON CONFLICT DO NOTHING`;
  onSql[7] = 'SELECT price_minor FROM world_square_purchases WHERE request_id=?';
  assert.equal(bought.sql.includes(COUNT_SQL), false, 'flag on does not pre-read the owned count');
  assert.deepEqual(bought.sql, onSql, 'flag on prices the insert from the live owned count and debits that stored price');
  assert.equal(await priceOf(r, 'alice'), 2505, 'the bought square counts toward the next price');
  await r.db.prepare("INSERT INTO world_squares (x,y,zone,owner,terrain,resource,feature) VALUES (2999,-1,'wildlands','kindle','plains',NULL,NULL)").run();
  const replay = await buy(r, 'alice', id);
  assert.equal(replay.data.replay, true); assert.equal(replay.data.priceMinor, 2503, 'replay returns the stored price');
  assert.equal(await tessera(r, 'alice'), 0);

  await setOwned(r, 1000); assert.equal(await owned(r), 1000);
  await setTessera(r, 'alice', 4999);
  assert.equal(await priceOf(r, 'alice'), 5000);
  const short = await buy(r, 'alice');
  assert.equal(short.data.reason, 'insufficient_tessera'); assert.match(short.data.error, /costs 50\.00 TSR; you hold 49\.99 TSR/);
  await setTessera(r, 'alice', 5000);
  const listed1000 = await priceOf(r, 'alice'), id2 = randomUUID();
  const big = await buy(r, 'alice', id2);
  assert.equal(big.status, 200, JSON.stringify(big.data));
  assert.equal(big.data.priceMinor, 5000); assert.equal(big.data.priceMinor, listed1000, 'listing matches the charge');
  assert.equal(await stored(r, id2), 5000); assert.equal(await tessera(r, 'alice'), 0);
  assert.equal((await buy(r, 'alice', id2)).data.priceMinor, 5000);

  await setOwned(r, 1000); await setTessera(r, 'alice', 5000);
  r.setFixtureEnv(FLAG, undefined);
  const hidden = await spy(r, () => r.call('world/registry', 'alice'));
  assert.equal(hidden.result.data.priceMinor, 2500, 'flag off listing stays 2500');
  assert.equal(hidden.sql.includes(COUNT_SQL), false, 'flag off listing does not count owned squares');
  const offId = randomUUID();
  const offBuy = await spy(r, () => buy(r, 'alice', offId));
  assert.equal(offBuy.result.status, 200, JSON.stringify(offBuy.result.data));
  assert.equal(offBuy.result.data.priceMinor, 2500); assert.equal(await stored(r, offId), 2500);
  assert.deepEqual(offBuy.sql, today, 'flag off purchase SQL is the #122 path');
  r.setFixtureEnv(FLAG, 'false');
  await setOwned(r, 1); await setTessera(r, 'alice', 2500);
  const offId2 = randomUUID(), offAgain = await buy(r, 'alice', offId2);
  assert.equal(offAgain.data.priceMinor, 2500); assert.equal(await stored(r, offId2), 2500);

  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [FLAG]: 'true' })); r.setFixtureEnv(FLAG, 'false');
  await setOwned(r, 1);
  assert.equal(await priceOf(r, 'alice'), 2500, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [FLAG]: 'false' })); r.setFixtureEnv(FLAG, 'true');
  assert.equal(await priceOf(r, 'alice'), 2503, 'a direct true wins over the pack');

  r.setSquarePurchase(false);
  const before = await tessera(r, 'alice');
  const gated = await spy(r, () => buy(r, 'alice'));
  assert.equal(gated.result.data.reason, 'disabled'); assert.deepEqual(gated.sql, [], 'purchase flag off still answers before any statement');
  assert.equal(await tessera(r, 'alice'), before);
  assert.equal((await r.db.prepare('SELECT owner FROM world_squares WHERE x=9 AND y=8').first()).owner, null);
});
