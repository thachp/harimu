/** #501 (QA3 on #814): the production runtime role on PGlite: no CREATE on public, every ledger read-only, default privileges reach later tables, the check fails on a ledger write grant, no secret in the log. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { bootstrapEmptyPostgres } from '../scripts/postgres-migrations.mjs';
import { createRuntimeRole, ledgerTables, roleGrantSql, roleProblems, runtimeRole } from '../scripts/create-production-runtime-role.mjs';

const adapter = pg => ({ query: (t, p) => pg.query(t, p), exec: t => pg.exec(t) });
const password = 'Abc123'.repeat(5);

test('runtime role: restricted, ledgers read-only, later tables granted, check fails closed, nothing secret logged', async () => {
  const pg = new PGlite(); await pg.waitReady; const db = adapter(pg), logs = [];
  await bootstrapEmptyPostgres(db, { freshWorld: true });
  await pg.exec('CREATE TABLE IF NOT EXISTS economy_migrations (id TEXT PRIMARY KEY)');
  await pg.exec('REVOKE CREATE ON SCHEMA public FROM PUBLIC'); // what PG15+ ships with; the script itself never runs this global statement
  assert.ok(!(await roleGrantSql(db)).some(sql => /FROM PUBLIC/.test(sql)), 'no database-wide revoke');
  await createRuntimeRole(db, password, { log: line => logs.push(line) });
  await createRuntimeRole(db, password, { log: line => logs.push(line) }); // idempotent
  assert.ok(logs.some(l => /existed/.test(l)));
  assert.ok(!logs.join('\n').includes(password) && !/postgres(ql)?:\/\//.test(logs.join('\n')), 'no password or URL in the log');
  await pg.exec('CREATE TABLE later_feature (id INTEGER PRIMARY KEY)'); // a migration after the role exists

  await pg.exec(`SET ROLE ${runtimeRole}`);
  assert.deepEqual(await roleProblems(db), []);
  for (const t of ledgerTables) {
    await pg.query(`SELECT * FROM ${t} LIMIT 1`);
    await assert.rejects(pg.query(`DELETE FROM ${t}`), /permission denied/, `${t} delete`);
    await assert.rejects(pg.query(`TRUNCATE ${t}`), /permission denied/, `${t} truncate`);
  }
  await assert.rejects(pg.exec('CREATE TABLE sneaky (id int)'), /permission denied/, 'no CREATE on public');
  await pg.query('INSERT INTO later_feature (id) VALUES (1)'); assert.equal((await pg.query('SELECT count(*)::int AS n FROM later_feature')).rows[0].n, 1, 'default privileges reach later tables');
  await pg.exec('RESET ROLE');

  await pg.exec(`GRANT INSERT ON schema_migrations TO ${runtimeRole}`); await pg.exec(`SET ROLE ${runtimeRole}`);
  assert.deepEqual(await roleProblems(db), ['schema_migrations is writable']); await pg.exec('RESET ROLE');
  await pg.exec(`REVOKE INSERT ON schema_migrations FROM ${runtimeRole}`); await pg.exec(`GRANT CREATE ON SCHEMA public TO ${runtimeRole}`); await pg.exec(`SET ROLE ${runtimeRole}`);
  assert.deepEqual(await roleProblems(db), ['the role can CREATE in schema public']); await pg.exec('RESET ROLE');
  await assert.rejects(createRuntimeRole(db, 'short'), /at least 24/);
  await pg.close();
});
