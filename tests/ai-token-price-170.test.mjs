import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {meteredAiCallCost,meteredAiCost,aiModelReservations,aiModelTokenPrices} from '../lib/ai-budget.ts';
const small='@cf/meta/llama-3.2-3b-instruct',guard='@cf/meta/llama-guard-3-8b';

test('#170 valid provider usage is priced per token, rounded up and never above the per-call bound',()=>{
 // guard: 300 input tokens x 0.484 + 1 output x 0.030 = 145.23 -> 146 micro-USD
 assert.equal(meteredAiCallCost({model:guard,usage:{prompt_tokens:300,completion_tokens:1}}),146);
 // 3B: 600 in x 0.051 + 120 out x 0.335 = 30.6 + 40.2 = 70.8 -> 71
 assert.equal(meteredAiCallCost({model:small,usage:{prompt_tokens:600,completion_tokens:120}}),71);
 assert.equal(meteredAiCallCost({model:small,usage:{prompt_tokens:0,completion_tokens:0}}),1);
 assert.equal(meteredAiCallCost({model:guard,usage:{prompt_tokens:1_000_000,completion_tokens:0}}),aiModelReservations[guard]);
 assert.equal(meteredAiCost([{model:guard,usage:{prompt_tokens:300,completion_tokens:1}},{model:small,usage:{prompt_tokens:600,completion_tokens:120}}]),217);
 for(const m of [small,guard])assert.ok(aiModelTokenPrices[m].inputPerM>0&&aiModelTokenPrices[m].outputPerM>0);
});

test('#170 missing or implausible usage falls back to the per-call bound',()=>{
 for(const usage of [undefined,null,'x',{},{prompt_tokens:10},{prompt_tokens:-1,completion_tokens:1},{prompt_tokens:1.5,completion_tokens:1},{prompt_tokens:'10',completion_tokens:1},{prompt_tokens:10,completion_tokens:257},{prompt_tokens:2_000_000,completion_tokens:1}])
  assert.equal(meteredAiCallCost({model:guard,usage}),aiModelReservations[guard]);
 assert.equal(meteredAiCallCost(small),aiModelReservations[small]);
});

test('#170 a Notable validation failure with reported usage books the true token cost',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const usage=[{prompt_tokens:300,completion_tokens:1},{prompt_tokens:600,completion_tokens:120}];const answers=['safe',{title:'x'}];
 await r.answerNotable('alice',{requestId:randomUUID(),notableId:'kindle-journalist',topic:'news',question:'What does the public work ledger establish?'},{async run(){return {response:answers.shift(),usage:usage.shift()};}},{enabled:true,budget:{dailyBudgetMicro:970000,gatewayId:'harimu-test'}});
 assert.deepEqual({...await r.db.prepare('SELECT reserved_micro,status FROM harimu_ai_reservations').first()},{reserved_micro:217,status:'finished'});
});
