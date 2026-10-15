/** #224: congregations and the Officiant seat through the real routes. HARIMU_TEST_STORAGE=postgres runs it on PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const gameDay = 7200 * 1000;
const cmd = (r, user, action, requestId = randomUUID()) => r.call('congregations', user, { action, requestId });
const faith = (r, user, faithId) => r.call('faith', user, { action: 'choose-faith', faithId, requestId: randomUUID() });
const panel = async (r, user = null) => (await r.call('congregations', user)).data;
const cong = (p, id) => p.congregations.find(c => c.id === id);
async function runtime(t) { const r = await localRuntime(); t.after(() => r.close()); r.setFaith(true); return r; }
async function citizen(r, id, nation, name = id) {
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, name, at, at).run();
}
const kinwardForge = p => p.congregations.find(c => c.faithId === 'kinward-rite' && c.nationId === 'kindle');

test('congregations ride HARIMU_FAITH_ENABLED (preview wrangler "true", code default off)', async t => {
  const { readFile } = await import('node:fs/promises');
  assert.match(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), /"HARIMU_FAITH_ENABLED"\s*:\s*"true"/);
  const r = await localRuntime(); t.after(() => r.close());
  const p = await panel(r, 'alice');
  assert.equal(p.enabled, false); assert.equal(p.congregations.length, 9); assert.ok(p.congregations.every(c => c.members === 0 && c.officiant === null));
  assert.equal((await cmd(r, 'alice', 'join-congregation')).data.reason, 'disabled');
});

test('one congregation per MVP faith per MVP capital; join and leave once per game day, idempotent', async t => {
  const r = await runtime(t);
  assert.equal((await cmd(r, 'alice', 'join-congregation')).data.reason, 'no_faith', 'Unaffiliated has no congregation');
  await faith(r, 'alice', 'kinward-rite');
  const id = randomUUID();
  const joined = await cmd(r, 'alice', 'join-congregation', id);
  assert.equal(joined.status, 200, JSON.stringify(joined.data));
  const forge = kinwardForge(joined.data.state); assert.equal(forge.members, 1); assert.equal(joined.data.state.you.congregationId, forge.id);
  assert.equal((await cmd(r, 'alice', 'join-congregation', id)).status, 200, 'retry is a replay');
  assert.equal(kinwardForge(await panel(r)).members, 1, 'signed-out panel shows the live headcount');
  const leaveToday = await cmd(r, 'alice', 'leave-congregation');
  assert.equal(leaveToday.data.reason, 'once_per_day'); assert.match(leaveToday.data.error, /once per game day/);
  r.setNow(r.now + gameDay);
  const leaveId = randomUUID();
  assert.equal((await cmd(r, 'alice', 'leave-congregation', leaveId)).status, 200);
  assert.equal((await cmd(r, 'alice', 'leave-congregation', leaveId)).data.replay, true);
  assert.equal(kinwardForge(await panel(r)).members, 0);
  // Korund: public congregations are not permitted (14.6).
  await citizen(r, 'kai', 'korund'); await r.call('faith', 'kai', { action: 'choose-faith', faithId: 'unaffiliated', hiddenFaithId: 'open-hand', requestId: randomUUID() });
  assert.equal((await cmd(r, 'kai', 'join-congregation')).data.reason, 'not_permitted');
});

test('changing faith ends membership on read, with no write', async t => {
  const r = await runtime(t);
  await faith(r, 'alice', 'kinward-rite'); await cmd(r, 'alice', 'join-congregation');
  r.setNow(r.now + 60 * 86400 * 1000);
  await faith(r, 'alice', 'open-hand');
  const p = await panel(r, 'alice');
  assert.equal(kinwardForge(p).members, 0); assert.equal(p.you.congregationId, null);
});

test('Officiant: highest-Devotion opt-in, 7-game-day challenge, successor when the holder leaves', async t => {
  const r = await runtime(t);
  await citizen(r, 'cg-bob', 'kindle', 'Bob'); await citizen(r, 'cg-cat', 'kindle', 'Cat');
  for (const u of ['alice', 'cg-bob', 'cg-cat']) { await faith(r, u, 'kinward-rite'); assert.equal((await cmd(r, u, 'join-congregation')).status, 200); }
  // Bob worships 3 days, Alice 1 day, Cat never.
  for (let d = 0; d < 3; d++) { await r.call('faith', 'cg-bob', { action: 'attend-worship', requestId: randomUUID() }); if (d === 2) await r.call('faith', 'alice', { action: 'attend-worship', requestId: randomUUID() }); r.setNow(r.now + gameDay); }
  r.setNow(r.now - gameDay);
  assert.equal(kinwardForge(await panel(r)).officiant, null, 'nobody opted in');
  assert.equal((await cmd(r, 'alice', 'stand-for-officiant')).data.seated, true, 'only opt-in takes the empty seat');
  assert.equal(kinwardForge(await panel(r)).officiant.name, 'Private alice');
  // Bob has more Devotion but must wait until Alice has held it 7 game days.
  assert.equal((await cmd(r, 'cg-bob', 'stand-for-officiant')).data.seated, false);
  r.setNow(r.now + 7 * gameDay);
  await r.call('faith', 'cg-bob', { action: 'attend-worship', requestId: randomUUID() });
  assert.equal((await cmd(r, 'cg-bob', 'stand-for-officiant')).data.seated, true);
  assert.equal(kinwardForge(await panel(r)).officiant.name, 'Bob');
  // Bob leaves: the panel shows the next opted-in member at once, without a write.
  r.setNow(r.now + gameDay);
  await cmd(r, 'cg-bob', 'leave-congregation');
  assert.equal(kinwardForge(await panel(r)).officiant.name, 'Private alice');
  assert.equal((await cmd(r, 'cg-cat', 'officiate')).data.reason, 'not_officiant');
});

test('Officiant service: once per game day, small Devotion bonus', async t => {
  const r = await runtime(t);
  await faith(r, 'alice', 'open-hand'); await cmd(r, 'alice', 'join-congregation'); await cmd(r, 'alice', 'stand-for-officiant');
  const before = (await r.call('faith', 'alice')).data.devotion.value;
  const id = randomUUID();
  assert.equal((await cmd(r, 'alice', 'officiate', id)).status, 200);
  assert.equal((await cmd(r, 'alice', 'officiate', id)).data.replay, true);
  assert.equal((await cmd(r, 'alice', 'officiate')).data.reason, 'already_officiated');
  assert.equal((await r.call('faith', 'alice')).data.devotion.value, before + 2);
  assert.equal((await panel(r, 'alice')).you.officiatedToday, true);
});

test('GET /api/congregations makes no writes, even when the seat would change', async t => {
  const r = await runtime(t);
  await citizen(r, 'cg-bob', 'kindle', 'Bob');
  for (const u of ['alice', 'cg-bob']) { await faith(r, u, 'kinward-rite'); await cmd(r, u, 'join-congregation'); await cmd(r, u, 'stand-for-officiant'); }
  r.setNow(r.now + gameDay); await cmd(r, 'alice', 'leave-congregation'); await cmd(r, 'cg-bob', 'stand-down');
  const writes = []; const prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 60)); return prepare(sql); };
  r.db.batch = s => { writes.push('batch'); return batch(s); };
  try { for (const u of ['alice', 'cg-bob', null]) assert.equal((await r.call('congregations', u)).status, 200); } finally { r.db.prepare = prepare; r.db.batch = batch; }
  assert.deepEqual(writes, []);
});

test('congregations and clergy never touch wages, production, the market or combat', async t => {
  const outcome = async member => {
    const r = await localRuntime(); r.setFaith(true);
    try {
      if (member) { await faith(r, 'alice', 'kinward-rite'); await cmd(r, 'alice', 'join-congregation'); await cmd(r, 'alice', 'stand-for-officiant'); await cmd(r, 'alice', 'officiate'); }
      const started = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' });
      const shift = started.data.shifts.find(s => !s.claimedAt);
      r.setNow(Date.parse(shift.completesAt) + 1000);
      const claimed = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id });
      const world = (await r.call('world', null)).data;
      return { wage: shift.wageMinor, reward: [shift.rewardItem, shift.rewardQuantity], claim: claimed.status, capacity: claimed.data.citizen?.capacity ?? null,
        orders: world.workOrders.map(o => `${o.name}:${o.detail}`).join('|') };
    } finally { await r.close(); }
  };
  assert.deepEqual(await outcome(true), await outcome(false));
  const { readFile, readdir } = await import('node:fs/promises');
  for (const f of (await readdir(new URL('../lib/', import.meta.url))).filter(f => /^(economy|market|work|shift|order-book|wallet|npc|spoilage|world-registry|city-founding|korund|combat|war)/.test(f)))
    assert.doesNotMatch(await readFile(new URL(`../lib/${f}`, import.meta.url), 'utf8'), /congregation|officiant/i, f);
});

// #292: tie at the 100 Devotion cap. Worship rows are seeded per game day (offset from the start day) so members reach the cap on known days:
// worshipping every day from day W gives 3, 6, ... so the cap is first reached on day W+33 and held after.
async function capScenario(t, { worship, join, order }) {
  const r = await runtime(t);
  const start = r.now, day0 = Math.floor(start / gameDay);
  const users = Object.keys(worship);
  for (const u of users) if (u !== 'alice') await citizen(r, u, 'kindle', u);
  for (const u of users) await faith(r, u, 'kinward-rite');
  for (const d of [...new Set(Object.values(join))].sort()) {
    r.setNow(start + d * gameDay);
    for (const u of order.filter(x => join[x] === d)) assert.equal((await cmd(r, u, 'join-congregation')).status, 200);
  }
  for (const [u, [from, to]] of Object.entries(worship)) for (let d = from; d <= to; d++)
    await r.db.prepare('INSERT INTO citizen_worship (user_id,game_day,faith_id,worshipped_at,request_id) VALUES (?,?,?,?,?)').bind(u, day0 + d, 'kinward-rite', start, randomUUID()).run();
  const at = d => r.setNow(start + d * gameDay);
  const stand = (u, d) => { at(d); return cmd(r, u, 'stand-for-officiant'); };
  const holder = async d => { at(d); return kinwardForge(await panel(r)).officiant?.name; };
  return { r, at, stand, holder, day0 };
}

test('Officiant cap tie: a challenger tied at the cap takes the seat on its 7th consecutive day at the cap, not the 6th', async t => {
  // Alice is at the cap from day 33 and takes the seat on day 40. Bob starts on day 20, so he first sits at the cap on day 53 (streak 7 on day 59).
  const s = await capScenario(t, { worship: { alice: [0, 80], 'cg-bob': [20, 100] }, join: { alice: 0, 'cg-bob': 0 }, order: ['alice', 'cg-bob'] });
  assert.equal((await s.stand('alice', 40)).data.seated, true);
  assert.equal((await s.stand('cg-bob', 40)).data.seated, false);
  assert.equal((await s.stand('cg-bob', 58)).data.seated, false, '6 consecutive days at the cap is not enough');
  assert.equal(await s.holder(58), 'Private alice');
  assert.equal((await s.stand('cg-bob', 59)).data.seated, true, 'the 7th consecutive day at the cap takes the seat');
  assert.equal(await s.holder(59), 'cg-bob');
});

test('Officiant cap tie: a holder with fewer than 7 game days in the seat keeps it', async t => {
  const s = await capScenario(t, { worship: { alice: [0, 80], 'cg-bob': [0, 80] }, join: { alice: 0, 'cg-bob': 0 }, order: ['alice', 'cg-bob'] });
  assert.equal((await s.stand('alice', 40)).data.seated, true);
  assert.equal((await s.stand('cg-bob', 40)).data.seated, false, 'both are long at the cap, but the seat is new');
  assert.equal((await s.stand('cg-bob', 46)).data.seated, false, 'holder has held it 6 game days');
  assert.equal((await s.stand('cg-bob', 47)).data.seated, true, 'holder has held it 7 game days');
});

test('Officiant cap tie: a challenger who has not been at the cap 7 days waits, and a dip below the cap resets the streak', async t => {
  // Bob sits at the cap on days 33-60, skips worship on day 61 (99 on day 61, ties no more), is back at the cap on day 62 (streak restarts at 1).
  const s = await capScenario(t, { worship: { alice: [0, 100], 'cg-bob': [0, 60] }, join: { alice: 0, 'cg-bob': 0 }, order: ['alice', 'cg-bob'] });
  assert.equal((await s.stand('alice', 20)).data.seated, true);
  for (let d = 62; d <= 80; d++) await s.r.db.prepare('INSERT INTO citizen_worship (user_id,game_day,faith_id,worshipped_at,request_id) VALUES (?,?,?,?,?)').bind('cg-bob', s.day0 + d, 'kinward-rite', s.r.now, randomUUID()).run();
  assert.equal((await s.stand('cg-bob', 20)).data.seated, false);
  assert.equal((await s.stand('cg-bob', 61)).data.seated, false, 'Bob is at 99 on day 61, below the cap');
  assert.equal(await s.holder(61), 'Private alice');
  assert.equal((await s.stand('cg-bob', 67)).data.seated, false, 'streak since day 62 is 6 days');
  assert.equal((await s.stand('cg-bob', 68)).data.seated, true, 'streak since day 62 is 7 days');
});

test('Officiant cap tie: several qualified challengers go to longest at the cap, then earliest join, then lowest id', async t => {
  // Everybody opts in on day 30 (nobody at the cap yet except none), then nothing is written until day 60, when two challengers qualify at once.
  const run = async (join, order, worship, expected, msg) => {
    const s = await capScenario(t, { worship, join, order });
    assert.equal((await s.stand('alice', 30)).data.seated, true);
    for (const u of order.filter(x => x !== 'alice')) assert.equal((await s.stand(u, 30)).data.seated, false);
    assert.equal(await s.holder(60), 'Private alice', 'GET never moves the seat');
    await s.stand(order.at(-1), 60);
    assert.equal(await s.holder(60), expected, msg);
  };
  // Cat has been at the cap longest (from day 43) although Bob joined first.
  await run({ alice: 0, 'cg-bob': 0, 'cg-cat': 1 }, ['alice', 'cg-bob', 'cg-cat'], { alice: [0, 90], 'cg-bob': [20, 90], 'cg-cat': [10, 90] }, 'cg-cat', 'longest at cap wins over earlier join');
  // Same streak: Cat joined on day 0 and Bob on day 1, so Cat wins although Bob has the lower id.
  await run({ alice: 0, 'cg-cat': 0, 'cg-bob': 1 }, ['alice', 'cg-cat', 'cg-bob'], { alice: [0, 90], 'cg-bob': [10, 90], 'cg-cat': [10, 90] }, 'cg-cat', 'earliest join wins on equal streaks');
  // Same streak, same join time: lowest id wins (Bob), whatever order they joined in.
  await run({ alice: 0, 'cg-cat': 0, 'cg-bob': 0 }, ['alice', 'cg-cat', 'cg-bob'], { alice: [0, 90], 'cg-bob': [10, 90], 'cg-cat': [10, 90] }, 'cg-bob', 'lowest id wins on equal streak and join');
});

test('Officiant cap tie: GET stays read-only and the flag off changes nothing', async t => {
  const s = await capScenario(t, { worship: { alice: [0, 80], 'cg-bob': [0, 80] }, join: { alice: 0, 'cg-bob': 0 }, order: ['alice', 'cg-bob'] });
  await s.stand('alice', 30); await s.stand('cg-bob', 30);
  s.at(60);
  const writes = []; const prepare = s.r.db.prepare.bind(s.r.db), batch = s.r.db.batch.bind(s.r.db);
  s.r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 60)); return prepare(sql); };
  s.r.db.batch = x => { writes.push('batch'); return batch(x); };
  try { for (const u of ['alice', 'cg-bob', null]) assert.equal((await s.r.call('congregations', u)).status, 200); } finally { s.r.db.prepare = prepare; s.r.db.batch = batch; }
  assert.deepEqual(writes, []);
  assert.equal(kinwardForge(await panel(s.r)).officiant.name, 'Private alice');
  s.r.setFaith(false);
  const off = await cmd(s.r, 'cg-bob', 'stand-for-officiant');
  assert.equal(off.data.reason, 'disabled');
  const seat = await s.r.db.prepare('SELECT user_id FROM congregation_officiants').all();
  assert.deepEqual(seat.results.map(x => x.user_id), ['alice']);
  s.r.setFaith(true);
  assert.equal((await cmd(s.r, 'cg-bob', 'stand-for-officiant')).data.seated, true, 'with the flag on again the tie takes the seat');
});
