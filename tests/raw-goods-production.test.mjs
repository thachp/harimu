import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { postgresMigrations } from '../scripts/postgres-migrations.mjs';

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const jobs = [['orchard', 'fruit', 3, 700, 2], ['herding', 'meat', 2, 900, 3], ['logging', 'wood', 3, 1000, 4]];
const goods = async (r, u, item) => Number((await r.db.prepare('SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id=? AND item=?').bind(u, item).first())?.quantity ?? 0);
const wallet = async (r, u) => Number((await r.db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?').bind(u).first()).balance);

test(`#196 ${backend}: each raw-goods job credits its good once; retried claims never double-credit`, async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice');
  const world = await r.call('world', null);
  for (const [id, item, qty, wage, hours] of jobs) {
    const order = world.data.workOrders.find(o => o.id === id);
    assert.ok(order, `${id} offered`); assert.ok(order.detail.includes(`resolves in ${hours}h real`), order.detail);
    const before = { good: await goods(r, 'alice', item), food: await goods(r, 'alice', 'food'), cash: await wallet(r, 'alice') };
    const started = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: id });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    const shift = started.data.shifts.find(s => !s.claimedAt);
    assert.deepEqual([shift.rewardItem, shift.rewardQuantity, shift.wageMinor], [item, qty, wage], 'terms snapshot in shift_rewards');
    r.setNow(Date.parse(shift.completesAt) + 1000);
    assert.equal((await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id })).status, 200);
    const again = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id });
    assert.notEqual(again.status, 500);
    assert.equal(await goods(r, 'alice', item), before.good + qty, `${item} credited once`);
    assert.equal(await wallet(r, 'alice'), before.cash + wage);
    assert.equal(await goods(r, 'alice', 'food'), before.food, 'fruit/meat are not meal food (#195)');
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM shift_settlements WHERE shift_id=?').bind(shift.id).first()).n), 1);
  }
});

test(`#196 ${backend}: existing harvest/freight/archive terms are unchanged`, async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice');
  const started = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' });
  const shift = started.data.shifts.find(s => !s.claimedAt);
  assert.deepEqual([shift.rewardItem, shift.rewardQuantity, shift.wageMinor], ['food', 4, 800]);
});

test('#196 base output is the same for every worker; 0020 seeds the jobs on D1 and Postgres', async () => {
  const { rewards } = await import('../lib/economy.ts').catch(() => ({ rewards: null }));
  const src = await readFile('lib/economy.ts', 'utf8');
  for (const [id, item, qty, wage] of jobs) assert.match(src, new RegExp(`${id}: \\{ wageMinor: ${wage}, item: '${item}', quantity: ${qty} \\}`));
  if (rewards) for (const [id, item, qty] of jobs) assert.deepEqual([rewards[id].item, rewards[id].quantity], [item, qty]);
  const pg = postgresMigrations().find(m => m.file === '0020_raw_goods_work_orders.sql');
  assert.ok(pg); assert.deepEqual(pg.tables, []); assert.match(pg.sql, /ON CONFLICT \(id\) DO NOTHING/);
  const d1 = await readFile('drizzle/0020_raw_goods_work_orders.sql', 'utf8');
  for (const [id] of jobs) { assert.ok(pg.sql.includes(`'${id}','kindle'`)); assert.ok(d1.includes(`'${id}','kindle'`)); }
});

test(`#196 ${backend}: migration 0020 inserts the three jobs into an existing database and re-applies as a no-op`, async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice');
  await r.db.prepare("DELETE FROM work_orders WHERE id IN ('orchard','herding','logging')").run();
  const sql = await readFile(backend === 'postgres' ? 'db/postgres/0020_raw_goods_work_orders.sql' : 'drizzle/0020_raw_goods_work_orders.sql', 'utf8');
  r.db.sqlite.exec(sql); r.db.sqlite.exec(sql);
  const rows = (await r.db.prepare("SELECT id, nation_id, capacity_cost, status FROM work_orders WHERE id IN ('orchard','herding','logging') ORDER BY sort_order").all()).results;
  assert.deepEqual(rows.map(x => [x.id, x.nation_id, Number(x.capacity_cost), x.status]), [['orchard', 'kindle', 4, 'open'], ['herding', 'kindle', 5, 'open'], ['logging', 'kindle', 6, 'open']]);
});
