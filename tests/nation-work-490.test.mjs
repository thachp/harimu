/** #490 Stage 0d: generic per-nation wage ledger, nation work commands (HARIMU_NATION_WORK_ENABLED, off), citizen_faith widening (migration 0049). */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { localRuntime } from './helpers/local-runtime.mjs';
import { postgresMigrations, hasReviewMarker, isDestructive } from '../scripts/postgres-migrations.mjs';

// [ASSUMPTION] Test-only fixture numbers (no nation has jobs in the registry yet; the Confluence PoC picks the real ones): one 4-capacity, 2-hour job paying 800 minor, fund 1600.
const job = { id: 'confluence-test-harvest', name: 'Test cooperative harvest', capacityCost: 4, hours: 2, wageMinor: 800, output: 'Test output' };
const opening = (over = {}) => ({ id: 'confluence', openingFlag: 'HARIMU_CONFLUENCE_ENABLED', currency: { code: 'CUR', name: 'Current' }, wage: { fundMinor: 1600 }, jobs: [job], ...over });
const bindings = { HARIMU_CONFLUENCE_ENABLED: 'true', HARIMU_QA_TEST_CITIZENS: 'true', NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_QA_TEST_CITIZEN_IDS: 'alice,bob,carol' };
const live = (over = {}) => ({ enabled: true, bindings, openings: [opening()], ...over });
const sec = r => Math.floor(r.now / 1000);

async function setup(t, nation = 'confluence') {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('world', null);
  await r.db.prepare('UPDATE citizens SET nation_id=?').bind(nation).run();
  const m = await r.importModule('lib/nation-work.ts');
  return { r, m };
}
const count = async (r, table, where = '') => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).first()).n);
const start = (m, r, user, id = randomUUID(), options = live(), jobId = job.id) => m.executeNationWork(r.db, user, { action: 'nation-start-work', requestId: id, jobId }, sec(r), options);
const claim = (m, r, user, shiftId, options = live()) => m.executeNationWork(r.db, user, { action: 'nation-claim-work', shiftId }, sec(r), options);
const capacity = async (r, user) => Number((await r.db.prepare('SELECT capacity FROM citizens WHERE clerk_user_id=?').bind(user).first()).capacity);
const ledgerTables = ['nation_wage_funds', 'nation_wage_starts', 'nation_wage_settlements', 'nation_wage_spends'];

test('static: the flag ships "false"; migration 0049 is one additive set of tables plus the citizen_faith widening, mirrored in drizzle and db/postgres; nothing periodic', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_NATION_WORK_ENABLED"\s*:\s*"([^"]*)"/g)].map(x => x[1]), ['false']);
  for (const file of ['../drizzle/0049_nation_wage_ledger.sql', '../db/postgres/0049_nation_wage_ledger.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.deepEqual([...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/g)].map(x => x[1]).sort(), [...ledgerTables].sort().concat(file.includes('drizzle') ? ['citizen_faith'] : []).sort());
    assert.doesNotMatch(sql, /nation_id\s+(TEXT\s+)?(COLLATE "C"\s+)?NOT NULL CHECK\s*\(\s*nation_id\s+IN/i, 'no literal nation list on the new tables');
  }
  const pg = postgresMigrations().find(m => m.file.startsWith('0049_'));
  assert.deepEqual(pg.tables.sort(), [...ledgerTables].sort());
  assert.ok(hasReviewMarker(pg.sql) && isDestructive(pg.sql), 'the only destructive statements are the citizen_faith constraint swap, marked for review');
  assert.deepEqual([...pg.sql.replace(/--.*$/gm, '').matchAll(/\bDROP\s+(\w+)\s+(?:IF EXISTS\s+)?(\w+)/gi)].map(x => `${x[1]} ${x[2]}`.toUpperCase()).filter((x, i, a) => a.indexOf(x) === i), ['CONSTRAINT CITIZEN_FAITH_NATION_ID_CHECK', 'CONSTRAINT CITIZEN_FAITH_NATION_ID_FKEY', 'CONSTRAINT CITIZEN_FAITH_NATION_ID_NONEMPTY']);
  const lib = (await readFile(new URL('../lib/nation-work.ts', import.meta.url), 'utf8')).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(entry, /nation-work|executeNationWork/, 'the scheduled Worker has nothing to do here');
  const writes = [...lib.matchAll(/\b(INSERT(?: OR IGNORE)? INTO|UPDATE|DELETE FROM)\s+(\w+)/g)].map(x => `${x[1]} ${x[2]}`);
  const reader = lib.slice(lib.indexOf('export async function readNationWork'), lib.indexOf('const notFound'));
  assert.doesNotMatch(reader, /INSERT|UPDATE |DELETE/, 'reads never write');
  assert.ok(writes.every(w => /work_orders|nation_wage_|work_shifts|citizens/.test(w)), writes.join('; '));
});

test('flag off (shipped default): both commands are 404, nothing is written, the plan is absent, even for an allowlisted citizen of a nation with jobs', async t => {
  const { r, m } = await setup(t);
  const before = Object.fromEntries(await Promise.all(['work_orders', 'work_shifts', ...ledgerTables].map(async x => [x, await count(r, x)])));
  const id = randomUUID();
  for (const body of [{ action: 'nation-start-work', requestId: id, jobId: job.id }, { action: 'nation-claim-work', shiftId: id }, { action: 'nation-start-work' }, { action: 'nation-claim-work', shiftId: 'nope' }]) {
    const res = await r.call('citizen', 'alice', body); assert.equal(res.status, 404, JSON.stringify(body)); assert.equal(res.data.reason, 'disabled');
  }
  assert.equal((await r.call('citizen', 'alice')).data.nationWorkPlan, undefined);
  assert.deepEqual(await start(m, r, 'alice', id, live({ enabled: false })), { status: 404, reason: 'disabled', error: 'Not found.' });
  assert.equal(await m.readNationWork(r.db, 'alice', live({ enabled: false })), null);
  assert.deepEqual(Object.fromEntries(await Promise.all(Object.keys(before).map(async x => [x, await count(r, x)]))), before, 'no rows anywhere');
});

test('flag on but no nation has jobs yet (the registry ships none): 404 unavailable and nothing written; live nations and flag-off nations are unaffected', async t => {
  const { r } = await setup(t, 'confluence');
  r.setFixtureEnv('HARIMU_NATION_WORK_ENABLED', 'true'); r.setFixtureEnv('HARIMU_CONFLUENCE_ENABLED', 'true');
  for (const [k, v] of Object.entries(bindings)) r.setFixtureEnv(k, v);
  const body = { action: 'nation-start-work', requestId: randomUUID(), jobId: 'confluence-cooperative-harvest' };
  const res = await r.call('citizen', 'alice', body); assert.equal(res.status, 404); assert.equal(res.data.reason, 'unavailable');
  assert.equal((await r.call('citizen', 'alice')).data.nationWorkPlan, undefined);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle'").run();
  assert.equal((await r.call('citizen', 'alice', { ...body, requestId: randomUUID() })).status, 404);
  assert.equal((await r.call('citizen', 'alice', { action: 'nation-start-work', requestId: 'x', jobId: 'y' })).status, 400, 'a malformed command is a 400 once the flag is on');
  for (const x of ['work_shifts', ...ledgerTables]) assert.equal(await count(r, x), 0, x);
});

test('start and claim: one shift pays once, wallet and fund are sums, capacity is spent once, retries and parallel claims cannot pay twice', async t => {
  const { r, m } = await setup(t);
  const cap = await capacity(r, 'alice'), id = randomUUID();
  assert.deepEqual(await start(m, r, 'alice', id), { status: 200 });
  assert.equal(await capacity(r, 'alice'), cap - 4, 'capacity spent');
  assert.deepEqual(await start(m, r, 'alice', id), { status: 200, replayed: true }); assert.equal(await capacity(r, 'alice'), cap - 4, 'a replay does not charge again');
  assert.deepEqual(await start(m, r, 'bob', id), { status: 409, reason: 'request_reused', error: 'Request identifier already used.' }, 'another citizen cannot reuse the id');
  assert.equal((await start(m, r, 'alice', id, live(), 'confluence-other')).status, 404);
  assert.equal((await start(m, r, 'alice', randomUUID())).status, 409, 'one active shift at a time');
  assert.equal(await count(r, 'work_shifts'), 1);
  assert.equal((await claim(m, r, 'alice', id)).reason, 'underway');
  r.setNow(r.now + 2 * 3600 * 1000);
  assert.equal((await claim(m, r, 'bob', id)).status, 404, 'only the owner claims');
  const results = await Promise.all([1, 2, 3, 4].map(() => claim(m, r, 'alice', id)));
  assert.ok(results.every(x => x.status === 200), JSON.stringify(results));
  assert.equal(await count(r, 'nation_wage_settlements'), 1, 'one payout');
  assert.deepEqual(await claim(m, r, 'alice', id), { status: 200, replayed: true });
  const plan = await m.readNationWork(r.db, 'alice', live());
  assert.equal(plan.walletMinor, 800); assert.equal(plan.fundMinor, 800); assert.equal(plan.currency.code, 'CUR'); assert.equal(plan.shifts.length, 1); assert.equal(plan.shifts[0].wageMinor, 800); assert.ok(plan.shifts[0].claimedAt);
  assert.equal((await r.db.prepare('SELECT wage_minor,job_id,nation_id FROM nation_wage_settlements').first()).job_id, job.id);
  assert.equal(await capacity(r, 'alice'), cap - 4);
  // the next shift can start after the claim (the one-active-shift index is released) and pays on top
  const second = randomUUID(); assert.equal((await start(m, r, 'alice', second)).status, 200);
  assert.equal(await count(r, 'nation_wage_starts'), 2);
});

test('parallel starts with one request id charge capacity once and make one shift', async t => {
  const { r, m } = await setup(t);
  const cap = await capacity(r, 'alice'), id = randomUUID();
  const results = await Promise.all([1, 2, 3].map(() => start(m, r, 'alice', id)));
  assert.ok(results.every(x => x.status === 200), JSON.stringify(results));
  assert.equal(await count(r, 'work_shifts'), 1); assert.equal(await count(r, 'nation_wage_starts'), 1); assert.equal(await capacity(r, 'alice'), cap - 4);
});

test('not enough Work Capacity: the start is refused and nothing is written beyond the closed work order and fund seed', async t => {
  const { r, m } = await setup(t);
  await r.db.prepare("UPDATE citizens SET capacity=3 WHERE clerk_user_id='alice'").run();
  const res = await start(m, r, 'alice'); assert.equal(res.status, 409); assert.equal(res.reason, 'cannot_start');
  assert.equal(await count(r, 'work_shifts'), 0); assert.equal(await count(r, 'nation_wage_starts'), 0); assert.equal(await capacity(r, 'alice'), 3);
});

test('fund cap: the nation fund never pays more than it holds; a short claim keeps the shift unclaimed and pays nothing, even in parallel', async t => {
  const { r, m } = await setup(t);
  const options = live({ openings: [opening({ wage: { fundMinor: 800 } })] });
  const a = randomUUID(), b = randomUUID();
  assert.equal((await start(m, r, 'alice', a, options)).status, 200); assert.equal((await start(m, r, 'bob', b, options)).status, 200);
  r.setNow(r.now + 2 * 3600 * 1000);
  const results = await Promise.all([claim(m, r, 'alice', a, options), claim(m, r, 'bob', b, options)]);
  const paid = await count(r, 'nation_wage_settlements');
  assert.ok(paid <= 1, `paid ${paid}`); assert.ok(results.filter(x => x.status === 200).length === paid, JSON.stringify(results));
  const fund = Number((await r.db.prepare('SELECT initial_minor-COALESCE((SELECT SUM(wage_minor) FROM nation_wage_settlements),0) AS f FROM nation_wage_funds').first()).f);
  assert.ok(fund >= 0, 'the fund is never overdrawn');
  if (!paid) { // both withdrew (a tie fails closed): a retry pays one
    assert.equal((await claim(m, r, 'alice', a, options)).status, 200); assert.equal(await count(r, 'nation_wage_settlements'), 1);
  }
  const loser = (await r.db.prepare('SELECT s.id FROM work_shifts s WHERE s.claimed_at IS NULL').first()).id;
  const refused = await claim(m, r, loser === a ? 'alice' : 'bob', loser, options);
  assert.equal(refused.status, 409); assert.equal(refused.reason, 'fund_short');
  assert.equal(await count(r, 'nation_wage_settlements'), 1, 'still one payout'); assert.equal(await count(r, 'work_shifts', 'WHERE claimed_at IS NULL'), 1, 'the unpaid shift is kept');
  assert.equal((await m.readNationWork(r.db, 'alice', options)).fundMinor, 0);
});

test('the opening must be playable for the account and well formed, every command, or it fails closed', async t => {
  const { r, m } = await setup(t);
  assert.equal((await start(m, r, 'carol')).status, 404, 'carol is not a citizen here');
  assert.equal((await start(m, r, 'alice', randomUUID(), live({ bindings: { ...bindings, HARIMU_CONFLUENCE_ENABLED: undefined } }))).reason, 'unavailable', 'opening flag off');
  assert.equal((await start(m, r, 'alice', randomUUID(), live({ bindings: { ...bindings, HARIMU_QA_TEST_CITIZEN_IDS: 'bob' } }))).reason, 'unavailable', 'not on the QA allowlist');
  assert.equal((await start(m, r, 'alice', randomUUID(), live({ bindings: { ...bindings, NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: undefined } }))).reason, 'unavailable', 'not a preview');
  for (const bad of [opening({ jobs: [{ ...job, id: 'harvest' }] }), opening({ jobs: [{ ...job, wageMinor: 0 }] }), opening({ jobs: [{ ...job, wageMinor: 1.5 }] }), opening({ jobs: [] }), opening({ wage: undefined }), opening({ currency: undefined }), opening({ wage: { fundMinor: -1 } })])
    assert.equal((await start(m, r, 'alice', randomUUID(), live({ openings: [bad] }))).reason, 'unavailable', JSON.stringify(bad).slice(0, 80));
  assert.equal(await count(r, 'work_shifts'), 0); for (const x of ledgerTables) assert.equal(await count(r, x), 0, x);
  // a started shift is not claimable once the nation stops being playable for the account (re-checked on every command)
  const id = randomUUID(); assert.equal((await start(m, r, 'alice', id)).status, 200); r.setNow(r.now + 2 * 3600 * 1000);
  assert.equal((await claim(m, r, 'alice', id, live({ bindings: { ...bindings, HARIMU_CONFLUENCE_ENABLED: 'false' } }))).status, 404); assert.equal(await count(r, 'nation_wage_settlements'), 0);
  assert.equal((await claim(m, r, 'alice', id)).status, 200);
});

test('a nation job never shows in the public work order list and cannot be started or claimed through the generic commands', async t => {
  const { r, m } = await setup(t);
  const id = randomUUID(); assert.equal((await start(m, r, 'alice', id)).status, 200);
  assert.equal((await r.db.prepare('SELECT status FROM work_orders WHERE id=?').bind(job.id).first()).status, 'closed');
  assert.doesNotMatch(JSON.stringify((await r.call('world', null)).data), /confluence-test-harvest|Test cooperative harvest/);
  assert.equal((await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: job.id })).status, 404);
  r.setNow(r.now + 2 * 3600 * 1000);
  const generic = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: id }); assert.notEqual(generic.status, 200);
  assert.equal(await count(r, 'shift_settlements'), 0, 'no Spark wage from a nation shift'); assert.equal(await count(r, 'nation_wage_settlements'), 0);
});

test('Korund, Aurelle and Kindle wages are unchanged with the flag on, and the reconciliation job still has zero mismatches', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('world', null);
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run(); await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='bob'").run();
  r.setFixtureEnv('HARIMU_NATION_WORK_ENABLED', 'true');
  for (const [user, prefix, order] of [['alice', 'korund', 'korund-food-production'], ['bob', 'aurelle', 'aurelle-food-estate']]) {
    const id = randomUUID(); assert.equal((await r.call('citizen', user, { action: `${prefix}-start-work`, requestId: id })).status, 200, prefix);
    r.setNow(r.now + 2 * 3600 * 1000); assert.equal((await r.call('citizen', user, { action: `${prefix}-claim-work`, shiftId: id, requestId: randomUUID() })).status, 200, prefix);
    assert.equal((await r.db.prepare('SELECT wage_minor FROM work_shifts s JOIN work_orders o ON o.id=s.work_order_id JOIN ' + `${prefix}_settlements t ON t.shift_id=s.id WHERE o.id=?`).bind(order).first()).wage_minor, 800);
  }
  assert.equal((await r.call('citizen', 'alice')).data.korundPlan.walletMinor, 800);
  assert.equal((await r.call('citizen', 'alice')).data.nationWorkPlan, undefined);
  for (const x of ledgerTables) assert.equal(await count(r, x), 0, x);
  const recon = await r.importModule('lib/ledger-reconciliation.ts'); const result = await recon.reconcileLedger(r.db);
  assert.equal(result.mismatchCount, 0, JSON.stringify(result.mismatches));
  const korund = await readFile(new URL('../lib/korund.ts', import.meta.url), 'utf8'); assert.match(korund, /laborNoteSql\('\?'\)/);
});

test('citizen_faith accepts any seeded nation and still refuses unknown ones and a hidden faith outside Korund (inline schema)', async t => {
  const { r } = await setup(t);
  const insert = (user, nation, hidden = null) => r.db.prepare("INSERT INTO citizen_faith (user_id,nation_id,faith_id,hidden_faith_id,chosen_at,request_id) VALUES (?,?,'unaffiliated',?,1,?)").bind(user, nation, hidden, randomUUID()).run();
  await insert('alice', 'confluence'); assert.equal(await count(r, 'citizen_faith'), 1);
  await assert.rejects(insert('bob', 'atlantis'), /FOREIGN KEY|foreign key|violates|23503/i);
  await assert.rejects(insert('bob', 'confluence', 'open-hand'), /CHECK|check|violates|23514/i, 'a hidden faith stays Korund-only');
  await insert('bob', 'korund', 'open-hand');
});

const faithMigration = readFileSync(new URL('../drizzle/0025_citizen_faith.sql', import.meta.url), 'utf8');
const wageMigration = readFileSync(new URL('../drizzle/0049_nation_wage_ledger.sql', import.meta.url), 'utf8');
test('migration 0049 on SQLite (mutation check): before it confluence is refused, after it is accepted, old rows are kept exactly, bad nations and hidden faiths are still refused', () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  db.exec(`CREATE TABLE nations (id TEXT PRIMARY KEY); INSERT INTO nations VALUES ('kindle'),('korund'),('aurelle'),('confluence');
    CREATE TABLE citizens (clerk_user_id TEXT PRIMARY KEY, nation_id TEXT REFERENCES nations(id)); INSERT INTO citizens VALUES ('u1','kindle'),('u2','korund'),('u3','confluence'),('u4','aurelle');
    CREATE TABLE work_shifts (id TEXT PRIMARY KEY);`);
  db.exec(faithMigration);
  db.exec("INSERT INTO citizen_faith VALUES ('u1','kindle','open-hand',NULL,10,20,'r1'),('u2','korund','unaffiliated','kinward-rite',11,NULL,'r2')");
  assert.throws(() => db.exec("INSERT INTO citizen_faith VALUES ('u3','confluence','unaffiliated',NULL,1,NULL,'r3')"), /CHECK/, 'before: the literal list refuses it');
  const before = db.prepare('SELECT * FROM citizen_faith ORDER BY user_id').all();
  db.exec(wageMigration); db.exec(wageMigration.replace(/^[\s\S]*?(?=DROP TABLE IF EXISTS citizen_faith_old)/, '')); // and a second run of the rebuild keeps the rows too
  assert.deepEqual(db.prepare('SELECT * FROM citizen_faith ORDER BY user_id').all(), before, 'rows copied unchanged');
  db.exec("INSERT INTO citizen_faith VALUES ('u3','confluence','unaffiliated',NULL,1,NULL,'r3')");
  assert.throws(() => db.exec("INSERT INTO citizen_faith VALUES ('u4','atlantis','unaffiliated',NULL,1,NULL,'r4')"), /FOREIGN KEY/);
  assert.throws(() => db.exec("INSERT INTO citizen_faith VALUES ('u4','aurelle','unaffiliated','open-hand',1,NULL,'r5')"), /CHECK/);
  assert.throws(() => db.exec("INSERT INTO citizen_faith VALUES ('u4','aurelle','bogus',NULL,1,NULL,'r6')"), /CHECK/);
  assert.throws(() => db.exec("INSERT INTO citizen_faith VALUES ('u4','aurelle','unaffiliated',NULL,1,NULL,'r1')"), /UNIQUE/, 'request ids stay unique');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='citizen_faith_old'").get().n, 0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  for (const x of ledgerTables) assert.ok(db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(x), x);
});

test('migration 0049 on Postgres (PGlite, mutation check): every earlier migration, rows kept, confluence refused before and accepted after, bad nations still refused', async () => {
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(readFileSync('db/postgres/compatibility.sql', 'utf8')); await pg.exec(readFileSync('db/postgres/schema.sql', 'utf8'));
  const migrations = postgresMigrations();
  for (const m of migrations.filter(x => x.number < '0049')) await pg.exec(m.sql);
  const exec = sql => pg.exec(sql), tryExec = async sql => { try { await pg.exec(sql); return null; } catch (e) { return String(e.message); } };
  const nation = id => `INSERT INTO nations (id,name,short_name,government,economy,currency,religion,capital,population,treasury,stability,color,soft_color,motto,trade_status,position_x,position_y,sort_order) VALUES ('${id}','${id}','${id}','g','e','c','r','cap','1','1',1,'#000','#000','m','open',0,0,1)`;
  for (const id of ['kindle', 'korund', 'aurelle', 'confluence']) await exec(nation(id));
  for (const [u, n] of [['u1', 'kindle'], ['u2', 'korund'], ['u3', 'confluence']]) await exec(`INSERT INTO citizens (clerk_user_id,nation_id,created_at,updated_at) VALUES ('${u}','${n}','t','t')`);
  await exec("INSERT INTO citizen_faith VALUES ('u1','kindle','open-hand',NULL,10,20,'r1'),('u2','korund','unaffiliated','kinward-rite',11,NULL,'r2')");
  assert.match(await tryExec("INSERT INTO citizen_faith VALUES ('u3','confluence','unaffiliated',NULL,1,NULL,'r3')"), /citizen_faith_nation_id_check/, 'before: refused by the literal list');
  const file = migrations.find(m => m.number === '0049'); await exec(file.sql);
  assert.deepEqual((await pg.query('SELECT user_id,nation_id,faith_id,hidden_faith_id,chosen_at,changed_at,request_id FROM citizen_faith ORDER BY user_id')).rows.map(r => `${r.user_id}/${r.nation_id}/${r.faith_id}/${r.hidden_faith_id}/${r.request_id}`), ['u1/kindle/open-hand/null/r1', 'u2/korund/unaffiliated/kinward-rite/r2']);
  assert.equal(await tryExec("INSERT INTO citizen_faith VALUES ('u3','confluence','unaffiliated',NULL,1,NULL,'r3')"), null);
  assert.match(await tryExec("INSERT INTO citizens (clerk_user_id,nation_id,created_at,updated_at) VALUES ('u4','atlantis','t','t')"), /foreign key|violates/i);
  await exec("INSERT INTO citizens (clerk_user_id,nation_id,created_at,updated_at) VALUES ('u4','kindle','t','t')");
  assert.match(await tryExec("INSERT INTO citizen_faith VALUES ('u4','atlantis','unaffiliated',NULL,1,NULL,'r4')"), /citizen_faith_nation_id_fkey/);
  assert.match(await tryExec("INSERT INTO citizen_faith VALUES ('u4','kindle','unaffiliated','open-hand',1,NULL,'r5')"), /check/i, 'hidden faith stays Korund-only');
  assert.equal(await tryExec(file.sql), null, 'the migration can be re-run');
  assert.deepEqual((await pg.query("SELECT COUNT(*)::int AS n FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relname='citizen_faith' AND k.contype='c'")).rows[0].n >= 3, true, 'the CHECK count the deploy guard compares is not lower than 0025 declared');
  for (const x of ledgerTables) assert.equal((await pg.query('SELECT 1 FROM pg_tables WHERE tablename=$1', [x])).rows.length, 1, x);
  await pg.close();
});
