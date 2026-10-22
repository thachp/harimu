/** #739 slice 1 (docs §17.4, flag HARIMU_DORMANCY_ENABLED): dormancy status, the hourly activity bump on GET /api/citizen, the Welcome back briefing once, flag off inert, migration 0069. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { localRuntime } from './helpers/local-runtime.mjs';
const rules = await (async () => { const r = await localRuntime(); try { return await r.importModule('lib/dormancy-rules.ts'); } finally { await r.close(); } })();
const H = 3600, D = 86400;

test('thresholds are the docs\' 7 / 30 / 180 real days, at the boundaries', () => {
  assert.deepEqual({ ...rules.DORMANCY_DAYS }, { away: 7, dormant: 30, archived: 180 }); assert.equal(rules.ACTIVITY_BUMP_SECONDS, 3600);
  const now = 1_800_000_000, at = s => rules.dormancyStatus(now - s, now);
  assert.equal(at(7 * D - H), 'active'); assert.equal(at(7 * D - 1), 'active'); assert.equal(at(7 * D), 'away');
  assert.equal(at(30 * D - 1), 'away'); assert.equal(at(30 * D), 'dormant'); assert.equal(at(180 * D - 1), 'dormant'); assert.equal(at(180 * D), 'archived');
  assert.equal(rules.dormancyStatus(null, now), 'active'); assert.equal(rules.dormancyStatus(now + D, now), 'active');
});

const spy = r => { const sql = []; const prepare = r.db.prepare.bind(r.db); r.db.prepare = q => { sql.push(q); return prepare(q); }; return { sql, restore: () => { r.db.prepare = prepare; } }; };
const setLast = (r, user, ms) => r.db.prepare('UPDATE citizens SET last_active_at = ? WHERE clerk_user_id = ?').bind(new Date(ms).toISOString(), user).run();
const last = async (r, user) => (await r.db.prepare('SELECT last_active_at FROM citizens WHERE clerk_user_id = ?').bind(user).first()).last_active_at;

for (const backend of ['sqlite', 'postgres']) test(`GET /api/citizen: flag off inert; on: Welcome back once after Away, hourly bump, active never briefed (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  await setLast(r, 'alice', r.now - 8 * D * 1000);
  const off = spy(r); const quiet = await r.call('citizen', 'alice'); off.restore();
  assert.equal(quiet.status, 200); assert.equal(quiet.data.welcomeBack, undefined, 'flag off: no briefing');
  assert.ok(!off.sql.some(q => /last_active_at/.test(q)), 'flag off: last_active_at is neither read nor written');
  r.setDormancy(true);
  const on = spy(r); const back = await r.call('citizen', 'alice'); on.restore();
  assert.equal(back.data.welcomeBack.status, 'away'); assert.equal(back.data.welcomeBack.since, new Date(r.now - 8 * D * 1000).toISOString());
  assert.equal(on.sql.filter(q => /^\s*UPDATE citizens SET last_active_at/.test(q)).length, 1, 'one bump');
  assert.equal(await last(r, 'alice'), new Date(Math.floor(r.now / 1000) * 1000).toISOString());
  const again = spy(r); const second = await r.call('citizen', 'alice'); again.restore();
  assert.equal(second.data.welcomeBack, undefined, 'shown once'); assert.ok(!again.sql.some(q => /^\s*UPDATE/.test(q)), 'no write within the hour');
  r.setNow(r.now + 2 * H * 1000);
  const later = spy(r); const third = await r.call('citizen', 'alice'); later.restore();
  assert.equal(third.data.welcomeBack, undefined, 'two hours away is still active'); assert.equal(later.sql.filter(q => /^\s*UPDATE citizens SET last_active_at/.test(q)).length, 1, 'hourly bump');
  for (const [days, status] of [[31, 'dormant'], [181, 'archived']]) { await setLast(r, 'alice', r.now - days * D * 1000); assert.equal((await r.call('citizen', 'alice')).data.welcomeBack.status, status); }
});

test('no extra serial round trip: the read rides the first parallel wave and the bump the existing second wave', () => {
  const src = readFileSync('app/api/citizen/route.ts', 'utf8'), get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'));
  const waves = [...get.matchAll(/await Promise\.all\(\[/g)].map(m => m.index);
  assert.equal(waves.length, 2, 'still exactly two waves'); const read = get.indexOf('readLastActive(database'), bump = get.indexOf('bumpLastActive(database');
  assert.ok(read > waves[0] && read < waves[1] && bump > waves[1], 'read in wave 1, bump in wave 2');
});

test('migration 0069 is additive and backfills last_active_at from updated_at (Postgres); SQLite gets the same column and backfill', async t => {
  const sql = readFileSync('db/postgres/0069_citizen_last_active.sql', 'utf8'), pg = new PGlite(); t.after(() => pg.close());
  await pg.exec("CREATE TABLE citizens (clerk_user_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL); INSERT INTO citizens VALUES ('a','2026-01-01T00:00:00.000Z')");
  await pg.exec(sql); await pg.exec(sql);
  assert.deepEqual((await pg.query('SELECT clerk_user_id, last_active_at FROM citizens')).rows, [{ clerk_user_id: 'a', last_active_at: '2026-01-01T00:00:00.000Z' }]);
  assert.match(readFileSync('lib/db.ts', 'utf8'), /ALTER TABLE citizens ADD COLUMN last_active_at TEXT'\), database\.prepare\('UPDATE citizens SET last_active_at = updated_at WHERE last_active_at IS NULL'\)/);
});
