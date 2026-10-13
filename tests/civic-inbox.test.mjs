import assert from 'node:assert/strict';
import {test} from 'node:test';
import {civicInbox,markInboxRead,unreadInbox} from '../lib/civic-inbox.ts';
const end='2026-10-13T20:00:00Z',now=Date.parse(end),shift={id:'fixture-shift',orderName:'Harvest',completesAt:end,claimedAt:null};
const government={nationId:'kindle',petitions:[{requestId:'fixture-petition',topic:'food',status:'pending',reason:'Awaiting review.',submittedAt:now/1000-10,reviewedAt:null}]};
test('inbox includes only reached, unclaimed valid deadlines and deduplicates national shift views',()=>{
 assert.deepEqual(civicInbox([shift],null,'kindle',now-1),[]);
 const items=civicInbox([shift,shift,{...shift,id:'claimed',claimedAt:end},{...shift,id:'invalid',completesAt:'invalid'}],null,'kindle',now);
 assert.equal(items.length,1);assert.equal(items[0].view,'workplace');assert.match(items[0].text,/does not claim rewards/);assert.equal(shift.claimedAt,null);
});
test('petitions come only from the citizen nation; anonymous and unknown clocks show no entries',()=>{
 assert.equal(civicInbox([],government,'kindle',now).length,1);
 assert.deepEqual(civicInbox([],government,'korund',now),[]);assert.deepEqual(civicInbox([shift],government,null,now),[]);
 for(const clock of [0,NaN,Infinity])assert.deepEqual(civicInbox([shift],government,'kindle',clock),[]);
});
test('unread acknowledgement changes only local read ids; a later petition status becomes unread again',()=>{
 const items=civicInbox([shift],government,'kindle',now);assert.equal(unreadInbox(items,[]),2);
 const read=markInboxRead(items,[]);assert.equal(unreadInbox(items,read),0);assert.equal(items.length,2);assert.equal(shift.claimedAt,null);
 const updated={...government,petitions:[{...government.petitions[0],status:'accepted',reviewedAt:now/1000}]};
 assert.equal(unreadInbox(civicInbox([shift],updated,'kindle',now),read),1);assert.deepEqual(markInboxRead(items,read),read);
 assert.equal(markInboxRead([],Array.from({length:200},(_,i)=>String(i))).length,128);
});
