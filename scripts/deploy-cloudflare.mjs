import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { assertDevelopmentConfig, readDevelopmentConfig } from './development-config.mjs';
import { assertPinnedWrangler, deployArgs, isDryRun, withoutLegacyEnv } from './wrangler-pin.mjs';

// #89: newer wrangler (e.g. 4.151) rejects `legacy_env` in the vinext-built config.
// Always use the project-local, pinned wrangler; never a global or npx copy.
assertPinnedWrangler(JSON.parse(readFileSync('node_modules/wrangler/package.json', 'utf8')).version,
  JSON.parse(readFileSync('package.json', 'utf8')).devDependencies.wrangler);
const dryRun = isDryRun(process.argv, process.env);
{
  const built = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
  writeFileSync('dist/server/wrangler.json', JSON.stringify(withoutLegacyEnv(built)));
}

// Branch flow (#127): preview (harimu-preview) deploys from `dev`; production deploys only from `main`
// via a separate release workflow. See CONTRIBUTING.md.
{
  const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout?.trim();
  if (branch && branch !== 'dev') console.warn(`Warning: preview deploys come from "dev"; current branch is "${branch}".`);
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
const schemaCheck = spawnSync('node_modules/.bin/wrangler', [
  'd1', 'execute', 'harimu-preview', '--remote', '--config', 'dist/server/wrangler.json', '--json',
  '--command', "SELECT COUNT(*) AS installed FROM sqlite_master WHERE type='table' AND name IN ('world_clock','world_ticks','world_supply','government_policy_executions','korund_resources','korund_work_starts','citizen_city_locations')",
], { encoding: 'utf8', env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' } });
if (schemaCheck.status !== 0) throw new Error('Preview D1 schema verification failed.');
const schema = JSON.parse(schemaCheck.stdout);
if (schema[0]?.results?.[0]?.installed !== 7) {
  throw new Error('Apply the existing Drizzle migrations to fresh preview D1 before deployment; see migration runbook.');
}
const result = spawnSync('node_modules/.bin/wrangler', deployArgs(false), {
  stdio: 'inherit', env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' },
});
process.exit(result.status ?? 1);
