import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createdTables, postgresMigrations, repoTables, isDestructive, migrationProblems, createdObjects, hasReviewMarker, applyPostgresMigrations, assertPostgresMigrationsApplied, destructiveReviewedMarker, backfillThrough } from '../scripts/postgres-migrations.mjs';

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
  assert.ok(migrations.length >= 2 && migrations.every(m => /^\d{4}_/.test(m.file) && m.tables.length && m.checksum.length === 64));
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
  for (const m of postgresMigrations()) assert.ok(!isDestructive(m.sql), `${m.file} must stay additive`);
  assert.deepEqual(createdObjects('CREATE TABLE t(a int, "b" text, PRIMARY KEY(a), UNIQUE(a,b), CHECK(a>0)); ALTER TABLE t ADD COLUMN IF NOT EXISTS c int; CREATE UNIQUE INDEX IF NOT EXISTS i_t ON t(a);'),
    { columns: [['t', 'a'], ['t', 'b'], ['t', 'c']], indexes: ['i_t'] });
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
  await assert.rejects(assertPostgresMigrationsApplied(db), /0011_world_squares\.sql \(missing column world_squares\.zone\)/);
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
  assert.match(deploy, /assertPostgresMigrationsApplied\(db\)[\s\S]*deployArgs\(false\)/);
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.scripts['db:postgres:migrate'], 'node scripts/apply-postgres-migrations.mjs');
});
test('preview workflow deploys only dev after CI, migrates first, secret names only', async () => {
  const wf = await readFile('.github/workflows/deploy-preview.yml', 'utf8');
  assert.match(wf, /workflow_run:[\s\S]*workflows: \[CI\][\s\S]*branches: \[dev\]/);
  assert.match(wf, /conclusion == 'success'/);
  assert.match(wf, /head_branch == 'dev'/);
  assert.match(wf, /cancel-in-progress: true/);
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
  assert.match(await readFile('scripts/deploy-cloudflare.mjs', 'utf8'), /assertPostgresMigrationsApplied\(db\)[\s\S]*deployArgs\(false\)/);
});
