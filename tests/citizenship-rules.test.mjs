import assert from 'node:assert/strict';
import { test } from 'node:test';
import { citizenshipGraceMs, citizenshipStatus, validEnrollmentExpectation } from '../lib/citizenship.ts';
const enrolled=Date.parse('2026-10-13T00:00:00.000Z');
const citizen={nation_id:'kindle',nation_changes:0,created_at:new Date(enrolled).toISOString()};
test('citizenship change is available strictly before the 48-hour boundary',()=>{
 assert.equal(citizenshipStatus(citizen,false,enrolled+citizenshipGraceMs-1).canChange,true);
 assert.equal(citizenshipStatus(citizen,false,enrolled+citizenshipGraceMs).lockedReason,'grace-expired');
 assert.equal(citizenshipStatus(citizen,false,enrolled+citizenshipGraceMs+1).canChange,false);
});
test('one used change or political action locks the grace period independently',()=>{
 const used=citizenshipStatus({...citizen,nation_changes:1},false,enrolled);
 assert.equal(used.canChange,false);assert.equal(used.changesRemaining,0);assert.equal(used.lockedReason,'change-used');
 assert.equal(citizenshipStatus(citizen,true,enrolled).lockedReason,'political-action');
 assert.equal(citizenshipStatus({...citizen,nation_id:null},false,enrolled).canChange,false);
});
test('enrollment requires the citizenship the user reviewed, including explicit null for first enrollment',()=>{
 for(const body of [{},{expectedNationId:undefined},{expectedNationId:''},{expectedNationId:1},{expectedNationId:[]},{expectedNationId:{}}]) assert.equal(validEnrollmentExpectation(body),false);
 assert.equal(validEnrollmentExpectation({expectedNationId:null}),true);
 assert.equal(validEnrollmentExpectation({expectedNationId:'kindle'}),true);
});
test('invalid legacy date cannot silently open a grace period or invent a deadline',()=>{
 const state=citizenshipStatus({...citizen,created_at:'invalid'},false,enrolled);
 assert.equal(state.canChange,false);assert.equal(state.lockedReason,'grace-expired');assert.equal(state.graceEndsAt,null);
});
test('future enrollment time and corrupt counters fail closed',()=>{
 const future=citizenshipStatus({...citizen,created_at:new Date(enrolled+1).toISOString()},false,enrolled);
 assert.equal(future.canChange,false);assert.equal(future.graceEndsAt,null);
 for(const nation_changes of [-1,0.5,NaN]) {
  const state=citizenshipStatus({...citizen,nation_changes},false,enrolled);
  assert.equal(state.canChange,false);assert.equal(state.changesRemaining,0);
 }
});
