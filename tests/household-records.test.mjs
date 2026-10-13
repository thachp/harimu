import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
test('Household distinguishes the original grant from food consumed by an actual meal',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 const fresh=await r.call('citizen','alice');
 assert.deepEqual(fresh.data.market.householdRecord,{starterFoodGranted:2,lastMealAt:null});
 assert.equal(fresh.data.market.mealReadyAt,null);
 assert.equal(fresh.data.economy.inventory.find(i=>i.item==='food').quantity,2);
 await r.db.prepare("UPDATE citizens SET capacity=18 WHERE clerk_user_id='alice'").run();
 const command={action:'household-meal',requestId:randomUUID()};
 const meal=await r.call('citizen','alice',command);assert.equal(meal.status,200);
 assert.equal(meal.data.market.householdRecord.lastMealAt,new Date(r.now).toISOString());
 assert.equal(Date.parse(meal.data.market.mealReadyAt)-Date.parse(meal.data.market.householdRecord.lastMealAt),meal.data.market.mealIntervalSeconds*1000);
 assert.equal(meal.data.economy.inventory.find(i=>i.item==='food')?.quantity ?? 0,0);
 assert.equal((await r.call('citizen','alice',command)).status,200);
 r.reopen();const restored=await r.call('citizen','alice');
 assert.deepEqual(restored.data.market.householdRecord,meal.data.market.householdRecord);
 assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM citizen_economy_events WHERE clerk_user_id='alice' AND kind='meal'").first()).n,1);
 assert.equal((await r.db.prepare("SELECT quantity FROM starter_food_grants WHERE clerk_user_id='alice'").first()).quantity,2);
});
test('Household records are account-owned and never infer a meal from another account',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 await r.db.prepare("INSERT INTO citizen_economy_events(id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at,capacity_applied) VALUES (?,'alice','meal','food',-2,0,?,1)").bind(randomUUID(),Math.floor(r.now/1000)-100).run();
 await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
 await r.db.prepare("DELETE FROM starter_food_grants WHERE clerk_user_id='bob'").run();
 for(let i=0;i<2;i++){
  const bob=await r.call('citizen','bob');assert.deepEqual(bob.data.market.householdRecord,{starterFoodGranted:0,lastMealAt:null});assert.equal(bob.data.market.mealReadyAt,null);
  assert.equal(bob.cache,'private, no-store');
 }
 assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM starter_food_grants WHERE clerk_user_id='bob'").first()).n,0);
 assert.equal((await r.call('citizen',null)).status,401);
});
