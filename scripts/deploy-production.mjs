/**
 * #501c: production deploy (inactive). Nothing runs this automatically: no npm script, no workflow before slice d, and slice d's workflow is manual-dispatch behind the
 * `production` environment approval. It refuses unless every input below is present and consistent, and it never calls Cloudflare, PlanetScale or Clerk in --dry-run
 * (it validates and prints the plan only). Inputs (names only): HARIMU_DEPLOY_ENVIRONMENT=production, --qa2-go-sha=<40 hex> equal to the checked-out HEAD (and GITHUB_SHA when set),
 * and for a real run also GITHUB_REF=refs/heads/main, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, the admin-URL secret named by --database-url-env (default PRODUCTION_DATABASE_ADMIN_URL; PREVIEW_DATABASE_ADMIN_URL while production shares preview's database). Migrations and the pre-deploy PlanetScale backup are
 * separate workflow steps that run before this script; this script only verifies the migrations are applied, then uploads the built bundle.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { assertProductionConfig, databaseUrlEnvNames, productionJournalProblems, productionTarget, readProductionConfigRaw, sharesPreviewHyperdrive } from './production-config.mjs';

export const databaseUrlEnv = argv => argv.find(a => a.startsWith('--database-url-env='))?.slice('--database-url-env='.length) ?? databaseUrlEnvNames[0];
export function productionDeployProblems({ argv, env, head }) {
  const problems = [], urlEnv = databaseUrlEnv(argv), sha = argv.find(a => a.startsWith('--qa2-go-sha='))?.slice('--qa2-go-sha='.length), dryRun = argv.includes('--dry-run');
  if (env.HARIMU_DEPLOY_ENVIRONMENT !== 'production') problems.push('HARIMU_DEPLOY_ENVIRONMENT=production is required.');
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) problems.push('--qa2-go-sha=<full 40 hex commit> is required.');
  else if (sha !== head) problems.push('--qa2-go-sha must equal the checked-out commit.');
  if (env.GITHUB_SHA && env.GITHUB_SHA !== head) problems.push('GITHUB_SHA does not match the checked-out commit.');
  if (!databaseUrlEnvNames.includes(urlEnv)) problems.push(`--database-url-env must be one of ${databaseUrlEnvNames.join(', ')}.`);
  if (!dryRun) {
    if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REF !== 'refs/heads/main') problems.push('A real production deploy runs only from refs/heads/main in GitHub Actions.');
    for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', urlEnv]) if (!env[name]) problems.push(`${name} is not set.`);
    if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ACCOUNT_ID !== productionTarget.accountId) problems.push('CLOUDFLARE_ACCOUNT_ID is not the approved account.');
  }
  return problems;
}
export const productionDeployArgs = dryRun => ['deploy', '--config', 'dist/server/wrangler.json', ...(dryRun ? ['--dry-run', '--outdir', '.wrangler/dry-run'] : [])]; // no --keep-vars: production vars come from the config alone

export async function main(argv = process.argv.slice(2), env = process.env) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim();
  const problems = productionDeployProblems({ argv, env, head });
  if (problems.length) throw new Error(`Production deploy refused:\n- ${problems.join('\n- ')}`);
  const journal = productionJournalProblems(); if (journal.length) throw new Error(`Production deploy refused:\n- ${journal.join('\n- ')}`);
  const config = assertProductionConfig(readProductionConfigRaw()); // the checked-in config; a Hyperdrive placeholder stops here
  if (sharesPreviewHyperdrive(config)) console.warn('Note: production uses the same Hyperdrive config as preview (shared database).');
  if (argv.includes('--dry-run')) { console.log(`Dry run for ${head}: inputs and wrangler.prod.jsonc are valid. Would verify migrations, assert the built config, then run: wrangler ${productionDeployArgs(false).join(' ')}`); return 0; }
  const { assertPinnedWrangler } = await import('./wrangler-pin.mjs'), { assertPostgresMigrationsApplied, connectPostgres } = await import('./postgres-migrations.mjs');
  assertPinnedWrangler(JSON.parse(readFileSync('node_modules/wrangler/package.json', 'utf8')).version, JSON.parse(readFileSync('package.json', 'utf8')).devDependencies.wrangler);
  const built = assertProductionConfig(JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'))); // the bundle that would be uploaded
  if (built.main !== 'index.js' || !built.assets?.directory) throw new Error('Build production first (scripts/build-production.mjs).');
  const db = await connectPostgres(env[databaseUrlEnv(argv)]);
  try { await assertPostgresMigrationsApplied(db); } finally { await db.close(); }
  return spawnSync('node_modules/.bin/wrangler', productionDeployArgs(false), { stdio: 'inherit', env: { ...env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' } }).status ?? 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => process.exit(code), error => { console.error(error.message); process.exit(1); }); // messages carry names only, never values
}
