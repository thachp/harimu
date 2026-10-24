import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import { localRuntime as fixtureRuntime } from './helpers/local-runtime.mjs';
const localRuntime = (options = {}) => fixtureRuntime({ presidentialCalendar: true, ...options }); // #918: the presidential vote opens only inside the calendar window
import {replayJournalSqlite,replayJournalD1} from '../scripts/postgres-migration.mjs';
import {DatabaseSync} from 'node:sqlite';
const id='kindle-presidential-account-poc-1',ranking=['ines-varro','tobin-achterberg','mara-quell'];
const vote=(order=ranking)=>({action:'vote',electionId:id,requestId:randomUUID(),ranking:order});
test('approved account preview isolates eligibility, window, retries and persisted ballot privacy',async t=>{
 const r=await localRuntime({accountElection:true});t.after(()=>r.close());
 assert.equal((await r.call('election',null)).status,401);
 const open=await r.call('election','alice');assert.equal(open.status,200);assert.equal(open.data.id,id);assert.equal(open.data.electionEligibility.scope,'preview-citizen');assert.equal(open.data.electionEligibility.eligible,true);assert.equal(open.data.verification.countedActionsEligible,false);assert.equal(open.data.privacyReady,true);assert.equal(open.data.closesAt-open.data.opensAt,259200);assert.equal(open.data.result,null);
 const command=vote([...ranking].reverse());const responses=await Promise.all([r.call('election','alice',command),r.call('election','alice',command)]);assert.ok(responses.every(response=>response.status===200));assert.ok(responses.every(response=>response.data.voted));
 const repeat=await r.call('election','alice',{...command,ranking});assert.equal(repeat.status,200);assert.equal(repeat.data.alreadyRecorded,true);
 assert.equal((await r.call('election','alice',vote())).status,409);assert.equal((await r.call('election','bob',command)).status,409);
 const ballot=(await r.db.prepare('SELECT * FROM poc_anonymous_ballots').all()).results;assert.equal(ballot.length,1);assert.deepEqual(JSON.parse(ballot[0].ranking_json),command.ranking);assert.deepEqual(Object.keys(ballot[0]).sort(),['election_id','id','policy','ranking_json']);assert.equal(ballot[0].policy,'preview-citizen-v1');assert.notEqual(ballot[0].id,command.requestId);
 const receipt=(await r.db.prepare('SELECT * FROM poc_voter_receipts').all()).results;assert.equal(receipt.length,1);assert.ok(receipt.every(row=>!('ranking_json' in row)&&!('ballot_id' in row)));
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_voter_receipts').first()).n,0);
 assert.doesNotMatch(JSON.stringify(responses),/ranking_json|clerk_user_id|Private alice|"alice"|humanBallots|simulatedPublicUnits/);
 const citizen=await r.call('citizen','alice');assert.equal(citizen.data.profile.citizenship.lockedReason,'political-action');assert.equal(citizen.data.election.id,id);assert.equal(citizen.data.election.voted,true);
 assert.equal((await r.call('citizen','alice',{action:'enroll',nationId:'korund',expectedNationId:'kindle'})).status,409);
 // The preview exception does not unlock other counted civic actions.
 assert.equal((await r.call('petitions','alice',{action:'sign',petitionId:randomUUID(),requestId:randomUUID()})).status,403);
 r.reopen();r.setNow(open.data.closesAt*1000-1);assert.equal((await r.call('election','bob')).data.result,null);
 r.setNow(open.data.closesAt*1000);const closed=await r.call('election','bob');assert.equal(closed.data.result.humanBallots,1);assert.equal(closed.data.result.simulatedPublicUnits,1);assert.equal(closed.data.result.winner,'mara-quell');assert.equal((await r.call('election','bob',vote())).status,409);
 await (await r.importModule('lib/world-simulation.ts')).advanceWorld(r.db,Math.floor(r.now/1000));/* #221: the tick records the close GET only shows */r.setNow(open.data.opensAt*1000);assert.equal((await r.call('election','bob',vote())).status,409);
});
test('account preview enforces origin, complete rankings, namespace and current citizenship',async t=>{
 const r=await localRuntime({accountElection:true});t.after(()=>r.close());
 assert.equal((await r.call('election','alice',vote(),'https://foreign.invalid')).status,403);
 assert.equal((await r.call('election','alice',vote(['ines-varro','ines-varro','mara-quell']))).status,400);
 assert.equal((await r.call('election','alice',{...vote(),electionId:'kindle-presidential-poc-1'})).status,400);
 await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='bob'").run();assert.equal((await r.call('election','bob',vote())).status,403);
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM poc_anonymous_ballots').first()).n,0);
});
test('actual approved PostgreSQL path excludes identity/ranking journals and blocks incomplete rollback',async t=>{
 const r=await localRuntime({accountElection:true,backend:'postgres'});t.after(()=>r.close());const command=vote();assert.equal((await r.call('election','alice',command)).status,200);
 const journal=(await r.db.prepare('SELECT id,statements_json FROM harimu_postgres_write_journal ORDER BY id').all()).results;
 const serialized=JSON.stringify(journal);assert.doesNotMatch(serialized,/ranking_json|poc_voter_receipts|poc_anonymous_ballots/);assert.equal(journal.filter(entry=>entry.statements_json.includes('ballotBoundary')).length,1);
 const boundary=journal.filter(entry=>entry.statements_json.includes('ballotBoundary'));const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());assert.throws(()=>replayJournalSqlite(sqlite,boundary),/journal-only replay refused/);
 await assert.rejects(replayJournalD1({prepare(){throw Error('Must not access rollback data.');}},boundary,{maintenanceConfirmed:true}),/journal-only replay refused/);
 await assert.rejects(r.db.batch([r.db.prepare('UPDATE poc_voter_receipts SET ballot_written=1'),r.db.prepare('UPDATE citizens SET capacity=0')]),/dedicated transaction/);assert.equal((await r.db.prepare("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").first()).capacity,18);
 await assert.rejects(r.db.prepare('UPDATE civic_voter_receipts SET ballot_written=1').run(),/disabled pending privacy/);
});
test('corrupt saved aggregate fails closed against frozen authoritative ballots',async t=>{
 const r=await localRuntime({accountElection:true});t.after(()=>r.close());const saved=await r.call('election','alice',vote());r.setNow(saved.data.closesAt*1000);const closed=await r.call('election','alice');await (await r.importModule('lib/world-simulation.ts')).advanceWorld(r.db,Math.floor(r.now/1000));/* #221: the tick records the close GET only shows */const corrupt={...closed.data.result,winner:'mara-quell'};
 await r.db.prepare('UPDATE poc_elections SET result_json=? WHERE id=?').bind(JSON.stringify(corrupt),id).run();await assert.rejects(r.call('election','alice'),/aggregate does not match/);
});

test('both trusted flags are required; production and request claims cannot enable account voting',async t=>{
 for(const bindings of [{NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW:'false',HARIMU_ACCOUNT_ELECTION_POC_ENABLED:'true'},{NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW:'true',HARIMU_ACCOUNT_ELECTION_POC_ENABLED:'false'},{HARIMU_ACCOUNT_ELECTION_POC_ENABLED:'true'}]){
  const r=await localRuntime({accountElectionBindings:bindings});t.after(()=>r.close());const response=await r.call('election','alice',{...vote(),developmentPreview:true,accountElectionEnabled:true});assert.equal(response.status,403);assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM poc_anonymous_ballots').first()).n,0);
 }
});
