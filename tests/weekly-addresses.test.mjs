import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
async function fixture(){const r=await localRuntime();await r.call('world',null);return r;}
const read=(r,user,query='')=>r.call('addresses',user,undefined,'https://fixture.invalid',query);
for(const nationId of ['kindle','korund','aurelle'])test(`${nationId} authored address publishes once per real week and retains immutable transcripts`,async t=>{
 const r=await fixture();t.after(()=>r.close());await r.db.prepare('UPDATE citizens SET nation_id=?').bind(nationId).run();
 const a=await read(r,'alice','?nationId=foreign');assert.equal(a.status,200);assert.equal(a.cache,'private, no-store');assert.equal(a.data.nationId,nationId);assert.equal(a.data.addresses.length,1);
 const initial=a.data.addresses[0];assert.equal(initial.provenance,'authored-poc');assert.equal(initial.agree,0);assert.equal(initial.disagree,0);assert.equal(initial.ownReaction,null);
 assert.doesNotMatch(initial.transcript,/112%|Grain rose|subsidy|Cabinet will answer Thursday/);
 assert.deepEqual((await read(r,'bob')).data.addresses[0],initial);
 r.setNow(a.data.nextAddressAt*1000-1);assert.equal((await read(r,'alice')).data.addresses.length,1);
 r.setNow(a.data.nextAddressAt*1000);const next=await read(r,'alice');assert.equal(next.data.addresses.length,2);assert.deepEqual(next.data.addresses[1],initial);
 r.reopen();assert.deepEqual((await read(r,'alice')).data.addresses,next.data.addresses);
 r.setNow((next.data.nextAddressAt+3*604800)*1000);assert.equal((await read(r,'alice')).data.addresses.length,3); // skipped weeks are not fabricated
});
test('address reactions bind retries to own intent, never cross nations or alter government resources',async t=>{
 const r=await fixture();t.after(()=>r.close());const a=await read(r,'alice'),address=a.data.addresses[0];
 const before=(await r.call('citizen','alice')).data;const command={action:'react',requestId:randomUUID(),addressId:address.id,expectedNationId:'kindle',reaction:'agree'};
 for(let i=0;i<2;i++)assert.equal((await r.call('addresses','alice',command)).status,200);
 assert.equal((await r.call('addresses','alice',{...command,reaction:'disagree'})).status,409);
 assert.equal((await r.call('addresses','bob',command)).status,409);
 assert.equal((await r.call('addresses','alice',{...command,requestId:randomUUID(),reaction:'disagree'})).status,409);
 const current=(await read(r,'bob')).data.addresses[0];assert.equal(current.agree,1);assert.equal(current.ownReaction,null);
 await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
 assert.equal((await r.call('addresses','bob',{...command,requestId:randomUUID(),expectedNationId:'korund'})).status,409);
 assert.equal((await read(r,'bob')).data.addresses.some(a=>a.id===address.id),false);
 const after=(await r.call('citizen','alice')).data;assert.deepEqual(after.profile,before.profile);assert.deepEqual(after.economy,before.economy);assert.deepEqual(after.government,before.government);assert.equal(after.verification.tier,0);
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_petition_signatures').first()).n,0);
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM civic_voter_receipts').first()).n,0);
 assert.doesNotMatch(JSON.stringify((await read(r,'alice')).data),/alice|bob|user_id|request_id|Private/);
});
test('archive pagination preserves older transcripts and access failures never publish',async t=>{
 const r=await fixture();t.after(()=>r.close());assert.equal((await read(r,null)).status,401);
 await r.db.prepare("UPDATE citizens SET nation_id=NULL WHERE clerk_user_id='bob'").run();assert.equal((await read(r,'bob')).status,403);
 await r.db.prepare("UPDATE citizens SET nation_id='fulmara' WHERE clerk_user_id='bob'").run();assert.equal((await read(r,'bob')).status,404);
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM weekly_addresses').first()).n,0);
 for(let i=0;i<14;i++){const a=await read(r,'alice');r.setNow(a.data.nextAddressAt*1000);}
 const page=await read(r,'alice');assert.equal(page.data.addresses.length,12);assert.ok(page.data.nextBeforeWeek>0);
 const older=await read(r,'alice',`?beforeWeek=${page.data.nextBeforeWeek}`);assert.equal(older.data.addresses.length,3);assert.equal(older.data.nextBeforeWeek,null);
 assert.equal((await read(r,'alice','?beforeWeek=-1')).status,400);
 assert.equal((await r.call('addresses','alice',{action:'react'},'https://foreign.invalid')).status,403);
});
const voice={kindle:/Forgehaven|spark/i,korund:/brigade|One hammer, one heart/,aurelle:/Hear ye|by leave of the Crown/i};
for(const nationId of Object.keys(voice))test(`#118 ${nationId} weekly addresses speak in nation voice without announcing outcomes`,async t=>{
 const r=await fixture();t.after(()=>r.close());await r.db.prepare('UPDATE citizens SET nation_id=?').bind(nationId).run();
 const first=await read(r,'alice');r.setNow(first.data.nextAddressAt*1000);
 const seen=(await read(r,'alice')).data.addresses.map(a=>a.transcript);assert.equal(seen.length,2);assert.notEqual(seen[0],seen[1]);
 for(const text of seen){assert.match(text,voice[nationId]);assert.match(text,/\bno\b|\bnot\b/i);assert.doesNotMatch(text,/Notable|\d+%|guarantee/);assert.match(text,/\bauthored\b|simulated leaders/,"every transcript keeps its authored or simulated-leaders disclaimer");}
 if(nationId!=='korund')assert.match(seen.join(' '),/simulated leaders/);
});
