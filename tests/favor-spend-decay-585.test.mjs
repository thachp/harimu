/** #585 (follow-ups to #567): a spend counts only against Favor earned before it (ARC), the coup reads the decayed Favor, and the edge cases of the decayed rule.
 *  Flag HARIMU_FAVOR_DECAY_ENABLED stays off. HARIMU_TEST_STORAGE=postgres runs it on PGlite. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { favorDecaySeconds, royalFavorBalance, royalFavorBalanceSql, royalFavorSql, royalFavorBinds, royalFavorColumnBinds } from '../lib/aurelle.ts';

const DAY = 86400 * 1000;
async function setup(t, users = ['ava']) {
  const r = await localRuntime(); t.after(() => r.close()); r.setFaith(true);
  const at = new Date(r.now).toISOString();
  for (const u of users) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'aurelle',?,18,0,'Good standing',?,?)").bind(u, u, at, at).run();
  return r;
}
/** `shifts` settled estate shifts (2 Favor each) for a citizen; `settledAt` (ms) defaults to the runtime's current time. */
async function serve(r, user, shifts, settledAt = r.now) {
  const iso = new Date(r.now).toISOString();
  for (let n = 0; n < shifts; n++) { const id = randomUUID(); await r.db.batch([
    r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, user, 'aurelle-food-estate', 'Estate fixture', '4 state food', 4, iso, iso, iso),
    r.db.prepare('INSERT INTO aurelle_settlements VALUES (?,?,?,?,?,?)').bind(id, user, 800, 4, 2, Math.floor(settledAt / 1000)),
  ]); }
}
const spend = (r, user, amount, spentAt = r.now) => r.db.prepare("INSERT INTO aurelle_favor_spends (request_id,clerk_user_id,amount,reason,spent_at) VALUES (?,?,?,'leave-kinward',?)").bind(randomUUID(), user, amount, Math.floor(spentAt / 1000)).run();
const at = r => Math.floor(r.now / 1000);
const bal = (r, user = 'ava') => royalFavorBalance(r.db, user, at(r));
const flat = (r, user = 'ava') => royalFavorBalance(r.db, user);
const count = async (r, table) => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);

test('ARC (a): earn 20, spend 10, wait 14 days, earn 10 fresh reads 10 (not 0); a fresh spend still costs its full amount', async t => {
  const r = await setup(t); const t0 = r.now;
  await serve(r, 'ava', 10); await spend(r, 'ava', 10);
  assert.equal(await bal(r), 10, 'right after the spend: 20 earned - 10 spent'); assert.equal(await flat(r), 10, 'flag off is unchanged');
  r.setNow(t0 + 7 * DAY); assert.equal(await bal(r), 0, 'half faded: the 10 left was the 10 spent');
  r.setNow(t0 + 14 * DAY); assert.equal(await bal(r), 0);
  await serve(r, 'ava', 5); assert.equal(await bal(r), 10, 'the old spend does not eat the 10 fresh Favor');
  assert.equal(await flat(r), 20 - 10 + 10, 'flag off: still the flat rule (no decay at all)');
  r.setNow(t0 + 14 * DAY + 3500 * 1000); assert.equal(await bal(r), 9, 'the fresh Favor fades on its own, the spend stays out of it');
  r.setNow(t0 + 14 * DAY);
  await spend(r, 'ava', 10); assert.equal(await bal(r), 0, 'a second, fresh spend takes its full amount');
});

test('ARC (a): a spend never charges Favor that was earned after it, and an overdrawn history floors at 0', async t => {
  const r = await setup(t); const t0 = r.now;
  await serve(r, 'ava', 2); await spend(r, 'ava', 10);
  assert.equal(await bal(r), 0, 'only 4 earned before the spend: it costs at most those'); assert.equal(await flat(r), 0, 'flat rule floors too');
  r.setNow(t0 + 1 * DAY); await serve(r, 'ava', 5); assert.equal(await bal(r), 10, 'Favor earned after the spend is untouched by it');
  assert.equal(await flat(r), 4 + 10 - 10, 'flat rule charges the whole spend against everything');
  r.setNow(t0 + 3 * DAY); await serve(r, 'ava', 3); assert.equal(await bal(r), 14, '4 earned at day 0 faded to 3.14 and fully charged by the spend, plus 8.57 and 6 later: 14 (flat: 10)');
  const two = await setup(t, ['bea']); await serve(two, 'bea', 10); await spend(two, 'bea', 10);
  r.setNow(t0 + 3 * DAY); await serve(r, 'ava', 10); await spend(r, 'ava', 10); await spend(r, 'ava', 10);
  assert.ok(await bal(r) >= 0, 'never negative'); assert.equal(await bal(two, 'bea'), 10);
  const fresh = await setup(t); const f0 = fresh.now;
  await serve(fresh, 'ava', 10); await spend(fresh, 'ava', 10); fresh.setNow(f0 + DAY); await serve(fresh, 'ava', 10);
  assert.equal(await bal(fresh), 28, 'trunc(20x13/14 + 20 - 10) = 28 (the flat rule would say 30)'); assert.equal(await flat(fresh), 30);
});

test('(c) INSERT guard at the decayed boundary: exactly the cost is allowed, one second later is not (the pre-check is bypassed, the statement alone decides)', async t => {
  const r = await setup(t); const t0 = r.now; await serve(r, 'ava', 10);
  const run = async (when, id) => { const binds = [id, 'ava', 10, when, ...royalFavorBinds('ava', when), 10]; return r.db.prepare(`INSERT INTO aurelle_favor_spends (request_id,clerk_user_id,amount,reason,spent_at) SELECT ?,?,?,'leave-kinward',? WHERE (${royalFavorSql(when)}) >= ?`).bind(...binds).run(); };
  await run(Math.floor(t0 / 1000) + 7 * 86400 + 1, 'late'); assert.equal(await count(r, 'aurelle_favor_spends'), 0, '19.99999 earned x 0.5 truncates to 9: refused');
  await run(Math.floor(t0 / 1000) + 7 * 86400, 'edge'); assert.equal(await count(r, 'aurelle_favor_spends'), 1, 'exactly 10: allowed');
  r.setNow(t0 + 7 * DAY); assert.equal(await bal(r), 0);
  await run(Math.floor(t0 / 1000) + 7 * 86400, 'again'); assert.equal(await count(r, 'aurelle_favor_spends'), 1, 'nothing left: refused');
});

test('(c) future-dated rows count at most their own Favor, and a negative Favor row cannot exist (CHECK favor=2)', async t => {
  const r = await setup(t); const t0 = r.now;
  await serve(r, 'ava', 10, t0 + 5 * DAY); assert.equal(await bal(r), 20, 'clock skew: a future row is not worth more than its Favor');
  r.setNow(t0 + 5 * DAY); assert.equal(await bal(r), 20, 'at its own time it is worth exactly its Favor');
  await spend(r, 'ava', 10, t0 + 1 * DAY); assert.equal(await bal(r), 20, 'a spend dated before the row does not charge it');
  r.setNow(t0);
  const id = randomUUID(); const iso = new Date(t0).toISOString();
  await r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, 'ava', 'aurelle-food-estate', 'Estate fixture', '4 state food', 4, iso, iso, iso).run();
  await assert.rejects(r.db.prepare('INSERT INTO aurelle_settlements VALUES (?,?,?,?,?,?)').bind(id, 'ava', 800, 4, -5, Math.floor(t0 / 1000)).run(), 'the table refuses negative Favor, so the sum can never go down');
});

test('(c) the decayed offline fallback (no aurelle_favor_spends yet) reads the faded earned Favor, the flat one is unchanged', async t => {
  const r = await setup(t); const t0 = r.now; await serve(r, 'ava', 10);
  // the same database, but the spends table is "missing": the balance query throws the missing-relation error, every other query runs for real (DROP is not allowed on the Postgres wrapper)
  const missing = new Error('relation "aurelle_favor_spends" does not exist'); missing.code = '42P01';
  const db = { prepare: sql => /aurelle_favor_spends/.test(sql) ? { bind: () => ({ first: async () => { throw missing; } }) } : r.db.prepare(sql) };
  const off = () => royalFavorBalance(db, 'ava'), on = () => royalFavorBalance(db, 'ava', at(r));
  assert.equal(await off(), 20, 'flag off: the old fallback'); assert.equal(await on(), 20);
  r.setNow(t0 + 7 * DAY); assert.equal(await on(), 10, 'decayed fallback'); assert.equal(await off(), 20);
  r.setNow(t0 + 14 * DAY); assert.equal(await on(), 0);
  await assert.rejects(royalFavorBalance({ prepare: () => ({ bind: () => ({ first: async () => { throw new Error('connection reset'); } }) }) }, 'ava', at(r)), /connection reset/, 'any other failure is never read as a balance');
});

test('(b) the coup reads the decayed Favor with the shared rule; flag off keeps the flat query', async t => {
  const src = await readFile(new URL('../lib/aurelle-coup.ts', import.meta.url), 'utf8');
  assert.match(src, /royalFavorSql\(decayAt, 'u\.clerk_user_id'\)/); assert.match(src, /readFavorAverage\(db, favorDecay \? now : undefined\)/);
  assert.match(src, /const flatFavorAverageSql = `SELECT AVG\(CASE WHEN f > 100 THEN 100 ELSE f END\) AS favor FROM \(SELECT SUM\(favor\) AS f FROM aurelle_settlements GROUP BY clerk_user_id\) t`;/);
  for (const f of ['../app/api/citizen/route.ts', '../app/api/world/route.ts', '../app/api/aurelle/rising/route.ts']) assert.match(await readFile(new URL(f, import.meta.url), 'utf8'), /favorDecay: .*HARIMU_FAVOR_DECAY_ENABLED.*=== 'true'/, f);
  assert.equal(royalFavorBalanceSql, "MAX(0,MIN(100,COALESCE((SELECT SUM(favor) FROM aurelle_settlements WHERE clerk_user_id=?),0))-COALESCE((SELECT SUM(amount) FROM aurelle_favor_spends WHERE clerk_user_id=?),0))");
  // behaviour: the average over settling citizens, from the same function as each citizen's balance
  const r = await setup(t, ['ava', 'bea']); const t0 = r.now;
  await serve(r, 'ava', 10); await serve(r, 'bea', 10); await spend(r, 'bea', 10);
  const average = async decayAt => { const sql = decayAt === undefined ? 'SELECT AVG(CASE WHEN f > 100 THEN 100 ELSE f END) AS favor FROM (SELECT SUM(favor) AS f FROM aurelle_settlements GROUP BY clerk_user_id) t' : `SELECT AVG(f) AS favor FROM (SELECT ${royalFavorSql(decayAt, 'u.clerk_user_id')} AS f FROM (SELECT DISTINCT clerk_user_id FROM aurelle_settlements) u) t`;
    const binds = decayAt === undefined ? [] : royalFavorColumnBinds(decayAt); return Number((await r.db.prepare(sql).bind(...binds).first()).favor); };
  assert.equal(await average(at(r)), (await bal(r, 'ava') + await bal(r, 'bea')) / 2, 'same numbers as the two balances'); assert.equal(await average(at(r)), 15);
  assert.equal(await average(undefined), 20, 'flag off: flat average, spends not counted (unchanged)');
  r.setNow(t0 + 7 * DAY); assert.equal(await average(at(r)), 5); assert.equal(await average(undefined), 20);
  assert.equal(favorDecaySeconds, 14 * 86400);
});
