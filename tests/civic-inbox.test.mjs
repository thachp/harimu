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
test('collective alerts derive from recorded near thresholds and followed responses, never foreign data or expired windows',()=>{
 const p={id:'collective-fixture',title:'Waterworks audit',createdAt:now/1000-20,expiresAt:now/1000+100,weeklyHumans:100,threshold:3,signatures:2,signed:false,mine:false,status:'collecting',reachedAt:null,response:null};
 const snapshot={nationId:'kindle',asOf:now/1000,weeklyHumans:100,petitions:[p]};
 assert.match(civicInbox([],null,'kindle',now,snapshot)[0].title,/nearing/);
 assert.equal(civicInbox([],null,'korund',now,snapshot).length,0);
 assert.equal(civicInbox([],null,'kindle',now,{...snapshot,petitions:[{...p,expiresAt:now/1000}]}).length,0);
 assert.equal(civicInbox([],null,'kindle',now,{...snapshot,petitions:[{...p,status:'awaiting-response',reachedAt:now/1000-1}]}).length,0);
 const followed={...snapshot,petitions:[{...p,status:'awaiting-response',signed:true,reachedAt:now/1000-1}]};const item=civicInbox([],null,'kindle',now,followed)[0];assert.match(item.title,/awaiting/);assert.equal(item.view,'government');assert.match(item.text,/2 \/ 3 verified/);
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
