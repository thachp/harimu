/** #68: festivals for the three MVP faiths through the real faith route. Kindle treats all faiths equally. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const call = (r, user, body) => r.call('faith', user, { requestId: randomUUID(), ...body });
const join = (r, user, festivalId, requestId) => call(r, user, { action: 'join-festival', festivalId, ...(requestId ? { requestId } : {}) });
const read = async (r, user) => (await r.call('faith', user)).data;
const daySec = 7200, year = 360;
const dayOfYear = { 'launching': 30, 'oath-day': 90, 'bread-day': 150, 'safe-return': 210, 'night-of-names': 270, 'day-of-the-open-door': 330 };
async function runtime(t) { const r = await localRuntime(); t.after(() => r.close()); r.setFaith(true); return r; }
async function citizen(r, id, nation) {
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
}
/** Move the clock to the next start of `festival` (plus `offset` seconds). */
function goTo(r, festival, offset = 60) {
  const today = Math.floor(r.now / 1000 / daySec); const y = Math.floor(today / year);
  let day = y * year + dayOfYear[festival]; if (day <= today) day += year;
  r.setNow((day * daySec + offset) * 1000); return day;
}

test('upcoming festivals list all six with real and game timestamps; stances per nation (Kindle equal, Aurelle endorses Kinward, Korund bans)', async t => {
  const r = await runtime(t);
  await citizen(r, 'ava', 'aurelle'); await citizen(r, 'kai', 'korund');
  const kindle = await read(r, 'alice');
  assert.equal(kindle.festivals.length, 6);
  for (const f of kindle.festivals) { assert.match(f.startsAt, /^\d{4}-\d{2}-\d{2}T/); assert.ok(Number.isInteger(f.gameDay) && Number.isInteger(f.gameYear)); }
  assert.deepEqual([...new Set(kindle.festivals.map(f => f.stance))], ['tolerated'], 'Kindle never endorses or bans one faith');
  assert.equal(kindle.festivals.some(f => f.publicHoliday), false);
  const ava = await read(r, 'ava');
  assert.deepEqual(ava.festivals.filter(f => f.stance === 'endorsed').map(f => f.id).sort(), ['night-of-names', 'oath-day']);
  assert.deepEqual([...new Set((await read(r, 'kai')).festivals.map(f => f.stance))], ['banned']);
});

test('an endorsed festival is a public holiday (one fewer shift, Stability up) in the endorsing nation only', async t => {
  const r = await runtime(t);
  await citizen(r, 'ava', 'aurelle'); await citizen(r, 'kai', 'korund');
  goTo(r, 'oath-day');
  const ava = await read(r, 'ava');
  assert.equal(ava.holiday.festivalId, 'oath-day'); assert.equal(ava.holiday.shiftReduction, 1); assert.equal(ava.holiday.stabilityRaised, true);
  assert.equal((await read(r, 'alice')).holiday, null, 'Kindle: no holiday');
  assert.equal((await read(r, 'kai')).holiday, null, 'Korund: no holiday');
  goTo(r, 'bread-day');
  assert.equal((await read(r, 'ava')).holiday, null, 'Aurelle tolerates Open Hand festivals, no holiday');
});

test('a banned festival shows no public banner and logs a ban event; joining is refused', async t => {
  const r = await runtime(t);
  await citizen(r, 'kai', 'korund');
  assert.equal((await call(r, 'kai', { action: 'choose-faith', faithId: 'unaffiliated', hiddenFaithId: 'open-hand' })).status, 200);
  goTo(r, 'bread-day');
  const kai = await read(r, 'kai'); const bread = kai.festivals.find(f => f.id === 'bread-day');
  assert.equal(bread.active, true); assert.equal(bread.banner, null);
  assert.equal(kai.banEvents.length, 1); assert.equal(kai.banEvents[0].festivalId, 'bread-day'); assert.doesNotMatch(kai.banEvents[0].text, /Open Hand/);
  const res = await join(r, 'kai', 'bread-day'); assert.equal(res.status, 409); assert.equal(res.data.reason, 'banned');
});

test('joining grants Devotion once per festival per citizen, idempotent on retry; only adherents, only while active', async t => {
  const r = await runtime(t);
  assert.equal((await call(r, 'alice', { action: 'choose-faith', faithId: 'open-hand' })).status, 200);
  await citizen(r, 'nia', 'kindle');
  assert.equal((await join(r, 'alice', 'bread-day')).data.reason, 'not_active');
  goTo(r, 'bread-day');
  const banner = (await read(r, 'alice')).festivals.find(f => f.id === 'bread-day').banner; assert.equal(banner.joinButton, 'Join the festival');
  assert.equal((await read(r, 'nia')).festivals.find(f => f.id === 'bread-day').banner, null, 'Unaffiliated sees no banner');
  assert.equal((await join(r, 'nia', 'bread-day')).data.reason, 'not_adherent');
  const id = randomUUID();
  const first = await join(r, 'alice', 'bread-day', id);
  assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.state.devotion.value, 3);
  assert.equal((await join(r, 'alice', 'bread-day', id)).data.replay, true);
  assert.equal((await join(r, 'alice', 'bread-day')).data.reason, 'already_joined');
  const worship = await call(r, 'alice', { action: 'attend-worship' }); assert.equal(worship.data.state.devotion.value, 6, 'worship stacks with the festival');
  goTo(r, 'bread-day'); // next year's Bread Day is a new occurrence
  assert.equal((await join(r, 'alice', 'bread-day')).status, 200);
});

test('Aurelle default Kinward citizens can join their endorsed festivals without choosing first', async t => {
  const r = await runtime(t);
  await citizen(r, 'ava', 'aurelle');
  goTo(r, 'night-of-names');
  const res = await join(r, 'ava', 'night-of-names');
  assert.equal(res.status, 200, JSON.stringify(res.data)); assert.equal(res.data.state.devotion.value, 3); assert.equal(res.data.state.faith.id, 'kinward-rite');
});

test('festivals are behind HARIMU_FAITH_ENABLED and GET writes nothing', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  assert.equal((await join(r, 'alice', 'bread-day')).data.reason, 'disabled');
  r.setFaith(true); goTo(r, 'bread-day');
  const writes = []; const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 60)); return prepare(sql); };
  await read(r, 'alice'); r.db.prepare = prepare;
  assert.deepEqual(writes, []);
});
