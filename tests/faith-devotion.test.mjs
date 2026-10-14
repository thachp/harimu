/** #67: citizen faith, Devotion and daily worship through the real routes. HARIMU_TEST_STORAGE=postgres runs it on PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const choose = (r, user, faithId, hiddenFaithId, requestId = randomUUID()) => r.call('faith', user, { action: 'choose-faith', faithId, ...(hiddenFaithId ? { hiddenFaithId } : {}), requestId });
const worship = (r, user, requestId = randomUUID()) => r.call('faith', user, { action: 'attend-worship', requestId });
const read = async (r, user) => (await r.call('faith', user)).data;
const gameDay = 7200 * 1000;
async function runtime(t) { const r = await localRuntime(); t.after(() => r.close()); r.setFaith(true); return r; }
async function citizen(r, id, nation) {
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
}

test('wrangler.jsonc ships faith off by default, and the flag gates every POST', async t => {
  const { readFile } = await import('node:fs/promises');
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_FAITH_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
  const r = await localRuntime(); t.after(() => r.close());
  assert.equal((await choose(r, 'alice', 'open-hand')).data.reason, 'disabled');
  assert.equal((await worship(r, 'alice')).data.reason, 'disabled');
  const s = await read(r, 'alice'); assert.equal(s.enabled, false); assert.match(s.changeBlockedReason, /not open/);
});

test('nation options: Kindle pluralist, Aurelle state church, Korund public Unaffiliated with an optional hidden faith', async t => {
  const r = await runtime(t);
  await citizen(r, 'kai', 'korund'); await citizen(r, 'ava', 'aurelle');
  assert.deepEqual((await read(r, 'alice')).options.public.map(o => o.id), ['unaffiliated', 'kinward-rite', 'fair-wind-vow', 'open-hand']);
  const ava = await read(r, 'ava'); assert.equal(ava.faith.id, 'kinward-rite'); assert.equal(ava.faith.name, 'Kinward Rite');
  const kai = await read(r, 'kai');
  assert.deepEqual(kai.options.public.map(o => o.id), ['unaffiliated']); assert.equal(kai.faith.id, 'unaffiliated');
  assert.match((await choose(r, 'kai', 'open-hand')).data.error, /only public option is Unaffiliated/);
  assert.equal((await choose(r, 'alice', 'open-hand', 'kinward-rite')).data.reason, 'not_allowed', 'only Korund may hold a hidden faith');
  const hidden = await choose(r, 'kai', 'unaffiliated', 'kinward-rite');
  assert.equal(hidden.status, 200, JSON.stringify(hidden.data));
  const kaiAfter = await read(r, 'kai');
  assert.equal(kaiAfter.faith.id, 'unaffiliated'); assert.deepEqual(kaiAfter.hiddenFaith, { id: 'kinward-rite', name: 'Kinward Rite', private: true });
  assert.equal((await worship(r, 'kai')).data.reason, 'no_faith'); assert.match(kaiAfter.worshipBlockedReason, /not permitted in Korund/);
  // The hidden faith is visible only to its holder.
  assert.equal(JSON.stringify((await read(r, 'alice'))).includes('kai'), false);
});

test('worship raises Devotion once per game day, is idempotent on retry, and decays slowly', async t => {
  const r = await runtime(t);
  assert.equal((await worship(r, 'alice')).data.reason, 'no_faith');
  assert.equal((await choose(r, 'alice', 'kinward-rite')).status, 200);
  const id = randomUUID();
  const first = await worship(r, 'alice', id);
  assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.completion, 'The hearth is tended. Your name is kept.');
  assert.equal(first.data.state.devotion.value, 3); assert.equal(first.data.state.worship.label, 'Tend the Hearth');
  assert.equal((await worship(r, 'alice', id)).data.replay, true, 'retry with the same id');
  assert.equal((await read(r, 'alice')).devotion.value, 3, 'retry did not add Devotion');
  const again = await worship(r, 'alice');
  assert.equal(again.data.reason, 'already_worshipped'); assert.match(again.data.error, /already attended worship this game day/);
  // Concurrent attempts on a new game day record exactly one.
  r.setNow(r.now + gameDay);
  const both = await Promise.all([worship(r, 'alice'), worship(r, 'alice')]);
  assert.deepEqual(both.map(b => b.status).sort(), [200, 409]);
  assert.equal((await read(r, 'alice')).devotion.value, 6);
  // Three game days away: -1 per day without worship.
  r.setNow(r.now + 3 * gameDay);
  assert.equal((await read(r, 'alice')).devotion.value, 3);
  assert.equal(Number((await r.db.prepare("SELECT COUNT(*) AS n FROM citizen_worship WHERE user_id='alice'").first()).n), 2);
  const s = await read(r, 'alice'); assert.equal(s.devotion.tier.label, 'Newcomer'); assert.match(s.devotion.explanation, /social standing only/);
});

test('a first pick is free; the first change starts the 60-day cooldown with a visible reason and resets Devotion', async t => {
  const r = await runtime(t);
  assert.equal((await choose(r, 'alice', 'open-hand')).status, 200);
  const afterFirst = await read(r, 'alice');
  assert.equal(afterFirst.changeBlockedReason, null, 'first pick starts no cooldown'); assert.equal(afterFirst.changeAvailableAt, null);
  await worship(r, 'alice');
  const changed = await choose(r, 'alice', 'fair-wind-vow');
  assert.equal(changed.status, 200, JSON.stringify(changed.data)); assert.equal(changed.data.state.devotion.value, 0);
  assert.equal(changed.data.state.faith.name, 'Fair-Wind Vow'); assert.match(changed.data.state.changeBlockedReason, /60 real days/);
  const blocked = await choose(r, 'alice', 'open-hand');
  assert.equal(blocked.status, 409); assert.equal(blocked.data.reason, 'cooldown'); assert.match(blocked.data.error, /once every 60 real days. Next change: \d{4}-\d{2}-\d{2}/);
  r.setNow(r.now + 60 * 86400 * 1000);
  assert.equal((await choose(r, 'alice', 'open-hand')).status, 200);
});

test('a first pick of Unaffiliated is free and starts no cooldown (Kindle and Korund)', async t => {
  const r = await runtime(t);
  await citizen(r, 'kai', 'korund');
  assert.equal((await choose(r, 'alice', 'unaffiliated')).status, 200);
  assert.equal((await read(r, 'alice')).changeBlockedReason, null);
  assert.equal((await choose(r, 'alice', 'open-hand')).status, 200, 'change right after a first Unaffiliated pick');
  assert.equal((await choose(r, 'kai', 'unaffiliated')).status, 200);
  assert.equal((await read(r, 'kai')).changeAvailableAt, null);
  assert.equal((await choose(r, 'kai', 'unaffiliated', 'open-hand')).status, 200, 'Korund can add a hidden faith right after a first pick');
});

/** Royal Favor comes from settled Aurelle estate shifts (2 each). Local ledger fixture, as in aurelle-integration.test.mjs. */
async function giveFavor(r, user, shifts) {
  const iso = new Date(r.now - 86400000).toISOString();
  for (let n = 0; n < shifts; n++) {
    const id = randomUUID();
    await r.db.batch([
      r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, user, 'aurelle-food-estate', 'Estate fixture', '4 state food', 4, iso, iso, iso),
      r.db.prepare('INSERT INTO aurelle_settlements VALUES (?,?,?,?,?,?)').bind(id, user, 800, 4, 2, Math.floor(r.now / 1000)),
    ]);
  }
}
const spends = async (r, user) => (await r.db.prepare('SELECT request_id,amount,reason FROM aurelle_favor_spends WHERE clerk_user_id=?').bind(user).all()).results.map(x => ({ ...x }));
const favorOf = async (r, user) => (await r.call('citizen', user)).data.aurellePlan.favor;

test('Aurelle: leaving the Kinward Rite is refused with a visible reason when Royal Favor cannot cover it (14.2), even after worship records the default', async t => {
  const r = await runtime(t);
  await citizen(r, 'ava', 'aurelle'); await citizen(r, 'bo', 'aurelle');
  const ava = await read(r, 'ava'); assert.equal(ava.leaveCost, 10); assert.equal(ava.royalFavor, 0); assert.match(ava.leaveBlockedReason, /costs 10 Royal Favor.*You have 0/);
  await giveFavor(r, 'ava', 4); // 8 Favor, still short
  assert.match((await read(r, 'ava')).leaveBlockedReason, /You have 8/);
  for (const to of ['open-hand', 'fair-wind-vow', 'unaffiliated']) {
    const res = await choose(r, 'ava', to);
    assert.equal(res.status, 409); assert.equal(res.data.reason, 'insufficient_royal_favor'); assert.match(res.data.error, /Royal Favor/);
  }
  assert.deepEqual(await spends(r, 'ava'), [], 'a refused change spends nothing');
  assert.equal((await worship(r, 'bo')).status, 200);
  assert.equal((await choose(r, 'bo', 'open-hand')).data.reason, 'insufficient_royal_favor');
  assert.equal((await read(r, 'bo')).faith.id, 'kinward-rite');
  const alice = await read(r, 'alice'); assert.equal(alice.leaveBlockedReason, null, 'Kindle has no Favor cost'); assert.equal(alice.leaveCost, null);
});

test('Aurelle: leaving the Kinward Rite spends 10 Royal Favor once, records it, and a retry or later change cannot spend again', async t => {
  const r = await runtime(t);
  await citizen(r, 'ava', 'aurelle');
  await giveFavor(r, 'ava', 7); // 14 Favor
  assert.equal(await favorOf(r, 'ava'), 14);
  const ava = await read(r, 'ava'); assert.equal(ava.leaveBlockedReason, null); assert.equal(ava.leaveCost, 10);
  const requestId = randomUUID();
  const left = await choose(r, 'ava', 'open-hand', undefined, requestId);
  assert.equal(left.status, 200, JSON.stringify(left.data)); assert.equal(left.data.state.faith.id, 'open-hand'); assert.equal(left.data.state.leaveCost, null);
  assert.deepEqual(await spends(r, 'ava'), [{ request_id: requestId, amount: 10, reason: 'leave-kinward' }]);
  assert.equal(await favorOf(r, 'ava'), 4, 'the Aurelle plan shows the balance after the spend');
  const replay = await choose(r, 'ava', 'open-hand', undefined, requestId);
  assert.equal(replay.status, 200); assert.equal(replay.data.replay, true);
  assert.equal((await spends(r, 'ava')).length, 1, 'a retry with the same request id does not debit twice');
  assert.equal(await favorOf(r, 'ava'), 4);
  // Leaving the default Kinward Rite is Aurelle's first pick (free of cooldown, per #279); the next change starts the 60-day cooldown. Neither debits again.
  assert.equal((await choose(r, 'ava', 'fair-wind-vow')).status, 200);
  assert.equal((await choose(r, 'ava', 'open-hand')).data.reason, 'cooldown');
  assert.equal((await spends(r, 'ava')).length, 1); assert.equal(await favorOf(r, 'ava'), 4);
});

test('Aurelle: Royal Favor never goes negative: the balance is earned (capped at 100) minus spent, and a second leave cannot overspend', async t => {
  const r = await runtime(t);
  await citizen(r, 'ava', 'aurelle'); await citizen(r, 'bo', 'aurelle');
  await giveFavor(r, 'ava', 60); // 120 earned, capped at 100
  assert.equal(await favorOf(r, 'ava'), 100);
  assert.equal((await choose(r, 'ava', 'unaffiliated')).status, 200);
  assert.equal(await favorOf(r, 'ava'), 90, 'cap applies before the spend');
  await giveFavor(r, 'bo', 5); // exactly 10
  assert.equal((await choose(r, 'bo', 'open-hand')).status, 200);
  assert.equal(await favorOf(r, 'bo'), 0);
  // A same-day concurrent pair with different request ids: only one debit can land, the other is refused.
  await citizen(r, 'cy', 'aurelle'); await giveFavor(r, 'cy', 5);
  const [one, two] = await Promise.all([choose(r, 'cy', 'open-hand'), choose(r, 'cy', 'fair-wind-vow')]);
  assert.equal([one, two].filter(x => x.status === 200).length, 1, JSON.stringify([one.data, two.data]));
  assert.equal((await spends(r, 'cy')).length, 1); assert.equal(await favorOf(r, 'cy'), 0);
});

test('Aurelle: a citizen who moves in with a non-Kinward faith row from another nation still pays Royal Favor to leave', async t => {
  const r = await runtime(t);
  await citizen(r, 'mo', 'kindle');
  assert.equal((await choose(r, 'mo', 'open-hand')).status, 200);
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='mo'").run();
  const mo = await read(r, 'mo'); assert.equal(mo.faith.id, 'kinward-rite'); assert.match(mo.leaveBlockedReason, /costs 10 Royal Favor/);
  for (const to of ['open-hand', 'fair-wind-vow', 'unaffiliated']) {
    const res = await choose(r, 'mo', to);
    assert.equal(res.status, 409, to); assert.equal(res.data.reason, 'insufficient_royal_favor', to);
  }
  assert.equal((await read(r, 'mo')).faith.id, 'kinward-rite');
  assert.deepEqual(await spends(r, 'mo'), []);
  await giveFavor(r, 'mo', 5);
  assert.equal((await choose(r, 'mo', 'open-hand')).status, 200); assert.equal((await spends(r, 'mo')).length, 1);
});

test('GET /api/faith makes no writes', async t => {
  const r = await runtime(t);
  await choose(r, 'alice', 'kinward-rite'); await worship(r, 'alice'); r.setNow(r.now + 5 * gameDay);
  const writes = []; const prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 60)); return prepare(sql); };
  r.db.batch = s => { writes.push('batch'); return batch(s); };
  try { for (const u of ['alice', 'bob']) assert.equal((await r.call('faith', u)).status, 200); } finally { r.db.prepare = prepare; r.db.batch = batch; }
  assert.deepEqual(writes, []);
});

test('Devotion never changes wages, production or market prices', async t => {
  const outcome = async devoted => {
    const r = await localRuntime(); r.setFaith(true);
    try {
      if (devoted) { await choose(r, 'alice', 'open-hand'); for (let d = 0; d < 40; d++) { await worship(r, 'alice'); r.setNow(r.now + gameDay); } }
      const devotion = (await read(r, 'alice')).devotion.value;
      const world = (await r.call('world', null)).data;
      const started = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' });
      const shift = started.data.shifts.find(s => !s.claimedAt);
      r.setNow(Date.parse(shift.completesAt) + 1000);
      const claimed = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id });
      return { devotion, wage: shift.wageMinor, reward: [shift.rewardItem, shift.rewardQuantity], claim: claimed.status,
        prices: JSON.stringify(world.market ?? world.prices ?? null), orders: world.workOrders.map(o => o.detail).join('|') };
    } finally { await r.close(); }
  };
  const [plain, devout] = [await outcome(false), await outcome(true)];
  assert.equal(plain.devotion, 0); assert.ok(devout.devotion >= 100 - 1, `devout ${devout.devotion}`);
  const { devotion: _a, ...p } = plain; const { devotion: _b, ...d } = devout;
  assert.deepEqual(d, p);
  // No economy, market, work or combat module reads faith or Devotion.
  const { readFile, readdir } = await import('node:fs/promises');
  for (const f of (await readdir(new URL('../lib/', import.meta.url))).filter(f => /^(economy|market|work|shift|order-book|wallet|npc|spoilage|world-registry|city-founding)/.test(f)))
    assert.doesNotMatch(await readFile(new URL(`../lib/${f}`, import.meta.url), 'utf8'), /citizen_faith|citizen_worship|devotion/i, f);
});

test('worship waits for arrival while travelling', async t => {
  const r = await runtime(t); r.setTravel(true);
  await choose(r, 'alice', 'kinward-rite');
  assert.equal((await r.call('travel', 'alice', { action: 'start-travel', x: 8, y: 7, requestId: randomUUID() })).status, 200);
  assert.equal((await worship(r, 'alice')).data.reason, 'traveling');
});
