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
 * wrangler >= 4.151 rejects `legacy_env`. `true` was the default and wrangler states
 * removing it does not change the deployment, so drop it only when it is true.
 */
export function withoutLegacyEnv(config) {
  if (!('legacy_env' in config)) return config;
  if (config.legacy_env !== true) throw new Error('Built config sets legacy_env=false; refusing to change environment semantics.');
  const { legacy_env: _legacyEnv, ...rest } = config;
  return rest;
}
