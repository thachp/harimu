import assert from 'node:assert/strict';
import {test} from 'node:test';
import {localRuntime} from './helpers/local-runtime.mjs';
const command={action:'commit-decision',optionId:'forum',infrastructureId:'council',householdMemberId:'citizen',note:'Fixture commitment'};
const profile=r=>r.db.prepare("SELECT capacity,influence,nation_id FROM citizens WHERE clerk_user_id='alice'").first();
const decision=r=>r.db.prepare("SELECT * FROM citizen_decisions WHERE clerk_user_id='alice'").first();
test('new personal commitments require Kindle citizenship while Tier 0 remains eligible',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
 const before=await profile(r);const denied=await r.call('citizen','alice',command);assert.equal(denied.status,409);assert.deepEqual(await profile(r),before);assert.equal(await decision(r),null);
 assert.equal((await r.call('citizen','bob',command)).data.decision.counted,false);
});
for(const change of ['citizenship','capacity'])test(`personal commitment refuses a ${change} change before its transaction`,async t=>{
 const r=await localRuntime();t.after(()=>r.close());const batch=r.db.batch.bind(r.db);let changed=false;
 r.db.batch=async statements=>{
  if(statements.some(s=>s.sql.includes('INSERT')&&s.sql.includes('citizen_decisions'))){changed=true;await r.db.prepare(change==='citizenship'?"UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'":"UPDATE citizens SET capacity=1 WHERE clerk_user_id='alice'").run();}
  return batch(statements);
 };
 const result=await r.call('citizen','alice',command);assert.equal(changed,true);assert.equal(result.status,409);assert.equal(await decision(r),null);
 const after=await profile(r);assert.equal(after.capacity,change==='capacity'?1:18);assert.equal(after.influence,1240);
 assert.equal(await r.db.prepare("SELECT * FROM citizen_plans WHERE clerk_user_id='alice'").first(),null);
});
test('concurrent commitment retries return the saved decision and debit capacity once',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 const results=await Promise.allSettled([r.call('citizen','alice',command),r.call('citizen','alice',{...command,optionId:'capacity',note:'Competing fixture'})]);
 for(const result of results){assert.equal(result.status,'fulfilled');assert.equal(result.value.status,200);assert.equal(result.value.cache,'private, no-store');}
 const saved=await decision(r);for(const result of results)assert.equal(result.value.data.decision.optionId,saved.task_id);
 assert.equal((await profile(r)).capacity,18+saved.capacity_delta);assert.equal((await profile(r)).influence,1240+saved.influence_delta);
 const draft=(await r.call('citizen','alice')).data.plan;assert.deepEqual(draft.completedIds,[saved.task_id]);assert.equal(draft.note,saved.task_id==='forum'?command.note:'Competing fixture');
 const retry=await r.call('citizen','alice',command);assert.equal(retry.status,200);assert.equal(retry.data.alreadyCommitted,true);assert.equal(retry.data.decision.optionId,saved.task_id);
 assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM citizen_decisions WHERE clerk_user_id='alice'").first()).n,1);
});
test('a failed draft write rolls back the commitment and resource changes before a safe retry',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const batch=r.db.batch.bind(r.db);
 r.db.batch=async statements=>batch(statements.map(s=>s.sql.startsWith('INSERT INTO citizen_plans')?r.db.prepare('SELECT missing_commitment_fixture_column'):s));
 await assert.rejects(r.call('citizen','alice',command));assert.equal(await decision(r),null);assert.equal((await profile(r)).capacity,18);assert.equal((await profile(r)).influence,1240);
 r.db.batch=batch;assert.equal((await r.call('citizen','alice',command)).status,200);assert.equal((await profile(r)).capacity,16);
});
test('acknowledging an own historical commitment after a nation change never applies its effects again',async t=>{
 const r=await localRuntime();t.after(()=>r.close());assert.equal((await r.call('citizen','alice',command)).status,200);
 await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();const before=await profile(r);
 const replay=await r.call('citizen','alice',command);assert.equal(replay.status,200);assert.equal(replay.data.alreadyCommitted,true);assert.deepEqual(await profile(r),before);
 assert.equal((await r.call('citizen','bob')).data.decision,null);
});
