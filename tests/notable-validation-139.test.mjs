import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {notableTopics} from '../lib/notable-profiles.ts';
// #139: captured model outputs. The short stub is the shape PM saw (tiny reply, 200 from the gateway).
const shortStub={title:'Ledger',summary:'Work',claims:['completedShifts']}; // a few tokens, no end punctuation
const goodAnswer={title:'Public ledger',summary:'The public ledger records settled work. Completed settlements are recorded events.',claims:['completedShifts']};
const budget={dailyBudgetMicro:970000,gatewayId:'harimu-test'};
const ask=(r,binding,question)=>({requestId:randomUUID(),notableId:'kindle-journalist',topic:'work',...(question?{question}:{})});
const scripted=outputs=>{const calls=[];return {calls,async run(model,input){calls.push({model,input});const next=outputs[calls.length-1];if(next instanceof Error)throw next;return typeof next==='string'?{response:next}:{response:next};}};};
test('#139 a captured good model answer passes validation and is returned as a model reply',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 const ai=scripted([goodAnswer,{supported:true},'safe']);
 const out=await r.answerNotable('alice',ask(r),ai,{enabled:true,budget});
 assert.equal(out.status,200);assert.equal(out.source,'model');assert.match(out.reply,/settled work/);assert.equal(ai.calls.length,3);
});
test('#139 a captured short/invalid model answer degrades to the authored topic example instead of a 503',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 const ai=scripted([shortStub]); // fails at draft parse; never reaches verification
 const out=await r.answerNotable('alice',ask(r),ai,{enabled:true,budget});
 assert.equal(out.status,200);assert.equal(out.source,'authored');assert.equal(out.reply,notableTopics.work.authored);assert.equal(out.failureCode,'validation');
 assert.ok(ai.calls.length>=1); // charged: reached the gateway
 assert.equal((await r.db.prepare('SELECT status FROM harimu_ai_reservations').first()).status,'finished');
});
test('#139 unsupported verification still falls back to the authored example, with the reservation charged',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 const ai=scripted([goodAnswer,{supported:false}]);
 const out=await r.answerNotable('alice',ask(r),ai,{enabled:true,budget});
 assert.equal(out.status,200);assert.equal(out.source,'authored');assert.equal(out.reply,notableTopics.work.authored);
 assert.equal((await r.db.prepare('SELECT status FROM harimu_ai_reservations').first()).status,'finished');
});
test('#139 a malformed gateway reply (no response field) falls back to the authored example, charged',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 const out=await r.answerNotable('alice',ask(r),{async run(){return {};}},{enabled:true,budget});
 assert.equal(out.status,200);assert.equal(out.source,'authored');
 assert.equal((await r.db.prepare('SELECT status FROM harimu_ai_reservations').first()).status,'finished');
});
test('#139 an uncertain transport failure stays 503 and uncertain (outcome unknown)',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 const out=await r.answerNotable('alice',ask(r),{async run(){throw Error('gateway 502');}},{enabled:true,budget});
 assert.equal(out.status,503);assert.equal(out.failureCode,'inference-uncertain');
 assert.equal((await r.db.prepare('SELECT status FROM harimu_ai_reservations').first()).status,'uncertain');
});
