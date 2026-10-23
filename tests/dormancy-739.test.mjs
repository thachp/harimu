/** #739 slice 1 (docs §17.4, flag HARIMU_DORMANCY_ENABLED): dormancy status, POST /api/citizen/heartbeat (hourly bump, Welcome back once from the prior value),
 *  flag off inert, GET /api/citizen untouched (#205, ARC), the neutral frame for nations without one, and migration 0069. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { localRuntime } from './helpers/local-runtime.mjs';
const { rules, copy } = await (async () => { const r = await localRuntime(); try { return { rules: await r.importModule('lib/dormancy-rules.ts'), copy: await r.importModule('lib/dormancy-copy.ts') }; } finally { await r.close(); } })();
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
const beat = (r, user, origin) => r.call('citizen/heartbeat', user, {}, origin);
const bumps = sql => sql.filter(q => /^\s*UPDATE citizens SET last_active_at/.test(q)).length;

for (const backend of ['sqlite', 'postgres']) test(`POST /api/citizen/heartbeat: flag off 404 with no database work; on: Welcome back once after Away, hourly bump (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  await setLast(r, 'alice', r.now - 8 * D * 1000);
  const off = spy(r); const quiet = await beat(r, 'alice'); off.restore();
  assert.equal(quiet.status, 404, 'flag off: 404'); assert.deepEqual(off.sql, [], 'flag off: no database work');
  r.setDormancy(true);
  assert.equal((await beat(r, null)).status, 401, 'signed out'); assert.equal((await beat(r, 'alice', 'https://evil.invalid')).status, 403, 'cross-origin');
  const on = spy(r); const back = await beat(r, 'alice'); on.restore();
  assert.equal(back.status, 200); assert.equal(back.data.welcomeBack.status, 'away'); assert.equal(back.data.welcomeBack.since, new Date(r.now - 8 * D * 1000).toISOString());
  assert.equal(bumps(on.sql), 1, 'one bump'); assert.equal(await last(r, 'alice'), new Date(Math.floor(r.now / 1000) * 1000).toISOString());
  const again = spy(r); const second = await beat(r, 'alice'); again.restore();
  assert.equal(second.data.welcomeBack, null, 'shown once'); assert.equal(bumps(again.sql), 0, 'no write within the hour');
  r.setNow(r.now + 2 * H * 1000);
  const later = spy(r); const third = await beat(r, 'alice'); later.restore();
  assert.equal(third.data.welcomeBack, null, 'two hours away is still active'); assert.equal(bumps(later.sql), 1, 'hourly bump');
  for (const [days, status] of [[31, 'dormant'], [181, 'archived']]) { await setLast(r, 'alice', r.now - days * D * 1000); assert.equal((await beat(r, 'alice')).data.welcomeBack.status, status); }
  await setLast(r, 'alice', r.now - 9 * D * 1000);
  const racing = await Promise.all([beat(r, 'alice'), beat(r, 'alice'), beat(r, 'alice')]);
  assert.equal(racing.filter(x => x.data.welcomeBack).length, 1, 'parallel first loads: only the compare-and-set winner returns the briefing (QA1)');
  await r.db.prepare("UPDATE citizens SET last_active_at = 'not-a-date' WHERE clerk_user_id = 'alice'").run(); // QA1: unparseable is treated like NULL
  assert.deepEqual((await beat(r, 'alice')).data, { bumped: true, welcomeBack: null }, 'unparseable: no briefing, bumped');
  assert.equal(await last(r, 'alice'), new Date(Math.floor(r.now / 1000) * 1000).toISOString(), 'unparseable value is overwritten');
  await r.db.prepare("UPDATE citizens SET last_active_at = NULL WHERE clerk_user_id = 'alice'").run();
  assert.deepEqual((await beat(r, 'alice')).data, { bumped: true, welcomeBack: null }, 'NULL: same as unparseable');
  assert.deepEqual((await beat(r, 'nobody')).data, { bumped: false, welcomeBack: null }, 'no citizen row: nothing written');
});

test('the client posts the heartbeat once per load and GET /api/citizen has no dormancy code (#205)', () => {
  assert.doesNotMatch(readFileSync('app/api/citizen/route.ts', 'utf8'), /dormancy|last_active_at/i);
  const page = readFileSync('app/page.tsx', 'utf8'); assert.equal((page.match(/sendHeartbeat\(/g) ?? []).length, 1);
});

test('nations without their own frame get the neutral generic frame (no byline, no nation voice); headlineCount stays hidden', () => {
  const g = copy.welcomeBackGeneric, src = readFileSync('app/welcome-back.tsx', 'utf8');
  assert.equal(g.byline, null); assert.equal(g.aiBadge, false); assert.equal(g.greeting.text, 'Welcome back. You were away for {daysAway}.');
  for (const w of copy.welcomeBack) assert.notEqual(g.greeting.text, w.greeting.text, `${w.nationId}'s frame is not reused`);
  assert.ok(g.greeting.text.length <= copy.DORMANCY_LINE_MAX);
  assert.match(src, /welcomeBackFor\(nationId as DormancyNation\) \?\? welcomeBackGeneric/); assert.doesNotMatch(src, /\.news\b/, "the news line is never rendered");
});

test('migration 0069 is additive and backfills last_active_at with now on Postgres and SQLite (an active player gets no false Welcome back)', async t => {
  const sql = readFileSync('db/postgres/0069_citizen_last_active.sql', 'utf8'), pg = new PGlite(); t.after(() => pg.close());
  await pg.exec("CREATE TABLE citizens (clerk_user_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL); INSERT INTO citizens VALUES ('a','2026-01-01T00:00:00.000Z')");
  await pg.exec(sql); await pg.exec(sql);
  const [{ last_active_at: v }] = (await pg.query('SELECT last_active_at FROM citizens')).rows;
  assert.match(v, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/); assert.ok(Math.abs(Date.parse(v) - Date.now()) < 60_000, 'backfilled with now, not updated_at: no false Welcome back');
  assert.match(readFileSync('lib/db.ts', 'utf8'), /ADD COLUMN last_active_at TEXT'\), database\.prepare\("UPDATE citizens SET last_active_at = strftime\('%Y-%m-%dT%H:%M:%fZ','now'\) WHERE last_active_at IS NULL"\)/);
  const { DatabaseSync } = await import('node:sqlite'), lite = new DatabaseSync(':memory:'); lite.exec("CREATE TABLE citizens (clerk_user_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL); INSERT INTO citizens VALUES ('a','2026-01-01T00:00:00.000Z')");
  lite.exec(readFileSync('drizzle/0069_citizen_last_active.sql', 'utf8')); const w = lite.prepare('SELECT last_active_at FROM citizens').get().last_active_at; lite.close();
  assert.match(w, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/); assert.ok(Math.abs(Date.parse(w) - Date.now()) < 60_000, 'SQLite backfill is now too');
});
