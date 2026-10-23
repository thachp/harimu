/** #501 (QA3 on #814): the production runtime role on PGlite: no CREATE on public, every ledger read-only, default privileges reach later tables, the check fails on a ledger write grant, no secret in the log. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { bootstrapEmptyPostgres } from '../scripts/postgres-migrations.mjs';
import { createRuntimeRole, ledgerTables, main, roleGrantSql, roleProblems, runtimeRole } from '../scripts/create-production-runtime-role.mjs';

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

  for (const t of ledgerTables) for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
    await pg.exec(`GRANT ${priv} ON ${t} TO ${runtimeRole}`); await pg.exec(`SET ROLE ${runtimeRole}`);
    assert.deepEqual(await roleProblems(db), [`${t} is writable`], `${priv} on ${t}`); await pg.exec('RESET ROLE');
    await pg.exec(`REVOKE ${priv} ON ${t} FROM ${runtimeRole}`);
  }
  await pg.exec(`GRANT UPDATE (id) ON schema_migrations TO ${runtimeRole}`); await pg.exec(`SET ROLE ${runtimeRole}`);
  assert.deepEqual(await roleProblems(db), ['schema_migrations is writable'], 'a column UPDATE grant'); await pg.exec('RESET ROLE');
  await pg.exec(`REVOKE UPDATE (id) ON schema_migrations FROM ${runtimeRole}`); await pg.exec(`GRANT CREATE ON SCHEMA public TO ${runtimeRole}`); await pg.exec(`SET ROLE ${runtimeRole}`);
  assert.deepEqual(await roleProblems(db), ['the role can CREATE in schema public']); await pg.exec('RESET ROLE');
  await assert.rejects(createRuntimeRole(db, 'short'), /at least 24/);
  await pg.close();
});

test('refuses (and changes nothing) unless all three ledgers already exist', async () => {
  for (const drop of ledgerTables) {
    const pg = new PGlite(); await pg.waitReady; const db = adapter(pg);
    await bootstrapEmptyPostgres(db, { freshWorld: true }); await pg.exec('CREATE TABLE IF NOT EXISTS economy_migrations (id TEXT PRIMARY KEY)');
    await pg.exec(`DROP TABLE ${drop}`);
    await assert.rejects(createRuntimeRole(db, password, { log: () => {} }), new RegExp(`missing: ${drop}`));
    assert.equal((await pg.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [runtimeRole])).rows.length, 0, 'no role created');
    await pg.close();
  }
});

test('main() runs end to end against connectPostgres\'s shape ({ query, close }, no end)', async () => {
  const pg = new PGlite(); await pg.waitReady;
  await bootstrapEmptyPostgres(adapter(pg), { freshWorld: true }); await pg.exec('CREATE TABLE IF NOT EXISTS economy_migrations (id TEXT PRIMARY KEY)');
  const urls = [], connect = async url => { urls.push(new URL(url).username); await pg.exec(new URL(url).username === runtimeRole ? `SET ROLE ${runtimeRole}` : 'RESET ROLE'); return { query: (t, p) => pg.query(t, p), close: async () => {} }; };
  const out = [], log = console.log; console.log = line => out.push(String(line));
  try { assert.equal(await main({ PREVIEW_DATABASE_ADMIN_URL: 'postgres://admin:adminpw@db.example:5432/harimu', PRODUCTION_RUNTIME_ROLE_PASSWORD: password }, { connect }), 0); } finally { console.log = log; }
  assert.deepEqual(urls, ['admin', runtimeRole], 'admin first, then the role check as the role');
  assert.match(out.at(-1), /would accept it/); assert.ok(!out.join('\n').includes(password) && !out.join('\n').includes('adminpw'));
  await pg.close();
});
