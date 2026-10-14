import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
import { npcQuantity, npcAskMinor, npcSupply, npcOrderId } from '../lib/npc-supply-rules.ts';

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const tick = 7200;

test('#198 scaling curve: base with no player supply, shrinks with volume, never below the 10% floor', () => {
  assert.equal(npcQuantity('fruit', 0), 40);
  assert.equal(npcQuantity('fruit', 15), 25);
  assert.equal(npcQuantity('fruit', 36), 4);
  assert.equal(npcQuantity('fruit', 1000), 4, 'floor = 10% of base');
  assert.equal(npcQuantity('meat', 1000), 2);
  for (let v = 0; v < 60; v++) assert.ok(npcQuantity('wood', v + 1) <= npcQuantity('wood', v), 'monotonic');
});
test('#198 price: reference × 1.15, and never at or below the best player ask', () => {
  assert.equal(npcAskMinor('fruit', null), 138);
  assert.equal(npcAskMinor('fruit', 120), 138, 'cheaper player ask: NPC stays at markup above it');
  assert.equal(npcAskMinor('fruit', 138), 139, 'tie goes to the player');
  assert.equal(npcAskMinor('fruit', 200), 201);
  assert.equal(npcAskMinor('meat', null), 345);
});

async function setup(t, flag = true) {
  const r = await localRuntime(); t.after(() => r.close()); r.setOrderBook(flag);
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  const epoch = (await r.call('world', null)).data.simulation.clock.epochSeconds;
  const fund = (u, cash, fruit) => r.db.batch([
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), u, cash),
    ...Array.from({ length: Math.ceil(fruit / 10) }, (_, i) => r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'buy','fruit',?,-1,1)").bind(randomUUID(), u, Math.min(10, fruit - i * 10))),
  ]);
  await fund('alice', 50000, 1); await fund('bob', 1000, 60);
  const day = d => r.setNow((epoch + d * tick + 60) * 1000);
  const place = (u, side, qty, price) => r.call('market/orders', u, { action: 'market-order-place', requestId: randomUUID(), side, good: 'fruit', qty, limitUnitMinor: price });
  const npc = async (good, d) => r.db.prepare('SELECT qty, limit_unit_minor FROM market_orders WHERE id = ?').bind(npcOrderId(good, d)).first();
  const openNpc = async good => Number((await r.db.prepare("SELECT COUNT(*) AS n FROM market_open_orders WHERE npc_id='kindle-farm' AND good=?").bind(good).first()).n);
  return { r, day, place, npc, openNpc };
}

test(`#198 ${backend}: with zero player supply NPC asks exist at markup; idempotent per day; one open ask per good`, async t => {
  const { r, day, npc, openNpc } = await setup(t);
  day(1); await r.call('market/orders', 'alice'); await r.call('market/orders', 'alice'); await r.call('world', null);
  for (const good of Object.keys(npcSupply)) {
    const o = await npc(good, 1);
    assert.deepEqual([Number(o.qty), Number(o.limit_unit_minor)], [npcSupply[good].baseQty, Math.ceil(npcSupply[good].referenceMinor * 1.15)], good);
    assert.equal(await openNpc(good), 1);
  }
  assert.equal(Number((await r.db.prepare("SELECT COUNT(*) AS n FROM market_orders WHERE npc_id='kindle-farm'").first()).n), 3, 'repeat requests add nothing');
  day(2); await r.call('market/orders', 'alice');
  assert.ok(await npc('fruit', 2)); assert.equal(await openNpc('fruit'), 1, "yesterday's ask is cancelled");
  const book = (await r.call('market/orders', 'alice')).data.book.goods.find(g => g.good === 'fruit');
  assert.deepEqual([book.bestAskMinor, book.asks[0].npc], [138, true]);
});

test(`#198 ${backend}: a player can undercut and gets filled first; NPC qty drops toward the floor as player volume rises`, async t => {
  const { r, day, place, npc } = await setup(t);
  day(1); await r.call('market/orders', 'alice');
  assert.equal((await place('bob', 'sell', 30, 130)).status, 200);
  const buy = await place('alice', 'buy', 30, 140);
  assert.equal(buy.status, 200);
  const fills = (await r.db.prepare("SELECT s.citizen_id, SUM(t.qty) AS q, MAX(t.unit_minor) AS p FROM market_trades t JOIN market_orders s ON s.id=t.sell_order_id GROUP BY s.citizen_id").all()).results;
  assert.deepEqual(fills.map(f => [f.citizen_id, Number(f.q), Number(f.p)]), [['bob', 30, 130]], 'player ask fills before the NPC');
  day(2); await r.call('market/orders', 'alice');
  assert.equal(Number((await npc('fruit', 2)).qty), 10, '40 base − 30 sold by players');
  assert.equal(Number((await npc('meat', 2)).qty), 20, 'other goods unaffected');
  assert.equal((await place('bob', 'sell', 25, 130)).status, 200); await place('alice', 'buy', 25, 135);
  day(3); await r.call('market/orders', 'alice');
  assert.equal(Number((await npc('fruit', 3)).qty), 4, 'floor');
  // Window: 3 game days later the old volume ages out.
  day(7); await r.call('world', null); await r.call('market/orders', 'alice'); // catch-up is at most 3 ticks per request
  assert.equal(Number((await npc('fruit', 7)).qty), 40);
});

test(`#198 ${backend}: NPC never undercuts the best player ask; flag off posts nothing`, async t => {
  const { r, day, place, npc } = await setup(t);
  day(1); await r.call('market/orders', 'alice');
  assert.equal((await place('bob', 'sell', 5, 200)).status, 200);
  day(2); await r.call('market/orders', 'alice');
  assert.equal(Number((await npc('fruit', 2)).limit_unit_minor), 201, 'NPC prices above the best player ask');
  // A player bid that crosses only the player ask fills against the player.
  await place('alice', 'buy', 5, 200);
  assert.equal(Number((await r.db.prepare("SELECT COALESCE(SUM(t.qty),0) AS n FROM market_trades t JOIN market_orders s ON s.id=t.sell_order_id WHERE s.npc_id IS NOT NULL").first()).n), 0);
});
test(`#198 ${backend}: with the order book flag off, world ticks post no NPC orders`, async t => {
  const { r, day } = await setup(t, false);
  day(2); await r.call('world', null); await r.call('citizen', 'alice');
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM market_orders').first()).n), 0);
});
