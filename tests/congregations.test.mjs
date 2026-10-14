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

test('congregations ride HARIMU_FAITH_ENABLED (default "false")', async t => {
  const { readFile } = await import('node:fs/promises');
  assert.match(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), /"HARIMU_FAITH_ENABLED"\s*:\s*"false"/);
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
