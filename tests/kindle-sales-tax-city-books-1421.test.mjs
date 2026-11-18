/** #1421: Kindle sales tax on every Kindle city book (docs §12.2). Same 500 bps, same flag, seller-paid to kindle-treasury. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { citiesForNation, gatedResidentCitiesForNation, outpostCityForNation, residentCitiesForNation } from '../lib/cities.ts';
import { kindleMarketCityId, kindleSalesTaxBps, kindleSalesTaxMinor } from '../lib/kindle-sales-tax.ts';

const BOOKS = 'HARIMU_CITY_LOCAL_BOOKS_ENABLED';
const TAX = 'HARIMU_KINDLE_SALES_TAX_ENABLED';

test('bps stays 500, the legacy venue stays kindle, and the SQL lists every Kindle city from the catalog', async () => {
  assert.equal(kindleSalesTaxBps, 500);
  assert.equal(kindleSalesTaxMinor(4000), 200);
  assert.equal(kindleMarketCityId, 'kindle');
  const src = await readFile(new URL('../lib/kindle-sales-tax.ts', import.meta.url), 'utf8');
  assert.match(src, /export const kindleSalesTaxBps = 500;/);
  assert.match(src, /citiesForNation\('kindle'\)/);
  assert.match(src, /outpostCityForNation\('kindle'\)/);
  assert.match(src, /gatedResidentCitiesForNation\('kindle'\)/);
  const { kindleSalesTaxSql } = await import('../lib/kindle-sales-tax.ts');
  const ids = new Set([kindleMarketCityId, ...citiesForNation('kindle').map(c => c.id), ...residentCitiesForNation('kindle').map(c => c.id), ...gatedResidentCitiesForNation('kindle').map(c => c.id), outpostCityForNation('kindle').id]);
  assert.equal(outpostCityForNation('kindle').id, 'ashby-crossing');
  assert.ok(ids.has('forgehaven') && ids.has('tarrek-foundry') && ids.has('brasswell-port') && ids.has('emberwell'));
  for (const id of ids) assert.match(kindleSalesTaxSql, new RegExp(`'${id}'`));
  for (const id of ['watchfast', 'highspire', 'stonehearth', 'aurelle', 'meesa-ford']) assert.doesNotMatch(kindleSalesTaxSql, new RegExp(`'${id}'`));
  assert.match(kindleSalesTaxSql, /s\.citizen_id IS NOT NULL/);
  assert.match(kindleSalesTaxSql, /\(t\.qty \* t\.unit_minor \* 500\) \/ 10000 > 0/);
});

async function market(t, { tax = true, books = false, backend = 'sqlite' } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close()); r.setOrderBook(true);
  r.setFixtureEnv(TAX, tax ? 'true' : undefined);
  r.setFixtureEnv(BOOKS, books ? 'true' : 'false');
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  const fund = (u, cash, fruit) => r.db.batch([
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), u, cash),
    ...(fruit ? [r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'buy','fruit',?,-1,1)").bind(randomUUID(), u, fruit)] : []),
  ]);
  await fund('alice', 50000, 0); await fund('bob', 1000, 10);
  const wallet = async u => Number((await r.db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?').bind(u).first()).balance);
  const { kindleTreasuryBalanceSql } = await r.importModule('lib/economy.ts');
  const treasury = async () => Number((await r.db.prepare(kindleTreasuryBalanceSql).first()).balance);
  const at = (u, city) => r.db.prepare('INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET home_city_id=excluded.home_city_id, current_city_id=excluded.current_city_id').bind(u, 'kindle', city, city, 1).run();
  const place = (u, side, qty, price) => r.call('market/orders', u, { action: 'market-order-place', requestId: randomUUID(), side, good: 'fruit', qty, limitUnitMinor: price });
  const taxes = async () => {
    const rows = (await r.db.prepare(`SELECT s.city_id, tax.seller_id, tax.tax_minor FROM market_sales_tax tax
      JOIN market_trades tr ON tr.id = tax.trade_id JOIN market_orders s ON s.id = tr.sell_order_id`).all()).results;
    return Object.fromEntries(rows.map(row => [row.city_id, { seller_id: row.seller_id, tax_minor: Number(row.tax_minor) }]));
  };
  const reconcile = async () => (await (await r.importModule('lib/ledger-reconciliation.ts')).reconcileLedger(r.db));
  return { r, wallet, treasury, at, place, taxes, reconcile };
}

async function parkedTrade(r, { seller, city, npc = false }) {
  const id = `t-${city}-${npc ? 'npc' : seller}`;
  await r.db.batch([
    r.db.prepare("INSERT INTO market_orders (id,city_id,citizen_id,npc_id,side,good,qty,limit_unit_minor,created_at) VALUES (?,?,?,?,'sell','fruit',4,1000,1)").bind(`so-${id}`, city, npc ? null : seller, npc ? 'kindle-farm' : null),
    r.db.prepare("INSERT INTO market_orders (id,city_id,citizen_id,npc_id,side,good,qty,limit_unit_minor,created_at) VALUES (?,?,'alice',NULL,'buy','fruit',4,1000,1)").bind(`bo-${id}`, city),
    r.db.prepare("INSERT INTO market_trades (id,buy_order_id,sell_order_id,good,qty,unit_minor,filled_at) VALUES (?,?,?,'fruit',4,1000,2)").bind(id, `bo-${id}`, `so-${id}`),
  ]);
  const { kindleSalesTaxSql } = await r.importModule('lib/kindle-sales-tax.ts');
  await r.db.prepare(kindleSalesTaxSql).bind(id).run();
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: local books off taxes the kindle venue and leaves a non-Kindle venue untaxed`, async t => {
    const { r, wallet, treasury, place, taxes } = await market(t, { backend, books: false });
    const bob0 = await wallet('bob'), alice0 = await wallet('alice'), tr0 = await treasury();
    assert.equal((await place('bob', 'sell', 4, 1000)).status, 200);
    assert.equal((await place('alice', 'buy', 4, 1000)).status, 200);
    assert.equal((await r.db.prepare("SELECT city_id FROM market_orders WHERE citizen_id='bob'").first()).city_id, 'kindle');
    assert.deepEqual(await taxes(), { kindle: { seller_id: 'bob', tax_minor: 200 } });
    assert.equal(await wallet('bob'), bob0 + 4000 - 200);
    assert.equal(await wallet('alice'), alice0 - 4000);
    assert.equal(await treasury(), tr0 + 200);
    await parkedTrade(r, { seller: 'bob', city: 'aurelle' });
    assert.deepEqual(await taxes(), { kindle: { seller_id: 'bob', tax_minor: 200 } });
  });

  test(`${backend}: Kindle city books remit 500 bps; other cities and an NPC seller do not`, async t => {
    const { r, wallet, treasury, at, place, taxes, reconcile } = await market(t, { backend, books: true });
    const bob0 = await wallet('bob'), alice0 = await wallet('alice'), tr0 = await treasury();
    const fills = [['forgehaven', 4, 200], ['tarrek-foundry', 2, 100], ['brasswell-port', 2, 100]];
    for (const [city, qty] of fills) {
      await at('alice', city); await at('bob', city);
      assert.equal((await place('bob', 'sell', qty, 1000)).status, 200, city);
      assert.equal((await place('alice', 'buy', qty, 1000)).status, 200, city);
    }
    await parkedTrade(r, { seller: 'bob', city: 'ashby-crossing' });
    assert.deepEqual(await taxes(), {
      forgehaven: { seller_id: 'bob', tax_minor: 200 },
      'tarrek-foundry': { seller_id: 'bob', tax_minor: 100 },
      'brasswell-port': { seller_id: 'bob', tax_minor: 100 },
      'ashby-crossing': { seller_id: 'bob', tax_minor: 200 },
    });
    const gross = 4 * 1000 + 2 * 1000 + 2 * 1000 + 4 * 1000, tax = 200 + 100 + 100 + 200;
    assert.equal(await wallet('bob'), bob0 + gross - tax);
    assert.equal(await wallet('alice'), alice0 - gross);
    assert.equal(await treasury(), tr0 + tax);
    assert.equal((await reconcile()).mismatchCount, 0);
    const before = await taxes();
    for (const city of ['watchfast', 'highspire', 'stonehearth']) await parkedTrade(r, { seller: 'bob', city });
    await parkedTrade(r, { city: 'forgehaven', npc: true });
    assert.deepEqual(await taxes(), before);
  });

  test(`${backend}: sales tax flag off writes no row on a Forgehaven fill`, async t => {
    const { r, wallet, treasury, at, place, taxes } = await market(t, { backend, books: true, tax: false });
    await at('alice', 'forgehaven'); await at('bob', 'forgehaven');
    const bob0 = await wallet('bob'), tr0 = await treasury();
    const seen = [], prepare = r.db.prepare.bind(r.db); r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
    assert.equal((await place('bob', 'sell', 4, 1000)).status, 200);
    assert.equal((await place('alice', 'buy', 4, 1000)).status, 200);
    r.db.prepare = prepare;
    assert.equal((await r.db.prepare("SELECT city_id FROM market_orders WHERE citizen_id='bob'").first()).city_id, 'forgehaven');
    assert.deepEqual(seen.filter(sql => /market_sales_tax/.test(sql)), []);
    assert.deepEqual(await taxes(), {});
    assert.equal(await wallet('bob'), bob0 + 4000);
    assert.equal(await treasury(), tr0);
  });
}
