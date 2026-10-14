import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {readAiBudget,reserveAiSequence} from '../lib/ai-budget.ts';
const now=Date.parse('2026-10-14T09:00:00Z')/1000;
test('actual acceptance charges reconcile once into the shared ledger, preserving both windows and uncertainty',async t=>{
 const r=await localRuntime();t.after(()=>r.close());await Promise.all([r.reconcileAcceptanceCharges(),r.reconcileAcceptanceCharges()]);await r.reconcileAcceptanceCharges();
 const row=await r.db.prepare("SELECT COUNT(*) AS n,SUM(reserved_micro) AS cost,SUM(CASE WHEN status='uncertain' THEN 1 ELSE 0 END) AS uncertain FROM harimu_ai_reservations").first();assert.deepEqual({...row},{n:8,cost:886600,uncertain:3});
 const budget=await readAiBudget(r.db,now);assert.equal(budget.reservedMicroUsd,886600);assert.equal(budget.nextDayReservedMicroUsd,886600);assert.equal(budget.remainingMicroUsd,83400);assert.equal(budget.blocked,false);
 assert.equal(await reserveAiSequence(r.db,randomUUID(),now,now+3600,undefined,true),false);
 const news=await Promise.all([reserveAiSequence(r.db,randomUUID(),now,now+3600),reserveAiSequence(r.db,randomUUID(),now,now+3600)]);assert.equal(news.filter(Boolean).length,1);
 assert.equal((await readAiBudget(r.db,now)).reservedMicroUsd,959000);
 const tomorrow=await readAiBudget(r.db,now+86400);assert.equal(tomorrow.reservedMicroUsd,959000);assert.equal(tomorrow.blocked,true);assert.equal(await reserveAiSequence(r.db,randomUUID(),now+86400,now+90000),false);
 await r.reconcileAcceptanceCharges();assert.equal((await readAiBudget(r.db,now)).reservedMicroUsd,959000);
});
test('accounting collisions fail closed instead of overwriting/refunding an existing charge',async t=>{
 const r=await localRuntime();t.after(()=>r.close());await r.reconcileAcceptanceCharges();await r.db.prepare("UPDATE harimu_ai_reservations SET reserved_micro=136401 WHERE request_id='acceptance:2026-10-14:notable-1'").run();await assert.rejects(r.reconcileAcceptanceCharges(),/accounting mismatch/);assert.equal((await readAiBudget(r.db,now)).reservedMicroUsd,886601);
});

test('single named news prebook uses the global guard, is idempotent and consumes both windows',async t=>{
 const r=await localRuntime();t.after(()=>r.close());await r.reconcileAcceptanceCharges();assert.equal(await r.prebookNewsAcceptance(now,now+3600),true);assert.equal(await r.prebookNewsAcceptance(now,now+3600),true);const budget=await readAiBudget(r.db,now);assert.equal(budget.reservedMicroUsd,959000);assert.equal(budget.nextDayReservedMicroUsd,959000);assert.equal(budget.remainingMicroUsd,11000);assert.equal(await reserveAiSequence(r.db,randomUUID(),now,now+3600),false);
});
