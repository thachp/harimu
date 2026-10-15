/** Wrangler pin guard for preview deploys (#89). */
export function assertPinnedWrangler(installed, declared) {
  if (!/^\d+\.\d+\.\d+$/.test(declared ?? '')) throw new Error(`package.json must pin wrangler to an exact version (found "${declared}").`);
  if (installed !== declared) throw new Error(`Installed wrangler ${installed} does not match the pinned ${declared}. Run "npm ci"; do not deploy with a global or npx wrangler.`);
  return installed;
}
export function isDryRun(argv, env) { return argv.includes('--dry-run') || env.npm_config_dry_run === 'true'; }
export function deployArgs(dryRun) {
  return dryRun ? ['deploy', '--config', 'dist/server/wrangler.json', '--dry-run', '--outdir', '.wrangler/dry-run']
    : ['deploy', '--config', 'dist/server/wrangler.json', '--keep-vars'];
}
/**
 * #394: vars the PM manages in the Cloudflare dashboard (QA test-citizen switch and its allowlist of account ids). `--keep-vars` keeps dashboard vars that are
 * absent from the config, but a var that IS in the config is overwritten on every deploy, which reset HARIMU_QA_TEST_CITIZENS to "false". These names are
 * dropped from the built deploy config only (wrangler.jsonc keeps the "false" default for local runs, tests and a brand-new Worker), so the deploy leaves
 * the Worker's current values alone. No ids or secrets live in the repo. A var that was never set stays absent, which the app treats as off.
 * #627: the same for the two flags the PM turns on in the preview dashboard, HARIMU_SQUARE_PURCHASE_ENABLED (squares only) and HARIMU_TESSERA_EXCHANGE_ENABLED (the Spark-to-Tessera
 * kiosk, #626): each is still "false" in wrangler.jsonc (local runs, tests, a brand-new Worker), but a release deploy no longer resets what the dashboard set.
 */
export const dashboardManagedVars = Object.freeze(['HARIMU_QA_TEST_CITIZENS', 'HARIMU_QA_TEST_CITIZEN_IDS', 'HARIMU_SQUARE_PURCHASE_ENABLED', 'HARIMU_TESSERA_EXCHANGE_ENABLED']);
export function withoutDashboardVars(config) {
  if (!config.vars || typeof config.vars !== 'object') return config;
  const vars = Object.fromEntries(Object.entries(config.vars).filter(([name]) => !dashboardManagedVars.includes(name)));
  return { ...config, vars };
}
/**
 * wrangler >= 4.151 rejects `legacy_env`. `true` was the default and wrangler states
 * removing it does not change the deployment, so drop it only when it is true.
 */
export function withoutLegacyEnv(config) {
  if (!('legacy_env' in config)) return config;
  if (config.legacy_env !== true) throw new Error('Built config sets legacy_env=false; refusing to change environment semantics.');
  const { legacy_env: _legacyEnv, ...rest } = config;
  return rest;
}
