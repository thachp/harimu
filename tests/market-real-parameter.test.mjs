import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';

test('integer-valued REAL bindings trade through actual routes and preserve replay/conservation after reopen',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 assert.equal((await r.db.prepare('SELECT typeof(?) AS type').bind(1).first()).type,'real');
 await r.call('citizen','alice',{action:'commit-work',workOrderId:'harvest'});
 const shift=(await r.call('citizen','alice')).data.shifts[0];r.setNow(Date.parse(shift.completesAt));
 assert.equal((await r.call('citizen','alice',{action:'claim-work',shiftId:shift.id})).status,200);
 const total=async()=>r.db.prepare('SELECT (SELECT SUM(balance) FROM citizen_wallet_balances)+(SELECT balance FROM merchant_cash_balance)+(SELECT initial_minor FROM economy_funds WHERE id=\'kindle-employer\')-(SELECT COALESCE(SUM(wage_minor),0) FROM shift_settlements)-(SELECT COALESCE(SUM(spend_minor),0) FROM government_policy_executions) AS cash').first();
 const before=await total();
 const buy={action:'market-trade',requestId:randomUUID(),side:'buy',item:'food',quantity:1};
 const response=await r.call('citizen','alice',buy);assert.equal(response.status,200,response.data.error);assert.equal(response.data.economy.walletMinor,650);
 assert.equal((await r.call('citizen','alice',{...buy,requestId:randomUUID(),side:'sell'})).status,200);
 r.reopen();assert.equal((await r.call('citizen','alice',buy)).status,200);
 assert.equal((await r.call('citizen','alice')).data.economy.walletMinor,750);
 assert.deepEqual(await total(),before);
 const denied=await r.call('citizen','alice',{...buy,requestId:randomUUID(),quantity:1.5});assert.equal(denied.status,400);assert.deepEqual(await total(),before);
});
