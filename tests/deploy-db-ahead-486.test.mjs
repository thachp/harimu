/** #486 (ARC): the #501 production deploy refuses, fail closed, to ship a commit older than the shared database (e.g. code without #724 after 0066 is applied). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { assertDatabaseNotAhead, postgresMigrations, schemaMigrationsTable, unknownAppliedMigrations } from '../scripts/postgres-migrations.mjs';

const migrations = postgresMigrations();
const pgWith = async ids => { const pg = new PGlite(); await pg.exec(schemaMigrationsTable); for (const id of ids) await pg.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [id, 'x']); return pg; };

test('a database with a migration this commit lacks is refused, naming it; the same set (or fewer) passes', async t => {
  const ahead = await pgWith([...migrations.map(m => m.id), '9999_from_a_newer_release']); t.after(() => ahead.close());
  await assert.rejects(assertDatabaseNotAhead(ahead, migrations), /older than the database.*9999_from_a_newer_release|9999_from_a_newer_release.*older than the database/s);
  const same = await pgWith(migrations.map(m => m.id)); t.after(() => same.close());
  await assertDatabaseNotAhead(same, migrations);
  assert.deepEqual(unknownAppliedMigrations(migrations, new Map([[migrations[0].id, 'x']])), []);
});

test('pre-#724-style code (a migration list without the newest file) is refused once the newest is applied', async t => {
  const pg = await pgWith(migrations.map(m => m.id)); t.after(() => pg.close());
  await assert.rejects(assertDatabaseNotAhead(pg, migrations.slice(0, -1)), new RegExp(migrations.at(-1).id));
});

test('no schema_migrations table: refused (fail closed)', async t => {
  const pg = new PGlite(); t.after(() => pg.close());
  await assert.rejects(assertDatabaseNotAhead(pg, migrations), /schema_migrations is missing/);
});

test('the #501 deploy runs the guard against the database right after the #119 check, before wrangler deploy', () => {
  const src = readFileSync('scripts/deploy-production.mjs', 'utf8');
  assert.match(src, /await assertPostgresMigrationsApplied\(db\); await assertDatabaseNotAhead\(db\);/);
  assert.ok(src.indexOf('assertDatabaseNotAhead(db)') < src.indexOf("productionDeployArgs(false, head), { stdio"), 'checked before the deploy runs');
});
