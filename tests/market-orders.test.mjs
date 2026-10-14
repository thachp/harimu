import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { marketGoods, marketSchemas, marketGoodsSeedSql, isMarketGood } from '../lib/market-orders.ts';
import { postgresMigrations, isDestructive } from '../scripts/postgres-migrations.mjs';

const backends = process.env.HARIMU_TEST_STORAGE === 'postgres' ? ['postgres'] : ['d1'];
const one = s => s.replace(/\s*\n\s*/g, ' ').trim();
const wallet = async (r, u) => Number((await r.db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?').bind(u).first()).balance);
const goods = async (r, u, item) => Number((await r.db.prepare('SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id=? AND item=?').bind(u, item).first())?.quantity ?? 0);
const order = (r, id, who, side, good, qty, price) => r.db.prepare('INSERT INTO market_orders (id,city_id,citizen_id,npc_id,side,good,qty,limit_unit_minor,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
  .bind(id, 'kindle', who.startsWith('npc:') ? null : who, who.startsWith('npc:') ? who.slice(4) : null, side, good, qty, price, 1000).run();
const trade = (r, id, buy, sell, good, qty, price) => r.db.prepare('INSERT INTO market_trades (id,buy_order_id,sell_order_id,good,qty,unit_minor,filled_at) VALUES (?,?,?,?,?,?,?)').bind(id, buy, sell, good, qty, price, 1001).run();
const cancel = (r, id, orderId) => r.db.prepare('INSERT INTO market_order_cancellations (request_id,order_id,cancelled_at) VALUES (?,?,?)').bind(id, orderId, 1002).run();

test('#195 catalog: fruit, meat, wood with unit, perishable flag and shelf life', () => {
  assert.deepEqual(marketGoods.map(g => [g.good, g.perishable, g.shelfLifeDays]), [['fruit', true, 3], ['meat', true, 2], ['wood', false, null]]);
  assert.ok(isMarketGood('wood') && !isMarketGood('food') && !isMarketGood('materials'));
});

for (const backend of backends) {
  test(`#195 ${backend}: catalog is seeded and CHECKs reject bad orders and trades`, async t => {
    const r = await localRuntime(); t.after(() => r.close());
    await r.call('citizen', 'alice');
    const rows = (await r.db.prepare('SELECT good,unit,perishable,shelf_life_days FROM market_goods ORDER BY good').all()).results;
    assert.deepEqual(rows.map(x => [x.good, x.unit, Number(x.perishable), x.shelf_life_days === null ? null : Number(x.shelf_life_days)]), marketGoods.map(g => [g.good, g.unit, g.perishable ? 1 : 0, g.shelfLifeDays]));
    for (const [qty, price] of [[0, 10], [-1, 10], [1.5, 10], [1001, 10], [1, 0], [1, -5], [1, 2.5], [1, 100001]])
      await assert.rejects(order(r, `bad-${qty}-${price}`, 'alice', 'buy', 'fruit', qty, price), undefined, `qty ${qty} price ${price}`);
    await assert.rejects(order(r, 'bad-good', 'alice', 'buy', 'food', 1, 10), undefined, 'food is not a market good');
    await assert.rejects(order(r, 'bad-side', 'alice', 'hold', 'fruit', 1, 10));
    await assert.rejects(r.db.prepare("INSERT INTO market_orders (id,city_id,citizen_id,npc_id,side,good,qty,limit_unit_minor,created_at) VALUES ('none','kindle',NULL,NULL,'buy','fruit',1,10,1)").run(), undefined, 'needs exactly one owner');
    await assert.rejects(r.db.prepare("INSERT INTO market_orders (id,city_id,citizen_id,npc_id,side,good,qty,limit_unit_minor,created_at) VALUES ('both','kindle','alice','farm','buy','fruit',1,10,1)").run(), undefined, 'not both owners');
    await order(r, 'b1', 'alice', 'buy', 'fruit', 2, 10); await order(r, 's1', 'npc:farm', 'sell', 'fruit', 2, 10);
    for (const [qty, price] of [[0, 10], [-1, 10], [1, 0], [1.5, 10], [1, 2.5]]) await assert.rejects(trade(r, `t-${qty}-${price}`, 'b1', 's1', 'fruit', qty, price));
    await assert.rejects(trade(r, 'self', 'b1', 'b1', 'fruit', 1, 10), undefined, 'a trade needs two orders');
    assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM market_trades').first()).n * 1, 0);
  });

  test(`#195 ${backend}: escrow and trades in the derived wallet and inventory views`, async t => {
    const r = await localRuntime(); t.after(() => r.close());
    await r.call('citizen', 'alice');
    const base = await wallet(r, 'alice'); const food0 = await goods(r, 'alice', 'food');
    // Open buy reserves remaining × limit.
    await order(r, 'b1', 'alice', 'buy', 'fruit', 10, 50);
    assert.equal(await wallet(r, 'alice'), base - 500, 'buy escrow');
    // A partial fill at the resting (lower) price pays the trade price and releases the excess on the filled part.
    await order(r, 's1', 'npc:farm', 'sell', 'fruit', 4, 40); await trade(r, 't1', 'b1', 's1', 'fruit', 4, 40);
    assert.equal(await wallet(r, 'alice'), base - 160 - 6 * 50, 'paid 4×40, 6×50 still reserved');
    assert.equal(await goods(r, 'alice', 'fruit'), 4);
    assert.equal((await r.db.prepare("SELECT remaining FROM market_open_orders WHERE id='b1'").first()).remaining * 1, 6);
    assert.equal(await r.db.prepare("SELECT id FROM market_open_orders WHERE id='s1'").first(), null, 'fully filled order is not open');
    // Cancel releases only the remainder.
    await cancel(r, 'c1', 'b1');
    assert.equal(await wallet(r, 'alice'), base - 160);
    // Open sell reserves goods; a fill pays the seller.
    await order(r, 's2', 'alice', 'sell', 'fruit', 3, 60);
    assert.equal(await goods(r, 'alice', 'fruit'), 1, 'sell escrow');
    await order(r, 'b2', 'npc:farm', 'buy', 'fruit', 1, 60); await trade(r, 't2', 'b2', 's2', 'fruit', 1, 60);
    assert.equal(await wallet(r, 'alice'), base - 160 + 60);
    assert.equal(await goods(r, 'alice', 'fruit'), 1, '4 bought − 1 sold − 2 still listed');
    await cancel(r, 'c2', 's2');
    assert.equal(await goods(r, 'alice', 'fruit'), 3);
    assert.equal(await goods(r, 'alice', 'wood'), 0);
    // Existing food balance is untouched by market goods (#195 decision: fruit/meat are not meal food).
    assert.equal(await goods(r, 'alice', 'food'), food0);
  });
}

test('#195 migration 0016 matches the runtime schema, is additive on Postgres, and re-applies on D1', async t => {
  const d1 = await readFile('drizzle/0016_market_orders.sql', 'utf8'); const pg = await readFile('db/postgres/0016_market_orders.sql', 'utf8');
  // #199 (0021) adds market_spoilage and supersedes the open-orders view; 0016 keeps the #195 shapes.
  for (const s of [...marketSchemas.filter(s => !s.includes('market_spoilage')), ...marketGoodsSeedSql]) assert.ok(d1.includes(one(s)), s.slice(0, 60));
  const m = postgresMigrations().find(x => x.file === '0016_market_orders.sql');
  assert.ok(m, 'numbered 0016'); assert.deepEqual([...m.tables].sort(), ['market_goods', 'market_order_cancellations', 'market_orders', 'market_trades']);
  assert.ok(!isDestructive(pg), 'Postgres 0016 has no DROP');
  assert.match(pg, /CREATE OR REPLACE VIEW citizen_wallet_balances[\s\S]*market_open_orders/);
  assert.equal(postgresMigrations().filter(x => x.number === '0016').length, 1);
  if (backends[0] !== 'd1') return;
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice'); const before = await wallet(r, 'alice');
  r.db.sqlite.exec(d1); r.db.sqlite.exec(d1);
  assert.equal(await wallet(r, 'alice'), before);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM market_goods').first()).n, 3);
});

test('#195 0016 applies after 0017 is already recorded (out-of-order merge), and the guard passes', async t => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { mkdtempSync, copyFileSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { bootstrapEmptyPostgres, applyPostgresMigrations, assertPostgresMigrationsApplied } = await import('../scripts/postgres-migrations.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'pg0016-'));
  for (const f of ['compatibility.sql', 'schema.sql']) copyFileSync(join('db/postgres', f), join(dir, f));
  for (const m of postgresMigrations().filter(m => m.number !== '0016' && m.number !== '0021' && m.number !== '0022' && m.number !== '0029')) copyFileSync(join('db/postgres', m.file), join(dir, m.file));
  const pg = new PGlite(); await pg.waitReady; t.after(() => pg.close());
  const db = { query: (q, p) => pg.query(q, p), exec: q => pg.exec(q) };
  await bootstrapEmptyPostgres(db, { dir });
  assert.ok((await pg.query("SELECT 1 FROM schema_migrations WHERE id LIKE '0017%'")).rows.length, '0017 recorded first');
  await assert.rejects(assertPostgresMigrationsApplied(db), /0016_market_orders\.sql \(not applied\)/);
  assert.deepEqual((await applyPostgresMigrations(db)).applied, ['0016_market_orders.sql', '0021_market_spoilage.sql', '0022_kindle_income_tax.sql', '0029_tessera_exchange.sql']); // #86/#210: 0022 and 0029 swap the wallet view built on 0016
  await assertPostgresMigrationsApplied(db);
  assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM market_goods')).rows[0].n, 3);
});
