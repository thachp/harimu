import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
const enrollment=page.slice(page.indexOf("body: JSON.stringify({ action: 'enroll'"),page.indexOf('  function beginEnrollment'));
const apply=enrollment.slice(enrollment.indexOf("      if (typeof result.capacity"),enrollment.indexOf('    } catch'));
function confirm(result){
  const calls=[];
  const setters=['setGovernment','setVerification','setSimulation','setEnrollmentError','setCapacity','setCitizenNationId','setSelectedId','setKorundPlan','setAurellePlan','setCitizenshipStatus','setEconomy','setMarket','setPlayerMarket','closeEnrollmentReview','changeView'];
  new Function('result',...setters,apply)(result,...setters.map(name=>value=>calls.push([name,value])));
  return calls;
}
test('oath success applies returned capacity before Work and never invents a refill',()=>{
  for(const capacity of [18,7,0]){
    const calls=confirm({nationId:'kindle',capacity});
    assert.deepEqual(calls[0],['setCapacity',capacity]);
    assert.deepEqual(calls.at(-1),['changeView','workplace']);
  }
});
test('incomplete enrollment response cannot enter Work with stale zero capacity',()=>{
  for(const capacity of [undefined,null,NaN]){
    const calls=confirm({nationId:'kindle',capacity});
    assert.equal(calls.length,1);assert.equal(calls[0][0],'setEnrollmentError');
  }
});
