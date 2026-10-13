import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {petitionThreshold,petitionWindowSeconds,validPetitionText} from '../lib/collective-petitions.ts';
const create=()=>({action:'create',requestId:randomUUID(),title:'Repair the public waterworks',demand:'Publish an audited plan to repair the district waterworks.'});
const eligible=(r,user)=>r.setVerification(user,{userId:user,emailVerified:true,phoneVerified:true,phoneUnique:true,revoked:false,checkedAt:r.now,expiresAt:r.now+60000});
async function population(r,count){const now=Math.floor(r.now/1000);for(let i=0;i<count;i++){const id=`fixture-human-${i}`;await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,created_at,updated_at) VALUES (?,'kindle',?,?)").bind(id,new Date(r.now).toISOString(),new Date(r.now).toISOString()).run();await r.db.prepare("INSERT INTO civic_human_activity VALUES (?,?,'tier1-human-v1')").bind(id,now).run();}}
test('threshold rounds up to whole humans and text remains bounded plain data',()=>{
 for(const [population,threshold] of [[1,1],[33,1],[34,2],[100,3],[101,4]])assert.equal(petitionThreshold(population),threshold);
 for(const value of [0,-1,NaN,1.5,Infinity])assert.throws(()=>petitionThreshold(value));
 assert.equal(validPetitionText('A valid demand',10,1000),true);assert.equal(validPetitionText('bad\u0000text',1,100),false);assert.equal(validPetitionText(' padded ',1,100),false);
});
test('unverified and forged eligibility never create, sign, or enter the human denominator',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 assert.equal((await r.call('petitions',null)).status,401);const body={...create(),verified:true,human:true,tier:1};
 assert.equal((await r.call('petitions','alice',body)).status,403);assert.equal((await r.call('petitions','alice',body,'https://foreign.invalid')).status,403);
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_human_activity').first()).n,0);assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_petitions').first()).n,0);
 eligible(r,'alice');await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();assert.equal((await r.call('petitions','alice',body)).status,403);
});
test('verified creator signs once, immutable retries reopen correctly and no private identity is projected',async t=>{
 const r=await localRuntime();t.after(()=>r.close());eligible(r,'alice');const body=create();const first=await r.call('petitions','alice',body);
 assert.equal(first.status,200,first.data.error);const p=first.data.petitions[0];assert.equal(p.signatures,1);assert.equal(p.threshold,1);assert.equal(p.expiresAt-p.createdAt,petitionWindowSeconds);assert.equal(p.status,'awaiting-response');assert.equal(p.response,null);
 for(let i=0;i<2;i++){r.reopen();const retry=await r.call('petitions','alice',body);assert.equal(retry.status,200);assert.equal(retry.data.petitions[0].signatures,1);}
 assert.equal((await r.call('petitions','alice',{...body,demand:'An edited demand must not reuse this receipt.'})).status,409);
 assert.equal((await r.call('petitions','alice',create())).status,409);
 assert.equal((await r.call('petitions','alice',{action:'sign',requestId:randomUUID(),petitionId:body.requestId})).status,409);
 assert.doesNotMatch(JSON.stringify(first.data),/creator_id|clerk_user_id|Private alice|fixture-human|"alice"/);
 assert.equal(first.cache,'private, no-store');assert.equal((await r.call('petitions','alice',undefined,'https://fixture.invalid','?nation=korund')).data.nationId,'kindle');
 const citizen=await r.call('citizen','alice');assert.equal(citizen.data.profile.citizenship.lockedReason,'political-action');
 assert.equal((await r.call('citizen','alice',{action:'enroll',nationId:'korund',expectedNationId:'kindle'})).status,409);
});
test('only distinct verified signatures meet a frozen weekly threshold, once',async t=>{
 const r=await localRuntime();t.after(()=>r.close());await population(r,66);eligible(r,'alice');eligible(r,'bob');const body=create();let response=await r.call('petitions','alice',body);
 assert.equal(response.data.petitions[0].threshold,3);assert.equal(response.data.petitions[0].status,'collecting');
 const sign={action:'sign',requestId:randomUUID(),petitionId:body.requestId};response=await r.call('petitions','bob',sign);assert.equal(response.status,200);assert.equal(response.data.petitions[0].signatures,2);
 assert.equal((await r.call('petitions','bob',{...sign,requestId:randomUUID()})).status,409);assert.equal((await r.call('petitions','bob',sign)).status,200);
 eligible(r,'fixture-human-0');response=await r.call('petitions','fixture-human-0',{...sign,requestId:randomUUID()});assert.equal(response.status,200);assert.equal(response.data.petitions[0].status,'awaiting-response');const reached=response.data.petitions[0].reachedAt;
 r.setNow(r.now+petitionWindowSeconds*1000);response=await r.call('petitions','alice');assert.equal(response.data.petitions[0].status,'awaiting-response');assert.equal(response.data.petitions[0].reachedAt,reached);assert.equal(response.data.petitions[0].threshold,3);
});
test('seven-real-day expiry rejects an exact-boundary signature and does not reset on reopening',async t=>{
 const r=await localRuntime();t.after(()=>r.close());await population(r,100);eligible(r,'alice');const body=create();const first=await r.call('petitions','alice',body);const p=first.data.petitions[0];
 r.setNow(p.expiresAt*1000);eligible(r,'bob');assert.equal((await r.call('petitions','bob',{action:'sign',requestId:randomUUID(),petitionId:p.id})).status,409);
 r.reopen();const read=await r.call('petitions','alice');assert.equal(read.data.petitions[0].status,'expired');assert.equal(read.data.petitions[0].signatures,1);assert.equal(read.data.petitions[0].response,null);
});
test('expired, foreign and future activity cannot inflate the weekly human denominator',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const now=Math.floor(r.now/1000);await r.db.prepare("INSERT INTO civic_human_activity VALUES ('alice',?,'tier1-human-v1')").bind(now-petitionWindowSeconds-1).run();await r.db.prepare("INSERT INTO civic_human_activity VALUES ('bob',?,'tier1-human-v1')").bind(now+1).run();
 assert.equal((await r.call('petitions','alice')).data.weeklyHumans,0);await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();await r.db.prepare("UPDATE civic_human_activity SET last_seen=? WHERE clerk_user_id='bob'").bind(now).run();assert.equal((await r.call('petitions','alice')).data.weeklyHumans,0);
});
test('citizen request fields cannot post a Cabinet response or change the population and deadline',async t=>{
 const r=await localRuntime();t.after(()=>r.close());eligible(r,'alice');const body={...create(),weeklyHumans:1e9,threshold:0,expiresAt:0,responseText:'Approved',reachedAt:0};const result=await r.call('petitions','alice',body);assert.equal(result.status,200);const p=result.data.petitions[0];assert.equal(p.weeklyHumans,1);assert.equal(p.threshold,1);assert.equal(p.response,null);assert.equal(p.expiresAt-p.createdAt,petitionWindowSeconds);
 await r.db.prepare('UPDATE civic_petitions SET response_text=?,response_at=? WHERE id=?').bind('Fixture Cabinet record: the demand is acknowledged.',p.reachedAt+1,p.id).run();const read=await r.call('petitions','alice');assert.equal(read.data.petitions[0].status,'responded');assert.equal(read.data.petitions[0].response.at,p.reachedAt+1);
});
test('racing publications allow one current petition and reject foreign receipt reuse without orphan records',async t=>{
 const r=await localRuntime();t.after(()=>r.close());eligible(r,'alice');eligible(r,'bob');const body=create();
 const races=await Promise.all([r.call('petitions','alice',body),r.call('petitions','alice',create())]);assert.deepEqual(races.map(x=>x.status).sort(),[200,409]);
 const winner=(await r.call('petitions','alice')).data.petitions[0];assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_petitions').first()).n,1);
 assert.equal((await r.call('petitions','bob',{...body,requestId:winner.id})).status,409);assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_petitions').first()).n,1);
});
test('request-id collision with another signature never creates a new empty petition',async t=>{
 const r=await localRuntime();t.after(()=>r.close());await population(r,100);eligible(r,'alice');eligible(r,'bob');const body=create();await r.call('petitions','alice',body);
 const id=randomUUID();assert.equal((await r.call('petitions','bob',{action:'sign',requestId:id,petitionId:body.requestId})).status,200);
 assert.equal((await r.call('petitions','bob',{...create(),requestId:id})).status,409);assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_petitions').first()).n,1);
});
