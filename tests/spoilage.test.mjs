import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { spoilQuantity, allocateSpoilage, shelfLifeDays } from '../lib/spoilage-rules.ts';
import { marketGoods, marketSpoilageSchema, marketSpoilageIndexes, marketOpenOrdersView } from '../lib/market-orders.ts';
import { postgresMigrations, isDestructive } from '../scripts/postgres-migrations.mjs';

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const tick = 7200;
const one = s => s.replace(/\s*\n\s*/g, ' ').trim();

test('#199 rules: ceil(held / shelf life) per day, never more than held; free first, then newest orders', () => {
  assert.deepEqual(Object.fromEntries(marketGoods.filter(g => g.perishable).map(g => [g.good, g.shelfLifeDays])), shelfLifeDays, 'parity with the catalog');
  assert.ok(!('wood' in shelfLifeDays), 'wood never spoils');
  assert.deepEqual([0, 1, 2, 3, 4, 9, 10].map(n => spoilQuantity('fruit', n)), [0, 1, 1, 1, 2, 3, 4]);
  assert.deepEqual([0, 1, 2, 3, 5].map(n => spoilQuantity('meat', n)), [0, 1, 1, 2, 3]);
  assert.equal(spoilQuantity('fruit', -4), 0);
  // 3 fruit last exactly 3 days; 2 meat last 2 days.
  for (const [good, n, days] of [['fruit', 3, 3], ['meat', 2, 2]]) { let h = n, d = 0; while (h > 0) { h -= spoilQuantity(good, h); d++; } assert.equal(d, days, good); }
  assert.deepEqual(allocateSpoilage(5, 2, [{ id: 'new', remaining: 2 }, { id: 'old', remaining: 4 }]), { free: 2, orders: [{ id: 'new', qty: 2 }, { id: 'old', qty: 1 }] });
  assert.deepEqual(allocateSpoilage(1, 3, [{ id: 'a', remaining: 1 }]), { free: 1, orders: [] });
});

async function setup(t, flag = true) {
  const r = await localRuntime(); t.after(() => r.close()); r.setOrderBook(flag);
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  const epoch = (await r.call('world', null)).data.simulation.clock.epochSeconds;
  const fund = (u, item, n) => r.db.batch(Array.from({ length: Math.ceil(n / 10) }, (_, i) => r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'buy',?,?,-1,1)").bind(randomUUID(), u, item, Math.min(10, n - i * 10))));
  const day = d => r.setNow((epoch + d * tick + 60) * 1000);
  const held = async (u, item) => Number((await r.db.prepare('SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id=? AND item=?').bind(u, item).first())?.quantity ?? 0);
  const remaining = async id => Number((await r.db.prepare('SELECT remaining FROM market_open_orders WHERE id=?').bind(id).first())?.remaining ?? 0);
  const rows = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM market_spoilage').first()).n);
  const sell = async (u, qty, price) => { const res = await r.call('market/orders', u, { action: 'market-order-place', requestId: randomUUID(), side: 'sell', good: 'fruit', qty, limitUnitMinor: price }); assert.equal(res.status, 200); return (await r.db.prepare("SELECT id FROM market_orders WHERE citizen_id=? ORDER BY created_at DESC LIMIT 1").bind(u).first()).id; };
  return { r, fund, day, held, remaining, rows, sell };
}

test(`#199 ${backend}: fruit and meat spoil once per game day, wood never; idempotent; never negative`, async t => {
  const { r, fund, day, held, rows } = await setup(t);
  await fund('alice', 'fruit', 9); await fund('alice', 'meat', 3); await fund('alice', 'wood', 5);
  day(1); await r.call('world', null); await r.call('world', null); await r.call('world', null);
  assert.deepEqual([await held('alice', 'fruit'), await held('alice', 'meat'), await held('alice', 'wood')], [6, 1, 5]);
  const once = await rows();
  await r.call('citizen', 'alice', { action: 'noop' }).catch(() => {}); await r.call('world', null);
  assert.equal(await rows(), once, 'same day: nothing more');
  day(2); await r.call('world', null);
  assert.deepEqual([await held('alice', 'fruit'), await held('alice', 'meat'), await held('alice', 'wood')], [4, 0, 5]);
  day(3); await r.call('world', null);
  assert.equal(await held('alice', 'meat'), 0, 'never negative');
  assert.equal(Number((await r.db.prepare("SELECT COUNT(*) AS n FROM market_spoilage WHERE good='meat' AND tick=3").first()).n), 0, 'nothing to spoil, nothing written');
  assert.equal(await held('alice', 'fruit'), 2);
  const kinds = (await r.db.prepare('SELECT DISTINCT kind FROM market_spoilage').all()).results.map(x => x.kind);
  assert.deepEqual(kinds, ['spoil']);
  await assert.rejects(r.db.prepare("INSERT INTO market_spoilage (id,clerk_user_id,good,order_id,qty,tick,spoiled_at) VALUES ('w','alice','wood',NULL,1,1,1)").run(), undefined, 'wood cannot spoil');
  await assert.rejects(r.db.prepare("INSERT INTO market_spoilage (id,clerk_user_id,good,order_id,qty,tick,spoiled_at) VALUES ('z','alice','fruit',NULL,0,1,1)").run());
});

test(`#199 ${backend}: escrowed goods in open sell orders spoil too and the order auto-reduces; a fully spoiled order closes`, async t => {
  const { r, fund, day, held, remaining, sell } = await setup(t);
  await fund('bob', 'fruit', 6);
  day(0);
  const order = await sell('bob', 5, 900);
  assert.deepEqual([await held('bob', 'fruit'), await remaining(order)], [1, 5]);
  day(1); await r.call('world', null);
  // held 6 → lose 2: the 1 free unit first, then 1 from the order.
  assert.deepEqual([await held('bob', 'fruit'), await remaining(order)], [0, 4]);
  day(2); await r.call('world', null); // lose 2 → 2 left on the order
  assert.equal(await remaining(order), 2);
  // Cancelling returns only what is left.
  await r.call('market/orders', 'bob', { action: 'market-order-cancel', requestId: randomUUID(), orderId: order });
  assert.equal(await held('bob', 'fruit'), 2);
  const small = await sell('bob', 1, 900);
  assert.equal(await held('bob', 'fruit'), 1);
  day(3); await r.call('world', null); day(4); await r.call('world', null);
  assert.equal(await remaining(small), 0);
  assert.equal(await r.db.prepare('SELECT id FROM market_open_orders WHERE id=?').bind(small).first(), null, 'fully spoiled order is no longer open');
  assert.ok((await held('bob', 'fruit')) >= 0);
});

test(`#199 ${backend}: GETs never spoil; flag off spoils nothing`, async t => {
  const { r, fund, day, held, rows } = await setup(t);
  await fund('alice', 'fruit', 9);
  day(1); await r.call('market/orders', 'alice'); await r.call('citizen', 'alice');
  assert.equal(await rows(), 0, 'read-only GETs');
  assert.equal(await held('alice', 'fruit'), 9);
  const off = await setup(t, false);
  await off.fund('alice', 'fruit', 9);
  off.day(2); await off.r.call('world', null);
  assert.equal(await off.rows(), 0); assert.equal(await off.held('alice', 'fruit'), 9);
});

test('#199 migration 0021 matches the runtime schema, is additive on Postgres, and re-applies on D1', async t => {
  const d1 = await readFile('drizzle/0021_market_spoilage.sql', 'utf8'); const pg = await readFile('db/postgres/0021_market_spoilage.sql', 'utf8');
  for (const s of [marketSpoilageSchema, ...marketSpoilageIndexes]) assert.ok(d1.includes(one(s)), s.slice(0, 60));
  assert.ok(d1.includes(one(marketOpenOrdersView).replace('CREATE VIEW IF NOT EXISTS', 'CREATE VIEW')));
  const m = postgresMigrations().find(x => x.file === '0021_market_spoilage.sql');
  assert.ok(m); assert.deepEqual([...m.tables], ['market_spoilage']);
  assert.equal(postgresMigrations().filter(x => x.number === '0021').length, 1);
  assert.ok(!isDestructive(pg));
  assert.match(pg, /CREATE OR REPLACE VIEW market_open_orders[\s\S]*market_spoilage/);
  assert.match(pg, /CREATE OR REPLACE VIEW citizen_inventory_balances[\s\S]*market_spoilage/);
  if (backend !== 'd1') return;
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice');
  r.db.sqlite.exec(d1); r.db.sqlite.exec(d1);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM market_spoilage').first()).n), 0);
});
