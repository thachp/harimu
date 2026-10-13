import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

async function fixture(t) {
  const r=await localRuntime();t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle'").run();
  await r.call('world',null);return r;
}
const action=(name,requestId=randomUUID(),extra={})=>({action:`aurelle-${name}`,requestId,...extra});
async function earn(r,user='alice') {
  const shiftId=randomUUID();
  assert.equal((await r.call('citizen',user,action('start-work',shiftId))).status,200);
  const shift=(await r.call('citizen',user)).data.aurellePlan.shifts.find(s=>s.id===shiftId);
  r.setNow(Date.parse(shift.completesAt));
  const requestId=randomUUID(),body=action('claim-work',requestId,{shiftId});
  const response=await r.call('citizen',user,body);assert.equal(response.status,200);
  return {shiftId,requestId,body,response};
}

test('Aurelle Tier 0 has a separate chartered economy and assigned estate job',async t=>{
  const r=await fixture(t),response=await r.call('citizen','alice');
  assert.equal(response.status,200);assert.equal(response.data.verification.tier,0);
  assert.equal(response.data.aurellePlan.available,true);
  assert.equal(response.data.aurellePlan.walletMinor,0);
  assert.equal(response.data.aurellePlan.publicFoodRemaining,40);assert.equal(response.data.aurellePlan.publicFundMinor,100000);
  assert.equal(response.data.aurellePlan.job.id,'aurelle-food-estate');
  assert.equal((await r.call('citizen',null,action('start-work'))).status,401);
  assert.equal((await r.call('citizen','alice',action('start-work',undefined,{quantity:2}))).status,400);
  assert.equal((await r.call('citizen','alice',action('buy-food',undefined,{quantity:1,shiftId:randomUUID()}))).status,400);
  assert.equal((await r.call('citizen','alice',action('start-work'))).status,200);
});

test('Crown purchase receipts bind account, action and quantity, and conserve estate funds and food after reopen',async t=>{
  const r=await fixture(t),paid=await earn(r),id=randomUUID();
  assert.equal(paid.response.data.aurellePlan.walletMinor,800);assert.equal(paid.response.data.aurellePlan.favor,2);
  assert.equal((await r.call('citizen','alice',paid.body)).data.aurellePlan.walletMinor,800);
  const buy=action('buy-food',id,{quantity:2,unitMinor:0,clerk_user_id:'bob'});
  const bought=await r.call('citizen','alice',buy);assert.equal(bought.status,200);
  assert.equal(bought.data.aurellePlan.walletMinor,500);assert.equal(bought.data.aurellePlan.foodQuantity,2);
  assert.equal(bought.data.aurellePlan.publicFoodRemaining,42);assert.equal(bought.data.aurellePlan.publicFundMinor,99500);
  assert.equal(bought.data.aurellePlan.walletMinor+bought.data.aurellePlan.publicFundMinor,100000);
  assert.equal(bought.data.aurellePlan.foodQuantity+bought.data.aurellePlan.publicFoodRemaining,44);
  assert.equal((await r.call('citizen','alice',buy)).status,200);
  assert.equal((await r.call('citizen','alice',action('buy-food',id,{quantity:1}))).status,409);
  assert.equal((await r.call('citizen','bob',buy)).status,409);
  assert.equal((await r.call('citizen','alice',action('household-meal',id))).status,409);
  assert.equal((await r.call('citizen','alice',action('start-work',id))).status,409);
  for(const quantity of [0,3,-1,1.5,'1',null]) assert.equal((await r.call('citizen','alice',action('buy-food',undefined,{quantity}))).status,400);
  r.reopen();
  assert.equal((await r.call('citizen','alice',buy)).data.aurellePlan.walletMinor,500);
  assert.equal((await r.call('citizen','bob')).data.aurellePlan.walletMinor,0);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM aurelle_purchases').first()).count,1);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM aurelle_settlements').first()).count,1);
  assert.equal((await r.call('citizen','alice')).data.economy.walletMinor,0);
});

test('Aurelle meals apply once, consume two food and enforce exact two-hour cooldown and capacity cap',async t=>{
  const r=await fixture(t);await earn(r);
  for(let n=0;n<2;n++) assert.equal((await r.call('citizen','alice',action('buy-food',undefined,{quantity:2}))).status,200);
  await r.db.prepare("UPDATE citizens SET capacity=18 WHERE clerk_user_id='alice'").run();
  const id=randomUUID(),meal=action('household-meal',id);
  const first=await r.call('citizen','alice',meal);assert.equal(first.status,200);assert.equal(first.data.capacity,22);
  assert.equal(first.data.aurellePlan.foodQuantity,2);
  assert.equal((await r.call('citizen','alice',meal)).data.capacity,22);
  assert.equal((await r.call('citizen','bob',meal)).status,409);
  r.reopen();assert.equal((await r.call('citizen','alice',meal)).data.aurellePlan.foodQuantity,2);
  r.setNow(r.now+7199000);
  assert.equal((await r.call('citizen','alice',action('household-meal'))).status,409);
  r.setNow(r.now+1000);
  const next=await r.call('citizen','alice',action('household-meal'));assert.equal(next.status,200);
  assert.equal(next.data.capacity,24);assert.equal(next.data.aurellePlan.foodQuantity,0);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM aurelle_meals').first()).count,2);
});

test('charter jobs preserve shared active-shift guard, ownership and original currency after a grace move',async t=>{
  const r=await fixture(t),shiftId=randomUUID();
  const started=await r.call('citizen','alice',action('start-work',shiftId,{wageMinor:999999,capacityCost:0,workOrderId:'harvest'}));
  assert.equal(started.status,200);assert.equal(started.data.capacity,14);
  assert.equal(started.data.aurellePlan.shifts[0].currency,'CRN');assert.equal(started.data.aurellePlan.shifts[0].wageMinor,800);
  assert.equal((await r.call('citizen','alice',action('start-work',shiftId))).data.capacity,14);
  assert.equal((await r.call('citizen','bob',action('start-work',shiftId))).status,409);
  assert.equal((await r.call('citizen','alice',action('claim-work',undefined,{shiftId}))).status,409);
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen','alice',{action:'korund-start-work',requestId:randomUUID()})).status,409);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen','alice',{action:'commit-work',workOrderId:'harvest'})).status,409);
  r.setNow(r.now+7200000);
  assert.equal((await r.call('citizen','alice',{action:'claim-work',shiftId})).status,409);
  assert.equal((await r.call('citizen','bob',action('claim-work',undefined,{shiftId}))).status,409);
  const claim=action('claim-work',undefined,{shiftId}),paid=await r.call('citizen','alice',claim);
  assert.equal(paid.status,200);assert.equal(paid.data.aurellePlan.walletMinor,800);
  assert.equal(paid.data.aurellePlan.available,false);assert.equal(paid.data.aurellePlan.favor,2);
  assert.equal((await r.call('citizen','alice')).data.economy.walletMinor,0);
  assert.equal((await r.call('citizen','alice')).data.korundPlan.walletMinor,0);
  assert.equal((await r.call('citizen','alice',action('buy-food',undefined,{quantity:1}))).status,409);
  assert.equal((await r.call('citizen','alice',claim)).data.aurellePlan.walletMinor,800);
  r.reopen();assert.equal((await r.call('citizen','alice',claim)).data.aurellePlan.walletMinor,800);
});

test('Aurelle Favor caps at 100 while immutable earned Crown and food terms stay conserved',async t=>{
  const r=await fixture(t),iso=new Date(r.now-86400000).toISOString();
  // Supported local ledger history: 49 completed estate shifts give 98 Favor.
  for(let n=0;n<49;n++) {
    const id=randomUUID();await r.db.batch([
      r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id,'alice','aurelle-food-estate','Estate fixture','4 state food',4,iso,iso,iso),
      r.db.prepare('INSERT INTO aurelle_settlements VALUES (?,?,?,?,?,?)').bind(id,'alice',800,4,2,Math.floor(r.now/1000)),
    ]);
  }
  assert.equal((await r.call('citizen','alice')).data.aurellePlan.favor,98);
  await earn(r);await earn(r);
  const plan=(await r.call('citizen','alice')).data.aurellePlan;
  assert.equal(plan.favor,100);assert.equal(plan.walletMinor,51*800);
  assert.equal(plan.walletMinor+plan.publicFundMinor,100000);assert.equal(plan.publicFoodRemaining,40+51*4);
  assert.equal((await r.call('citizen','bob')).data.aurellePlan.favor,0);
  assert.equal((await r.db.prepare('SELECT SUM(favor) AS total FROM aurelle_settlements').first()).total,102);
});

test('old Spark work remains Spark and does not fund Aurelle food or convert to Crowns',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  assert.equal((await r.call('citizen','alice',{action:'commit-work',workOrderId:'harvest'})).status,200);
  const shift=(await r.call('citizen','alice')).data.shifts[0];
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen','alice',action('start-work'))).status,409);
  r.setNow(Date.parse(shift.completesAt));
  assert.equal((await r.call('citizen','alice',{action:'claim-work',shiftId:shift.id})).status,200);
  const read=await r.call('citizen','alice');
  assert.equal(read.data.economy.walletMinor,800);assert.equal(read.data.aurellePlan.walletMinor,0);
  assert.equal((await r.call('citizen','alice',action('buy-food',undefined,{quantity:1}))).status,409);
  for(const body of [{action:'market-trade',requestId:randomUUID(),item:'food',side:'buy',quantity:1},
    {action:'create-listing',requestId:randomUUID(),item:'food',quantity:1,unitMinor:100},
    {action:'buy-listing',requestId:randomUUID(),listingId:randomUUID()}]) assert.notEqual((await r.call('citizen','alice',body)).status,200);
  assert.equal((await r.call('citizen','alice')).data.economy.walletMinor,800);
});

test('Aurelle government food needs use Crown household food rather than retained Spark inventory',async t=>{
  const r=await fixture(t);
  // Both fixture accounts had Kindle citizenship before changing nation locally;
  // its starter goods must not satisfy Aurelle's separate household ledger.
  await r.db.batch(['alice','bob'].map(user=>r.db.prepare("INSERT OR IGNORE INTO starter_food_grants(clerk_user_id,quantity) VALUES (?,2)").bind(user)));
  assert.match((await r.call('citizen','alice')).data.government.decision.reason,/Food security is 0\/100/);
  for(const user of ['alice','bob']) {
    await earn(r,user);
    assert.equal((await r.call('citizen',user,action('buy-food',undefined,{quantity:2}))).status,200);
  }
  assert.ok(!(await r.call('citizen','alice')).data.government.decision.reason.includes('below the 40-point safety threshold'));
  for(const user of ['alice','bob']) assert.equal((await r.call('citizen',user,action('household-meal'))).status,200);
  assert.match((await r.call('citizen','alice')).data.government.decision.reason,/Food security is 0\/100/);
});
