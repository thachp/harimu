import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
const incomplete={title:'Public Record Incomplete',summary:'The public record does not establish specific details about the work ledger.',claims:['citizens','completedShifts','food']};
const ledger={title:'Public ledger',summary:'The ledger records registered citizens and completed paid work.',claims:['citizens','completedShifts','food']};
test('captured incomplete-ledger prose remains rejected by explicit false verification; news is independently publishable',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const calls=[],answers=['safe',{...incomplete},{supported:false}];const bad={async run(model,input){calls.push({model,input});return {response:answers.shift()};}};
 const result=await r.answerNotable('alice',{requestId:randomUUID(),notableId:'kindle-journalist',topic:'news',question:'What does the public work ledger establish?'},bad,{enabled:true,priceReviewedUntil:Math.floor(r.now/1000)+3600});assert.equal(result.status,503);assert.equal(result.reply,undefined);assert.equal(calls.length,3);
 const replies=[ledger,{supported:true},'safe'],newsCalls=[];r.setFixtureAiBinding({async run(model,input){newsCalls.push({model,input});assert.doesNotMatch(JSON.stringify(input),/Private alice|privateDraft|private household/);return {response:replies.shift()};}});r.setFixtureAiFlags({news:true,notables:false});
 const news=await r.call('news','alice');assert.equal(news.status,200);assert.equal(newsCalls.length,3);assert.ok(news.data.items.some(item=>item.source==='model'&&item.text.includes('0 completed paid shifts')));assert.equal((await r.call('notables','alice')).data.enabled,false);
});
test('Notable availability uses its own switch rather than the news switch',async t=>{
 const r=await localRuntime();t.after(()=>r.close());r.setFixtureAiBinding({async run(){throw Error('GET must not infer');}});r.setFixtureAiFlags({news:false,notables:true});assert.equal((await r.call('notables','alice')).data.enabled,true);
});
