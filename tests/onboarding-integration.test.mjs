import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

async function fixture(t){const r=await localRuntime();t.after(()=>r.close());return r;}
const enroll=(nationId,expectedNationId=null)=>({action:'enroll',nationId,expectedNationId});
const citizen=(r,user)=>r.db.prepare('SELECT clerk_user_id,nation_id,nation_changes,created_at FROM citizens WHERE clerk_user_id=?').bind(user).first();

test('duplicate concurrent first enrollment is idempotent and conflicting first choice cannot consume a grace change',async t=>{
  const r=await fixture(t);
  const same=await Promise.allSettled([r.call('citizen','new-same',enroll('kindle')),r.call('citizen','new-same',enroll('kindle'))]);
  for(const response of same){assert.equal(response.status,'fulfilled');assert.equal(response.value.status,200);assert.equal(response.value.data.nationId,'kindle');}
  const selected=await citizen(r,'new-same');assert.equal(selected.nation_changes,0);
  const different=await Promise.allSettled([r.call('citizen','new-different',enroll('korund')),r.call('citizen','new-different',enroll('aurelle'))]);
  for(const response of different)assert.equal(response.status,'fulfilled');
  assert.deepEqual(different.map(response=>response.value.status).sort(),[200,409]);
  const actual=await citizen(r,'new-different');assert.equal(actual.nation_changes,0);
  assert.equal(different.find(response=>response.value.status===200).value.data.nationId,actual.nation_id);
});

test('stale citizenship confirmation cannot change nation and the one grace change remains bound to expected citizenship',async t=>{
  const r=await fixture(t);
  assert.equal((await r.call('citizen','alice',enroll('korund','aurelle'))).status,409);
  assert.equal((await citizen(r,'alice')).nation_id,'kindle');assert.equal((await citizen(r,'alice')).nation_changes,0);
  assert.equal((await r.call('citizen','alice',enroll('korund','kindle'))).status,200);
  assert.equal((await r.call('citizen','alice',enroll('aurelle','kindle'))).status,409);
  assert.equal((await r.call('citizen','alice',enroll('aurelle','korund'))).status,409);
  assert.equal((await citizen(r,'alice')).nation_id,'korund');assert.equal((await citizen(r,'alice')).nation_changes,1);
  // Same-target retry confirms the previous result without spending another change.
  assert.equal((await r.call('citizen','alice',enroll('korund','kindle'))).status,200);
  r.reopen();assert.equal((await r.call('citizen','alice')).data.profile.nationId,'korund');
});

test('citizenship change permits 48 hours minus one millisecond and rejects the exact boundary',async t=>{
  const r=await fixture(t),start=r.now;
  for(const user of ['before-boundary','at-boundary','after-boundary']) assert.equal((await r.call('citizen',user,enroll('kindle'))).status,200);
  r.setNow(start+48*3600000-1);
  assert.equal((await r.call('citizen','before-boundary',enroll('korund','kindle'))).status,200);
  r.setNow(start+48*3600000);
  const exact=await r.call('citizen','at-boundary',enroll('korund','kindle'));
  assert.equal(exact.status,409);assert.equal(exact.data.citizenship.lockedReason,'grace-expired');
  r.setNow(start+48*3600000+1);
  assert.equal((await r.call('citizen','after-boundary',enroll('korund','kindle'))).status,409);
  for(const user of ['at-boundary','after-boundary']) {
    const row=await citizen(r,user);assert.equal(row.nation_id,'kindle');assert.equal(row.nation_changes,0);
  }
});

test('personal civic commitments and counted petitions lock citizenship before the grace deadline',async t=>{
  const r=await fixture(t);
  assert.equal((await r.call('citizen','alice',{action:'commit-decision',optionId:'forum',infrastructureId:'council',householdMemberId:'citizen'})).status,200);
  r.setVerification('bob',{userId:'bob',emailVerified:true,phoneVerified:true,phoneUnique:true,revoked:false,checkedAt:r.now,expiresAt:r.now+60000});
  const requestId=crypto.randomUUID();
  assert.equal((await r.call('citizen','bob',{action:'government-petition',topic:'food',requestId})).status,200);
  for(const user of ['alice','bob']) {
    const denied=await r.call('citizen',user,enroll('korund','kindle'));
    assert.equal(denied.status,409);assert.equal(denied.data.citizenship.lockedReason,'political-action');
    assert.equal((await citizen(r,user)).nation_id,'kindle');assert.equal((await citizen(r,user)).nation_changes,0);
  }
});

test('signed-out enrollment is denied and each signed-in account controls only its own citizen',async t=>{
  const r=await fixture(t);
  assert.equal((await r.call('citizen',null,enroll('korund'))).status,401);
  assert.equal((await r.call('citizen','alice',{...enroll('korund','kindle'),clerk_user_id:'bob',userId:'bob'})).status,200);
  assert.equal((await citizen(r,'alice')).nation_id,'korund');assert.equal((await citizen(r,'bob')).nation_id,'kindle');
  assert.equal((await r.call('citizen',null)).status,401);
  r.reopen();
  assert.equal((await r.call('citizen','alice')).data.profile.nationId,'korund');
  assert.equal((await r.call('citizen','bob')).data.profile.nationId,'kindle');
  assert.equal((await r.call('citizen','bob',enroll('aurelle','kindle'))).status,200);
  assert.equal((await r.call('citizen','alice',enroll('korund','kindle'))).status,200);
  assert.equal((await citizen(r,'alice')).nation_changes,1);assert.equal((await citizen(r,'bob')).nation_changes,1);
  assert.equal((await r.call('citizen','alice',enroll('aurelle','korund'),'https://foreign.invalid')).status,403);
});

test('enrollment requires an explicit valid expected citizenship and recognized destination',async t=>{
  const r=await fixture(t);
  for(const body of [{action:'enroll',nationId:'korund'},enroll('unknown'),
    enroll('korund',false),enroll('korund',42),enroll('korund',[])]) {
    assert.equal((await r.call('citizen','alice',body)).status,400);
    assert.equal((await citizen(r,'alice')).nation_id,'kindle');assert.equal((await citizen(r,'alice')).nation_changes,0);
  }
});

test('concurrent grace confirmations consume one change and cannot overwrite the winning nation',async t=>{
  const r=await fixture(t);
  const same=await Promise.all([r.call('citizen','alice',enroll('korund','kindle')),r.call('citizen','alice',enroll('korund','kindle'))]);
  assert.deepEqual(same.map(response=>response.status),[200,200]);
  assert.equal((await citizen(r,'alice')).nation_changes,1);
  const competing=await Promise.all([r.call('citizen','bob',enroll('korund','kindle')),r.call('citizen','bob',enroll('aurelle','kindle'))]);
  assert.deepEqual(competing.map(response=>response.status).sort(),[200,409]);
  const row=await citizen(r,'bob');assert.equal(row.nation_changes,1);
  assert.equal(competing.find(response=>response.status===200).data.nationId,row.nation_id);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM citizens WHERE clerk_user_id=?').bind('bob').first()).count,1);
});

test('private draft creation does not start citizenship grace before the first nation choice',async t=>{
  const r=await fixture(t),user='old-private-draft';
  assert.equal((await r.call('citizen',user,{action:'save-plan',note:'Existing private draft',horizon:'today',completedIds:[]})).status,200);
  assert.equal((await citizen(r,user)).nation_id,null);
  r.setNow(r.now+72*3600000);
  const started=r.now;
  const first=await r.call('citizen',user,enroll('kindle'));
  assert.equal(first.status,200);assert.equal(first.data.citizenship.enrolledAt,new Date(started).toISOString());
  assert.equal(Date.parse(first.data.citizenship.graceEndsAt),started+48*3600000);
  assert.equal((await r.call('citizen',user)).data.plan.note,'Existing private draft');
  r.setNow(started+47*3600000);
  assert.equal((await r.call('citizen',user,enroll('korund','kindle'))).status,200);
});

test('exploration and returning reads never enroll or switch the authenticated citizen',async t=>{
  const r=await fixture(t);
  for(let attempt=0;attempt<2;attempt++) {
    assert.equal((await r.call('world',null)).status,200);
    const fresh=await r.call('citizen','exploring');
    assert.equal(fresh.status,200);assert.equal(fresh.data.profile,null);
    assert.equal(await citizen(r,'exploring'),null);
    assert.equal((await r.call('citizen','alice')).data.profile.nationId,'kindle');
    r.reopen();
  }
  assert.equal((await r.call('citizen','exploring',enroll('aurelle'))).status,200);
  r.reopen();
  assert.equal((await r.call('citizen','exploring')).data.profile.nationId,'aurelle');
  assert.equal((await citizen(r,'exploring')).nation_changes,0);
});

test('grace switching preserves private draft, citizen attributes and existing economic ledger',async t=>{
  const r=await fixture(t);
  await r.call('citizen','alice',{action:'save-plan',horizon:'season',note:'Keep my household draft',completedIds:['capacity']});
  await r.db.prepare("UPDATE citizens SET capacity=11,influence=1501,standing='Fixture standing',display_name='Fixture name' WHERE clerk_user_id='alice'").run();
  const before=await r.call('citizen','alice');
  const snapshot=async()=>({
    grants:(await r.db.prepare("SELECT * FROM starter_food_grants WHERE clerk_user_id='alice'").all()).results,
    events:(await r.db.prepare("SELECT * FROM citizen_economy_events WHERE clerk_user_id='alice'").all()).results,
    wallet:await r.db.prepare("SELECT * FROM citizen_wallet_balances WHERE clerk_user_id='alice'").first(),
    inventory:(await r.db.prepare("SELECT * FROM citizen_inventory_balances WHERE clerk_user_id='alice' ORDER BY item").all()).results,
  });
  const ledger=await snapshot();
  assert.equal((await r.call('citizen','alice',enroll('korund','kindle'))).status,200);
  r.reopen();
  const after=await r.call('citizen','alice');
  assert.deepEqual(after.data.plan,before.data.plan);
  for(const key of ['capacity','influence','standing','displayName'])assert.equal(after.data.profile[key],before.data.profile[key]);
  assert.equal(after.data.profile.nationId,'korund');
  assert.deepEqual(await snapshot(),ledger);
  assert.equal((await r.call('citizen','alice',{action:'market-trade',side:'buy',requestId:crypto.randomUUID(),item:'food',quantity:1})).status,409);
  assert.equal((await r.call('citizen','bob')).data.profile.nationId,'kindle');
});

test('future enrollment dates and corrupt persisted counters cannot unlock a grace switch',async t=>{
 const r=await fixture(t);
 for(const [createdAt,changes] of [[new Date(r.now+1000).toISOString(),0],[new Date(r.now).toISOString(),-1],[new Date(r.now).toISOString(),0.5]]) {
  const update=r.db.prepare('UPDATE citizens SET created_at=?,nation_changes=? WHERE clerk_user_id=?').bind(createdAt,changes,'alice');
  // PostgreSQL rejects fractional integer corruption before it can persist.
  if(r.storageEngine==='postgres'&&!Number.isInteger(changes)){await assert.rejects(update.run());assert.equal((await citizen(r,'alice')).nation_id,'kindle');continue;}
  await update.run();
  const denied=await r.call('citizen','alice',enroll('korund','kindle'));
  assert.equal(denied.status,409);assert.equal(denied.data.citizenship.canChange,false);
  assert.equal((await citizen(r,'alice')).nation_id,'kindle');
 }
});

test('enrollment returns authoritative capacity for first citizenship, replay, change and stale refusal',async t=>{
  const r=await fixture(t);
  const first=await r.call('citizen','capacity-new',enroll('kindle'));
  assert.equal(first.status,200);assert.equal(first.data.capacity,18);
  await r.db.prepare('UPDATE citizens SET capacity=7 WHERE clerk_user_id=?').bind('capacity-new').run();
  const replay=await r.call('citizen','capacity-new',enroll('kindle'));
  assert.equal(replay.status,200);assert.equal(replay.data.capacity,7);
  const changed=await r.call('citizen','capacity-new',enroll('korund','kindle'));
  assert.equal(changed.status,200);assert.equal(changed.data.capacity,7);
  const stale=await r.call('citizen','capacity-new',enroll('aurelle','kindle'));
  assert.equal(stale.status,409);assert.equal(stale.data.capacity,7);
});

test('first enrollment and grace change hydrate the current government and trusted verification immediately',async t=>{
  const r=await fixture(t);
  for(const nationId of ['kindle','korund','aurelle']){
    const enrolled=await r.call('citizen',`civic-${nationId}`,enroll(nationId));
    assert.equal(enrolled.status,200);
    assert.equal(enrolled.data.government.nationId,nationId);
    assert.equal(enrolled.data.verification.countedActionsEligible,false);
    assert.equal(enrolled.data.verification.status,'unavailable');
    assert.ok(enrolled.data.simulation);
  }
  const changed=await r.call('citizen','civic-kindle',enroll('korund','kindle'));
  assert.equal(changed.data.government.nationId,'korund');
  const replay=await r.call('citizen','civic-kindle',enroll('korund','kindle'));
  assert.equal(replay.data.government.nationId,'korund');
});
