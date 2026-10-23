/** #501 (Patrick, Oct 22): one-off, idempotent. Creates (or resets the password of) the restricted runtime role production's Hyperdrive uses on the shared database, applies runtimeRoleGrantSql
 *  plus default privileges for future migration tables, then connects AS the role and runs the Worker's startup role check. Env (names only): PREVIEW_DATABASE_ADMIN_URL, PRODUCTION_RUNTIME_ROLE_PASSWORD. Prints no values. */
import { pathToFileURL } from 'node:url';
import { runtimeRoleGrantSql } from './production-config.mjs';
import { connectPostgres } from './postgres-migrations.mjs';

export const runtimeRole = 'harimu_production_app';
export const roleAttributes = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
export const defaultPrivilegeSql = role => [`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`, `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`];
export const roleCheckSql = "SELECT has_schema_privilege(current_user,'public','CREATE') AS can_create_schema,has_any_column_privilege(current_user,'harimu_storage_migrations','UPDATE') AS can_change_marker,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser";

async function main(env = process.env) {
  const adminUrl = env.PREVIEW_DATABASE_ADMIN_URL, password = env.PRODUCTION_RUNTIME_ROLE_PASSWORD;
  if (!adminUrl || !password) throw new Error('PREVIEW_DATABASE_ADMIN_URL and PRODUCTION_RUNTIME_ROLE_PASSWORD are required.');
  if (!/^[A-Za-z0-9]{24,}$/.test(password)) throw new Error('PRODUCTION_RUNTIME_ROLE_PASSWORD must be at least 24 letters or digits.');
  const admin = await connectPostgres(adminUrl);
  try {
    const exists = (await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [runtimeRole])).rowCount > 0;
    await admin.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${runtimeRole} WITH ${roleAttributes} PASSWORD '${password}'`);
    console.log(exists ? `Role ${runtimeRole} existed: attributes and password reset.` : `Role ${runtimeRole} created.`);
    for (const sql of [...runtimeRoleGrantSql(runtimeRole), ...defaultPrivilegeSql(runtimeRole)]) { await admin.query(sql); console.log(`ok: ${sql}`); }
  } finally { await admin.end(); }
  const url = new URL(adminUrl); url.username = runtimeRole; url.password = password;
  const app = await connectPostgres(url.toString());
  try {
    const row = (await app.query(roleCheckSql)).rows[0], marker = (await app.query('SELECT count(*)::int AS n FROM harimu_storage_migrations')).rows[0].n;
    console.log(`Role check as ${runtimeRole}: can_create_schema=${row.can_create_schema} can_change_marker=${row.can_change_marker} superuser=${row.superuser}; marker table readable (${marker} rows).`);
    if (row.superuser || row.can_create_schema || row.can_change_marker) throw new Error('The runtime role is not restricted; assertPostgresApplicationRole would refuse it.');
    console.log('assertPostgresApplicationRole would accept this role.');
  } finally { await app.end(); }
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then(c => process.exit(c), e => { console.error(String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, '<redacted>')); process.exit(1); });
