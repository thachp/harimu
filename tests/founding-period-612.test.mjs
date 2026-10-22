/** #612 slice A: Founding Period state on the government read, one idempotent day-30 event per MVP nation on the world tick, a national news line. Flag HARIMU_FOUNDING_PERIOD_ENABLED, off by default. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const read = rel => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const day = 86400;
async function scene(t, backend, { on = true, startedDaysAgo = 10 } = {}) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  const at = new Date(r.now).toISOString();
  for (const [id, nation] of [['kay', 'kindle'], ['kor', 'korund'], ['ava', 'aurelle'], ['con', 'confluence']])
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
  const nowS = () => Math.floor(r.now / 1000);
  r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(nowS() - startedDaysAgo * day));
  if (on) r.setFixtureEnv('HARIMU_FOUNDING_PERIOD_ENABLED', 'true');
  return { r, nowS, started: nowS() - startedDaysAgo * day };
}
const events = async r => (await r.db.prepare('SELECT nation_id,kind,occurred_at,recorded_at FROM founding_day30_events ORDER BY nation_id').all()).results.map(x => ({ ...x }));
const tick = async r => { await r.call('world', null); await r.call('world', null); };
const gov = async (r, user) => (await r.call('citizen', user)).data.government;

test('wrangler.jsonc ships the Founding Period on in preview with its comment on its own line, and no line has a trailing comment', async () => {
  const cfg = await read('wrangler.jsonc');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_FOUNDING_PERIOD_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['true']);
  assert.match(cfg, /^\s*\/\/ #612:.*\n\s*"HARIMU_FOUNDING_PERIOD_ENABLED": "true",$/m, 'the comment is a full line above the flag');
  const trailing = cfg.split('\n').filter(l => !/^\s*\/\//.test(l)).filter(l => /\/\/|\/\*/.test(l.replace(/"(?:[^"\\]|\\.)*"/g, '""')));
  assert.deepEqual(trailing, []);
  const imports = [...(await read('lib/founding-period.ts')).matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]).sort();
  assert.deepEqual(imports, ['./aurelle-rising-rules', './database-contract', './db-errors', './founding-period-copy', './war', './war-rules'], 'only the war clock, the copy module, the claimant list, the shared missing-table helper and a type');
});

test('migration 0053 is additive in both dialects and matches the inline schema', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const [sqlite, pg, inline] = [await read('drizzle/0053_founding_day30_events.sql'), await read('db/postgres/0053_founding_day30_events.sql'), await r.importModule('lib/founding-period.ts')];
  for (const sql of [sqlite, pg]) {
    assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i);
    assert.deepEqual([...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]), ['founding_day30_events']);
  }
  assert.deepEqual([...inline.foundingSchema.join(';').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]), ['founding_day30_events']);
});

test('foundingState reuses the war clock: active until start + 30 days, unknown start stays active', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { foundingState } = await r.importModule('lib/founding-period.ts'), { foundingPeriodEnd, inFoundingPeriod } = await r.importModule('lib/war-rules.ts');
  const start = 1_800_000_000;
  assert.deepEqual(foundingState(start, start), { active: true, endsAt: start + 30 * day, dayOfPeriod: 1 });
  assert.deepEqual(foundingState(start, start + 29 * day + 86399), { active: true, endsAt: start + 30 * day, dayOfPeriod: 30 });
  assert.deepEqual(foundingState(start, start + 30 * day), { active: false, endsAt: start + 30 * day, dayOfPeriod: null });
  assert.deepEqual(foundingState(null, start), { active: true, endsAt: null, dayOfPeriod: null }, 'fail closed');
  for (const now of [start, start + 30 * day - 1, start + 30 * day, start + 31 * day]) assert.equal(foundingState(start, now).active, inFoundingPeriod(start, now));
  assert.equal(foundingState(start, start).endsAt, foundingPeriodEnd(start));
});

for (const backend of ['sqlite', 'postgres']) {
  test(`flag off: no new fields, no tick writes, no news line (${backend})`, async t => {
    const { r, nowS } = await scene(t, backend, { on: false, startedDaysAgo: 40 });
    for (const user of ['kay', 'kor', 'ava']) assert.equal('founding' in (await gov(r, user)), false, user);
    await tick(r); assert.deepEqual(await events(r), []);
    assert.equal((await r.call('citizen', 'kay', { action: 'noop' })).status >= 200, true);
    const news = (await r.call('news', 'kay')).data;
    assert.ok(!JSON.stringify(news).includes('founding-day30'));
    assert.ok(nowS() > 0);
  });

  test(`flag on, before day 30: active with the right endsAt, no event (${backend})`, async t => {
    const { r, started } = await scene(t, backend, { startedDaysAgo: 10 });
    for (const user of ['kay', 'kor', 'ava']) { const g = await gov(r, user); assert.deepEqual(g.founding, { active: true, endsAt: started + 30 * day, dayOfPeriod: 11 }, user); }
    assert.equal('founding' in (await gov(r, 'con') ?? {}), false, 'not an MVP nation');
    await tick(r); assert.deepEqual(await events(r), []);
  });

  test(`flag on, after day 30: inactive, exactly one event per MVP nation after repeated ticks, and GET writes nothing (${backend})`, async t => {
    const { r, started } = await scene(t, backend, { startedDaysAgo: 31 });
    for (const user of ['kay', 'kor', 'ava']) assert.deepEqual((await gov(r, user)).founding, { active: false, endsAt: started + 30 * day, dayOfPeriod: null }, user);
    assert.deepEqual(await events(r), [], 'the read alone records nothing');
    await tick(r); const first = await events(r);
    assert.deepEqual(first.map(e => [e.nation_id, e.kind, Number(e.occurred_at)]), [['aurelle', 'houses_publish_claims', started + 30 * day], ['kindle', 'first_election', started + 30 * day], ['korund', 'chairman_confirmed', started + 30 * day]]);
    r.setNow(r.now + 3 * day * 1000); await tick(r); await r.call('citizen', 'kay', { action: 'noop' });
    assert.deepEqual(await events(r), first, 'repeated ticks change nothing');
    const writes = [], prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
    r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 40)); return prepare(sql); }; r.db.batch = x => { writes.push('batch'); return batch(x); };
    await r.call('citizen', 'kay'); r.db.prepare = prepare; r.db.batch = batch;
    assert.deepEqual(writes, [], 'GET /api/citizen stays read-only');
  });

  test(`the national news carries each nation's day-30 line from the recorded row (${backend})`, async t => {
    const { r } = await scene(t, backend, { startedDaysAgo: 31 });
    await tick(r);
    const lines = {};
    for (const [user, nation] of [['kay', 'kindle'], ['kor', 'korund'], ['ava', 'aurelle']]) lines[nation] = (await r.call('news', user)).data.items.find(i => i.id === `${nation}:founding-day30`);
    assert.match(lines.kindle.title, /first election/); assert.match(lines.korund.title, /Chairman is confirmed/); assert.match(lines.aurelle.title, /houses publish claims/);
    for (const house of ['House Vaelcourt', 'House Brightvane', 'House Larkspire']) assert.ok(lines.aurelle.text.includes(house), house);
    assert.ok(!lines.kindle.text.includes('House'));
  });

  test(`the table only takes the three MVP nations with their own event (${backend})`, async t => {
    const { r } = await scene(t, backend);
    await assert.rejects(() => r.db.prepare("INSERT INTO founding_day30_events VALUES ('confluence','first_election',1,1)").run());
    await assert.rejects(() => r.db.prepare("INSERT INTO founding_day30_events VALUES ('kindle','chairman_confirmed',1,1)").run());
  });
}

test('a database without migration 0053 reads as no events and keeps serving (sqlite)', async t => {
  const { r, started } = await scene(t, 'sqlite', { startedDaysAgo: 31 });
  const mod = await r.importModule('lib/founding-period.ts');
  await tick(r); assert.equal((await mod.readFoundingEvents(r.db)).length, 3);
  await r.db.prepare('DROP TABLE founding_day30_events').run();
  assert.deepEqual(await mod.readFoundingEvents(r.db), []);
  assert.deepEqual((await r.call('news', 'kay')).data.items.filter(i => String(i.id).includes('founding')), []);
  assert.deepEqual((await gov(r, 'kay')).founding, { active: false, endsAt: started + 30 * day, dayOfPeriod: null });
  await r.call('world', null);
});

test('readFoundingEvents tolerates only a missing table (the SQLite and Postgres error shapes), and rethrows anything else', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { readFoundingEvents } = await r.importModule('lib/founding-period.ts');
  const failing = error => ({ prepare: () => ({ all: () => Promise.reject(error) }) });
  assert.deepEqual(await readFoundingEvents(failing(new Error('no such table: founding_day30_events'))), []);
  assert.deepEqual(await readFoundingEvents(failing(new Error('PostgreSQL operation failed (42P01): relation "founding_day30_events" does not exist.'))), []);
  await assert.rejects(() => readFoundingEvents(failing(new Error('database is locked'))), /locked/);
});
