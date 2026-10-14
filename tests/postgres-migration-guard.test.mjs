import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createdTables, postgresMigrations, repoTables, isDestructive, migrationProblems, applyPostgresMigrations, assertPostgresMigrationsApplied, destructiveReviewedMarker, backfillThrough } from '../scripts/postgres-migrations.mjs';

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
  for (const m of postgresMigrations()) assert.ok(!isDestructive(m.sql), `${m.file} must stay additive`);
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
