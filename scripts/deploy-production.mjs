/**
 * #501c: production deploy (inactive). Nothing runs this automatically: no npm script, no workflow before slice d, and slice d's workflow is manual-dispatch behind the
 * `production` environment approval. It refuses unless every input below is present and consistent, and it never calls Cloudflare (except the read-only rollback-floor `wrangler versions view`, #486), PlanetScale or Clerk in --dry-run
 * (it validates and prints the plan only). Inputs (names only): HARIMU_DEPLOY_ENVIRONMENT=production, --qa2-go-sha=<40 hex> equal to the checked-out HEAD (and GITHUB_SHA when set),
 * and for a real run also GITHUB_REF=refs/heads/main, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, the admin-URL secret named by --database-url-env (default PRODUCTION_DATABASE_ADMIN_URL; PREVIEW_DATABASE_ADMIN_URL while production shares preview's database). Migrations and the pre-deploy PlanetScale backup are
 * separate workflow steps that run before this script; this script only verifies the migrations are applied, then uploads the built bundle.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { assertProductionConfig, databaseUrlEnvNames, productionConfigPath, productionJournalProblems, productionTarget, readProductionConfigRaw, sharesPreviewHyperdrive } from './production-config.mjs';

export const databaseUrlEnv = argv => argv.find(a => a.startsWith('--database-url-env='))?.slice('--database-url-env='.length) ?? databaseUrlEnvNames[0];
/** #501d: --rollback=<Worker version id> rolls the production Worker back to an earlier Cloudflare version (no rebuild, no migration, no config assertion: it must work when a bad commit is on main). The journal is off in production, so a journal replay is not a rollback path. */
export const rollbackVersion = argv => argv.find(a => a.startsWith('--rollback='))?.slice('--rollback='.length);
export const productionRollbackArgs = version => ['rollback', version, '--name', productionTarget.worker, '--config', productionConfigPath, '--message', 'harimu production rollback', '--yes'];
/** #486 (ARC): the rollback floor. A rollback target must be a version built from a commit that contains #724's merge (world_squares readers that tolerate the 30x24 rows),
 *  because once 0066 is on the shared database an older Worker would serve a broken map. It is the one check --rollback never skips; anything uncertain refuses. */
export const rollbackFloorCommit = '36fe66ed8682286c0178ea6b4ecf19a49877060c';
export function rollbackFloorProblem(version, spawn = spawnSync) {
  const view = spawn('node_modules/.bin/wrangler', ['versions', 'view', version, '--name', productionTarget.worker, '--config', productionConfigPath, '--json'], { encoding: 'utf8', env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' } });
  if (view.status !== 0) return 'could not read the target version from Cloudflare';
  let tag; try { tag = JSON.parse(view.stdout ?? '')?.annotations?.['workers/tag']; } catch { return 'the target version could not be parsed'; }
  if (!/^[a-f0-9]{40}$/.test(tag ?? '')) return 'the target version carries no commit tag (built before the rollback floor)';
  const ancestor = spawn('git', ['merge-base', '--is-ancestor', rollbackFloorCommit, tag], { encoding: 'utf8' });
  if (ancestor.status !== 0) return `target version ${version} was built from commit ${tag}, which does not contain the required floor commit ${rollbackFloorCommit} (#724's merge); roll back only to a version built from a descendant of it`;
  return null;
}
export function productionDeployProblems({ argv, env, head }) {
  const problems = [], urlEnv = databaseUrlEnv(argv), sha = argv.find(a => a.startsWith('--qa2-go-sha='))?.slice('--qa2-go-sha='.length), dryRun = argv.includes('--dry-run'), rollback = rollbackVersion(argv);
  if (env.HARIMU_DEPLOY_ENVIRONMENT !== 'production') problems.push('HARIMU_DEPLOY_ENVIRONMENT=production is required.');
  if (rollback !== undefined) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(rollback)) problems.push('--rollback=<Worker version id (uuid)> is invalid.'); }
  else {
    if (!/^[a-f0-9]{40}$/.test(sha ?? '')) problems.push('--qa2-go-sha=<full 40 hex commit> is required.');
    else if (sha !== head) problems.push('--qa2-go-sha must equal the checked-out commit.');
    if (env.GITHUB_SHA && env.GITHUB_SHA !== head) problems.push('GITHUB_SHA does not match the checked-out commit.');
    if (!databaseUrlEnvNames.includes(urlEnv)) problems.push(`--database-url-env must be one of ${databaseUrlEnvNames.join(', ')}.`);
  }
  if (!dryRun) {
    if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REF !== 'refs/heads/main') problems.push('A real production deploy runs only from refs/heads/main in GitHub Actions.');
    for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', ...(rollback === undefined ? [urlEnv] : [])]) if (!env[name]) problems.push(`${name} is not set.`);
    if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ACCOUNT_ID !== productionTarget.accountId) problems.push('CLOUDFLARE_ACCOUNT_ID is not the approved account.');
  }
  return problems;
}
export const productionDeployArgs = (dryRun, head) => ['deploy', '--config', 'dist/server/wrangler.json', ...(dryRun ? ['--dry-run', '--outdir', '.wrangler/dry-run'] : []), ...(head ? ['--tag', head] : [])]; // #486: --tag records the commit, for the rollback floor. No --keep-vars (QA3): every production setting must live in wrangler.prod.jsonc, because a deploy replaces dashboard-set vars. Secrets are set by name in the dashboard; after the FIRST deploy, check they are all still present (names only) before opening traffic.

export async function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  const { journalProblems = productionJournalProblems, spawn = spawnSync } = deps;
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim();
  const problems = productionDeployProblems({ argv, env, head });
  if (problems.length) throw new Error(`Production deploy refused:\n- ${problems.join('\n- ')}`);
  const rollback = rollbackVersion(argv);
  if (rollback !== undefined) {
    const floor = rollbackFloorProblem(rollback, spawn); if (floor) throw new Error(`Production rollback refused (#486 floor): ${floor}.`); // also on --dry-run (read-only: versions view + git), so a rehearsal finds a bad target
    if (argv.includes('--dry-run')) { console.log(`Dry run: rollback floor passed; would run: wrangler ${productionRollbackArgs(rollback).join(' ')}`); return 0; }
    return spawn('node_modules/.bin/wrangler', productionRollbackArgs(rollback), { stdio: 'inherit', env: { ...env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' } }).status ?? 1;
  }
  const journal = journalProblems(); if (journal.length) throw new Error(`Production deploy refused:\n- ${journal.join('\n- ')}`);
  const config = assertProductionConfig(readProductionConfigRaw()); // the checked-in config; a Hyperdrive placeholder stops here
  if (sharesPreviewHyperdrive(config)) console.warn('Note: production uses the same Hyperdrive config as preview (shared database).');
  if (argv.includes('--dry-run')) { console.log(`Dry run for ${head}: inputs and wrangler.prod.jsonc are valid. Would verify migrations, assert the built config, then run: wrangler ${productionDeployArgs(false, head).join(' ')}`); return 0; }
  const { assertPinnedWrangler } = await import('./wrangler-pin.mjs'), { assertPostgresMigrationsApplied, assertDatabaseNotAhead, assertWorldGridCovered, connectPostgres } = await import('./postgres-migrations.mjs');
  assertPinnedWrangler(JSON.parse(readFileSync('node_modules/wrangler/package.json', 'utf8')).version, JSON.parse(readFileSync('package.json', 'utf8')).devDependencies.wrangler);
  const built = assertProductionConfig(JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'))); // the bundle that would be uploaded
  if (built.main !== 'index.js' || !built.assets?.directory) throw new Error('Build production first (scripts/build-production.mjs).');
  const db = await connectPostgres(env[databaseUrlEnv(argv)]);
  try { await assertPostgresMigrationsApplied(db); await assertDatabaseNotAhead(db); await assertWorldGridCovered(db); } finally { await db.close(); } // #486: never ship code older than the shared database
  return spawn('node_modules/.bin/wrangler', productionDeployArgs(false, head), { stdio: 'inherit', env: { ...env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' } }).status ?? 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => process.exit(code), error => { console.error(error.message); process.exit(1); }); // messages carry names only, never values
}
