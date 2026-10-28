import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createdTables, postgresMigrations, repoTables, isDestructive, migrationProblems, createdObjects, hasReviewMarker, applyPostgresMigrations, bootstrapEmptyPostgres, assertPostgresMigrationsApplied, destructiveReviewedMarker, backfillThrough, transactionProblem, stripComments } from '../scripts/postgres-migrations.mjs';

const adapter = pg => ({ query: (t, p) => pg.query(t, p), exec: t => pg.exec(t) });
/** A database shaped like preview today: base schema plus every migration through 0010, no schema_migrations. */
async function previewLike() {
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(readFileSync('db/postgres/compatibility.sql', 'utf8'));
  await pg.exec(readFileSync('db/postgres/schema.sql', 'utf8'));
  for (const m of postgresMigrations().filter(m => m.number <= backfillThrough)) await pg.exec(m.sql);
  return pg;
}
function dirWith(extra) {
  const dir = mkdtempSync(join(tmpdir(), 'pgmig-'));
  for (const m of postgresMigrations()) copyFileSync(join('db/postgres', m.file), join(dir, m.file));
  for (const [name, sql] of Object.entries(extra)) writeFileSync(join(dir, name), sql);
  return dir;
}
const newer = () => postgresMigrations().filter(m => m.number > backfillThrough).map(m => m.file);
const rows = async (pg, sql) => (await pg.query(sql)).rows;

test('inventory lists numbered migrations in order, never schema/compatibility', () => {
  const migrations = postgresMigrations();
  assert.ok(migrations.length >= 2 && migrations.every(m => /^\d{4}_/.test(m.file) && (m.tables.length || /^\s*INSERT INTO/m.test(m.sql) || /^\s*ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN\b/im.test(m.sql) || /^\s*CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\b/im.test(m.sql) || /^\s*UPDATE world_squares SET resource=/m.test(m.sql) || /^\s*ALTER\s+TABLE\b[\s\S]*\b(?:DROP|ADD)\s+CONSTRAINT\b/im.test(m.sql)) && m.checksum.length === 64)); // #196: 0020 is data-only (seed rows); #400: 0040 is an additive column on an existing table (ALTER TABLE ... ADD COLUMN, no new table); #616: 0051 is indexes only (CREATE INDEX IF NOT EXISTS); #745: 0067 is data-only (rare node placements on existing squares); #958: 0106 is CHECK-only (DROP/ADD CONSTRAINT on risk_scores.reasons)
  assert.deepEqual(migrations.map(m => m.file), [...migrations.map(m => m.file)].sort());
  assert.ok(!migrations.some(m => /schema|compatibility/.test(m.file)));
  assert.deepEqual(createdTables('CREATE TABLE IF NOT EXISTS "a_b"(x int); create table `c` (y int); CREATE TABLE d(z int);'), ['a_b', 'c', 'd']);
  assert.ok(repoTables().includes('korund_coupon_redemptions'));
});
test('destructive SQL is detected, comments ignored', () => {
  assert.ok(isDestructive('ALTER TABLE x DROP COLUMN y;'));
  assert.ok(isDestructive('drop table x;') && isDestructive('TRUNCATE x;') && isDestructive('DELETE FROM x;'));
  assert.ok(!isDestructive('-- DROP TABLE x\nCREATE TABLE IF NOT EXISTS x(a int);'));
  for (const sql of ['DROP FUNCTION f();', 'drop sequence s;', 'DROP MATERIALIZED VIEW v;', 'DROP TRIGGER t ON x;', 'DROP POLICY p ON x;', 'ALTER INDEX i RENAME TO j;',
    'ALTER TABLE IF EXISTS ONLY x DROP COLUMN y;', 'ALTER TABLE x RENAME COLUMN a TO b;', '/* note */ TRUNCATE x;', 'ALTER TABLE x ALTER COLUMN a SET DATA TYPE int;', 'DROP VIEW v;', 'DROP TYPE t;'])
    assert.ok(isDestructive(sql), sql);
  assert.ok(!isDestructive('/* DROP TABLE x */ CREATE INDEX IF NOT EXISTS i ON x(a);'));
  assert.ok(hasReviewMarker(`${destructiveReviewedMarker}\nDROP TABLE x;`));
  assert.ok(!hasReviewMarker(`CREATE TABLE a(x int); -- ${destructiveReviewedMarker}`), 'marker must be on its own line');
  // #490: 0049 swaps the citizen_faith nation CHECK for a foreign key (a DROP CONSTRAINT); #531: 0054 widens the aurelle_favor_spends reason CHECK the same way; #933: 0099 drops city_captures UNIQUE(siege_id) so partial capture can record multiple steps; #943: 0102 widens risk_scores.reasons CHECK for clerk-email; #958: 0106 widens it for one-way-trades. Each is reviewed and marked; every other migration stays additive.
  for (const m of postgresMigrations()) assert.ok(!isDestructive(m.sql) || (['0049_nation_wage_ledger.sql', '0054_aurelle_charters.sql', '0099_partial_city_captures.sql', '0102_clerk_risk_signals.sql', '0106_one_way_trades.sql'].includes(m.file) && hasReviewMarker(m.sql)), `${m.file} must stay additive`);
  assert.deepEqual(createdObjects('CREATE TABLE t(a int, "b" text, PRIMARY KEY(a), UNIQUE(a,b), CHECK(a>0)); ALTER TABLE t ADD COLUMN IF NOT EXISTS c int; CREATE UNIQUE INDEX IF NOT EXISTS i_t ON t(a);'),
    { columns: [['t', 'a'], ['t', 'b'], ['t', 'c']], indexes: ['i_t'], checks: [['t', 1]] });
});
test('first run on preview backfills through backfillThrough (0012) without re-running, then applies newer ones in order', async () => {
  const pg = await previewLike(); const db = adapter(pg);
  const dir = dirWith({ '0901_a.sql': 'CREATE TABLE IF NOT EXISTS zz_a (id int);', '0903_c.sql': 'CREATE TABLE IF NOT EXISTS zz_c (id int REFERENCES zz_b(id));', '0902_b.sql': 'CREATE TABLE IF NOT EXISTS zz_b (id int PRIMARY KEY);' });
  await assert.rejects(assertPostgresMigrationsApplied(db, postgresMigrations(dir)), /0008.*not applied/);
  assert.ok(postgresMigrations().filter(m => m.number <= backfillThrough).some(m => m.file === '0012_nation_stability.sql'), 'backfill covers through 0012');
  const dry = await applyPostgresMigrations(db, postgresMigrations(dir), { dryRun: true });
  assert.deepEqual(dry.pending, [...newer(), '0901_a.sql', '0902_b.sql', '0903_c.sql']);
  assert.equal((await rows(pg, "SELECT 1 FROM pg_tables WHERE tablename='schema_migrations'")).length, 0, 'dry run writes nothing');
  const result = await applyPostgresMigrations(db, postgresMigrations(dir));
  assert.equal((await rows(pg, "SELECT 1 FROM pg_tables WHERE tablename='nation_stability_scores'")).length, 1, '0012 table present');
  assert.deepEqual(result.applied, [...newer(), '0901_a.sql', '0902_b.sql', '0903_c.sql']);
  const recorded = await rows(pg, 'SELECT id, backfilled FROM schema_migrations ORDER BY id');
  assert.deepEqual(recorded.filter(r => r.backfilled).map(r => r.id), postgresMigrations().filter(m => m.number <= backfillThrough).map(m => m.id));
  await assertPostgresMigrationsApplied(db, postgresMigrations(dir));
  assert.deepEqual((await applyPostgresMigrations(db, postgresMigrations(dir))).applied, [], 'idempotent');
  await pg.close();
});
test('backfill refuses when the tables it would vouch for are missing', async () => {
  const pg = new PGlite(); await pg.waitReady;
  await assert.rejects(applyPostgresMigrations(adapter(pg)), /Cannot backfill.*korund_coupon_redemptions/);
  assert.equal((await rows(pg, "SELECT 1 FROM pg_tables WHERE tablename='schema_migrations'")).length, 0);
  await pg.close();
});
test('backfill and guard fail closed on a partial schema (missing column or index)', async () => {
  for (const damage of ['ALTER TABLE ai_news_articles DROP COLUMN nation_id', 'DROP INDEX idx_nation_stability_time']) {
    const pg = await previewLike(); await pg.exec(damage); const db = adapter(pg);
    await assert.rejects(applyPostgresMigrations(db), /Cannot backfill.*nothing recorded.*(column ai_news_articles\.nation_id|index idx_nation_stability_time)/);
    assert.equal((await rows(pg, "SELECT 1 FROM pg_tables WHERE tablename='schema_migrations'")).length, 0, damage);
    await assert.rejects(assertPostgresMigrationsApplied(db), /not applied/);
    await pg.close();
  }
  const pg = await previewLike(); const db = adapter(pg);
  await applyPostgresMigrations(db); await pg.exec('ALTER TABLE world_squares DROP COLUMN zone');
  await assert.rejects(assertPostgresMigrationsApplied(db), /0011_world_squares\.sql \(missing column world_squares\.zone/);
  await pg.close();
});
test('#152 bootstrap: empty database gets base schema plus every migration, recorded and guard-clean', async () => {
  const pg = new PGlite(); await pg.waitReady; const db = adapter(pg);
  const result = await bootstrapEmptyPostgres(db);
  assert.deepEqual(result.applied, postgresMigrations().map(m => m.file));
  assert.deepEqual((await rows(pg, 'SELECT id, backfilled FROM schema_migrations ORDER BY id')).map(r => [r.id, r.backfilled]), postgresMigrations().map(m => [m.id, false]));
  await assertPostgresMigrationsApplied(db);
  assert.deepEqual((await applyPostgresMigrations(db)).applied, [], 'normal migrate is a no-op afterwards');
  await assert.rejects(bootstrapEmptyPostgres(db), /refuses: schema public already has/);
  await pg.close();
});
test('#152 bootstrap failing partway rolls back to an empty database and can be rerun', async () => {
  const dir = dirWith({ '0950_bad.sql': 'CREATE TABLE IF NOT EXISTS zz_half (id int); SELECT * FROM no_such_table;' });
  for (const f of ['compatibility.sql', 'schema.sql']) copyFileSync(join('db/postgres', f), join(dir, f));
  const pg = new PGlite(); await pg.waitReady; const db = adapter(pg);
  await assert.rejects(bootstrapEmptyPostgres(db, { dir }), /failed at 0950_bad\.sql and was rolled back.*safe to retry/);
  assert.equal((await rows(pg, "SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname='public'"))[0].n, 0, 'zero tables');
  assert.equal((await rows(pg, "SELECT COUNT(*)::int AS n FROM pg_namespace WHERE nspname='harimu_compat'"))[0].n, 0, 'compat schema rolled back too');
  const unlocked = await rows(pg, 'SELECT pg_try_advisory_lock(1191280) AS ok'); assert.equal(unlocked[0].ok, true, 'lock released'); await pg.query('SELECT pg_advisory_unlock(1191280)');
  const result = await bootstrapEmptyPostgres(db);
  assert.deepEqual(result.applied, postgresMigrations().map(m => m.file));
  await assertPostgresMigrationsApplied(db);
  await pg.close();
});
test('#152 bootstrap refuses a non-empty database and writes nothing', async () => {
  const pg = new PGlite(); await pg.waitReady; await pg.exec('CREATE TABLE stray(id int)');
  await assert.rejects(bootstrapEmptyPostgres(adapter(pg)), /refuses/);
  assert.deepEqual((await rows(pg, "SELECT tablename FROM pg_tables WHERE schemaname='public'")).map(r => r.tablename), ['stray']);
  await pg.close();
});
test('#152 backfill and guard fail closed on a dropped CHECK constraint', async () => {
  const pg = await previewLike(); const db = adapter(pg);
  await pg.exec('ALTER TABLE ai_news_articles DROP CONSTRAINT ai_news_articles_nation_id_check');
  await assert.rejects(applyPostgresMigrations(db), /Cannot backfill.*CHECK constraints on ai_news_articles/);
  await assert.rejects(assertPostgresMigrationsApplied(db), /CHECK constraints on ai_news_articles/);
  await pg.close();
});
test('a failing migration rolls back, stops later ones, and the guard keeps deploy closed', async () => {
  const pg = await previewLike(); const db = adapter(pg);
  const dir = dirWith({ '0901_ok.sql': 'CREATE TABLE IF NOT EXISTS zz_ok (id int);', '0902_bad.sql': 'CREATE TABLE IF NOT EXISTS zz_half (id int); SELECT * FROM no_such_table;', '0903_later.sql': 'CREATE TABLE IF NOT EXISTS zz_later (id int);' });
  await assert.rejects(applyPostgresMigrations(db, postgresMigrations(dir)), /0902_bad\.sql failed and was rolled back/);
  const tables = (await rows(pg, "SELECT tablename FROM pg_tables WHERE tablename LIKE 'zz_%'")).map(r => r.tablename).sort();
  assert.deepEqual(tables, ['zz_ok']);
  assert.deepEqual((await rows(pg, "SELECT id FROM schema_migrations WHERE id LIKE '09%' AND backfilled=false")).map(r => r.id), ['0901_ok']);
  await assert.rejects(assertPostgresMigrationsApplied(db, postgresMigrations(dir)), /0902_bad\.sql \(not applied\).*0903_later\.sql \(not applied\)/);
  await pg.close();
});
test('destructive migrations need the review marker; edited applied migrations fail closed', async () => {
  const pg = await previewLike(); const db = adapter(pg);
  await assert.rejects(applyPostgresMigrations(db, postgresMigrations(dirWith({ '0901_drop.sql': 'ALTER TABLE korund_coupon_redemptions DROP COLUMN x;' }))), /looks destructive/);
  assert.equal((await rows(pg, "SELECT 1 FROM pg_tables WHERE tablename='schema_migrations'")).length, 0);
  await applyPostgresMigrations(db, postgresMigrations(dirWith({ '0901_t.sql': `${destructiveReviewedMarker}\nCREATE TABLE IF NOT EXISTS zz_t (id int); TRUNCATE zz_t;` })));
  await assert.rejects(applyPostgresMigrations(db, postgresMigrations(dirWith({ '0901_t.sql': 'CREATE TABLE IF NOT EXISTS zz_t (id int, x int);' }))), /were edited: 0901_t\.sql/);
  assert.deepEqual(migrationProblems([{ file: '0901_t.sql', id: '0901_t', checksum: 'b', tables: ['zz_t'] }], new Map([['0901_t', 'a']]), new Set(['zz_t'])), [{ file: '0901_t.sql', reason: 'changed after it was applied' }]);
  await pg.close();
});
test('deploy guard and migrate command are wired', async () => {
  const deploy = await readFile('scripts/deploy-cloudflare.mjs', 'utf8');
  assert.match(deploy, /assertDeployDatabase\(db\)[\s\S]*deployArgs\(false\)/); // #486: assertDeployDatabase runs #119 first (behavioural test in deploy-floor-486)
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.scripts['db:postgres:migrate'], 'node scripts/apply-postgres-migrations.mjs');
});
test('preview workflow deploys only release, checks then migrates first, secret names only', async () => {
  const wf = await readFile('.github/workflows/deploy-preview.yml', 'utf8');
  // #177: push to release (+ dispatch on release); never dev, never workflow_run.
  assert.match(wf, /on:\n  push:\n    branches: \[release\]\n  workflow_dispatch:/);
  assert.doesNotMatch(wf, /workflow_run|branches: \[dev|refs\/heads\/dev/);
  assert.match(wf, /github\.ref == 'refs\/heads\/release'/);
  assert.match(wf, /migrate_only:[\s\S]*?default: false/);
  assert.ok(wf.indexOf('run: npm run check') > 0 && wf.indexOf('run: npm run check') < wf.indexOf('db:postgres:migrate'), 'check runs before migrating');
  assert.match(wf, /cancel-in-progress: false/); // #163: queue, never cancel mid-migration
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'PREVIEW_DATABASE_ADMIN_URL']) assert.match(wf, new RegExp(`secrets\\.${name}`));
  assert.doesNotMatch(wf, /pull_request|postgres:\/\/|branches: \[main/);
  assert.ok(wf.indexOf('db:postgres:migrate') < wf.indexOf('npm run deploy'));
  // Deploy can never run if migrate failed or was skipped.
  assert.doesNotMatch(wf, /continue-on-error|always\(\)|failure\(\)|cancelled\(\)|needs:/, 'no step can bypass a failed migrate');
  assert.equal((wf.match(/^  [a-z-]+:\n    (if|runs-on):/gm) ?? []).length, 1, 'migrate and deploy share one job');
  assert.match(wf, /id: migrate\n\s+env:[\s\S]*?run: npm run db:postgres:migrate\n/);
  assert.doesNotMatch(wf.slice(wf.indexOf('id: migrate'), wf.indexOf('db:postgres:migrate')), /\bif:/, 'migrate step is unconditional');
  const deployStep = wf.slice(wf.indexOf('- name: Deploy'));
  assert.match(deployStep, /if: success\(\) && steps\.migrate\.outcome == 'success'/);
  assert.match(await readFile('scripts/deploy-cloudflare.mjs', 'utf8'), /assertDeployDatabase\(db\)[\s\S]*deployArgs\(false\)/); // #486: assertDeployDatabase runs #119 first (behavioural test in deploy-floor-486)
});

test('#236 migrations may not control their own transaction or use CONCURRENTLY; repo migrations are clean', async () => {
  for (const sql of ['BEGIN; CREATE TABLE IF NOT EXISTS x(a int); COMMIT;', 'CREATE TABLE IF NOT EXISTS x(a int);\nCOMMIT;', 'START TRANSACTION;', 'begin work;',
    'CREATE TABLE IF NOT EXISTS x(a int); ROLLBACK;', 'SAVEPOINT s1;', 'CREATE TABLE IF NOT EXISTS x(a int); END;', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS i ON x(a);',
    'create unique index concurrently i on x(a);', 'COMMIT', 'ABORT;'])
    assert.ok(transactionProblem(sql), sql);
  for (const sql of ['-- BEGIN; COMMIT;\nCREATE TABLE IF NOT EXISTS x(a int);', '/* CONCURRENTLY */ CREATE INDEX IF NOT EXISTS i ON x(a);',
    "CREATE OR REPLACE FUNCTION f() RETURNS int LANGUAGE plpgsql AS $$ BEGIN RETURN 1; END; $$;", "CREATE OR REPLACE FUNCTION g() RETURNS int LANGUAGE plpgsql AS $body$ BEGIN COMMIT; END $body$;",
    'CREATE TABLE IF NOT EXISTS begin_log(committed_at int, rollback_reason text);', "INSERT INTO t(note) VALUES ('begin');"])
    assert.equal(transactionProblem(sql), null, sql);
  for (const m of postgresMigrations()) assert.equal(transactionProblem(m.sql), null, m.file);
  // Both entry points refuse before applying anything.
  for (const [name, sql] of [['0950_tx.sql', 'BEGIN;\nCREATE TABLE IF NOT EXISTS zz_tx (id int);\nCOMMIT;'], ['0950_conc.sql', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS zz_i ON korund_coupon_redemptions(id);']]) {
    const pg = await previewLike(); const db = adapter(pg);
    await assert.rejects(applyPostgresMigrations(db, postgresMigrations(dirWith({ [name]: sql }))), new RegExp(`${name.replace('.', '\\.')} (controls its own transaction|uses CONCURRENTLY)`));
    assert.equal((await rows(pg, "SELECT 1 FROM pg_tables WHERE tablename IN ('schema_migrations','zz_tx')")).length, 0, 'nothing applied or recorded');
    await pg.close();
    const dir = dirWith({ [name]: sql }); for (const f of ['compatibility.sql', 'schema.sql']) copyFileSync(join('db/postgres', f), join(dir, f));
    const empty = new PGlite(); await empty.waitReady;
    await assert.rejects(bootstrapEmptyPostgres(adapter(empty), { dir }), /controls its own transaction|uses CONCURRENTLY/);
    assert.equal((await rows(empty, "SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname='public'"))[0].n, 0);
    await empty.close();
  }
});

test('#255 nit: -- and /* inside string literals are not comments, so they cannot hide SQL', () => {
  assert.equal(isDestructive("INSERT INTO t(note) VALUES ('a--b'); DROP TABLE t;"), true, 'DROP after a -- inside a literal is seen');
  assert.equal(isDestructive("INSERT INTO t(note) VALUES ('/* x'); DROP TABLE t; -- */"), true);
  assert.equal(transactionProblem("INSERT INTO t(note) VALUES ('it''s -- fine'); COMMIT;") !== null, true);
  assert.equal(isDestructive("INSERT INTO t(note) VALUES ('safe'); -- DROP TABLE t"), false, 'a real trailing comment is still ignored');
  assert.equal(isDestructive('/* DROP TABLE t */ CREATE TABLE IF NOT EXISTS u(a int);'), false);
  assert.equal(stripComments("SELECT 'a--b', \"c--d\" -- gone\nFROM x"), "SELECT 'a--b', \"c--d\" \nFROM x");
});
