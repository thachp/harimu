/** #465 slice 2: claimed rewards count in the shared TSR balance, the #478 reconciliation checks for rewards, complete kiosk totals, the lifetime cap enforced inside the write transaction, and a claim that only maps a unique
 *  violation to 409. SQLite and PGlite. Flag stays "false" in both wrangler configs (asserted in the slice 1 test). */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const DAY = 86400000, call = (r, user, body) => r.call('tessera/rewards', user, body), claim = (r, user, entryId, requestId = randomUUID()) => call(r, user, { action: 'claim', entryId, requestId });
const count = async (r, table, where = '1=1') => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).first()).n);
async function scene(t, backend, shifts = { ava: 6 }) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_TESSERA_REWARDS_ENABLED', 'true');
  const lib = await r.importModule('lib/tessera-rewards.ts'), day = Math.floor(r.now / DAY), order = (await r.db.prepare('SELECT id FROM work_orders LIMIT 1').first()).id;
  const settle = async (id, user, at, n) => r.db.batch([r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(`${id}-${n}`, user, order, 'Fixture shift', 'fixture', 4, at, at, at),
    r.db.prepare('INSERT INTO shift_settlements (shift_id, clerk_user_id, wage_minor, item, quantity, settled_at) VALUES (?,?,?,?,?,?)').bind(`${id}-${n}`, user, 800, 'food', 0, at)]);
  for (const [id, n] of Object.entries(shifts)) {
    const at = new Date(r.now - DAY).toISOString();
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(id, id, at, at).run();
    for (let k = 0; k < n; k++) await settle(id, id, at, k);
    r.setVerification(id, { userId: id, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
  }
  return { r, lib, day, settle, now: Math.floor(r.now / 1000), verify: async () => true };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`claimed rewards add to the shared TSR balance in every reader; unclaimed ones do not (${backend})`, async t => {
    const { r, lib, day, now, verify } = await scene(t, backend); await lib.closeRewardEpoch(r.db, day - 1, now, verify);
    const registry = await r.importModule('lib/world-registry.ts'), economy = await r.importModule('lib/economy.ts'), faucet = await r.importModule('lib/test-faucet.ts'), exchange = await r.importModule('lib/tessera-exchange.ts');
    const balances = async () => [await registry.readTessera(r.db, 'ava'), await economy.readTesseraBalance(r.db, 'ava'), (await faucet.readTestFaucet(r.db, 'ava', {})).tesseraMinor, Number((await r.db.prepare(`SELECT ${exchange.tesseraBalanceSql} AS b`).bind(...exchange.tesseraBalanceBinds('ava')).first()).b)];
    assert.deepEqual(await balances(), [0, 0, 0, 0], 'an unclaimed reward is not balance');
    const entries = (await call(r, 'ava')).data.claimable; await claim(r, 'ava', entries[0].entryId); await claim(r, 'ava', entries[1].entryId);
    assert.deepEqual(await balances(), [50, 50, 50, 50], 'two claimed 0.25 TSR rewards, the same in all four readers'); assert.equal((await call(r, 'ava')).data.claimedMinor, 50);
  });

  test(`reconciliation: a clean rewards ledger reconciles to zero mismatches and the TSR totals include claims (${backend})`, async t => {
    const { r, lib, day, now, verify } = await scene(t, backend, { ava: 6, ben: 2 }); await lib.closeRewardEpoch(r.db, day - 1, now, verify);
    for (const [user, n] of [['ava', 2], ['ben', 1]]) for (const e of (await call(r, user)).data.claimable.slice(0, n)) assert.equal((await claim(r, user, e.entryId)).status, 200);
    const result = await (await r.importModule('lib/ledger-reconciliation.ts')).reconcileLedger(r.db);
    assert.equal(result.mismatchCount, 0, JSON.stringify(result.mismatches)); assert.equal(result.totals.TSR.walletTotalMinor, 75); assert.equal(result.totals.TSR.creditsMinor, 75);
  });

  test(`kiosk totals and counts cover every entry even when the lists are limited (${backend})`, async t => {
    const { r, lib, settle, now } = await scene(t, backend, { ava: 0 }), at = new Date(r.now - DAY).toISOString(), total = 130;
    await r.db.prepare('INSERT INTO tessera_reward_epochs(epoch_day,pool_minor,allocated_minor,entries,closed_at) VALUES (1,10000,?,?,?)').bind(total * 25, total, now).run();
    for (let n = 0; n < total; n++) { await settle('bulk', 'ava', at, n); await r.db.prepare("INSERT INTO tessera_reward_entries(id,epoch_day,clerk_user_id,source_shift_id,amount_minor,provenance) VALUES (?,1,'ava',?,25,'shift')").bind(`trw-1-bulk-${n}`, `bulk-${n}`).run(); }
    for (let n = 0; n < 3; n++) await r.db.prepare("INSERT INTO tessera_reward_claims(entry_id,request_id,clerk_user_id,amount_minor,claimed_at) VALUES (?,?,'ava',25,?)").bind(`trw-1-bulk-${n}`, `req-bulk-${n}`, now).run();
    const view = (await call(r, 'ava')).data;
    assert.equal(view.claimable.length, lib.kioskListLimit); assert.equal(view.history.length, 3, 'claimed history is its own list, not crowded out');
    assert.deepEqual([view.claimableCount, view.claimableMinor, view.claimedCount, view.claimedMinor], [127, 127 * 25, 3, 75], 'totals are complete, not the sum of the listed rows');
  });

  test(`the lifetime cap holds under concurrent closes of different epochs, and the epoch row matches what was written (${backend})`, async t => {
    const { r, lib, day, settle, now, verify } = await scene(t, backend, { ava: 1 }), rules = await r.importModule('lib/tessera-rewards-rules.ts'), at2 = new Date(r.now - 2 * DAY).toISOString();
    await settle('old', 'ava', at2, 0); // a second shift, settled the day before
    await r.db.prepare('INSERT INTO tessera_reward_epochs(epoch_day,pool_minor,allocated_minor,entries,closed_at) VALUES (1,10000,?,1,?)').bind(rules.rewardCitizenLifetimeCapMinor - 25, now).run();
    await settle('prior', 'ava', new Date(r.now - 40 * DAY).toISOString(), 0);
    await r.db.prepare("INSERT INTO tessera_reward_entries(id,epoch_day,clerk_user_id,source_shift_id,amount_minor,provenance) VALUES ('trw-1-prior','1','ava','prior-0',?,'shift')").bind(rules.rewardCitizenLifetimeCapMinor - 25).run();
    const results = await Promise.all([lib.closeRewardEpoch(r.db, day - 1, now, verify), lib.closeRewardEpoch(r.db, day - 2, now, verify)]);
    assert.deepEqual(results.map(x => x.status), ['closed', 'closed']);
    assert.equal(Number((await r.db.prepare("SELECT SUM(amount_minor) AS n FROM tessera_reward_entries WHERE clerk_user_id='ava'").first()).n), rules.rewardCitizenLifetimeCapMinor, 'exactly at the cap, never over');
    assert.deepEqual(results.map(x => x.allocatedMinor).sort((a, b) => a - b), [0, 25]); assert.equal(await count(r, 'tessera_reward_entries', `epoch_day IN (${day - 1},${day - 2})`), 1);
    for (const e of (await r.db.prepare('SELECT epoch_day,allocated_minor,entries FROM tessera_reward_epochs WHERE epoch_day >= 2').all()).results) assert.equal(Number(e.allocated_minor), Number(e.entries) * 25, 'allocated is recomputed from the written entries');
  });
}

test('reconciliation flags each broken reward invariant (SQLite)', async t => {
  const { r, lib, day, now, verify } = await scene(t, 'sqlite'); await lib.closeRewardEpoch(r.db, day - 1, now, verify);
  const e = (await call(r, 'ava')).data.claimable[0]; await claim(r, 'ava', e.entryId);
  const m = await r.importModule('lib/ledger-reconciliation.ts'), hits = async () => (await m.reconcileLedger(r.db)).mismatches.filter(x => x.currency === 'TSR').map(x => x.check);
  assert.deepEqual(await hits(), []);
  await r.db.prepare('PRAGMA ignore_check_constraints = ON').run(); await r.db.prepare('PRAGMA foreign_keys = OFF').run();
  await r.db.prepare('UPDATE tessera_reward_epochs SET allocated_minor = 20000').run();
  assert.ok((await hits()).includes('reward_epoch_allocated_over_pool'));
  await r.db.prepare('UPDATE tessera_reward_epochs SET allocated_minor = 10').run();
  assert.ok((await hits()).includes('reward_epoch_claimed_over_allocated')); assert.ok((await hits()).includes('reward_epoch_allocated_over_pool'), 'allocated must equal the sum of its entries');
  await r.db.prepare('UPDATE tessera_reward_epochs SET allocated_minor = (SELECT SUM(amount_minor) FROM tessera_reward_entries)').run(); assert.deepEqual(await hits(), []);
  await r.db.prepare("UPDATE tessera_reward_entries SET source_shift_id = 'no-such-shift' WHERE id = ?").bind(e.entryId).run(); assert.ok((await hits()).includes('reward_entry_without_settled_shift'));
  await r.db.prepare("UPDATE tessera_reward_claims SET amount_minor = 99").run(); assert.ok((await hits()).includes('reward_claim_not_its_entry'));
});

test('claim: only a unique violation is a 409; any other database failure surfaces (lib) and is a 503 (route)', async t => {
  const { r, lib, day, now, verify } = await scene(t, 'sqlite'); await lib.closeRewardEpoch(r.db, day - 1, now, verify);
  const [first, second] = (await call(r, 'ava')).data.claimable; assert.equal((await claim(r, 'ava', first.entryId)).status, 200);
  const failing = error => ({ prepare: sql => /INSERT INTO tessera_reward_claims/.test(sql) ? { bind() { return this; }, run: async () => { throw error; } } : r.db.prepare(sql), batch: s => r.db.batch(s) });
  const command = entryId => ({ entryId, requestId: randomUUID() });
  await assert.rejects(lib.claimReward(failing(new Error('connection reset by peer')), 'ava', command(second.entryId), now, verify), /connection reset/);
  const collided = await lib.claimReward(failing(new Error('UNIQUE constraint failed: tessera_reward_claims.entry_id')), 'ava', command(first.entryId), now, verify); assert.equal(collided.ok, false); assert.equal(collided.status, 409); assert.equal(collided.reason, 'already_claimed');
  const pg = await lib.claimReward(failing(Object.assign(new Error('PostgreSQL operation failed (23505).'), { code: '23505' })), 'ava', command(first.entryId), now, verify); assert.equal(pg.status, 409);
  assert.equal(await count(r, 'tessera_reward_claims'), 1, 'a failed claim writes nothing');
  await r.db.prepare('DROP TABLE tessera_reward_claims').run();
  const down = await claim(r, 'ava', second.entryId); assert.equal(down.status, 503); assert.equal(down.data.reason, 'unavailable'); assert.doesNotMatch(JSON.stringify(down.data), /no such table|tessera_reward/);
});

test('one shared balance definition: no other library file repeats the ledger and exchange sums', async () => {
  for (const file of (await readdir(new URL('../lib', import.meta.url))).filter(f => f.endsWith('.ts') && f !== 'tessera-exchange.ts')) assert.doesNotMatch(await readFile(new URL(`../lib/${file}`, import.meta.url), 'utf8'), /SUM\(tessera_minor\)/, `${file} must use tesseraBalanceSql`);
  const source = await readFile(new URL('../lib/tessera-exchange.ts', import.meta.url), 'utf8'); assert.match(source, /SUM\(amount_minor\) FROM tessera_reward_claims WHERE clerk_user_id=\?/);
  for (const file of ['wrangler.jsonc', 'wrangler.prod.jsonc']) assert.match(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), /"HARIMU_TESSERA_REWARDS_ENABLED": "false"/);
});
