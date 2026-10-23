/** #844 Kindle sales tax on goods-market fills (docs §12.2, §12.12), behind HARIMU_KINDLE_SALES_TAX_ENABLED. The seller remits 5% of the gross to kindle-treasury. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { kindleSalesTaxBps, kindleSalesTaxMinor, kindleSalesTaxEnabled } from '../lib/kindle-sales-tax.ts';

test('tax math: 5% in integer minor units, rounded down; tiny trades pay 0; flag parses only "true"', () => {
  assert.equal(kindleSalesTaxBps, 500);
  assert.equal(kindleSalesTaxMinor(19), 0); assert.equal(kindleSalesTaxMinor(20), 1); assert.equal(kindleSalesTaxMinor(4000), 200); assert.equal(kindleSalesTaxMinor(4019), 200);
  assert.equal(kindleSalesTaxEnabled({ HARIMU_KINDLE_SALES_TAX_ENABLED: 'true' }), true);
  for (const v of [undefined, 'false', 'TRUE', '1']) assert.equal(kindleSalesTaxEnabled({ HARIMU_KINDLE_SALES_TAX_ENABLED: v }), false);
});

async function market(t, { tax = true, fee = false, backend = 'sqlite' } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close()); r.setOrderBook(true);
  r.setFixtureEnv('HARIMU_KINDLE_SALES_TAX_ENABLED', tax ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_MARKET_FEE_ENABLED', fee ? 'true' : undefined);
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  const fund = (u, cash, fruit) => r.db.batch([
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), u, cash),
    ...(fruit ? [r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'buy','fruit',?,-1,1)").bind(randomUUID(), u, fruit)] : []),
  ]);
  await fund('alice', 50000, 0); await fund('bob', 1000, 10);
  const wallet = async u => Number((await r.db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?').bind(u).first()).balance);
  const { kindleTreasuryBalanceSql } = await r.importModule('lib/economy.ts');
  const treasury = async () => Number((await r.db.prepare(kindleTreasuryBalanceSql).first()).balance);
  const place = (u, side, qty, price) => r.call('market/orders', u, { action: 'market-order-place', requestId: randomUUID(), side, good: 'fruit', qty, limitUnitMinor: price });
  const taxes = async () => (await r.db.prepare('SELECT seller_id, tax_minor FROM market_sales_tax ORDER BY trade_id').all()).results.map(x => ({ ...x, tax_minor: Number(x.tax_minor) }));
  const reconcile = async () => (await (await r.importModule('lib/ledger-reconciliation.ts')).reconcileLedger(r.db));
  return { r, wallet, treasury, place, taxes, reconcile };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag on, the seller remits 5% to kindle-treasury, buyer pays the listed price, reconciliation balances`, async t => {
    const { wallet, treasury, place, taxes, reconcile } = await market(t, { backend });
    const bob0 = await wallet('bob'), alice0 = await wallet('alice'), tr0 = await treasury();
    assert.equal((await place('bob', 'sell', 4, 1000)).status, 200);     // gross 4000 -> tax 200
    assert.equal((await place('alice', 'buy', 4, 1000)).status, 200);
    assert.deepEqual(await taxes(), [{ seller_id: 'bob', tax_minor: 200 }]);
    assert.equal(await wallet('bob'), bob0 + 4000 - 200); assert.equal(await wallet('alice'), alice0 - 4000);
    assert.equal(await treasury(), tr0 + 200, 'the tax is credited to the treasury, not destroyed');
    const rec = await reconcile(); assert.equal(rec.mismatchCount, 0, JSON.stringify(rec.mismatches));
  });

  test(`${backend}: flag off writes no tax row and the seller receives the full price (no change from dev)`, async t => {
    const { r, wallet, treasury, place, taxes } = await market(t, { backend, tax: false });
    const bob0 = await wallet('bob'), tr0 = await treasury();
    const seen = [], prepare = r.db.prepare.bind(r.db); r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
    await place('bob', 'sell', 4, 1000); await place('alice', 'buy', 4, 1000); r.db.prepare = prepare;
    assert.deepEqual(seen.filter(s => /market_sales_tax/.test(s)), [], 'no tax statement at all');
    assert.deepEqual(await taxes(), []); assert.equal(await wallet('bob'), bob0 + 4000); assert.equal(await treasury(), tr0);
  });
}

test('with the fee on too, both rows land per fill; tiny trades and an incoming sell vs a resting buy are handled; idempotent per trade', async t => {
  const { r, wallet, treasury, place, taxes, reconcile } = await market(t, { fee: true });
  const bob0 = await wallet('bob'), tr0 = await treasury();
  await place('bob', 'sell', 1, 15); await place('alice', 'buy', 1, 15);        // gross 15 -> tax 0, fee 0
  assert.deepEqual(await taxes(), []);
  await place('alice', 'buy', 2, 300); await place('bob', 'sell', 2, 300);      // resting buy: gross 600 -> tax 30, fee 3
  assert.deepEqual(await taxes(), [{ seller_id: 'bob', tax_minor: 30 }]);
  assert.equal(await wallet('bob'), bob0 + 15 + 600 - 30 - 3); assert.equal(await treasury(), tr0 + 30);
  const { kindleSalesTaxSql } = await r.importModule('lib/kindle-sales-tax.ts');
  const id = (await r.db.prepare('SELECT trade_id FROM market_sales_tax').first()).trade_id;
  await r.db.prepare(kindleSalesTaxSql).bind(id).run();
  assert.deepEqual(await taxes(), [{ seller_id: 'bob', tax_minor: 30 }], 'no second debit');
  assert.equal((await reconcile()).mismatchCount, 0);
});

test('a non-Kindle seller pays no Kindle sales tax', async t => {
  const { r, place, taxes } = await market(t);
  await place('bob', 'sell', 4, 1000); await place('alice', 'buy', 4, 1000);
  const { kindleSalesTaxSql } = await r.importModule('lib/kindle-sales-tax.ts');
  const id = (await r.db.prepare('SELECT trade_id FROM market_sales_tax').first()).trade_id;
  await r.db.prepare('DELETE FROM market_sales_tax').run();
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  await r.db.prepare(kindleSalesTaxSql).bind(id).run();
  assert.deepEqual(await taxes(), []);
});

test('migrations: both dialects add the table and net it in the wallet view', async () => {
  for (const f of ['../drizzle/0081_kindle_sales_tax.sql', '../db/postgres/0081_kindle_sales_tax.sql']) {
    const sql = await readFile(new URL(f, import.meta.url), 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS market_sales_tax/);
    assert.match(sql, /- COALESCE\(\(SELECT SUM\(tax_minor\) FROM market_sales_tax WHERE seller_id = c\.clerk_user_id\), 0\)/);
    assert.match(sql, /kindle-sales-tax-v1/);
  }
});
