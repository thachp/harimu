/** #501 (Patrick, Oct 22): one-off, idempotent. Creates (or resets the password of) the restricted runtime role production's Hyperdrive uses on the shared database, applies runtimeRoleGrantSql
 *  minus its global `REVOKE CREATE ON SCHEMA public FROM PUBLIC` (QA3: no database-wide change on the shared database; the check below asserts the role itself has no CREATE), makes every
 *  migration ledger read-only, adds default privileges for tables created by later migrations, then connects AS the role and runs the startup role check. Env (names only):
 *  PREVIEW_DATABASE_ADMIN_URL, PRODUCTION_RUNTIME_ROLE_PASSWORD. Prints no values. */
import { pathToFileURL } from 'node:url';
import { runtimeRoleGrantSql } from './production-config.mjs';

export const runtimeRole = 'harimu_production_app';
export const roleAttributes = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
/** Every migration ledger the repo writes: the NNNN_*.sql runner, the storage readiness markers, and the economy one-off markers. The runtime role may read them, never write. */
export const ledgerTables = ['schema_migrations', 'harimu_storage_migrations', 'economy_migrations'];

export async function roleGrantSql(db, role = runtimeRole) {
  const present = new Set((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)", [ledgerTables])).rows.map(r => r.tablename));
  const missing = ledgerTables.filter(t => !present.has(t)); // QA3: a ledger created after the role would inherit the default write grants
  if (missing.length) throw new Error(`Refusing: every migration ledger must exist before the runtime role is created; missing: ${missing.join(', ')}.`);
  return [
    ...runtimeRoleGrantSql(role).filter(sql => !/ FROM PUBLIC$/.test(sql)),
    ...ledgerTables.map(t => `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ${t} FROM ${role}`),
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
  ];
}

/** The startup check (lib/db.ts, assertPostgresApplicationRole) plus: no write on any ledger. Run as the role; returns problems (names only). */
export async function roleProblems(db) {
  const problems = [];
  const row = (await db.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS can_create_schema,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser")).rows[0];
  if (row.superuser) problems.push('the role is a superuser');
  if (row.can_create_schema) problems.push('the role can CREATE in schema public');
  for (const t of ledgerTables) {
    if (!(await db.query("SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=$1", [t])).rows.length) continue;
    const p = (await db.query(`SELECT has_table_privilege(current_user,$1,'SELECT') AS r, has_table_privilege(current_user,$1,'INSERT') OR has_table_privilege(current_user,$1,'DELETE') OR has_table_privilege(current_user,$1,'TRUNCATE') OR has_any_column_privilege(current_user,$1,'UPDATE') AS w`, [t])).rows[0];
    if (!p.r) problems.push(`${t} is not readable`);
    if (p.w) problems.push(`${t} is writable`);
  }
  return problems;
}

export async function createRuntimeRole(admin, password, { role = runtimeRole, log = console.log } = {}) {
  if (!/^[A-Za-z0-9]{24,}$/.test(password ?? '')) throw new Error('PRODUCTION_RUNTIME_ROLE_PASSWORD must be at least 24 letters or digits.');
  const grants = await roleGrantSql(admin, role); // refuses before any role change when a ledger is missing
  const exists = (await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rows.length > 0;
  await admin.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${role} WITH ${roleAttributes} PASSWORD '${password}'`);
  log(exists ? `Role ${role} existed: attributes and password reset.` : `Role ${role} created.`);
  for (const sql of grants) { await admin.query(sql); log(`ok: ${sql}`); }
}

/** connectPostgres returns { query, close } (no end): the run on Oct 22 failed on admin.end(). `connect` is injectable for the test. */
export async function main(env = process.env, { connect } = {}) {
  const adminUrl = env.PREVIEW_DATABASE_ADMIN_URL, password = env.PRODUCTION_RUNTIME_ROLE_PASSWORD;
  if (!adminUrl || !password) throw new Error('PREVIEW_DATABASE_ADMIN_URL and PRODUCTION_RUNTIME_ROLE_PASSWORD are required.');
  const connectPostgres = connect ?? (await import('./postgres-migrations.mjs')).connectPostgres;
  const admin = await connectPostgres(adminUrl);
  try { await createRuntimeRole(admin, password); } finally { await admin.close(); }
  const url = new URL(adminUrl); url.username = runtimeRole; url.password = password;
  const app = await connectPostgres(url.toString());
  try {
    const problems = await roleProblems(app);
    if (problems.length) throw new Error(`Runtime role refused:\n- ${problems.join('\n- ')}`);
    console.log(`Role check as ${runtimeRole}: no superuser, no CREATE on public, ledgers (${ledgerTables.join(', ')}) read-only. assertPostgresApplicationRole would accept it.`);
  } finally { await app.close(); }
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then(c => process.exit(c), e => { console.error(String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, '<redacted>')); process.exit(1); });
