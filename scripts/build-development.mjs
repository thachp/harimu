import { spawnSync } from 'node:child_process';
import { readDevelopmentConfig } from './development-config.mjs';
import { varsForProcessEnv } from '../lib/flag-pack.mjs';

if (process.env.HARIMU_DEPLOY_TARGET && process.env.HARIMU_DEPLOY_TARGET !== 'cloudflare') {
  throw new Error('All development uses Cloudflare. Production/Sites publishing requires a separate future workflow.');
}
const config = readDevelopmentConfig();
const isLocalDev = process.argv.includes('--dev');
const result = spawnSync('node_modules/.bin/vinext', [isLocalDev ? 'dev' : 'build'], {
  stdio: 'inherit', env: {
    ...process.env,
    ...(isLocalDev
      ? { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true' }
      : varsForProcessEnv(config.vars)),
    HARIMU_DEPLOY_TARGET: 'cloudflare',
    WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs',
  },
});
process.exit(result.status ?? 1);
