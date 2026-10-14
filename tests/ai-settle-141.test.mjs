import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {aiNotableQuestionReservation,aiModelReservations} from '../lib/ai-budget.ts';
// #141: a Notable validation failure kept the full 136,400 reservation charged although the gateway answered ~150 worth of calls.
const budget={dailyBudgetMicro:970000,gatewayId:'harimu-test'};
const guard=aiModelReservations['@cf/meta/llama-guard-3-8b'],small=aiModelReservations['@cf/meta/llama-3.2-3b-instruct'];
const ask=r=>({requestId:randomUUID(),notableId:'kindle-journalist',topic:'news',question:'What does the public work ledger establish?'});
const row=r=>r.db.prepare('SELECT reserved_micro,status FROM harimu_ai_reservations').first();

test('#141 a Notable question failing draft validation settles to the answered calls and releases the rest',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const answers=['safe',{title:'x'}];let calls=0;
 const result=await r.answerNotable('alice',ask(r),{async run(){calls++;return {response:answers.shift()};}},{enabled:true,budget});
 assert.equal(result.status,503);assert.equal(calls,2);
 const settled=await row(r);assert.equal(settled.status,'finished');assert.equal(settled.reserved_micro,guard+small);assert.ok(settled.reserved_micro<aiNotableQuestionReservation);
});

test('#141 an unsafe input verdict settles to the single guard call',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 assert.equal((await r.answerNotable('alice',ask(r),{async run(){return {response:'unsafe'};}},{enabled:true,budget})).status,503);
 assert.deepEqual({...await row(r)},{reserved_micro:guard,status:'finished'});
});

test('#141 a transport failure after the gateway call still keeps the full reservation',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const answers=['safe'];
 await r.answerNotable('alice',ask(r),{async run(){if(!answers.length)throw Error('network');return {response:answers.shift()};}},{enabled:true,budget});
 assert.deepEqual({...await row(r)},{reserved_micro:aiNotableQuestionReservation,status:'uncertain'});
});
