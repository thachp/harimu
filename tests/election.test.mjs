import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),rules={};
const source=ts.transpileModule(await readFile(new URL('../lib/elections.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
new Function('exports','require',source)(rules,name=>name==='./instant-runoff'?require('../lib/instant-runoff.ts'):name==='./ballot-privacy'?require('../lib/ballot-privacy.ts'):require(name));
const {candidateIds,electionId,ballotWindowSeconds}=rules;
const eligible=(r,user)=>r.setVerification(user,{userId:user,emailVerified:true,phoneVerified:true,phoneUnique:true,revoked:false,checkedAt:r.now,expiresAt:r.now+60000});
const vote=(ranking=candidateIds)=>({action:'vote',electionId,requestId:randomUUID(),ranking});
test('production privacy gate is closed and even verified fixture humans cannot unlock it with request claims',async t=>{
 assert.equal(require('../lib/ballot-privacy.ts').trustedBallotPrivacyReady(),false);
 const r=await localRuntime({ballotPrivacyReady:false});t.after(()=>r.close());eligible(r,'alice');const read=await r.call('election','alice');assert.equal(read.data.privacyReady,false);assert.equal(read.data.status,'waiting');assert.equal(read.data.closesAt,null);
 const result=await r.call('election','alice',{...vote(),privacyReady:true,privacyApproved:true});assert.equal(result.status,403);assert.match(result.data.error,/privacy/i);assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_anonymous_ballots').first()).n,0);assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_elections').first()).n,0);
});
test('an unverified visit waits honestly, never opens a clock or accepts a forged ballot',async t=>{
 const r=await localRuntime({ballotPrivacyReady:true});t.after(()=>r.close());assert.equal((await r.call('election',null)).status,401);const read=await r.call('election','alice');assert.equal(read.data.status,'waiting');assert.equal(read.data.opensAt,null);assert.equal(read.data.closesAt,null);assert.equal(read.data.result,null);
 assert.equal((await r.call('election','alice',{...vote(),tier:1,human:true,verified:true})).status,403);assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_elections').first()).n,0);
 eligible(r,'alice');await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run();assert.equal((await r.call('election','alice')).status,403);
});
test('first verified visit opens one exact 72-hour window; reopening and another visit do not restart it',async t=>{
 const r=await localRuntime({ballotPrivacyReady:true});t.after(()=>r.close());eligible(r,'alice');const first=await r.call('election','alice');assert.equal(first.data.status,'open');assert.equal(first.data.closesAt-first.data.opensAt,ballotWindowSeconds);assert.equal(first.cache,'private, no-store');
 await (await r.importModule('lib/elections.ts')).openPreviewElection(r.db,'alice',Math.floor(r.now/1000),true);/* #221: a write path opens it (GET only projects) */
 r.setNow(r.now+10000);eligible(r,'bob');r.reopen();const next=await r.call('election','bob',undefined,'https://fixture.invalid','?nation=aurelle');assert.equal(next.data.nationId,'kindle');assert.equal(next.data.opensAt,first.data.opensAt);assert.equal(next.data.closesAt,first.data.closesAt);assert.equal(next.data.result,null);
});
test('stored rankings are separated from participation receipts; new receipts cannot vote twice and retry cannot edit the original',async t=>{
 const r=await localRuntime({ballotPrivacyReady:true});t.after(()=>r.close());eligible(r,'alice');const command=vote([...candidateIds].reverse());const first=await r.call('election','alice',command);assert.equal(first.status,200);assert.equal(first.data.voted,true);assert.equal(first.data.result,null);
 assert.equal((await r.call('election','alice',vote())).status,409);assert.equal((await r.call('election','alice',{...command,ranking:candidateIds})).status,200);
 const ballots=await r.db.prepare('SELECT * FROM civic_anonymous_ballots').all();assert.equal(ballots.results.length,1);assert.deepEqual(JSON.parse(ballots.results[0].ranking_json),command.ranking);assert.notEqual(ballots.results[0].id,command.requestId);assert.equal(Object.hasOwn(ballots.results[0],'clerk_user_id'),false);assert.equal(Object.hasOwn(ballots.results[0],'request_id'),false);assert.equal(Object.hasOwn(ballots.results[0],'checked_at'),false);
 assert.equal((await r.db.prepare('SELECT * FROM civic_voter_receipts').all()).results.every(row=>!Object.hasOwn(row,'ranking_json')&&!Object.hasOwn(row,'ballot_id')),true);
 await assert.rejects(r.db.prepare('SELECT rowid FROM civic_anonymous_ballots').all());assert.doesNotMatch(JSON.stringify(first.data),/ranking|request_id|checked_at|Private alice|"alice"|clerk_user_id|humanBallots|simulatedPublicUnits/);
 assert.equal((await r.call('citizen','alice')).data.profile.citizenship.lockedReason,'political-action');assert.equal((await r.call('citizen','alice',{action:'enroll',nationId:'korund',expectedNationId:'kindle'})).status,409);
});
test('results stay hidden before exact close, then human and capped simulated tallies are separate and immutable',async t=>{
 const r=await localRuntime({ballotPrivacyReady:true});t.after(()=>r.close());eligible(r,'alice');eligible(r,'bob');const a=await r.call('election','alice',vote([...candidateIds].reverse()));await r.call('election','bob',vote([...candidateIds].reverse()));const close=a.data.closesAt;
 r.setNow(close*1000-1);const before=await r.call('election','bob');assert.equal(before.data.result,null);assert.equal(before.data.status,'open');
 r.setNow(close*1000);const result=await r.call('election','alice');assert.equal(result.data.status,'closed');assert.equal(result.data.result.humanBallots,2);assert.equal(result.data.result.simulatedPublicUnits,2);assert.equal(result.data.result.winner,candidateIds[2]);assert.equal(result.data.result.weightScale,4);assert.equal(result.data.result.rounds[0].human[candidateIds[2]],2);
 r.reopen();r.setNow(close*1000+1000);assert.deepEqual((await r.call('election','bob')).data.result,result.data.result);assert.doesNotMatch(JSON.stringify(result.data),/ranking_json|ballot_id|receipt|clerk_user_id|"alice"|"bob"/);
 await (await r.importModule('lib/world-simulation.ts')).advanceWorld(r.db,Math.floor(r.now/1000));/* #221: the tick records the close GET only shows */r.setNow(close*1000-5000);eligible(r,'bob');assert.equal((await r.call('election','bob',vote())).status,409);assert.equal((await r.call('election','alice')).data.status,'closed');
});
test('an empty election closes with no simulated weight and no invented winner',async t=>{
 const r=await localRuntime({ballotPrivacyReady:true});t.after(()=>r.close());eligible(r,'alice');await (await r.importModule('lib/elections.ts')).openPreviewElection(r.db,'alice',Math.floor(r.now/1000),true);/* #221: a write path opens it (GET only projects) */const open=await r.call('election','alice');r.setNow(open.data.closesAt*1000);const closed=await r.call('election','alice');assert.equal(closed.data.result.winner,null);assert.equal(closed.data.result.humanBallots,0);assert.equal(closed.data.result.simulatedPublicUnits,0);
});
test('invalid rankings, foreign origins and receipt collisions cannot create extra anonymous ballots',async t=>{
 const r=await localRuntime({ballotPrivacyReady:true});t.after(()=>r.close());eligible(r,'alice');eligible(r,'bob');assert.equal((await r.call('election','alice',vote([candidateIds[0],candidateIds[0],candidateIds[2]]))).status,400);assert.equal((await r.call('election','alice',vote(),'https://foreign.invalid')).status,403);
 const command=vote();const responses=await Promise.all([r.call('election','alice',command),r.call('election','alice',command)]);assert.ok(responses.every(result=>result.status===200));assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_anonymous_ballots').first()).n,1);assert.equal((await r.call('election','bob',command)).status,409);assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_anonymous_ballots').first()).n,1);
});
