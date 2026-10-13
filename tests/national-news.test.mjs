import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';

const read=(r,user,query='')=>r.call('news',user,undefined,'https://fixture.invalid',query);
for(const nationId of ['kindle','korund','aurelle']){
 test(`${nationId} news uses citizen authorization, durable records and truthful provenance after reopen`,async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  await r.db.prepare('UPDATE citizens SET nation_id=? WHERE clerk_user_id=?').bind(nationId,'alice').run();
  await r.db.prepare('UPDATE citizens SET nation_id=? WHERE clerk_user_id=?').bind(nationId==='kindle'?'korund':'kindle','bob').run();
  const start=nationId==='kindle'?{action:'commit-work',workOrderId:'harvest'}:{action:`${nationId}-start-work`,requestId:randomUUID()};
  assert.equal((await r.call('citizen','alice',start)).status,200);
  const citizen=(await r.call('citizen','alice')).data;
  const shift=(nationId==='kindle'?citizen.shifts:nationId==='korund'?citizen.korundPlan.shifts:citizen.aurellePlan.shifts)[0];
  r.setNow(Date.parse(shift.completesAt));
  const claim=nationId==='kindle'?{action:'claim-work',shiftId:shift.id}:{action:`${nationId}-claim-work`,requestId:randomUUID(),shiftId:shift.id};
  assert.equal((await r.call('citizen','alice',claim)).status,200);
  const trade=nationId==='kindle'?{action:'market-trade',requestId:randomUUID(),side:'buy',item:'food',quantity:1}:nationId==='aurelle'?{action:'aurelle-buy-food',requestId:randomUUID(),quantity:2}:{action:'korund-redeem-ration',requestId:randomUUID()};
  const tradeResult=await r.call('citizen','alice',trade);assert.equal(tradeResult.status,200,tradeResult.data.error);
  await r.call('world',null);
  for(let attempt=0;attempt<2;attempt++){
   const response=await read(r,'alice','?nationId=foreign&nation=korund');
   assert.equal(response.status,200);assert.equal(response.cache,'private, no-store');assert.equal(response.data.nationId,nationId);
   assert.deepEqual(response.data.statistics,{citizens:1,completedShifts:1,food:4});
   assert.ok(response.data.items.some(item=>item.title==='Citizenship recorded'));
   assert.ok(response.data.items.some(item=>item.id.includes(':market:')));
   assert.ok(response.data.items.some(item=>item.text.includes('1 completed shift')));
   assert.ok(response.data.items.every(item=>['system','deterministic'].includes(item.source)));
   const text=JSON.stringify(response.data);assert.doesNotMatch(text,/Private alice|Private bob|clerk_user_id|alice|bob|shift_id/);
   if(nationId!=='kindle')assert.doesNotMatch(text,/Food security is|below the 40-point|ties favor|proposal is capped/);
   const bob=await read(r,'bob');assert.notEqual(bob.data.nationId,nationId);assert.equal(bob.data.statistics.completedShifts,0);
   r.reopen();
  }
 });
}
test('anonymous, unenrolled and unsupported citizens fail closed',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 assert.equal((await read(r,null)).status,401);
 await r.db.prepare('UPDATE citizens SET nation_id=NULL WHERE clerk_user_id=?').bind('alice').run();
 assert.equal((await read(r,'alice')).status,403);
 await r.db.prepare("UPDATE citizens SET nation_id='fulmara' WHERE clerk_user_id='alice'").run();
 assert.equal((await read(r,'alice')).status,404);
});
test('news reads do not advance world, change ledgers, claim work or count civic input',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 await r.call('world',null);
 const snapshot=async()=>Promise.all(['world_ticks','shift_settlements','government_petitions','government_reviews','citizen_economy_events','citizens','square_presence'].map(table=>r.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()));
 const before=await snapshot();r.setNow(r.now+86400000);
 for(let i=0;i<3;i++)assert.equal((await read(r,'alice')).status,200);
 assert.deepEqual(await snapshot(),before);
});
