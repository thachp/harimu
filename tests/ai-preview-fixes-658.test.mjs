import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
const budget={dailyBudgetMicro:970000,gatewayId:'harimu-test'};
const ask=()=>({requestId:randomUUID(),notableId:'kindle-journalist',topic:'work'});
const good={title:'Public ledger',summary:'The public ledger records settled work. Completed settlements are recorded events.',claims:['completedShifts']};
const scripted=outputs=>{let i=0;return {async run(){return {response:outputs[i++]};}};};
// #658 follow-up: QA2 saw preview news read "a total of citizens" (the model dropped the banned number).
// News and Notables share validatedNewsDraft, so drive it through answerNotable.
const draft=summary=>({title:'Public ledger',summary,claims:['citizens']});
test('#658 drafts with placeholder quantity phrases are rejected; ordinary ledger prose passes',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 for(const [s,ok] of [['The ledger shows a total of citizens. It is public.',false],['Kindle has a total of registered citizens. It is public.',false],['The total of shifts is recorded. It is public.',false],['Totaling citizens, the register grows. It is public.',false],['A number of citizens registered. It is public.',false],
  ['The register counts citizens who have joined. It is public.',true],['The number of registered citizens is shown below. It is public.',true],['Recorded food is part of the public ledger. It is public.',true]]){
  const out=await r.answerNotable('alice',ask(),scripted([draft(s),{supported:true},'safe']),{enabled:true,budget});
  assert.equal(out.source,ok?'model':'authored',s);
 }
});
for(const [name,outputs,where] of [['draft',[{title:'x',summary:'all of it',claims:['food']}],'draft-invalid'],['verification',[good,{supported:false}],'draft-unsupported'],['moderation',[good,{supported:true},'unsafe\nS1'],'output-unsafe']])
 test(`#658 a notable reply rejected at ${name} reports ${where}`,async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  const out=await r.answerNotable('alice',ask(),scripted(outputs),{enabled:true,budget});
  assert.equal(out.source,'authored');assert.equal(out.failureCode,'validation');assert.equal(out.rejectedAt,where);
 });
