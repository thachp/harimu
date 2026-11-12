/** #1392: each city keeps its own order book. NPC asks are copied in at the same price and quantity. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = 'HARIMU_CITY_LOCAL_BOOKS_ENABLED';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));

test('the flag is last in HARIMU_GRAY_PACK at index 91, preview on and production off, and is not its own binding', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_KORUND_MAP_FOG_ENABLED'), 90);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG), 91);
  assert.equal(preview.vars[FLAG], undefined); assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true'); assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [FLAG]: 'false' }, FLAG), false, 'a direct string wins');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 91);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 91);
});

async function book(t, backend) {
  const r = await localRuntime({ backend }); t.after(() => r.close()); r.setOrderBook(true);
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  const fund = (u, cash, fruit) => r.db.batch([
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), u, cash),
    ...(fruit ? [r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'buy','fruit',?,-1,1)").bind(randomUUID(), u, fruit)] : []),
  ]);
  await fund('alice', 5000, 0); await fund('bob', 1000, 10);
  const place = (u, side, qty, price) => r.call('market/orders', u, { action: 'market-order-place', requestId: randomUUID(), side, good: 'fruit', qty, limitUnitMinor: price });
  const fruit = async u => Number((await r.db.prepare('SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id=? AND item=?').bind(u, 'fruit').first())?.quantity ?? 0);
  const at = async (u, city) => r.db.prepare('INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET home_city_id=excluded.home_city_id, current_city_id=excluded.current_city_id').bind(u, 'kindle', city, city, 1).run();
  return { r, place, fruit, at };
}

for (const backend of ['sqlite', 'postgres']) test(`local books and the copied NPC ask (${backend})`, async t => {
  const { r, place, fruit } = await book(t, backend);
  r.setFixtureEnv(FLAG, 'false');
  assert.equal((await place('bob', 'sell', 2, 40)).status, 200);
  assert.equal((await place('alice', 'buy', 1, 50)).status, 200);
  assert.equal(await fruit('alice'), 1, 'flag off: the two orders share the kindle book');
  assert.equal((await r.db.prepare("SELECT city_id FROM market_orders WHERE citizen_id='bob'").first()).city_id, 'kindle');

  const on = await book(t, backend);
  on.r.setFixtureEnv(FLAG, 'true');
  await on.at('alice', 'forgehaven'); await on.at('bob', 'tarrek-foundry');
  await on.r.advanceWorld(Math.floor(on.r.now / 1000)); // stamp the clock, then let one tick fall due
  on.r.setNow(on.r.now + 7201 * 1000);
  assert.equal((await on.place('bob', 'sell', 2, 10)).status, 200);
  const bought = await on.place('alice', 'buy', 1, 500);
  assert.equal(bought.status, 200, JSON.stringify(bought.data));
  assert.equal(await on.fruit('alice'), 1, 'alice buys the NPC ask in her own city');
  assert.equal(Number((await on.r.db.prepare("SELECT remaining FROM market_open_orders WHERE citizen_id='bob'").first()).remaining), 2, 'bob\'s other city does not fill');
  const ask = bought.data.book.goods.find(g => g.good === 'fruit');
  assert.equal(ask.asks.some(level => level.npc), true, 'her book shows the NPC ask');
  assert.equal(ask.asks.some(level => level.unitMinor === 10), false, 'the book read omits the other city');
  const copy = await on.r.db.prepare("SELECT qty, limit_unit_minor FROM market_orders WHERE npc_id='kindle-farm' AND good='fruit' AND city_id='forgehaven'").first();
  const source = await on.r.db.prepare("SELECT qty, limit_unit_minor FROM market_orders WHERE npc_id='kindle-farm' AND good='fruit' AND city_id='kindle'").first();
  assert.deepEqual(copy, source, 'the city ask copies the kindle price and quantity');
  const fill = await on.r.db.prepare("SELECT s.city_id, s.npc_id FROM market_trades t JOIN market_orders s ON s.id=t.sell_order_id JOIN market_orders b ON b.id=t.buy_order_id WHERE b.citizen_id='alice'").first();
  assert.equal(fill.city_id, 'forgehaven'); assert.equal(fill.npc_id, 'kindle-farm');
});
