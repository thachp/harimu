import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
async function fixture(t){const r=await localRuntime();t.after(()=>r.close());await r.db.prepare("UPDATE citizens SET nation_id='korund'").run();await r.call('world',null);return r;}
const command=(action,requestId=randomUUID(),extra={})=>({action:`korund-${action}`,requestId,...extra});
const act=(r,user,action,id=randomUUID(),extra={})=>r.call('citizen',user,command(action,id,extra));
test('FIFO ration requests preserve ownership and stock, and cancellation/retry retain coupons',async t=>{
 const r=await fixture(t),a=randomUUID(),b=randomUUID();
 await r.db.prepare('UPDATE korund_resources SET initial_food=0').run();
 assert.equal((await act(r,'alice','join-ration-queue',a)).status,200);assert.equal((await act(r,'bob','join-ration-queue',b)).status,200);
 assert.equal((await act(r,'alice','join-ration-queue',a)).status,200);assert.equal((await act(r,'bob','join-ration-queue',a)).status,409);
 assert.equal((await act(r,'alice','join-ration-queue')).status,409);
 let state=(await r.call('citizen','alice')).data.korundPlan;assert.deepEqual(state.queue,{waiting:2,requestId:a,position:1});assert.equal(state.foodQuantity,0);assert.equal(state.couponFoodRemaining,2);
 assert.equal((await act(r,'alice','redeem-ration')).status,409);
 const cancel=randomUUID();assert.equal((await act(r,'bob','cancel-ration-queue',randomUUID(),{queueId:a})).status,409);
 assert.equal((await act(r,'alice','cancel-ration-queue',cancel,{queueId:a})).status,200);assert.equal((await act(r,'alice','cancel-ration-queue',cancel,{queueId:a})).status,200);
 assert.equal((await act(r,'alice','cancel-ration-queue',cancel,{queueId:b})).status,409);
 state=(await r.call('citizen','bob')).data.korundPlan;assert.equal(state.queue.position,1);
 const rejoin=randomUUID();assert.equal((await act(r,'alice','join-ration-queue',rejoin)).status,200);
 await r.db.prepare('UPDATE korund_resources SET initial_food=2').run();
 const results=await Promise.all([act(r,'alice','redeem-ration'),act(r,'bob','redeem-ration')]);assert.deepEqual(results.map(x=>x.status),[409,200]);
 state=(await r.call('citizen','alice')).data.korundPlan;assert.equal(state.queue.position,1);assert.equal(state.publicFoodRemaining,0);
 assert.equal((await act(r,'alice','redeem-ration',a)).status,409); // join receipt is not a redemption receipt
 r.reopen();assert.equal((await r.call('citizen','alice')).data.korundPlan.queue.requestId,rejoin);
 assert.doesNotMatch(JSON.stringify(state.queue),/alice|bob/);
});
test('coupon boundary expires queues without inventing deliveries; previous requests cannot revive',async t=>{
 const r=await fixture(t),id=randomUUID();await act(r,'alice','join-ration-queue',id);const first=(await r.call('citizen','alice')).data.korundPlan;
 r.setNow(Date.parse(first.couponExpiresAt)-1);assert.equal((await r.call('citizen','bob')).data.korundPlan.queue.waiting,1);
 r.setNow(Date.parse(first.couponExpiresAt));const next=(await r.call('citizen','alice')).data.korundPlan;assert.equal(next.queue.waiting,0);assert.equal(next.queue.requestId,null);assert.equal(next.couponFoodRemaining,2);assert.equal(next.foodQuantity,0);
 assert.equal((await act(r,'alice','join-ration-queue',id)).status,200);assert.equal((await r.call('citizen','alice')).data.korundPlan.queue.waiting,0);
 assert.equal((await act(r,'alice','cancel-ration-queue',randomUUID(),{queueId:id})).status,409);
 assert.equal((await act(r,'bob','redeem-ration')).status,200);
});
test('concurrent joins share one position, foreign citizenship cannot join or see queue, and cross-action identifiers are bound',async t=>{
 const r=await fixture(t);const id=randomUUID();const results=await Promise.all([act(r,'alice','join-ration-queue',id),act(r,'alice','join-ration-queue',id)]);assert.deepEqual(results.map(x=>x.status),[200,200]);
 assert.equal((await r.call('citizen','alice')).data.korundPlan.queue.waiting,1);
 assert.equal((await act(r,'alice','start-work',id)).status,409);assert.equal((await act(r,'alice','household-meal',id)).status,409);
 await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
 const foreign=(await r.call('citizen','alice')).data.korundPlan;assert.equal(foreign.queue.waiting,0);assert.equal(foreign.queue.requestId,null);assert.equal((await act(r,'alice','join-ration-queue')).status,409);
 assert.equal((await r.call('citizen','bob')).data.korundPlan.queue.waiting,0);assert.equal((await act(r,'bob','redeem-ration')).status,200);
 assert.equal((await act(r,'bob','join-ration-queue')).status,409);
});
