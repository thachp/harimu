/** #616: the decayed Royal Favor coup average (royalFavorAverageSql, flag HARIMU_FAVOR_DECAY_ENABLED) must stay index-backed: it reads one citizen's settlements and spends
 *  by clerk_user_id for every settling citizen, so a table scan there is quadratic. The checks are on the query plan, not on timings. Runs on SQLite (the real runtime schema)
 *  and, always, on a scratch PGlite built from migration db/postgres/0051. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { localRuntime } from './helpers/local-runtime.mjs';
import { aurelleFavorIndexes, royalFavorAverageSql, royalFavorColumnBinds } from '../lib/aurelle.ts';
import { postgresSql } from '../lib/postgres/sql.ts';

const NOW = 1_800_000_000;
const names = ['idx_aurelle_settlements_user_settled', 'idx_aurelle_favor_spends_user_spent'];
const file = path => readFile(new URL(path, import.meta.url), 'utf8');
const statements = sql => sql.split('\n').filter(line => !line.startsWith('--')).join('\n').split(';').map(x => x.trim()).filter(Boolean);

test('migration 0051: the same two CREATE INDEX IF NOT EXISTS in drizzle and db/postgres, equal to lib/aurelle.ts; no table, so the count is untouched', async () => {
  const sqlite = statements(await file('../drizzle/0051_favor_coup_indexes.sql')), postgres = statements(await file('../db/postgres/0051_favor_coup_indexes.sql'));
  assert.deepEqual(sqlite, [...aurelleFavorIndexes]); assert.deepEqual(postgres, sqlite);
  assert.ok(sqlite.every(sql => /^CREATE INDEX IF NOT EXISTS (idx_\w+) ON aurelle_(settlements|favor_spends)\(clerk_user_id, /.test(sql)) && !sqlite.some(sql => /CREATE TABLE/i.test(sql)));
});

test('SQLite plan: every read of the settlements and spends tables in the decayed average is an index search or a covering-index scan, never a table scan; it is a table scan without the indexes', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  if (typeof r.db.sqlite?.prepare !== 'function') { // Postgres fixture: the SQLite snapshot it was built from carried both indexes
    const indexes = r.postgresSnapshot.schema.filter(entry => entry.type === 'index').map(entry => entry.name); for (const name of names) assert.ok(indexes.includes(name), name); return; }
  const plan = () => r.db.sqlite.prepare('EXPLAIN QUERY PLAN ' + royalFavorAverageSql(NOW)).all(...royalFavorColumnBinds(NOW)).map(row => String(row.detail));
  const indexed = await plan();
  const reads = indexed.filter(line => /\b(SCAN|SEARCH) (aurelle_settlements|aurelle_favor_spends|r|s)\b/.test(line));
  assert.equal(reads.length, 4, 'outer distinct, earned, spend sum, spend charge: ' + indexed.join(' | '));
  for (const line of reads) assert.match(line, /USING COVERING INDEX idx_aurelle_(settlements_user_settled|favor_spends_user_spent)/, line);
  assert.ok(indexed.some(line => /SEARCH r USING COVERING INDEX idx_aurelle_settlements_user_settled \(clerk_user_id=\? AND settled_at<\?\)/.test(line)), 'the spend charge is a range search by user and time');
  assert.ok(indexed.some(line => /SEARCH s USING COVERING INDEX idx_aurelle_favor_spends_user_spent \(clerk_user_id=\?\)/.test(line)));
  for (const name of names) r.db.sqlite.exec(`DROP INDEX ${name}`);
  assert.ok((await plan()).some(line => /^SCAN (aurelle_settlements|r|s)$/.test(line) || /^SCAN aurelle_favor_spends$/.test(line)), 'control: without the indexes the same query scans the tables');
});

test('Postgres plan (PGlite, migration db/postgres/0051 applied): the decayed average searches both tables by index, with the planner forbidden to seq-scan them', async t => {
  const pg = new PGlite(); t.after(() => pg.close()); await pg.waitReady;
  await pg.exec('CREATE TABLE aurelle_settlements(shift_id TEXT PRIMARY KEY,clerk_user_id TEXT NOT NULL,wage_minor BIGINT NOT NULL,food_output BIGINT NOT NULL,favor BIGINT NOT NULL,settled_at BIGINT NOT NULL)');
  await pg.exec('CREATE TABLE aurelle_favor_spends(request_id TEXT PRIMARY KEY,clerk_user_id TEXT NOT NULL,amount BIGINT NOT NULL,reason TEXT NOT NULL,spent_at BIGINT NOT NULL)');
  await pg.exec(await file('../db/postgres/0051_favor_coup_indexes.sql')); await pg.exec(await file('../db/postgres/0051_favor_coup_indexes.sql'));
  await pg.exec(`INSERT INTO aurelle_settlements SELECT 's'||u||'-'||n,'u'||u,800,4,2,${NOW}-n*3600 FROM generate_series(1,300) u, generate_series(1,6) n`);
  await pg.exec(`INSERT INTO aurelle_favor_spends SELECT 'p'||u,'u'||u,10,'leave-kinward',${NOW}-100 FROM generate_series(1,300,5) u`);
  await pg.exec('ANALYZE'); await pg.exec('SET enable_seqscan = off');
  const { text, values } = postgresSql('EXPLAIN ' + royalFavorAverageSql(NOW), royalFavorColumnBinds(NOW));
  const plan = (await pg.query(text, values)).rows.map(row => row['QUERY PLAN']).join('\n');
  assert.match(plan, /idx_aurelle_settlements_user_settled/); assert.match(plan, /idx_aurelle_favor_spends_user_spent/);
  assert.doesNotMatch(plan, /Seq Scan on aurelle_(settlements|favor_spends)/, plan);
  await pg.exec(`DROP INDEX ${names.join(', ')}`); const bare = (await pg.query(text, values)).rows.map(row => row['QUERY PLAN']).join('\n');
  assert.match(bare, /Seq Scan on aurelle_(settlements|favor_spends)/, 'control: without the indexes the planner has to seq-scan');
  await pg.exec(await file('../db/postgres/0051_favor_coup_indexes.sql'));
  const average = await pg.query(...Object.values(postgresSql(royalFavorAverageSql(NOW), royalFavorColumnBinds(NOW))));
  assert.equal(Number(average.rows[0].favor) > 0, true, 'and the query itself still runs on the same tables');
  const present = (await pg.query("SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_aurelle_%' ORDER BY 1")).rows.map(x => x.indexname); assert.deepEqual(present, [...names].sort());
});
