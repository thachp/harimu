/** #912 (ARC on #921): two captures of the same defender at once must not take it past its weekly frontier-loss limit. Real multi-connection Postgres only
 *  (PGlite is single-connection): same harness as tests/state-pool-race-906.test.mjs; runs with HARIMU_TEST_POSTGRES_URL, skips in CI. The always-run test pins
 *  the batch shape: the defender's nations row is locked first and the cap is re-checked inside the batch. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { Client, types } from 'pg';
import { localRuntime } from './helpers/local-runtime.mjs';
import { bootstrapEmptyPostgres, connectPostgres } from '../scripts/postgres-migrations.mjs';

const databaseSource = (await readFile(new URL('../lib/postgres/database.ts', import.meta.url), 'utf8')).replace("'./sql'", JSON.stringify(new URL('../lib/postgres/sql.ts', import.meta.url).href));
const adapterSource = ts.transpileModule(databaseSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
/** The adapter with its global writer lock removed, so the defender row lock itself is what is tested. */
const UnlockedDatabase = (await import(`data:text/javascript;base64,${Buffer.from(adapterSource.replace(/if\s*\(transaction\)\s*await connection\.query\(`SELECT pg_advisory_xact_lock\(\$\{writerLock\}\)`\);/, '')).toString('base64')}`)).PostgresDatabase;
const url = process.env.HARIMU_TEST_POSTGRES_URL;
const real = url ? {} : { skip: 'set HARIMU_TEST_POSTGRES_URL to a Postgres admin URL to run the real multi-connection test' };

test('the guarded capture batch locks the defender row first and re-checks the cap inside the batch', async () => {
  const src = await readFile(new URL('../lib/siege-actions.ts', import.meta.url), 'utf8'), cap = await readFile(new URL('../lib/war-loss-cap.ts', import.meta.url), 'utf8');
  assert.match(src, /db\.batch\(\[db\.prepare\(defenderLockSql\)\.bind\(siege\.defender_nation\),[^\n]*\n\s*db\.prepare\(`INSERT INTO city_captures [^`]*WHERE \$\{guard\}`\)/);
  assert.match(cap, /export const defenderLockSql = 'UPDATE nations SET id=id WHERE id=\?'/);
});

async function scratch(t) {
  const admin = await connectPostgres(url), name = `harimu_912_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await admin.exec(`CREATE DATABASE ${name}`);
  const target = new URL(url); target.pathname = `/${name}`; const scratchUrl = target.toString();
  const boot = await connectPostgres(scratchUrl); await bootstrapEmptyPostgres(boot, { freshWorld: true });
  await boot.exec('CREATE TABLE harimu_postgres_write_journal (id bigserial PRIMARY KEY,statements_json text NOT NULL)'); await boot.close();
  const connect = async () => {
    const client = new Client({ connectionString: scratchUrl, types: { getTypeParser: (oid, format) => (format !== 'binary' && (oid === 20 || oid === 1700)) ? v => Number(v) : types.getTypeParser(oid, format) } });
    client.on('error', () => {}); await client.connect();
    return { query: async (text, values) => { const r = await client.query(text, values); return { rows: r.rows, rowCount: r.rowCount }; }, release: async () => { await client.end(); } };
  };
  const raw = await connectPostgres(scratchUrl);
  t.after(async () => { await raw.close(); await admin.exec(`DROP DATABASE ${name} WITH (FORCE)`).catch(() => {}); await admin.close(); });
  return { db: new UnlockedDatabase(connect, { journalRetentionApproved: true }), raw };
}
/** Same database, but the defender lock statement is replaced by a no-op: the control that shows the lock is what holds the cap. */
const withoutLock = (db, lockSql) => ({ batch: s => db.batch(s), prepare: sql => db.prepare(sql === lockSql ? 'SELECT CAST(? AS TEXT) AS noop' : sql) });

/** Kindle holds 10 frontier squares (limit 1 a week), two of them cities under siege; `racers` sieges then capture at once. Returns how many captures landed. */
async function race(raw, siege, db, racers) {
  for (const t of ['war_capture_refusals', 'city_capture_squares', 'city_captures', 'city_sieges', 'world_cities', 'wars']) await raw.query(`DELETE FROM ${t}`);
  const now = 1_800_000_000;
  const cols = (await raw.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='nations' AND is_nullable='NO' AND column_default IS NULL ORDER BY ordinal_position")).rows;
  for (const nation of ['kindle', 'korund']) await raw.query(`INSERT INTO nations (${cols.map(c => c.column_name).join(',')}) VALUES (${cols.map((c, i) => `$${i + 1}`).join(',')}) ON CONFLICT DO NOTHING`, cols.map(c => c.column_name === 'id' ? nation : /int|numeric|double/.test(c.data_type) ? 0 : nation));
  await raw.query("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES ('w1','rq-w1','pair-w1','korund','kindle','test',$1,$2,NULL,NULL)", [now - 5 * 86400, now - 3 * 86400]);
  await raw.query("UPDATE world_squares SET owner=NULL WHERE owner='kindle' AND zone='frontier'");
  const squares = (await raw.query("SELECT x,y FROM world_squares WHERE zone='frontier' ORDER BY y,x LIMIT 10")).rows;
  for (const s of squares) await raw.query("UPDATE world_squares SET owner='kindle' WHERE x=$1 AND y=$2", [s.x, s.y]);
  const rows = [];
  for (let i = 0; i < racers; i++) {
    const s = squares[i], id = `city-${i}`, sid = `siege-${i}`;
    await raw.query("INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ($1,'kindle',$1,1,$2,$3,'kindle-charter','alice',$4,1)", [id, s.x, s.y, `rq-${id}`]);
    await raw.query("INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at,captured_at) VALUES ($1,'w1',$2,'outpost',$3,$4,'korund','kindle',$5,NULL)", [sid, `city:${id}`, s.x, s.y, now]);
    rows.push({ id: sid, war_id: 'w1', city_key: `city:${id}`, city_kind: 'outpost', center_x: s.x, center_y: s.y, attacker_nation: 'korund', defender_nation: 'kindle', captured_at: null });
  }
  await Promise.all(rows.map((r, i) => siege.captureSiegeForTest(db, r, 'outpost', { x: r.center_x, y: r.center_y }, `rq-cap-${i}`, now, true)));
  return Number((await raw.query("SELECT COUNT(*) AS n FROM city_captures")).rows[0].n);
}

test('two captures of the same defender at once take at most its weekly limit (real Postgres)', real, async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const siege = await r.importModule('lib/siege-actions.ts'), cap = await r.importModule('lib/war-loss-cap.ts');
  const { db, raw } = await scratch(t);
  let over = 0;
  for (let round = 0; round < 10; round++) assert.equal(await race(raw, siege, db, 4), 1, `round ${round}: the cap allows one more loss`);
  for (let round = 0; round < 10; round++) if (await race(raw, siege, withoutLock(db, cap.defenderLockSql), 4) > 1) over++;
  t.diagnostic(`without the defender lock the cap was exceeded in ${over} of 10 rounds`);
  assert.ok(over > 0, 'control: without the lock concurrent captures overshoot, so the lock is what holds the cap');
});
