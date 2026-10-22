import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
// Follow-up to #658 / #735: preview Notables were always rejected at draft-invalid because the draft model saw real counts and copied them.
const budget={dailyBudgetMicro:970000,gatewayId:'harimu-test'};
const ask=()=>({requestId:randomUUID(),notableId:'kindle-journalist',topic:'work'});
const good={title:'Public ledger',summary:'The public ledger records settled work. Completed settlements are recorded events.',claims:['completedShifts']};
const scripted=(outputs,onCall)=>{const calls=[];return {calls,async run(model,input){calls.push({model,input});await onCall?.(calls.length);return {response:outputs[calls.length-1]};}};};
const captureWarn=t=>{const lines=[],orig=console.warn;console.warn=(...a)=>{lines.push(a.join(' '));};t.after(()=>{console.warn=orig;});return lines;};
test('draft model context names available counts but contains no digits; verification still gets the real facts',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 const ai=scripted([good,{supported:true},'safe']);
 const out=await r.answerNotable('alice',ask(),ai,{enabled:true,budget});
 assert.equal(out.source,'model');
 const draftUser=JSON.parse(ai.calls[0].input.messages[1].content);
 assert.deepEqual(draftUser.facts.available,['citizens','completedShifts','food']);
 assert.doesNotMatch(JSON.stringify(ai.calls[0].input.messages),/\d/);
 const verifyFacts=JSON.parse(ai.calls[1].input.messages[1].content).facts;
 for(const key of ['citizens','completedShifts','food'])assert.equal(typeof verifyFacts[key],'number');
 // newsDraftText appends the real server-rendered count after approval.
 assert.ok(out.reply.endsWith(`\n${verifyFacts.completedShifts} completed paid shifts.`),out.reply);
});
test('drafts that copy a number or say "a total of" are rejected at draft-invalid',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 for(const summary of ['Kindle has completed shifts with a total of 11. It is public.','The ledger records 11 shifts. It is public.']){
  const out=await r.answerNotable('alice',ask(),scripted([{...good,summary}]),{enabled:true,budget});
  assert.equal(out.source,'authored');assert.equal(out.rejectedAt,'draft-invalid',summary);
 }
});
test('only the a/the total of pattern rejects "A total of paid workers joined."',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 for(const [summary,source] of [['A total of paid workers joined. It is public.','authored'],['Paid workers joined. It is public.','model']]){
  const out=await r.answerNotable('alice',ask(),scripted([{...good,summary},{supported:true},'safe']),{enabled:true,budget});
  assert.equal(out.source,source,summary);
 }
});
test('a nation change after the safety check reports nation-changed and logs the gate',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const lines=captureWarn(t);
 const ai=scripted([good,{supported:true},'safe'],async n=>{if(n===3)await r.db.prepare('UPDATE citizens SET nation_id=? WHERE clerk_user_id=?').bind('korund','alice').run();});
 const out=await r.answerNotable('alice',ask(),ai,{enabled:true,budget});
 assert.equal(out.status,503);assert.equal(out.failureCode,'validation');
 assert.ok(lines.includes('[notables] reply rejected at nation-changed'),lines.join('|'));
});
test('a draft-invalid rejection logs "[notables] reply rejected at draft-invalid"',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const lines=captureWarn(t);
 await r.answerNotable('alice',ask(),scripted([{...good,summary:'All of it.'}]),{enabled:true,budget});
 assert.deepEqual(lines.filter(l=>l.startsWith('[notables]')),['[notables] reply rejected at draft-invalid']);
});
test('the size limit reports input-too-long, not input-unsafe, and sends nothing',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const lines=captureWarn(t);
 const Orig=globalThis.TextEncoder;t.after(()=>{globalThis.TextEncoder=Orig;});
 globalThis.TextEncoder=class extends Orig{encode(s){return String(s).startsWith('[{"role"')?new Uint8Array(12001):super.encode(s);}};
 const ai=scripted([]);
 const out=await r.answerNotable('alice',ask(),ai,{enabled:true,budget});
 assert.equal(out.failureCode,'not-sent');assert.equal(out.rejectedAt,'input-too-long');assert.equal(ai.calls.length,0);
 assert.ok(lines.includes('[notables] reply rejected at input-too-long'));
});
