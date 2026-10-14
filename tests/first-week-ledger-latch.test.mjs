/** #194: first-week ledger goals latch on write paths (never on GET), with end-to-end coverage for every
 *  event-backed goal and a negative out-of-window case. HARIMU_TEST_STORAGE=postgres runs the same suite on PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const day = 86400;
const completed = async (r, user) => (await r.call('citizen', user)).data.firstWeek.completed;
const rows = async (r, user) => (await r.db.prepare('SELECT goal_id,source FROM citizen_first_week_goals WHERE clerk_user_id=? ORDER BY goal_id').bind(user).all()).results;
async function setup(t) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice');
  const created = Date.parse((await r.db.prepare('SELECT created_at FROM citizens WHERE clerk_user_id=?').bind('alice').first()).created_at);
  const at = (d, extraSec = 600) => created + ((d - 1) * day + extraSec) * 1000; // ms inside arc day d
  r.setNow(at(1, 60)); await earn(r, 'alice'); r.setNow(at(1, 60)); await earn(r, 'bob');
  return { r, at, sec: (d, extra = 600) => Math.floor(at(d, extra) / 1000) };
}
async function earn(r, user) {
  const started = await r.call('citizen', user, { action: 'commit-work', workOrderId: 'harvest' }); assert.equal(started.status, 200, JSON.stringify(started.data));
  const shift = started.data.shifts.find(s => !s.claimedAt); 
  r.setNow(Date.parse(shift.completesAt) + 1000);
  assert.equal((await r.call('citizen', user, { action: 'claim-work', shiftId: shift.id })).status, 200);
}
const buy = (r, user, quantity = 1) => r.call('citizen', user, { action: 'market-trade', side: 'buy', item: 'food', quantity, requestId: randomUUID() });

test('GET /api/citizen never writes; the next write latches the goal', async t => {
  const { r, at } = await setup(t);
  r.setNow(at(2)); assert.equal((await buy(r, 'alice')).status, 200);
  const sell = await r.call('citizen', 'alice', { action: 'market-trade', side: 'sell', item: 'food', quantity: 1, requestId: randomUUID() });
  assert.equal(sell.status, 200, JSON.stringify(sell.data));
  assert.ok((await completed(r, 'alice')).includes('kindle-2-sell'), 'the sell itself latched');
  // Evidence that appears without a write path (inserted directly) is not derived by GET.
  await r.db.prepare('INSERT INTO square_messages(id,user_id,nation_id,body,posted_at) VALUES (?,?,?,?,?)').bind(randomUUID(), 'alice', 'kindle', 'hello', Math.floor(at(3) / 1000)).run();
  r.setNow(at(3, 900));
  const before = JSON.stringify(await rows(r, 'alice'));
  for (let i = 0; i < 2; i++) assert.ok(!(await completed(r, 'alice')).includes('kindle-3-square'));
  assert.equal(JSON.stringify(await rows(r, 'alice')), before, 'GET wrote nothing');
  assert.equal((await buy(r, 'alice', 1)).status, 200);
  const latched = (await rows(r, 'alice')).find(x => x.goal_id === 'kindle-3-square'); assert.equal(latched?.source, 'ledger');
});

test('meal and player trade latch through their real routes (seller included)', async t => {
  const { r, at } = await setup(t);
  r.setNow(at(4)); assert.equal((await buy(r, 'alice', 2)).status, 200);
  await r.db.prepare("UPDATE citizens SET capacity=10 WHERE clerk_user_id='alice'").run();
  const meal = await r.call('citizen', 'alice', { action: 'household-meal', requestId: randomUUID() });
  assert.equal(meal.status, 200, JSON.stringify(meal.data));
  assert.ok((await completed(r, 'alice')).includes('kindle-4-meal'));
  r.setNow(at(6)); assert.equal((await buy(r, 'bob')).status, 200);
  const listingId = randomUUID();
  assert.equal((await r.call('citizen', 'bob', { action: 'create-listing', requestId: listingId, item: 'food', quantity: 1, unitMinor: 100 })).status, 200);
  const fill = await r.call('citizen', 'alice', { action: 'buy-listing', requestId: randomUUID(), listingId });
  assert.equal(fill.status, 200, JSON.stringify(fill.data));
  assert.ok((await completed(r, 'alice')).includes('kindle-6-trade'), 'buyer');
  const bobCreated = Date.parse((await r.db.prepare("SELECT created_at FROM citizens WHERE clerk_user_id='bob'").first()).created_at);
  assert.ok(Math.abs(bobCreated - (at(1, 0))) < 60000, 'bob enrolled with alice');
  assert.ok((await completed(r, 'bob')).includes('kindle-6-trade'), 'seller latched by the buyer\'s write');
});

test('square, ballot, freight shift and Korund queue/coupons latch in their own arc day only', async t => {
  const { r, at, sec } = await setup(t);
  // #86: this arc budgets many 1-food buys against the untaxed wage; income tax is covered in kindle-income-tax-86.
  await r.db.prepare('UPDATE shift_income_tax SET tax_minor=0').run();
  const kindle = [
    ['kindle-3-square', 3, s => r.db.prepare('INSERT INTO square_messages(id,user_id,nation_id,body,posted_at) VALUES (?,?,?,?,?)').bind(randomUUID(), 'alice', 'kindle', 'hi', s).run()],
    ['kindle-6-shift', 6, s => r.db.prepare("UPDATE work_shifts SET claimed_at=? WHERE id=(SELECT id FROM work_shifts WHERE clerk_user_id='alice' LIMIT 1)").bind(new Date(s * 1000).toISOString()).run()],
  ];
  // Retime alice's real settled shift as a freight run (non-food pay).
  await r.db.prepare("UPDATE work_shifts SET order_name='Freight run' WHERE clerk_user_id='alice'").run();
  for (const [goal, d, insert] of kindle) {
    await insert(sec(d - 1 > 0 ? d - 1 : d, 60)); // wrong day first (negative case)
    r.setNow(at(d, 1200)); assert.equal((await buy(r, 'alice', 1)).status, 200);
    if (d > 1) assert.ok(!(await completed(r, 'alice')).includes(goal), `${goal}: evidence on day ${d - 1} does not count for day ${d}`);
    await insert(sec(d, 60)); assert.equal((await buy(r, 'alice', 1)).status, 200);
    assert.ok((await completed(r, 'alice')).includes(goal), goal);
  }
  // Ballot: a written receipt in the day-5 window (the election route latches the same way).
  // The preview election only opens with reviewed ballot privacy; seed the row the receipt references.
  await r.db.prepare("INSERT INTO civic_elections (id,nation_id,candidates_json,opens_at,closes_at) VALUES ('fw-test','kindle','[\"a\",\"b\",\"c\"]',?,?)").bind(sec(5, 0), sec(5, 0) + 259200).run();
  const election = { id: 'fw-test' };
  assert.ok(election, 'a seeded election exists');
  {
    await r.db.prepare("INSERT INTO civic_voter_receipts(election_id,clerk_user_id,request_id,checked_at,ballot_written,policy) VALUES (?,?,?,?,1,'tier1-human-v1')").bind(election.id, 'alice', randomUUID(), sec(5, 60)).run();
    r.setNow(at(5, 1200)); assert.equal((await buy(r, 'alice', 1)).status, 200);
    assert.ok((await completed(r, 'alice')).includes('kindle-5-ballot'));
  }
  // Korund citizen: queue (day 3) and coupons (day 2).
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  const bobCreated = Math.floor(Date.parse((await r.db.prepare("SELECT created_at FROM citizens WHERE clerk_user_id='bob'").first()).created_at) / 1000);
  const bs = (d, x = 60) => bobCreated + (d - 1) * day + x;
  await r.db.prepare("INSERT INTO korund_coupon_redemptions(id,clerk_user_id,game_week,coupon,item,quantity,price_minor,occurred_at) VALUES (?,?,1,'goods','soap',1,50,?)").bind(randomUUID(), 'bob', bs(2)).run();
  await r.db.prepare("INSERT INTO korund_ration_queue(seq,request_id,clerk_user_id,game_week,joined_at,expires_at,status) VALUES (9001,?,?,1,?,?,'cancelled')").bind(randomUUID(), 'bob', bs(3), bs(3) + 3600).run();
  r.setNow((bs(3) + 600) * 1000);
  assert.equal((await r.call('citizen', 'bob', { action: 'first-week-complete', goalId: 'korund-3-square', requestId: randomUUID() })).status, 200);
  const korund = await completed(r, 'bob');
  assert.ok(korund.includes('korund-2-coupons') && korund.includes('korund-3-queue'), JSON.stringify(korund));
  assert.ok(!korund.includes('korund-7-coupons'), 'future day not latched');
});
