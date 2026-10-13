import assert from 'node:assert/strict';
import {test} from 'node:test';
import {simulateGovernment} from '../lib/government.ts';
import {publicGovernmentSnapshot,governmentDisclosure} from '../lib/government-disclosure.ts';
test('Kindle publishes public rationale while closed nations publish only official text',()=>{
 for(const nationId of ['kindle','korund','aurelle']){
  const snapshot=simulateGovernment({nationId,availableBudgetMinor:1000,foodSecurity:35,petitionCounts:{food:2,work:1,infrastructure:0}});
  snapshot.privateAlternatives='PRIVATE_ALTERNATIVE';
  snapshot.petitions=[{requestId:'p',topic:'work',submittedAt:1,status:'deferred',reason:'PRIVATE_REVIEW_REASON',reviewedAt:2}];
  const published=publicGovernmentSnapshot(snapshot);
  assert.ok(!JSON.stringify(published).includes('PRIVATE_ALTERNATIVE'));
  if(nationId==='kindle'){assert.equal(published.decision.reason,snapshot.decision.reason);assert.equal(governmentDisclosure(published).kind,'brief');}
  else{assert.ok(!JSON.stringify(published).includes('PRIVATE_REVIEW_REASON'));assert.ok(!JSON.stringify(published).includes('35/100'));assert.equal(governmentDisclosure(published).kind,'official');}
 }
});

import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
for (const nationId of ['kindle', 'korund', 'aurelle']) {
 test(`${nationId} citizen responses filter current and recorded deliberation across read, petition and reopen`, async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare('UPDATE citizens SET nation_id=?').bind(nationId).run();
  r.setVerification('alice', {userId:'alice',emailVerified:true,phoneVerified:true,phoneUnique:true,revoked:false,checkedAt:r.now,expiresAt:r.now+60000});
  const response = await r.call('citizen','alice',{action:'government-petition',topic:'work',requestId:randomUUID()});
  assert.equal(response.status,200);
  const assertDisclosure = government => {
   if(nationId==='kindle') assert.match(government.decision.reason,/Food security|petition/);
   else assert.doesNotMatch(JSON.stringify(government),/Food security is|safety threshold|ties favor|proposal is capped|Recorded review inputs/);
  };
  assertDisclosure(response.data.government);
  r.setNow(r.now+86400000);
  for(let attempt=0;attempt<2;attempt++) {
   const read=await r.call('citizen','alice'); assert.equal(read.status,200);assertDisclosure(read.data.government);
   assert.equal(read.data.government.petitions.length,1);
   const internal=await r.readGovernment(nationId,'alice');
   assert.match(internal.petitions[0].reason,/Food security|petition/);
   if(nationId!=='kindle') assert.doesNotMatch(read.data.government.petitions[0].reason,/Food security|threshold|capped/);
   r.reopen();
  }
 });
}
