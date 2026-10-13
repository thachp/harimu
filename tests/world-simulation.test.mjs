import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

async function fixture(t) { const r = await localRuntime(); t.after(() => r.close()); return r; }

test('actual routes derive durable clock from server time; anonymous citizen cannot advance it', async t => {
  const r = await fixture(t);
  assert.equal((await r.call('citizen', null)).status, 401);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM world_clock').first()).count, 0);
  const initial = await r.call('world', null);
  assert.equal(initial.status, 200); assert.equal(initial.data.simulation.clock.latestTick, 0);
  const epoch = initial.data.simulation.clock.epochSeconds;
  r.setNow((epoch + 7200 * 7) * 1000);
  const first = await r.call('citizen', 'alice');
  assert.equal(first.data.simulation.clock.latestTick, 3);
  assert.equal(first.data.simulation.clock.pendingTicks, 4);
  assert.equal(first.data.simulation.clock.gameDay, 8);
  r.reopen();
  const second = await r.call('world', null);
  assert.equal(second.data.simulation.clock.epochSeconds, epoch);
  assert.equal(second.data.simulation.clock.latestTick, 6);
  assert.equal(second.data.simulation.clock.pendingTicks, 1);
  const third = await r.call('citizen', 'bob');
  assert.equal(third.data.simulation.clock.latestTick, 7);
  assert.equal(third.data.simulation.clock.pendingTicks, 0);
  const rows = await r.db.prepare('SELECT * FROM world_ticks ORDER BY tick').all();
  assert.deepEqual(rows.results.map(row => row.tick), [1,2,3,4,5,6,7]);
  for (const row of rows.results) {
    assert.equal(row.scheduled_at, epoch + row.tick * 7200);
    assert.equal(JSON.parse(row.proposals_json).length, 3);
  }
  const replay = await r.call('world', null);
  assert.equal(replay.data.simulation.clock.latestTick, 7);
  r.setNow(epoch * 1000);
  assert.equal((await r.call('world', null)).data.simulation.clock.latestTick, 7);
  for (const now of [-1, NaN, Infinity, 1.5]) await assert.rejects(r.advanceWorld(now), /authoritative world time/);
});

test('concurrent route ticks execute finite food transfer once and preserve supplier/fund conservation after reopen', async t => {
  const r = await fixture(t);
  const initial = await r.call('world', null), epoch = initial.data.simulation.clock.epochSeconds;
  await r.db.batch([
    r.db.prepare("UPDATE market_items SET initial_stock=0 WHERE item='food'"),
    r.db.prepare("UPDATE economy_funds SET initial_minor=10000 WHERE id='kindle-employer'"),
  ]);
  r.setNow((epoch + 7200) * 1000);
  const [alice,bob] = await Promise.all([r.call('citizen','alice'),r.call('citizen','bob')]);
  assert.equal(alice.status,200); assert.equal(bob.status,200);
  const receipt = await r.db.prepare('SELECT * FROM government_policy_executions').first();
  assert.equal(receipt.tick,1); assert.equal(receipt.food_quantity,10); assert.equal(receipt.spend_minor,1000);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM world_ticks').first()).count,1);
  const verify = async () => {
    const response = await r.call('world',null), state = response.data.simulation;
    assert.equal(state.supplierFoodRemaining,30); assert.equal(state.supplierCashMinor,1000);
    const stock = await r.db.prepare("SELECT stock FROM merchant_inventory_balances WHERE item='food'").first();
    assert.equal(stock.stock + state.supplierFoodRemaining,40);
    const government = (await r.call('citizen','alice')).data.government;
    assert.equal(government.availableBudgetMinor + state.supplierCashMinor,10000);
    assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM government_policy_executions').first()).count,1);
  };
  await verify(); r.reopen(); await verify();
  r.setNow((epoch + 7200 * 4) * 1000);
  await Promise.all([r.call('world',null),r.call('citizen','bob')]);
  const executions = await r.db.prepare('SELECT * FROM government_policy_executions ORDER BY tick').all();
  assert.equal(executions.results.length,2);
  assert.equal(executions.results.reduce((sum,row) => sum + row.food_quantity,0),19);
  assert.equal((await r.db.prepare("SELECT stock FROM merchant_inventory_balances WHERE item='food'").first()).stock,19);
});
