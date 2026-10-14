import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

async function fixture(t) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run();
  await r.call('world',null);
  return r;
}
const action = (name,requestId=randomUUID(),extra={}) => ({action:`korund-${name}`,requestId,...extra});

test('Korund ration entitlement expires at game week and cannot be transferred or counted twice', async t => {
  const r=await fixture(t), first=await r.call('citizen','alice'), id=randomUUID();
  const plan=first.data.korundPlan, epoch=first.data.simulation.clock.epochSeconds;
  assert.equal(plan.assignment.id,'korund-food-production'); assert.equal(plan.walletMinor,0);
  assert.equal(plan.publicFoodRemaining,40); assert.equal(plan.couponFoodRemaining,2);
  assert.equal(Date.parse(plan.couponExpiresAt)/1000,epoch+50400);
  assert.equal((await r.call('citizen','alice',action('redeem-ration',id,{clerk_user_id:'bob',quantity:100,gameWeek:99}))).status,200);
  assert.equal((await r.call('citizen','alice',action('redeem-ration',id))).status,200);
  assert.equal((await r.call('citizen','bob',action('redeem-ration',id))).status,409);
  assert.equal((await r.call('citizen','alice',action('redeem-ration'))).status,409);
  r.reopen();
  assert.equal((await r.call('citizen','alice')).data.korundPlan.foodQuantity,2);
  r.setNow((epoch+50399)*1000);
  assert.equal((await r.call('citizen','alice')).data.korundPlan.couponFoodRemaining,0);
  r.setNow((epoch+50400)*1000);
  const next=await r.call('citizen','alice');
  assert.equal(next.data.korundPlan.gameWeek,2); assert.equal(next.data.korundPlan.couponFoodRemaining,2);
  assert.equal((await r.call('citizen','alice',action('redeem-ration',id))).status,200);
  assert.equal((await r.call('citizen','alice')).data.korundPlan.couponFoodRemaining,2);
  assert.equal((await r.call('citizen','alice',action('redeem-ration'))).status,200);
  const alice=await r.call('citizen','alice'),bob=await r.call('citizen','bob');
  assert.equal(alice.data.korundPlan.foodQuantity,4); assert.equal(bob.data.korundPlan.foodQuantity,0);
  assert.equal(alice.data.korundPlan.publicFoodRemaining+alice.data.korundPlan.foodQuantity,40);
});

test('Korund meals debit two food once, respect cooldown and cap capacity at 24', async t => {
  const r=await fixture(t), ration=randomUUID(), meal=randomUUID();
  assert.equal((await r.call('citizen','alice',action('redeem-ration',ration))).status,200);
  await r.db.prepare("UPDATE citizens SET capacity=23 WHERE clerk_user_id='alice'").run();
  const result=await r.call('citizen','alice',action('household-meal',meal));
  assert.equal(result.status,200); assert.equal(result.data.capacity,24); assert.equal(result.data.korundPlan.foodQuantity,0);
  assert.equal((await r.call('citizen','alice',action('household-meal',meal))).status,200);
  assert.equal((await r.call('citizen','bob',action('household-meal',meal))).status,409);
  assert.equal((await r.call('citizen','alice',action('household-meal'))).status,409);
  assert.equal((await r.call('citizen','alice',action('household-meal',ration))).status,409);
  r.reopen();
  assert.equal((await r.call('citizen','alice',action('household-meal',meal))).data.capacity,24);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM korund_meals').first()).count,1);
  assert.equal((await r.db.prepare('SELECT capacity_applied FROM korund_meals').first()).capacity_applied,1);
});

test('Korund two-hour meal timer blocks a funded meal until the exact boundary', async t => {
  const r=await fixture(t);
  assert.equal((await r.call('citizen','alice',action('redeem-ration'))).status,200);
  const epoch=(await r.call('citizen','alice')).data.simulation.clock.epochSeconds;
  r.setNow((epoch+50400)*1000);
  assert.equal((await r.call('citizen','alice',action('redeem-ration'))).status,200);
  await r.db.prepare("UPDATE citizens SET capacity=18 WHERE clerk_user_id='alice'").run();
  const first=await r.call('citizen','alice',action('household-meal'));
  assert.equal(first.status,200);assert.equal(first.data.capacity,22);assert.equal(first.data.korundPlan.foodQuantity,2);
  r.setNow(r.now+7199000);
  assert.equal((await r.call('citizen','alice',action('household-meal'))).status,409);
  assert.equal((await r.call('citizen','alice')).data.korundPlan.foodQuantity,2);
  r.setNow(r.now+1000);
  const next=await r.call('citizen','alice',action('household-meal'));
  assert.equal(next.status,200);assert.equal(next.data.capacity,24);assert.equal(next.data.korundPlan.foodQuantity,0);
});

test('server assigned work shares active-shift guard and preserves LN across grace move without Spark conversion', async t => {
  const r=await fixture(t), id=randomUUID();
  const started=await r.call('citizen','alice',action('start-work',id,{workOrderId:'freight',wageMinor:999999,capacityCost:0}));
  assert.equal(started.status,200); assert.equal(started.data.capacity,14);
  assert.equal(started.data.korundPlan.shifts[0].orderName,'State food-production brigade');
  assert.equal(started.data.korundPlan.shifts[0].wageMinor,800);
  assert.equal((await r.call('citizen','alice',action('start-work',id))).data.capacity,14);
  assert.equal((await r.call('citizen','bob',action('start-work',id))).status,409);
  assert.equal((await r.call('citizen','alice',action('start-work'))).status,409);
  assert.equal((await r.call('citizen','alice',{action:'commit-work',workOrderId:'harvest'})).status,409);
  assert.equal((await r.call('citizen','alice',action('claim-work',undefined,{shiftId:id}))).status,409);
  r.setNow(r.now+7200000);
  assert.equal((await r.call('citizen','bob',action('claim-work',undefined,{shiftId:id}))).status,409);
  assert.equal((await r.call('citizen','alice',{action:'claim-work',shiftId:id})).status,409);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  const claimed=await r.call('citizen','alice',action('claim-work',undefined,{shiftId:id}));
  assert.equal(claimed.status,200); assert.equal(claimed.data.korundPlan.walletMinor,800);
  assert.equal(claimed.data.korundPlan.publicFoodRemaining,44); assert.equal(claimed.data.korundPlan.publicFundMinor,99200);
  assert.equal((await r.call('citizen','alice')).data.economy.walletMinor,0);
  assert.equal((await r.call('citizen','alice')).data.shifts[0].currency,'LN');
  assert.equal((await r.call('citizen','alice',action('redeem-ration'))).status,409);
  r.reopen();
  assert.equal((await r.call('citizen','alice',action('claim-work',undefined,{shiftId:id}))).data.korundPlan.walletMinor,800);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM korund_settlements').first()).count,1);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM shift_settlements').first()).count,0);
});

test('Korund cannot enter Kindle merchant or player listings and binds command IDs across actions', async t => {
  const r=await fixture(t), id=randomUUID();
  for (const body of [{action:'create-listing',requestId:randomUUID(),item:'food',quantity:1,unitMinor:100},
    {action:'buy-listing',requestId:randomUUID(),listingId:randomUUID()},
    {action:'market-trade',requestId:randomUUID(),side:'buy',item:'food',quantity:1},
    {action:'household-meal',requestId:randomUUID()}]) assert.notEqual((await r.call('citizen','alice',body)).status,200);
  assert.equal((await r.call('citizen',null,action('redeem-ration'))).status,401);
  assert.equal((await r.call('citizen','alice',action('start-work',id))).status,200);
  assert.equal((await r.call('citizen','alice',action('redeem-ration',id))).status,409);
  assert.equal((await r.call('citizen','alice',action('household-meal',id))).status,409);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM player_listings').first()).count,0);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM citizen_economy_events').first()).count,0);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='bob'").run();
  assert.equal((await r.call('citizen','bob',action('redeem-ration'))).status,409);
});

test('previous Spark and goods stay separate from Labor Notes and ration food after nation change', async t => {
  const r=await localRuntime();t.after(() => r.close());
  assert.equal((await r.call('citizen','alice',{action:'commit-work',workOrderId:'harvest'})).status,200);
  const shift=(await r.call('citizen','alice')).data.shifts[0];
  r.setNow(Date.parse(shift.completesAt));
  assert.equal((await r.call('citizen','alice',{action:'claim-work',shiftId:shift.id})).status,200);
  const before=(await r.call('citizen','alice')).data.economy;
  assert.equal(before.walletMinor,680); // #86: Kindle wage net of income tax
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
  const moved=await r.call('citizen','alice');
  assert.deepEqual(moved.data.economy,before);assert.equal(moved.data.korundPlan.walletMinor,0);
  assert.equal(moved.data.korundPlan.foodQuantity,0);
  assert.equal((await r.call('citizen','alice',action('redeem-ration'))).status,200);
  const rationed=await r.call('citizen','alice');
  assert.deepEqual(rationed.data.economy,before);assert.equal(rationed.data.korundPlan.foodQuantity,2);
  assert.equal(rationed.data.korundPlan.walletMinor,0);assert.equal(rationed.data.market.available,false);
});
