import { readFileSync } from 'node:fs';

/** #501 slice b: helpers for wrangler.prod.jsonc. Slice c's assertProductionConfig builds on these; nothing deploys from here. */
export const productionWorker = 'harimu-production';
export const productionConfigPath = 'wrangler.prod.jsonc';

/** Same rule as scripts/development-config.mjs: the checked-in JSONC has full-line // comments only. Reads no secret file. */
export function readProductionConfigRaw(path = productionConfigPath) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
}

/** A Hyperdrive config id is 32 lowercase hex characters. Anything else (the checked-in PLACEHOLDER, an empty or missing id) is a placeholder, and so is the preview's id: production must not share preview's database connection. */
export function hyperdriveIdProblem(id, previewId) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) return 'The production Hyperdrive id is a placeholder or not a valid config id.';
  if (id === previewId) return 'The production Hyperdrive id must not be the preview Hyperdrive config.';
  return null;
}

/** The runtime role's grants (the role the Worker reaches through Hyperdrive), run once by the admin role after the first bootstrap. The Worker's startup check (assertPostgresApplicationRole) refuses a role that
 *  is superuser, can CREATE in public, or can UPDATE the storage marker table, so the marker table is SELECT only. Do not use a managed pg_write_all_data role: it would let the role UPDATE the marker. */
export function runtimeRoleGrantSql(role) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error('Use a lowercase role name of letters, digits and underscores.');
  return [
    'REVOKE CREATE ON SCHEMA public FROM PUBLIC', `REVOKE CREATE ON SCHEMA public FROM ${role}`,
    `GRANT USAGE ON SCHEMA public TO ${role}`, `GRANT USAGE ON SCHEMA harimu_compat TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    `REVOKE INSERT, UPDATE, DELETE ON harimu_storage_migrations FROM ${role}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
  ];
}
