/** #844 follow-up (ARC on #845): fixed-lot listing sales are taxed like order-book fills (seller-paid, Kindle seller, same flag), and the budget card
 *  gets a "Sales tax today" line behind the same flag. Flag off: no tax row, no tax INSERT on buy-listing, no new budget field or tax read. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

async function lots(t, { tax = true, backend = 'sqlite' } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_KINDLE_SALES_TAX_ENABLED', tax ? 'true' : undefined);
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  await r.db.batch([
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,50000,1)").bind(randomUUID(), 'alice'),
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'buy','food',5,-1,1)").bind(randomUUID(), 'bob'),
  ]);
  const wallet = async u => Number((await r.db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?').bind(u).first()).balance);
  const { kindleTreasuryBalanceSql } = await r.importModule('lib/economy.ts');
  const treasury = async () => Number((await r.db.prepare(kindleTreasuryBalanceSql).first()).balance);
  const sell = async (qty, unitMinor) => {
    const listingId = randomUUID();
    assert.equal((await r.call('citizen', 'bob', { action: 'create-listing', requestId: listingId, item: 'food', quantity: qty, unitMinor })).status, 200);
    return listingId;
  };
  const buy = listingId => r.call('citizen', 'alice', { action: 'buy-listing', requestId: randomUUID(), listingId });
  const taxes = async () => (await r.db.prepare('SELECT seller_id, tax_minor FROM player_fill_sales_tax ORDER BY request_id').all()).results.map(x => ({ ...x, tax_minor: Number(x.tax_minor) }));
  return { r, wallet, treasury, sell, buy, taxes };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag on, a fixed-lot sale pays 5% from the seller to kindle-treasury; buyer pays the listed price; reconciliation balances`, async t => {
    const { r, wallet, treasury, sell, buy, taxes } = await lots(t, { backend });
    const id = await sell(2, 1000);                         // gross 2000 -> tax 100
    const bob0 = await wallet('bob'), alice0 = await wallet('alice'), tr0 = await treasury();
    assert.equal((await buy(id)).status, 200);
    assert.deepEqual(await taxes(), [{ seller_id: 'bob', tax_minor: 100 }]);
    assert.equal(await wallet('bob'), bob0 + 2000 - 100); assert.equal(await wallet('alice'), alice0 - 2000); assert.equal(await treasury(), tr0 + 100);
    const rec = await (await r.importModule('lib/ledger-reconciliation.ts')).reconcileLedger(r.db);
    assert.equal(rec.mismatchCount, 0, JSON.stringify(rec.mismatches));
  });

  test(`${backend}: flag off, a fixed-lot sale writes no tax row, runs no tax statement, and the seller gets the full price`, async t => {
    const { r, wallet, treasury, sell, buy, taxes } = await lots(t, { backend, tax: false });
    const id = await sell(2, 1000); const bob0 = await wallet('bob'), tr0 = await treasury();
    const seen = [], prepare = r.db.prepare.bind(r.db); r.db.prepare = q => { seen.push(q); return prepare(q); };
    try { assert.equal((await buy(id)).status, 200); } finally { r.db.prepare = prepare; }
    assert.deepEqual(seen.filter(q => /sales_tax/.test(q)), []);
    assert.deepEqual(await taxes(), []); assert.equal(await wallet('bob'), bob0 + 2000); assert.equal(await treasury(), tr0);
  });

  test(`${backend}: QA1: a fixed-lot sale by a non-Kindle seller writes no player_fill_sales_tax row; the seller keeps the full price`, async t => {
    const { r, wallet, treasury, taxes } = await lots(t, { backend });
    await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
    // The fill route refuses non-Kindle sellers, so the fill row is a fixture; the tax SQL is the one the route passes.
    await r.db.prepare("INSERT INTO player_listings (id,seller_id,item,quantity,unit_minor,created_at) VALUES ('NK1','bob','food',2,1000,1)").run();
    await r.db.prepare("INSERT INTO player_fills (request_id,listing_id,buyer_id,seller_id,item,quantity,amount_minor,filled_at) VALUES ('NKF','NK1','alice','bob','food',2,2000,2)").run();
    const bob0 = await wallet('bob'), tr0 = await treasury();
    const { playerFillSalesTaxSql } = await r.importModule('lib/kindle-sales-tax.ts');
    await r.db.prepare(playerFillSalesTaxSql).bind('NKF').run();
    assert.deepEqual(await taxes(), []); assert.equal(await wallet('bob'), bob0); assert.equal(await treasury(), tr0);
  });

  test(`${backend}: QA1: a 0-tax fixed-lot sale (gross 19) lands the fill with no tax row`, async t => {
    const { r, wallet, sell, buy, taxes } = await lots(t, { backend });
    const id = await sell(1, 19); const bob0 = await wallet('bob');
    assert.equal((await buy(id)).status, 200);
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM player_fills WHERE listing_id=?').bind(id).first()).n), 1);
    assert.deepEqual(await taxes(), []); assert.equal(await wallet('bob'), bob0 + 19);
  });

  test(`${backend}: budget "Sales tax today" sums both markets for this game day only; flag off has no field`, async t => {
    const { r } = await lots(t, { backend });
    const b = await r.importModule('lib/kindle-budget.ts');
    const now = 1_800_000_000, day = Math.floor(now / 7200) * 7200;
    const fixture = [
      "INSERT INTO player_listings (id,seller_id,item,quantity,unit_minor,created_at) VALUES ('L1','bob','food',1,100,1)",
      "INSERT INTO player_listings (id,seller_id,item,quantity,unit_minor,created_at) VALUES ('L2','bob','food',1,100,1)",
      `INSERT INTO player_fills (request_id,listing_id,buyer_id,seller_id,item,quantity,amount_minor,filled_at) VALUES ('F1','L1','alice','bob','food',1,100,${day - 1})`,
      `INSERT INTO player_fills (request_id,listing_id,buyer_id,seller_id,item,quantity,amount_minor,filled_at) VALUES ('F2','L2','alice','bob','food',1,100,${day})`,
      `INSERT INTO player_fill_sales_tax (request_id,seller_id,tax_minor,charged_at) VALUES ('F1','bob',7,${day - 1})`,
      `INSERT INTO player_fill_sales_tax (request_id,seller_id,tax_minor,charged_at) VALUES ('F2','bob',5,${day})`,
    ];
    for (const q of fixture) await r.db.prepare(q).run();
    const on = await b.readKindleBudget(r.db, now, 15, { salesTax: true });
    assert.equal(on.salesTaxTodayMinor, 5, 'yesterday excluded');
    const off = await b.readKindleBudget(r.db, now, 15);
    assert.equal('salesTaxTodayMinor' in off, false);
  });
}

test('budget card: "Sales tax today" row only when the field is present; route passes the flag; rate is a named constant; migrations', async () => {
  const card = await readFile(new URL('../app/kindle-budget-card.tsx', import.meta.url), 'utf8');
  assert.match(card, /budget\.salesTaxTodayMinor !== undefined \? <><dt>Sales tax today<\/dt>/);
  const route = await readFile(new URL('../app/api/kindle/budget/route.ts', import.meta.url), 'utf8');
  assert.match(route, /kindleSalesTaxEnabled\(e\) \? \{ salesTax: true \} : \{\}/);
  const lib = await readFile(new URL('../lib/kindle-sales-tax.ts', import.meta.url), 'utf8');
  assert.match(lib, /export const kindleSalesTaxBps = 500;/); assert.equal((lib.match(/\* \$\{kindleSalesTaxBps\}/g) ?? []).length, 4, 'every SQL uses the constant');
  for (const f of ['../drizzle/0083_kindle_fill_sales_tax.sql', '../db/postgres/0083_kindle_fill_sales_tax.sql']) {
    const sql = await readFile(new URL(f, import.meta.url), 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS player_fill_sales_tax/);
    assert.match(sql, /- COALESCE\(\(SELECT SUM\(tax_minor\) FROM player_fill_sales_tax WHERE seller_id = c\.clerk_user_id\), 0\)/); assert.match(sql, /kindle-sales-tax-v2/);
  }
});
