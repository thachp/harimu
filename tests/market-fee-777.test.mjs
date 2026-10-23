/** #777 goods-market seller fee as a money sink (docs 12.4, 12.10), behind HARIMU_MARKET_FEE_ENABLED. Written with the fill (POST); GET is read-only. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { marketFeeBps, marketFeeMinor, marketFeeLabel } from '../lib/market-fee.ts';

test('fee math: 0.5% in integer minor units, rounded down; tiny trades pay 0', () => {
  assert.equal(marketFeeBps, 50);
  assert.equal(marketFeeMinor(199), 0); assert.equal(marketFeeMinor(200), 1); assert.equal(marketFeeMinor(399), 1); assert.equal(marketFeeMinor(400), 2);
  assert.equal(marketFeeMinor(100000 * 1000), 500000); assert.ok(Number.isInteger(marketFeeMinor(12345)));
  assert.equal(marketFeeLabel(150), 'Market fee: 1.50 SPK');
});

async function market(t, { fee = true, backend = 'sqlite' } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close()); r.setOrderBook(true);
  r.setFixtureEnv('HARIMU_MARKET_FEE_ENABLED', fee ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_LEDGER_RECONCILIATION_ENABLED', 'true');
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  const fund = (u, cash, fruit) => r.db.batch([
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), u, cash),
    ...(fruit ? [r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'buy','fruit',?,-1,1)").bind(randomUUID(), u, fruit)] : []),
  ]);
  await fund('alice', 50000, 0); await fund('bob', 1000, 10);
  const wallet = async u => Number((await r.db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?').bind(u).first()).balance);
  const place = (u, side, qty, price) => r.call('market/orders', u, { action: 'market-order-place', requestId: randomUUID(), side, good: 'fruit', qty, limitUnitMinor: price });
  const fees = async () => (await r.db.prepare('SELECT seller_id, fee_minor FROM market_trade_fees ORDER BY trade_id').all()).results.map(x => ({ ...x, fee_minor: Number(x.fee_minor) }));
  return { r, wallet, place, fees };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag on, the seller receives price minus fee, one sink row per fill, buyer unaffected, reconciliation balances`, async t => {
    const { r, wallet, place, fees } = await market(t, { backend });
    const bob0 = await wallet('bob'), alice0 = await wallet('alice');
    assert.equal((await place('bob', 'sell', 4, 1000)).status, 200);       // gross 4000 -> fee 20
    const res = await place('alice', 'buy', 4, 1000); assert.equal(res.status, 200);
    assert.equal(await wallet('bob'), bob0 + 4000 - 20); assert.equal(await wallet('alice'), alice0 - 4000);
    assert.deepEqual(await fees(), [{ seller_id: 'bob', fee_minor: 20 }]);
    assert.deepEqual(res.data.book.myFees, [], 'the buyer has no fee lines');
    const bobBook = (await r.call('market/orders', 'bob')).data.book;
    assert.equal(bobBook.myFees.length, 1); assert.equal(bobBook.myFees[0].feeMinor, 20);
    assert.equal((alice0 + bob0) - ((await wallet('alice')) + (await wallet('bob'))), 20, 'the fee is destroyed, credited to nobody');
    const m = await r.importModule('lib/ledger-reconciliation.ts'); const rec = await m.reconcileLedger(r.db);
    assert.equal(rec.mismatchCount, 0, JSON.stringify(rec.mismatches));
  });
}

test('tiny trade pays 0 and writes no fee row; resting citizen seller filled by an incoming buy also pays', async t => {
  const { wallet, place, fees } = await market(t);
  const bob0 = await wallet('bob');
  await place('bob', 'sell', 1, 150); await place('alice', 'buy', 1, 150);   // gross 150 -> 0
  assert.deepEqual(await fees(), []); assert.equal(await wallet('bob'), bob0 + 150);
  await place('alice', 'buy', 2, 300); await place('bob', 'sell', 2, 300);   // incoming sell vs resting buy: gross 600 -> 3
  assert.deepEqual(await fees(), [{ seller_id: 'bob', fee_minor: 3 }]); assert.equal(await wallet('bob'), bob0 + 150 + 600 - 3);
});

test('QA3: inserting the fee twice for one trade id leaves one row, no error, and a balanced ledger (relies on OR IGNORE)', async t => {
  const { r, wallet, place, fees } = await market(t);
  await place('bob', 'sell', 4, 1000); await place('alice', 'buy', 4, 1000);
  const { marketFeeSql } = await r.importModule('lib/market-fee.ts');
  assert.match(marketFeeSql, /^INSERT OR IGNORE INTO market_trade_fees/, 'idempotent insert');
  const tradeId = (await r.db.prepare('SELECT trade_id FROM market_trade_fees').first()).trade_id;
  const bob1 = await wallet('bob');
  await r.db.prepare(marketFeeSql).bind(tradeId).run(); await r.db.batch([r.db.prepare(marketFeeSql).bind(tradeId), r.db.prepare(marketFeeSql).bind(tradeId)]);
  assert.deepEqual(await fees(), [{ seller_id: 'bob', fee_minor: 20 }]); assert.equal(await wallet('bob'), bob1, 'no second debit');
  const m = await r.importModule('lib/ledger-reconciliation.ts'); assert.equal((await m.reconcileLedger(r.db)).mismatchCount, 0);
});

test('flag off: no fee row, seller receives full price, no myFees field and no fee query on GET', async t => {
  const { r, wallet, place, fees } = await market(t, { fee: false });
  const bob0 = await wallet('bob');
  await place('bob', 'sell', 4, 1000); await place('alice', 'buy', 4, 1000);
  assert.deepEqual(await fees(), []); assert.equal(await wallet('bob'), bob0 + 4000);
  const seen = [], prepare = r.db.prepare.bind(r.db); r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
  const book = (await r.call('market/orders', 'bob')).data.book; r.db.prepare = prepare;
  assert.equal('myFees' in book, false); assert.equal(seen.filter(s => /market_trade_fees/.test(s)).length, 0);
});

test('GET /market/orders with the fee on makes no writes', async t => {
  const { r, place } = await market(t); await place('bob', 'sell', 4, 1000); await place('alice', 'buy', 4, 1000);
  const seen = [], prepare = r.db.prepare.bind(r.db); r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
  for (let i = 0; i < 3; i++) await r.call('market/orders', 'bob'); r.db.prepare = prepare;
  assert.ok(seen.some(s => /market_trade_fees/.test(s))); assert.deepEqual(seen.filter(s => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP)/i.test(s)), []);
});

test('migrations: both dialects add the fee table and net it in the wallet view', async () => {
  for (const f of ['../drizzle/0071_market_fee.sql', '../db/postgres/0071_market_fee.sql']) {
    const sql = await readFile(new URL(f, import.meta.url), 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS market_trade_fees/); assert.match(sql, /- COALESCE\(\(SELECT SUM\(fee_minor\) FROM market_trade_fees WHERE seller_id = c\.clerk_user_id\), 0\)/);
    assert.match(sql, /market-fee-v1/);
  }
  const board = await readFile(new URL('../app/market-board.tsx', import.meta.url), 'utf8');
  assert.match(board, /book\.myFees\?\.length/); assert.match(board, /marketFeeLabel\(f\.feeMinor\)/);
});
