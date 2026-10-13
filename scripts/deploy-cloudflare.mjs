import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { assertDevelopmentConfig, readDevelopmentConfig } from './development-config.mjs';

// Validate both input and built output; never upload a stale Sites/production bundle.
readDevelopmentConfig();
const config = assertDevelopmentConfig(JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8')));
if (config.main !== 'index.js' || !config.assets?.directory) throw new Error('Build the Cloudflare preview first.');
// Sites applied Drizzle migrations automatically; direct Workers must verify them.
const schemaCheck = spawnSync('node_modules/.bin/wrangler', [
  'd1', 'execute', 'harimu-preview', '--remote', '--config', 'dist/server/wrangler.json', '--json',
  '--command', "SELECT COUNT(*) AS installed FROM sqlite_master WHERE type='table' AND name IN ('world_clock','world_ticks','world_supply','government_policy_executions','korund_resources','korund_work_starts','citizen_city_locations')",
], { encoding: 'utf8', env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' } });
if (schemaCheck.status !== 0) throw new Error('Preview D1 schema verification failed.');
const schema = JSON.parse(schemaCheck.stdout);
if (schema[0]?.results?.[0]?.installed !== 7) {
  throw new Error('Apply the existing Drizzle migrations to fresh preview D1 before deployment; see migration runbook.');
}
const result = spawnSync('node_modules/.bin/wrangler', ['deploy', '--config', 'dist/server/wrangler.json', '--keep-vars'], {
  stdio: 'inherit', env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' },
});
process.exit(result.status ?? 1);
