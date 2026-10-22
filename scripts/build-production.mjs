/** #501c/d: production build (inactive; only the manual deploy-production workflow runs it). Same build as scripts/build-development.mjs, but reads wrangler.prod.jsonc and refuses unless it passes assertProductionConfig. */
import { spawnSync } from 'node:child_process';
import { assertProductionConfig, productionConfigPath, readProductionConfigRaw } from './production-config.mjs';

// #501d (QA3): the build runs in a clean environment. Only these ambient names pass through (tool lookup and the build's own commit stamp, scripts/build-info.mjs); no CLOUDFLARE_*, database URL, token or any other secret can reach the build.
export const buildPassthroughEnv = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'CI', 'NODE_OPTIONS', 'GITHUB_SHA', 'HARIMU_BUILD_SHA'];
export function productionBuildEnv(config, env = process.env) {
  const ambient = Object.fromEntries(buildPassthroughEnv.filter(name => env[name] !== undefined).map(name => [name, env[name]]));
  return { ...ambient, ...config.vars, HARIMU_WRANGLER_CONFIG: productionConfigPath, HARIMU_DEPLOY_TARGET: 'cloudflare', WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' };
}
export function buildProduction(env = process.env, deps = {}) {
  const { readConfig = readProductionConfigRaw, spawn = spawnSync } = deps;
  if (env.HARIMU_DEPLOY_ENVIRONMENT !== 'production') throw new Error('HARIMU_DEPLOY_ENVIRONMENT=production is required.');
  const config = assertProductionConfig(readConfig());
  return spawn('node_modules/.bin/vinext', ['build'], { stdio: 'inherit', env: productionBuildEnv(config, env) }).status ?? 1;
}
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { process.exit(buildProduction()); } catch (error) { console.error(error.message); process.exit(1); } }
