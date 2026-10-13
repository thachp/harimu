import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
test('foreign citizens cannot read the Kindle market board while owners retain escrow cancellation',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 for(const user of ['alice','bob'])assert.equal((await r.call('citizen',user,{action:'create-listing',requestId:randomUUID(),item:'food',quantity:1,unitMinor:125})).status,200);
 const before=(await r.call('citizen','alice')).data;
 const own=before.playerMarket.listings.find(l=>l.mine),other=before.playerMarket.listings.find(l=>!l.mine);
 assert.ok(own&&other);assert.ok(before.market.quotes.length);
 const changed=await r.call('citizen','alice',{action:'enroll',nationId:'korund',expectedNationId:'kindle'});assert.equal(changed.status,200);
 for(const snapshot of [changed.data,(await r.call('citizen','alice')).data]){
  assert.equal(snapshot.market.available,false);assert.deepEqual(snapshot.market.quotes,[]);assert.equal(snapshot.market.merchantCashMinor,0);
  assert.equal(snapshot.playerMarket.available,false);assert.ok(snapshot.playerMarket.listings.every(l=>l.mine));assert.ok(snapshot.playerMarket.listings.some(l=>l.id===own.id));
  assert.ok(!snapshot.playerMarket.listings.some(l=>l.id===other.id));
 }
 const command={action:'cancel-listing',listingId:own.id,requestId:randomUUID()};
 const cancelled=await r.call('citizen','alice',command);assert.equal(cancelled.status,200);
 assert.equal(cancelled.data.playerMarket.listings.find(l=>l.id===own.id).status,'cancelled');
 assert.ok(cancelled.data.playerMarket.listings.every(l=>l.mine));
 assert.equal((await r.call('citizen','alice',command)).status,200);
 const refused=await r.call('citizen','alice',{action:'market-trade',side:'buy',item:'food',quantity:1,requestId:randomUUID(),nationId:'kindle'});assert.equal(refused.status,409);assert.deepEqual(refused.data.market.quotes,[]);
 const kindle=(await r.call('citizen','bob')).data;assert.ok(kindle.market.quotes.length);assert.equal(kindle.playerMarket.available,true);
});
