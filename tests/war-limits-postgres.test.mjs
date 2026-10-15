/** #575: the per-nation war declaration limits (one declaration per 14 real days, at most 2 active offensive wars) must hold when several declarations race on REAL
 *  multi-connection Postgres. PGlite is single-connection (the fixture even serializes its connections), so war-limits.test.mjs cannot prove this.
 *
 *  Always runs: a unit test that the Postgres adapter takes `pg_advisory_xact_lock` before any write statement in the same transaction (the guarantee the guarded INSERT relies on).
 *  Runs only with a real server: set HARIMU_TEST_POSTGRES_URL to an admin URL (it CREATEs and DROPs a scratch database), e.g.
 *    docker run -d --rm --name pg575 -e POSTGRES_PASSWORD=pw -p 127.0.0.1:55432:5432 postgres:16
 *    HARIMU_TEST_POSTGRES_URL=postgres://postgres:pw@127.0.0.1:55432/postgres node --experimental-strip-types --test --test-concurrency=1 tests/war-limits-postgres.test.mjs
 *  CI does not provide a Postgres service, so those tests are skipped there: CI proves the adapter lock is taken, a real server proves what it does. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { Client, types } from 'pg';
import { localRuntime } from './helpers/local-runtime.mjs';
import { pairKey, declarationLimits } from '../lib/war-rules.ts';
import { bootstrapEmptyPostgres, connectPostgres } from '../scripts/postgres-migrations.mjs';

const databaseSource = (await readFile(new URL('../lib/postgres/database.ts', import.meta.url), 'utf8')).replace("'./sql'", JSON.stringify(new URL('../lib/postgres/sql.ts', import.meta.url).href));
const { PostgresDatabase } = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(databaseSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);
const D = 86400, writerLock = '728391462';
const url = process.env.HARIMU_TEST_POSTGRES_URL;
const real = url ? {} : { skip: 'set HARIMU_TEST_POSTGRES_URL to a Postgres admin URL to run the real multi-connection tests (see the header)' };

test('#575 the Postgres adapter takes the writer advisory lock inside the transaction, before the guarded INSERT', async () => {
  const log = [];
  const db = new PostgresDatabase(async () => ({ query: async (text, values) => { log.push(text.replace(/\s+/g, ' ').trim()); return { rows: [], rowCount: 1 }; }, release: async () => {} }), { journalRetentionApproved: true });
  await db.prepare('INSERT INTO wars (id,request_id) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM wars WHERE pair_key=?) ON CONFLICT DO NOTHING').bind('a', 'b', 'c').run();
  const lock = log.findIndex(q => q === `SELECT pg_advisory_xact_lock(${writerLock})`), insert = log.findIndex(q => /^INSERT INTO wars/.test(q)), begin = log.indexOf('BEGIN'), commit = log.indexOf('COMMIT');
  assert.ok(begin >= 0 && lock > begin, 'the lock is taken after BEGIN (a transaction lock, released at COMMIT)'); assert.ok(insert > lock, 'the guarded INSERT runs only after the lock is held'); assert.ok(commit > insert, 'and the lock is held until COMMIT');
  const reads = []; const ro = new PostgresDatabase(async () => ({ query: async text => { reads.push(text); return { rows: [], rowCount: 0 }; }, release: async () => {} }), { journalRetentionApproved: true });
  await ro.prepare('SELECT 1').run(); assert.equal(reads.some(q => /pg_advisory/.test(q)), false, 'reads stay lock-free');
});

async function scratch(t) {
  const admin = await connectPostgres(url); const name = `harimu_575_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await admin.exec(`CREATE DATABASE ${name}`);
  const target = new URL(url); target.pathname = `/${name}`; const scratchUrl = target.toString();
  const boot = await connectPostgres(scratchUrl); await bootstrapEmptyPostgres(boot);
  await boot.exec('CREATE TABLE harimu_postgres_write_journal (id bigserial PRIMARY KEY,statements_json text NOT NULL)'); // the adapter journals every write; production creates it in the snapshot import (scripts/postgres-migration.mjs)
  await boot.close();
  const clients = new Set(), connect = async () => { // a fresh REAL connection per statement group, like lib/postgres/driver.ts under Hyperdrive
    const client = new Client({ connectionString: scratchUrl, types: { getTypeParser: (oid, format) => (format !== 'binary' && (oid === 20 || oid === 1700)) ? v => Number(v) : types.getTypeParser(oid, format) } });
    client.on('error', () => {}); await client.connect(); clients.add(client);
    return { query: async (text, values) => { const r = await client.query(text, values); return { rows: r.rows, rowCount: r.rowCount }; }, release: async () => { clients.delete(client); await client.end(); } };
  };
  const db = new PostgresDatabase(connect, { journalRetentionApproved: true }), raw = await connectPostgres(scratchUrl);
  t.after(async () => { await raw.close(); await admin.exec(`DROP DATABASE ${name} WITH (FORCE)`).catch(() => {}); await admin.close(); });
  return { db, raw, scratchUrl };
}

test('#575 real Postgres: concurrent declarations by one nation land exactly once (interval limit), round after round', real, async t => {
  const { db, raw } = await scratch(t); const rt = await localRuntime(); t.after(() => rt.close());
  const war = await rt.importModule('lib/war.ts'), now = 1_900_000_000, rounds = 30, racers = 8;
  // Grievances toward both targets (a pact broken by each) so only the limits decide.
  for (const other of ['korund', 'aurelle']) { const id = randomUUID(); await raw.query('INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$7,$7,$9,$10,$5)', [id, pairKey('kindle', other), 'non-aggression', 'kindle', other, 'AI Chair', now - 5 * D, 'broken', now + 90 * D, now - 4 * D]); }
  const declare = defender => war.declareWar(db, { attacker: 'kindle', defender, casusBelli: 'test', declaredBy: 'AI President', requestId: randomUUID() }, now, { enabled: true, limits: true, shardStartedAt: now - 60 * D, nonAggression: () => false });
  const landed = [];
  for (let round = 0; round < rounds; round++) {
    await raw.query('DELETE FROM wars');
    const results = await Promise.all(Array.from({ length: racers }, (_, i) => declare(i % 2 ? 'aurelle' : 'korund')));
    const ok = results.filter(r => r.ok); landed.push(ok.length);
    assert.equal((await raw.query('SELECT COUNT(*)::int AS n FROM wars WHERE attacker_nation=$1', ['kindle'])).rows[0].n, ok.length, 'every ok is a row and every refusal wrote nothing');
    assert.equal(ok.length, 1, `round ${round}: ${racers} concurrent declarations by one nation must land exactly once (landed ${ok.length})`);
    for (const r of results.filter(x => !x.ok)) assert.ok(['rate_limit_declarations', 'war_exists'].includes(r.reason), `${r.reason}`);
  }
  t.diagnostic(`rounds=${rounds} racers=${racers} landed per round: ${[...new Set(landed)].join(',')}`);
});

test('#575 real Postgres: concurrent declarations cannot exceed the active offensive war cap', real, async t => {
  const { db, raw } = await scratch(t); const rt = await localRuntime(); t.after(() => rt.close());
  const war = await rt.importModule('lib/war.ts'), now = 1_900_000_000, rounds = 30;
  for (const other of ['korund', 'aurelle']) { const id = randomUUID(); await raw.query('INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$7,$7,$9,$10,$5)', [id, pairKey('kindle', other), 'non-aggression', 'kindle', other, 'AI Chair', now - 5 * D, 'broken', now + 90 * D, now - 4 * D]); }
  const declare = (defender, at) => war.declareWar(db, { attacker: 'kindle', defender, casusBelli: 'test', declaredBy: 'AI President', requestId: randomUUID() }, at, { enabled: true, limits: true, shardStartedAt: now - 60 * D, nonAggression: () => false });
  for (let round = 0; round < rounds; round++) {
    await raw.query('DELETE FROM wars');
    // One old open offensive war already counts (declared 20 days ago, under a pair key that never collides: with three nations the pair rule alone would cap an attacker at two open wars). The other two declarations are 15 days apart, so the interval limit alone
    // lets the later one through after the earlier one: only the cap (2) can stop both, and only when they cannot both pass the guard.
    await raw.query('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8)', [`war-${randomUUID()}`, 'kindle|seeded', 'kindle', 'korund', '', 'AI', now - 20 * D, now - 20 * D + 172800]);
    const results = await Promise.all([declare('korund', now), declare('aurelle', now + 15 * D), declare('korund', now), declare('aurelle', now + 15 * D)]);
    const open = (await raw.query('SELECT COUNT(*)::int AS n FROM wars WHERE attacker_nation=$1 AND ended_at IS NULL', ['kindle'])).rows[0].n;
    assert.ok(open <= declarationLimits.activeOffensiveMax, `round ${round}: ${open} open offensive wars (cap ${declarationLimits.activeOffensiveMax}), landed ${results.filter(r => r.ok).length}`);
    assert.equal(results.filter(r => r.ok).length, open - 1, 'exactly the landed declarations were added to the one seeded war');
  }
});

test('#575 control, real Postgres: a bare guarded INSERT on separate connections (no adapter lock) DOES let two declarations land', real, async t => {
  const { scratchUrl, raw } = await scratch(t); const now = 1_900_000_000, rounds = 60, racers = 6;
  const clients = await Promise.all(Array.from({ length: racers }, async () => { const c = new Client({ connectionString: scratchUrl }); c.on('error', () => {}); await c.connect(); return c; })); t.after(() => Promise.all(clients.map(c => c.end())));
  const sql = `INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at)
    SELECT $1,$2,$3,$4,$5,'x','AI',$6,$7 WHERE NOT EXISTS (SELECT 1 FROM wars WHERE pair_key=$3 AND ended_at IS NULL) AND NOT EXISTS (SELECT 1 FROM wars WHERE attacker_nation=$4 AND declared_at>$8) ON CONFLICT DO NOTHING`;
  let raced = 0;
  for (let round = 0; round < rounds; round++) {
    await raw.query('DELETE FROM wars');
    await Promise.all(clients.map((c, i) => { const defender = i % 2 ? 'aurelle' : 'korund'; return c.query(sql, [`w-${randomUUID()}`, randomUUID(), pairKey('kindle', defender), 'kindle', defender, now, now + 172800, now - declarationLimits.intervalSeconds]); }));
    if ((await raw.query('SELECT COUNT(*)::int AS n FROM wars')).rows[0].n > 1) raced++;
  }
  t.diagnostic(`bare guarded INSERT: both landed in ${raced} of ${rounds} rounds`);
  assert.ok(raced > 0, 'the control must reproduce the race, or the exactly-once tests above prove nothing');
});
