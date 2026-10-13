import assert from 'node:assert/strict';
import { executePlayerCommand } from '../lib/player-market.ts';

// Exercise the actual receipt/replay layer; production SQL transfer invariants
// are checked independently by player-market.test.py.
const requestId = '10000000-0000-4000-8000-000000000001';
const listingId = '20000000-0000-4000-8000-000000000002';
function fixture(receipt, afterInsert = receipt) {
  let writes = 0;
  return {
    get writes() { return writes; },
    prepare() { return {
      bind() { return this; },
      async first() { return writes ? afterInsert : receipt; },
      async run() { writes++; },
    }; },
  };
}
const created = { user_id:'alice', action:'create-listing', listing_id:requestId, item:'food', quantity:2, unit_minor:150 };
const create = { action:'create-listing', requestId, item:'food', quantity:2, unitMinor:150 };
for (const [user, command, expected] of [
  ['alice', create, 200],
  ['bob', create, 409],
  ['alice', {...create, quantity:3}, 409],
  ['alice', {...create, unitMinor:151}, 409],
  ['alice', {...create, item:'materials'}, 409],
  ['alice', {action:'cancel-listing',requestId,listingId:requestId}, 409],
]) {
  const db = fixture(created);
  const result = await executePlayerCommand(db,user,command,1000);
  assert.equal(result.status,expected);
  assert.equal(db.writes,0,'existing receipts never reapply a transfer');
  if (expected === 200) assert.equal(result.replayed,true);
}
for (const action of ['buy-listing','cancel-listing']) {
  const record = {...created,action,listing_id:listingId};
  for (const [user, lot, expected] of [['alice',listingId,200],['bob',listingId,409],['alice',requestId,409]]) {
    const db = fixture(record);
    assert.equal((await executePlayerCommand(db,user,{action,requestId,listingId:lot},1000)).status,expected);
    assert.equal(db.writes,0);
  }
}
const rejected = fixture(null,null);
assert.equal((await executePlayerCommand(rejected,'alice',create,1000)).status,409);
assert.equal(rejected.writes,1);
const accepted = fixture(null,created);
assert.equal((await executePlayerCommand(accepted,'alice',create,1000)).status,200);
assert.equal(accepted.writes,1);
console.log('Player market receipt isolation: owner, action, item, quantity, price, listing, rejected/confirmed insert passed');
