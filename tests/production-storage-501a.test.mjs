/** #501 slice (a): the fail-closed production storage path, the fresh-world-v1 marker and the readiness check. Preview behavior stays exactly as before. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { assertPostgresApplicationRole, assertStorageMarker, freshWorldMarker, importedWorldMarker, selectStorageBackend, storageMarkerIds } from '../lib/storage-selection.ts';
import { bootstrapEmptyPostgres, checksum, freshWorldManifest, postgresMigrations } from '../scripts/postgres-migrations.mjs';

const production = { backend: 'postgres', implementationEnabled: true, productionStorage: 'true', cutoverReady: 'true', hyperdriveConfigured: true };
const preview = { backend: 'postgres', implementationEnabled: true, developmentPreview: 'true', cutoverReady: 'true', hyperdriveConfigured: true, journalRetentionApproved: true };

test('production path: postgres only, every condition mandatory, none falls back to D1', () => {
  assert.equal(selectStorageBackend(production), 'postgres');
  for (const broken of [{ backend: undefined }, { backend: 'd1' }, { backend: 'unexpected' }, { implementationEnabled: false }, { implementationEnabled: undefined }, { cutoverReady: undefined }, { cutoverReady: 'false' },
    { hyperdriveConfigured: false }, { developmentPreview: 'true' }, { temporaryAdminApproved: 'true' }, { accountElectionEnabled: true }, { maintenance: 'true' }])
    assert.throws(() => selectStorageBackend({ ...production, ...broken }), /not approved and ready|paused/, JSON.stringify(broken));
  assert.equal(selectStorageBackend({ ...production, developmentPreview: 'false', temporaryAdminApproved: 'false', accountElectionEnabled: false }), 'postgres');
});

test('preview and D1 behavior is unchanged: the production switch is inert unless it is exactly "true"', () => {
  assert.equal(selectStorageBackend({ hyperdriveConfigured: false }), 'd1');
  assert.equal(selectStorageBackend({ backend: 'postgres', cutoverReady: 'true', hyperdriveConfigured: false }), 'd1');
  for (const productionStorage of [undefined, '', 'false', 'TRUE', '1']) {
    assert.equal(selectStorageBackend({ ...preview, productionStorage }), 'postgres');
    assert.throws(() => selectStorageBackend({ ...preview, developmentPreview: undefined, productionStorage }), /not approved and ready/);
    assert.equal(selectStorageBackend({ hyperdriveConfigured: false, productionStorage }), 'd1');
  }
  assert.throws(() => selectStorageBackend({ ...preview, hyperdriveConfigured: false }), /not approved and ready/);
  assert.equal(readFileSync('wrangler.jsonc', 'utf8').includes('HARIMU_PRODUCTION_STORAGE'), false, 'the preview Worker config never sets the production switch');
});

test('readiness markers: preview needs the validated D1 import, production also accepts fresh-world-v1', () => {
  const sha = 'a'.repeat(64), row = (id, validated = 1, backup_sha256 = sha) => ({ id, validated, backup_sha256 });
  assert.deepEqual(storageMarkerIds(false), [importedWorldMarker]); assert.deepEqual(storageMarkerIds(true), [freshWorldMarker, importedWorldMarker]);
  assertStorageMarker([row(importedWorldMarker)], false); assertStorageMarker([row(importedWorldMarker)], true); assertStorageMarker([row(freshWorldMarker)], true);
  assert.throws(() => assertStorageMarker([row(freshWorldMarker)], false), /import has not been validated/, 'a fresh-world marker never makes preview ready');
  for (const bad of [[], [row(freshWorldMarker, 0)], [row(freshWorldMarker, 1, 'xyz')], [row(freshWorldMarker, 1, 'A'.repeat(64))], [row('other-marker')]]) assert.throws(() => assertStorageMarker(bad, true), /not been initialized/);
  assertPostgresApplicationRole({ canCreateSchema: 0, canChangeMarker: 0, superuser: 0 }); assert.throws(() => assertPostgresApplicationRole({ canCreateSchema: 1, canChangeMarker: 0, superuser: 0 }));
});

test('db.ts wiring: production never gets the temporary-admin waiver, and readiness uses the marker rule', () => {
  const db = readFileSync('lib/db.ts', 'utf8');
  assert.match(db, /HARIMU_PRODUCTION_STORAGE!=='true'&&bindings\.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW==='true'&&bindings\.HARIMU_POSTGRES_TEMPORARY_ADMIN_APPROVED==='true'\)/);
  assert.match(db, /assertStorageMarker\(markers\.results,bindings\.HARIMU_PRODUCTION_STORAGE==='true'\)/);
  assert.match(db, /productionStorage:bindings\.HARIMU_PRODUCTION_STORAGE,temporaryAdminApproved:bindings\.HARIMU_POSTGRES_TEMPORARY_ADMIN_APPROVED,accountElectionEnabled:accountElectionEnabled\(bindings\)/);
  assert.match(db, /JSON\.stringify\(\[[^\]]*bindings\.HARIMU_PRODUCTION_STORAGE/, 'a changed production switch re-verifies readiness');
});

test('--fresh-world bootstrap writes fresh-world-v1 bound to the migration manifest; without it nothing is written', async () => {
  const adapter = pg => ({ query: (t, p) => pg.query(t, p), exec: t => pg.exec(t) });
  const plain = new PGlite(); await plain.waitReady; await bootstrapEmptyPostgres(adapter(plain));
  assert.equal((await plain.query("SELECT COUNT(*)::int AS n FROM pg_tables WHERE tablename IN ('harimu_storage_migrations','harimu_postgres_write_journal')")).rows[0].n, 0);
  const pg = new PGlite(); await pg.waitReady; const logs = [];
  await bootstrapEmptyPostgres(adapter(pg), { freshWorld: true, log: line => logs.push(line) });
  const rows = (await pg.query('SELECT id,backup_sha256,manifest_json,validated FROM harimu_storage_migrations')).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].id, 'fresh-world-v1'); assert.equal(rows[0].validated, 1);
  assert.equal(rows[0].manifest_json, freshWorldManifest(postgresMigrations())); assert.equal(rows[0].backup_sha256, checksum(rows[0].manifest_json));
  assertStorageMarker(rows, true); assert.throws(() => assertStorageMarker(rows, false));
  assert.equal((await pg.query("SELECT COUNT(*)::int AS n FROM pg_tables WHERE tablename='harimu_postgres_write_journal'")).rows[0].n, 0, '#501c: production keeps no write journal table');
  assert.match(logs.join('\n'), /fresh-world-v1 written/);
  await assert.rejects(bootstrapEmptyPostgres(adapter(pg), { freshWorld: true }), /refuses: schema public already has/, 'never re-run on a live world');
  await plain.close(); await pg.close();
});
