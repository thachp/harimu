/** #501c: production build (inactive; no npm script or workflow runs it before slice d). Same build as scripts/build-development.mjs, but reads wrangler.prod.jsonc and refuses unless it passes assertProductionConfig. */
import { spawnSync } from 'node:child_process';
import { assertProductionConfig, productionConfigPath, readProductionConfigRaw } from './production-config.mjs';

export function productionBuildEnv(config, env = process.env) {
  return { ...env, ...config.vars, HARIMU_WRANGLER_CONFIG: productionConfigPath, HARIMU_DEPLOY_TARGET: 'cloudflare', WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' };
}
const run = () => {
  if (process.env.HARIMU_DEPLOY_ENVIRONMENT !== 'production') throw new Error('HARIMU_DEPLOY_ENVIRONMENT=production is required.');
  const config = assertProductionConfig(readProductionConfigRaw());
  process.exit(spawnSync('node_modules/.bin/vinext', ['build'], { stdio: 'inherit', env: productionBuildEnv(config) }).status ?? 1);
};
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { run(); } catch (error) { console.error(error.message); process.exit(1); } }
