/** #465 slice 1: earned-Tessera rewards (Option A, shift source only), on SQLite and PGlite: epoch close (idempotent, pro-rata, caps, verified only), cron, kiosk read, idempotent claim, flag-off 404,
 *  the Postgres 0056 migration, and the default-off wrangler flags. Numbers are the [ASSUMPTION]s in lib/tessera-rewards-rules.ts. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { localRuntime } from './helpers/local-runtime.mjs';

const DAY = 86400000, call = (r, user, body) => r.call('tessera/rewards', user, body), claim = (r, user, entryId, requestId = randomUUID()) => call(r, user, { action: 'claim', entryId, requestId });
const count = async (r, table, where = '1=1') => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).first()).n);
const evidence = (r, id) => ({ userId: id, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
const ALL = [['ava', 6], ['ben', 2], ['cyn', 3]]; // shifts settled yesterday; cyn is never verified
async function scene(t, backend, enabled = true) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  if (enabled) r.setFixtureEnv('HARIMU_TESSERA_REWARDS_ENABLED', 'true');
  const rules = await r.importModule('lib/tessera-rewards-rules.ts'), lib = await r.importModule('lib/tessera-rewards.ts'), day = Math.floor(r.now / DAY), at = new Date(r.now - DAY).toISOString();
  const order = (await r.db.prepare('SELECT id FROM work_orders LIMIT 1').first()).id;
  for (const [id, shifts] of ALL) {
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(id, id, at, at).run();
    for (let n = 0; n < shifts; n++) await r.db.batch([r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(`${id}-${n}`, id, order, 'Fixture shift', 'fixture', 4, at, at, at),
      r.db.prepare('INSERT INTO shift_settlements (shift_id, clerk_user_id, wage_minor, item, quantity, settled_at) VALUES (?,?,?,?,?,?)').bind(`${id}-${n}`, id, 800, 'food', 0, at)]);
  }
  for (const id of ['ava', 'ben']) r.setVerification(id, evidence(r, id));
  return { r, rules, lib, day, verify: async id => id !== 'cyn' };
}
const entries = async r => (await r.db.prepare('SELECT clerk_user_id,amount_minor,provenance FROM tessera_reward_entries ORDER BY id').all()).results.map(x => ({ ...x }));

for (const backend of ['sqlite', 'postgres']) {
  test(`flag off: 404 before auth, no writes, the cron is a no-op (${backend})`, async t => {
    const { r, lib, day, verify } = await scene(t, backend, false);
    for (const res of [await call(r, 'ava'), await claim(r, 'ava', `trw-${day}-ava-0`), await call(r, undefined), await call(r, 'ava', { action: 'bogus' })]) assert.equal(res.status, 404);
    assert.deepEqual(await lib.runTesseraRewardCron(r.db, Math.floor(r.now / 1000), {}, verify), { status: 'disabled', closed: [] });
    assert.deepEqual(await lib.runTesseraRewardCron(r.db, Math.floor(r.now / 1000), { HARIMU_TESSERA_REWARDS_ENABLED: 'TRUE' }, verify), { status: 'disabled', closed: [] });
    for (const table of ['tessera_reward_epochs', 'tessera_reward_entries', 'tessera_reward_claims']) assert.equal(await count(r, table), 0, table);
  });

  test(`epoch close: verified shifts only, per-citizen cap, idempotent, today never closes (${backend})`, async t => {
    const { r, lib, day, verify } = await scene(t, backend), now = Math.floor(r.now / 1000);
    assert.equal((await lib.closeRewardEpoch(r.db, day, now, verify)).status, 'not-ended');
    const closed = await lib.closeRewardEpoch(r.db, day - 1, now, verify);
    assert.deepEqual(closed, { status: 'closed', entries: 6, allocatedMinor: 150 });
    const rows = await entries(r); assert.deepEqual(rows.map(x => [x.clerk_user_id, Number(x.amount_minor), x.provenance]), [...Array(4).fill(['ava', 25, 'shift']), ...Array(2).fill(['ben', 25, 'shift'])], 'alice capped at 1.00 TSR, carol unverified, only shifts');
    assert.equal(await count(r, 'tessera_reward_entries', "clerk_user_id='cyn'"), 0);
    assert.deepEqual(await lib.closeRewardEpoch(r.db, day - 1, now, verify), { status: 'already-closed', entries: 0, allocatedMinor: 0 }); assert.equal(await count(r, 'tessera_reward_entries'), 6);
    const results = await Promise.all([lib.closeRewardEpoch(r.db, day - 2, now, verify), lib.closeRewardEpoch(r.db, day - 2, now, verify)]);
    assert.equal(results.filter(x => x.status === 'closed').length <= 1, true); assert.equal(await count(r, 'tessera_reward_epochs', `epoch_day=${day - 2}`), 1, 'parallel closes write one epoch');
  });

  test(`cron closes yesterday once, re-runs change nothing, and never writes on a read (${backend})`, async t => {
    const { r, lib, day, verify } = await scene(t, backend), now = Math.floor(r.now / 1000), flags = { HARIMU_TESSERA_REWARDS_ENABLED: 'true' };
    const first = await lib.runTesseraRewardCron(r.db, now, flags, verify); assert.equal(first.status, 'ran'); assert.deepEqual(first.closed.map(x => x.status), ['closed', 'closed']);
    const total = [await count(r, 'tessera_reward_epochs'), await count(r, 'tessera_reward_entries')]; assert.deepEqual(total, [2, 6]);
    assert.deepEqual((await lib.runTesseraRewardCron(r.db, now, flags, verify)).closed.map(x => x.status), ['already-closed', 'already-closed']);
    assert.equal(await count(r, 'tessera_reward_epochs', `epoch_day=${day}`), 0, 'today is never closed');
    await call(r, 'ava'); await call(r, 'ben'); assert.deepEqual([await count(r, 'tessera_reward_epochs'), await count(r, 'tessera_reward_entries'), await count(r, 'tessera_reward_claims')], [2, 6, 0], 'reads never write');
  });

  test(`kiosk read and claim: own entries only, one claim per entry, retries are idempotent, unverified is refused (${backend})`, async t => {
    const { r, lib, day, verify } = await scene(t, backend), now = Math.floor(r.now / 1000); await lib.closeRewardEpoch(r.db, day - 1, now, verify);
    assert.equal((await call(r, undefined)).status, 401); assert.equal((await call(r, 'cyn')).data.claimable.length, 0);
    const mine = (await call(r, 'ava')).data; assert.equal(mine.claimable.length, 4); assert.equal(mine.claimableMinor, 100); assert.equal(mine.provenance, 'earned'); assert.ok(mine.claimable.every(e => e.entryId.startsWith('trw-')));
    const entryId = mine.claimable[0].entryId, requestId = randomUUID(), done = await claim(r, 'ava', entryId, requestId);
    assert.equal(done.status, 200); assert.equal(done.data.amountMinor, 25); assert.equal(done.data.replay, undefined);
    const retry = await claim(r, 'ava', entryId, requestId); assert.equal(retry.status, 200); assert.equal(retry.data.replay, true); assert.equal(await count(r, 'tessera_reward_claims'), 1);
    const again = await claim(r, 'ava', entryId); assert.equal(again.status, 409); assert.equal(again.data.reason, 'already_claimed');
    assert.equal((await claim(r, 'ben', mine.claimable[1].entryId, requestId)).data.reason, 'request_reused'); assert.equal((await claim(r, 'ben', mine.claimable[1].entryId)).status, 404, 'another citizen\'s entry looks missing');
    const after = (await call(r, 'ava')).data; assert.deepEqual([after.claimable.length, after.history.length, after.claimedMinor, after.claimableMinor], [3, 1, 25, 75]);
    const racing = await Promise.all([claim(r, 'ava', mine.claimable[1].entryId), claim(r, 'ava', mine.claimable[1].entryId)]); assert.deepEqual(racing.map(x => x.status).sort(), [200, 409]); assert.equal(await count(r, 'tessera_reward_claims'), 2);
    r.setVerification('ben', undefined); assert.equal((await claim(r, 'ben', (await call(r, 'ben')).data.claimable[0].entryId)).data.reason, 'not_verified'); assert.equal(await count(r, 'tessera_reward_claims', "clerk_user_id='ben'"), 0);
    for (const body of [{ action: 'claim' }, { action: 'claim', entryId: 'x', requestId: randomUUID() }, { action: 'claim', entryId: entryId, requestId: 'short' }, { action: 'exchange', entryId, requestId }]) assert.equal((await call(r, 'ava', body)).status, 400);
  });
}

test('allocation is pro-rata under the pool, honours every cap, and has no source but the shift', async t => {
  const { rules } = await scene(t, 'sqlite');
  const many = Array.from({ length: 500 }, (_, i) => ({ shiftId: `s${i}`, userId: `u${i}` })), split = rules.allocateRewards(many);
  assert.equal(split.length, 500); assert.ok(split.every(e => e.amountMinor === 20), 'pool 10000 / 500 shifts = 20 each, below the 25 rate'); assert.ok(split.reduce((n, e) => n + e.amountMinor, 0) <= rules.rewardPoolMinor);
  assert.deepEqual(rules.allocateRewards([{ shiftId: 'a', userId: 'u' }], { u: 4990 }).map(e => e.amountMinor), [10], 'lifetime cap trims the last reward'); assert.deepEqual(rules.allocateRewards([{ shiftId: 'a', userId: 'u' }], { u: 5000 }), []);
  assert.deepEqual(rules.allocateRewards([]), []); assert.equal(rules.rewardProvenance, 'shift');
  assert.deepEqual([rules.rewardPoolMinor, rules.rewardPerShiftMinor, rules.rewardCitizenEpochCapMinor, rules.rewardCitizenLifetimeCapMinor, rules.rewardPoolSharePercent], [10000, 25, 100, 5000, 5]);
  const source = await readFile(new URL('../lib/tessera-rewards.ts', import.meta.url), 'utf8');
  for (const forbidden of [/citizen_tessera_ledger/, /citizen_tessera_exchanges/, /tessera-exchange/, /player_fills/, /starter-grant/, /npc/i]) assert.doesNotMatch(source, forbidden, 'no exchange, faucet, ledger or NPC source and no balance change in slice 1');
});

test('Postgres 0056 is additive, re-runnable, and enforces the guards', async () => {
  const db = new PGlite(); await db.exec('CREATE TABLE citizens(clerk_user_id TEXT PRIMARY KEY); CREATE TABLE shift_settlements(shift_id TEXT PRIMARY KEY)');
  await db.exec("INSERT INTO citizens VALUES ('u'),('v'); INSERT INTO shift_settlements VALUES ('s1'),('s2')");
  const migration = await readFile(new URL('../db/postgres/0056_tessera_rewards.sql', import.meta.url), 'utf8'); await db.exec(migration); await db.exec(migration);
  assert.doesNotMatch(migration, /DROP |ALTER TABLE|^\s*(DELETE|UPDATE)\b/im, 'additive only');
  await db.exec("INSERT INTO tessera_reward_epochs VALUES (1,10000,25,1,100); INSERT INTO tessera_reward_entries VALUES ('trw-1-s1',1,'u','s1',25,'shift')");
  await assert.rejects(db.exec("INSERT INTO tessera_reward_epochs VALUES (1,10000,0,0,100)"), 'one row per epoch'); await assert.rejects(db.exec("INSERT INTO tessera_reward_epochs VALUES (2,100,200,0,100)"), 'allocated cannot exceed the pool');
  await assert.rejects(db.exec("INSERT INTO tessera_reward_entries VALUES ('x',1,'v','s1',25,'shift')"), 'a shift pays once'); await assert.rejects(db.exec("INSERT INTO tessera_reward_entries VALUES ('y',1,'v','s2',25,'faucet')"), 'shift is the only provenance');
  await assert.rejects(db.exec("INSERT INTO tessera_reward_entries VALUES ('z',1,'v','s2',0,'shift')"), 'positive amounts only');
  await db.exec("INSERT INTO tessera_reward_claims VALUES ('trw-1-s1','r1','u',25,200)"); await assert.rejects(db.exec("INSERT INTO tessera_reward_claims VALUES ('trw-1-s1','r2','u',25,200)"), 'one claim per entry');
  await db.exec("INSERT INTO tessera_reward_entries VALUES ('trw-1-s2',1,'v','s2',25,'shift')"); await assert.rejects(db.exec("INSERT INTO tessera_reward_claims VALUES ('trw-1-s2','r1','v',25,200)"), 'request ids are unique');
  await db.close();
});

test('flag HARIMU_TESSERA_REWARDS_ENABLED is "false" in both wrangler configs, and is not a dashboard-managed var', async () => {
  for (const file of ['wrangler.jsonc', 'wrangler.prod.jsonc']) assert.deepEqual([...(await readFile(new URL(`../${file}`, import.meta.url), 'utf8')).matchAll(/"HARIMU_TESSERA_REWARDS_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false'], file);
  const { dashboardManagedVars } = await import('../scripts/wrangler-pin.mjs'); assert.ok(!dashboardManagedVars.includes('HARIMU_TESSERA_REWARDS_ENABLED'), 'a release deploy writes the config value like the other feature flags');
  const worker = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8'); assert.match(worker, /runTesseraRewardCron\(await getDatabase\(\)/);
});
