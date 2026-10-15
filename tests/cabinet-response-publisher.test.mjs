import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
const tierOne=(r,user)=>({userId:user,emailVerified:true,phoneVerified:true,phoneUnique:true,revoked:false,checkedAt:r.now,expiresAt:r.now+60000});
const input=(r,id)=>({petitionId:id,sessionAt:Math.floor(r.now/1000),transcript:'This fixture Cabinet acknowledges the recorded petition. No policy change or appropriation is announced.'});
test('trusted fixture session publishes one authored public response after a genuine threshold crossing',async t=>{
 const r=await localRuntime();t.after(()=>r.close());r.setVerification('alice',tierOne(r,'alice'));
 const id=randomUUID();assert.equal((await r.call('petitions','alice',{action:'create',requestId:id,title:'Fixture food request',demand:'Please review the household food rules.'})).status,200);
 const before=(await r.call('citizen','alice')).data;const petition=(await r.call('petitions','alice')).data.petitions.find(p=>p.id===id);assert.equal(petition.status,'awaiting-response');
 assert.deepEqual(await r.recordCabinetResponse({...input(r,id),sessionAt:petition.reachedAt-1}),{status:'unavailable'});
 assert.deepEqual(await r.recordCabinetResponse({...input(r,id),sessionAt:Math.floor(r.now/1000)+1}),{status:'unavailable'});
 const reply=input(r,id);assert.deepEqual(await r.recordCabinetResponse(reply),{status:'recorded'});
 const saved=(await r.call('petitions','alice')).data.petitions.find(p=>p.id===id);assert.equal(saved.status,'responded');assert.equal(saved.response.text,`Authored PoC Cabinet response: ${reply.transcript}`);assert.equal(saved.response.at,reply.sessionAt);
 assert.deepEqual(await r.recordCabinetResponse({...reply,transcript:'Different fixture content must not replace the archived response.'}),{status:'already-recorded'});
 r.reopen();assert.deepEqual((await r.call('petitions','alice')).data.petitions.find(p=>p.id===id).response,saved.response);
 const after=(await r.call('citizen','alice')).data;assert.deepEqual(after.profile,before.profile);assert.deepEqual(after.economy,before.economy);
});
test('publisher refuses unthresholded/unknown petitions and public commands cannot invoke it',async t=>{
 const r=await localRuntime();t.after(()=>r.close());for(const user of ['alice','bob']){r.setVerification(user,tierOne(r,user));await (await r.importModule('lib/collective-petitions.ts')).recordVerifiedHumanVisit(r.db,user,Math.floor(r.now/1000));}/* #221: GET no longer records the visit */
 // Fixture census of 34 makes a threshold of two; the author alone remains below it.
 const now=Math.floor(r.now/1000);for(let i=0;i<32;i++){const user=`cabinet-fixture-${i}`;await r.db.prepare("INSERT INTO citizens(clerk_user_id,nation_id,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',18,0,'Fixture',?,?)").bind(user,new Date(r.now).toISOString(),new Date(r.now).toISOString()).run();await r.db.prepare("INSERT INTO civic_human_activity(clerk_user_id,last_seen,policy) VALUES (?,?,'tier1-human-v1')").bind(user,now).run();}
 const id=randomUUID();assert.equal((await r.call('petitions','alice',{action:'create',requestId:id,title:'Fixture pending petition',demand:'Please review this fixture request.'})).status,200);
 assert.deepEqual(await r.recordCabinetResponse(input(r,id)),{status:'unavailable'});
 assert.deepEqual(await r.recordCabinetResponse(input(r,randomUUID())),{status:'unavailable'});
 assert.equal((await r.call('petitions','alice',{action:'respond',requestId:randomUUID(),petitionId:id,response:input(r,id).transcript,sessionAt:now})).status,400);
 assert.equal((await r.call('petitions','alice')).data.petitions.find(p=>p.id===id).response,null);
 r.setNow(r.now+604800000);assert.deepEqual(await r.recordCabinetResponse({...input(r,id)}),{status:'unavailable'});
});
test('latched petitions still receive their immutable response after the signature window expires',async t=>{
 const r=await localRuntime();t.after(()=>r.close());r.setVerification('alice',tierOne(r,'alice'));const id=randomUUID();
 await r.call('petitions','alice',{action:'create',requestId:id,title:'Fixture latched petition',demand:'Please consider this fixture demand.'});r.setNow(r.now+604800000);
 const before=await r.db.prepare("SELECT capacity,influence FROM citizens WHERE clerk_user_id='alice'").first();
 assert.deepEqual(await r.recordCabinetResponse(input(r,id)),{status:'recorded'});
 assert.deepEqual(await r.db.prepare("SELECT capacity,influence FROM citizens WHERE clerk_user_id='alice'").first(),before);
 assert.equal((await r.call('petitions','alice')).data.petitions.find(p=>p.id===id).status,'responded');
});
