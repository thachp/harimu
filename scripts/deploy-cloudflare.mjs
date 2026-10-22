import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { assertDevelopmentConfig, readDevelopmentConfig } from './development-config.mjs';
import { assertDatabaseNotAhead, assertPostgresMigrationsApplied, connectPostgres } from './postgres-migrations.mjs';
import { redactSecrets } from './redact.mjs';
import { assertPinnedWrangler, deployArgs, isDryRun, withoutDashboardVars, withoutLegacyEnv } from './wrangler-pin.mjs';

// #89: newer wrangler (e.g. 4.151) rejects `legacy_env` in the vinext-built config.
// Always use the project-local, pinned wrangler; never a global or npx copy.
assertPinnedWrangler(JSON.parse(readFileSync('node_modules/wrangler/package.json', 'utf8')).version,
  JSON.parse(readFileSync('package.json', 'utf8')).devDependencies.wrangler);
const dryRun = isDryRun(process.argv, process.env);
{
  // #394: also leave the dashboard-managed QA vars out of the deploy config so --keep-vars preserves their current values.
  const built = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
  writeFileSync('dist/server/wrangler.json', JSON.stringify(withoutDashboardVars(withoutLegacyEnv(built))));
}

// Branch flow (#177): preview (harimu-preview) deploys from `release`; production deploys only from `main`
// via a separate release workflow. See CONTRIBUTING.md.
{
  const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout?.trim();
  if (branch && branch !== 'release' && branch !== 'HEAD') console.warn(`Warning: preview deploys come from "release"; current branch is "${branch}".`);
}
// Validate both input and built output; never upload a stale Sites/production bundle.
readDevelopmentConfig();
const config = assertDevelopmentConfig(JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8')));
if (config.main !== 'index.js' || !config.assets?.directory) throw new Error('Build the Cloudflare preview first.');
// Sites applied Drizzle migrations automatically; direct Workers must verify them.
if (dryRun) {
  // Dry run: validate the bundle with the pinned wrangler without remote D1 access or upload.
  const dry = spawnSync('node_modules/.bin/wrangler', deployArgs(true), { stdio: 'inherit', env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' } });
  process.exit(dry.status ?? 1);
}
// #172: the D1 check only matters when D1 is the live store. On Postgres, the #119 guard below verifies schema.
const storageBackend = process.env.HARIMU_STORAGE_BACKEND ?? config.vars?.HARIMU_STORAGE_BACKEND;
if (storageBackend === 'postgres') {
  console.warn('Warning: HARIMU_STORAGE_BACKEND=postgres; skipping the legacy preview D1 schema check (Postgres migrations are verified instead).');
} else {
  const schemaCheck = spawnSync('node_modules/.bin/wrangler', [
    'd1', 'execute', 'harimu-preview', '--remote', '--config', 'dist/server/wrangler.json', '--json',
    '--command', "SELECT COUNT(*) AS installed FROM sqlite_master WHERE type='table' AND name IN ('world_clock','world_ticks','world_supply','government_policy_executions','korund_resources','korund_work_starts','citizen_city_locations')",
  ], { encoding: 'utf8', env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' } });
  if (schemaCheck.status !== 0) {
    // #163: show wrangler's own error (redacted) so a failed check is diagnosable.
    console.error(redactSecrets(`wrangler exit ${schemaCheck.status ?? schemaCheck.signal}\n${schemaCheck.stderr ?? ''}\n${schemaCheck.stdout ?? ''}`).trim());
    throw new Error('Preview D1 schema verification failed (wrangler output above).');
  }
  const schema = JSON.parse(schemaCheck.stdout);
  if (schema[0]?.results?.[0]?.installed !== 7) {
    throw new Error('Apply the existing Drizzle migrations to fresh preview D1 before deployment; see migration runbook.');
  }
}
// #119: on Postgres the app never bootstraps schema; refuse to ship if any db/postgres migration is not applied.
if (storageBackend === 'postgres') {
  const url = process.env.HARIMU_POSTGRES_URL ?? process.env.PREVIEW_DATABASE_ADMIN_URL;
  if (!url) throw new Error('HARIMU_STORAGE_BACKEND=postgres: set HARIMU_POSTGRES_URL (read access is enough) so deploy can verify Postgres migrations.');
  const db = await connectPostgres(url);
  try { await assertPostgresMigrationsApplied(db); await assertDatabaseNotAhead(db); } finally { await db.close(); } // #486: never ship code older than the shared database
}
const result = spawnSync('node_modules/.bin/wrangler', deployArgs(false), {
  stdio: 'inherit', env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' },
});
process.exit(result.status ?? 1);
