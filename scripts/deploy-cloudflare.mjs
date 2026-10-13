import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Deploy only the generated direct build: the Sites build is not portable.
const config = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
if (config.name !== 'harimu-preview' || config.account_id !== '143bccf1a31c2161142c43845a8fc65d') {
  throw new Error('Build the direct Cloudflare preview for the approved account first.');
}
if (config.routes?.length || config.d1_databases?.length !== 1 ||
    config.d1_databases[0].binding !== 'DB' ||
    !/^[0-9a-f-]{36}$/i.test(config.d1_databases[0].database_id ?? '') ||
    config.d1_databases[0].database_id === '00000000-0000-4000-8000-000000000000') {
  throw new Error('Preview requires an explicit isolated D1 database ID and no custom routes.');
}
const result = spawnSync('node_modules/.bin/wrangler', ['deploy', '--config', 'dist/server/wrangler.json', '--keep-vars'], {
  stdio: 'inherit', env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' },
});
process.exit(result.status ?? 1);
