/** Wrangler pin guard for preview deploys (#89). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { developmentTarget } from './development-config.mjs';

export function assertPinnedWrangler(installed, declared) {
  if (!/^\d+\.\d+\.\d+$/.test(declared ?? '')) throw new Error(`package.json must pin wrangler to an exact version (found "${declared}").`);
  if (installed !== declared) throw new Error(`Installed wrangler ${installed} does not match the pinned ${declared}. Run "npm ci"; do not deploy with a global or npx wrangler.`);
  return installed;
}
export function isDryRun(argv, env) { return argv.includes('--dry-run') || env.npm_config_dry_run === 'true'; }
/** Empty file: wrangler sets keepSecrets when --secrets-file is passed, and adds no secret values. Secrets stay; plain-text vars that left the config do not (#988). */
export const previewSecretsKeepFile = '.wrangler/preview-keep-secrets.json';
export function deployArgs(dryRun) {
  return dryRun ? ['deploy', '--config', 'dist/server/wrangler.json', '--dry-run', '--outdir', '.wrangler/dry-run']
    : ['deploy', '--config', 'dist/server/wrangler.json', '--secrets-file', previewSecretsKeepFile];
}
export function writePreviewSecretsKeepFile(path = previewSecretsKeepFile) {
  mkdirSync('.wrangler', { recursive: true });
  writeFileSync(path, '{}\n');
  return path;
}
/**
 * #394: vars the PM manages in the Cloudflare dashboard (QA test-citizen switch and its allowlist of account ids). A var that IS in the config is overwritten on every deploy, which reset HARIMU_QA_TEST_CITIZENS to "false".
 * #988: preview deploy no longer passes --keep-vars (that kept every removed plain-text var, so folding flags could not free a text-binding slot). These names are
 * still dropped from the built config (wrangler.jsonc keeps the "false" default for local runs, tests and a brand-new Worker). Before upload, the deploy reads the live Worker settings and copies only these names back, so a release does not wipe them and does not keep folded-away flags. No ids or secrets live in the repo. A var that was never set stays absent, which the app treats as off.
 * #627: the same for the two flags the PM turns on in the preview dashboard, HARIMU_SQUARE_PURCHASE_ENABLED (squares only) and HARIMU_TESSERA_EXCHANGE_ENABLED (the Spark-to-Tessera
 * kiosk, #626): each is still "false" in wrangler.jsonc (local runs, tests, a brand-new Worker), but a release deploy no longer resets what the dashboard set.
 * #631 faucet: HARIMU_TEST_FAUCET_ENABLED is NOT dashboard-managed (the preview-flags PR): the file value is deployed to preview. It is preview-only: the faucet also needs NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW="true", which production never carries, and wrangler.prod.jsonc pins it "false".
 */
export const dashboardManagedVars = Object.freeze(['HARIMU_QA_TEST_CITIZENS', 'HARIMU_QA_TEST_CITIZEN_IDS', 'HARIMU_SQUARE_PURCHASE_ENABLED', 'HARIMU_TESSERA_EXCHANGE_ENABLED']);
export function withoutDashboardVars(config) {
  if (!config.vars || typeof config.vars !== 'object') return config;
  const vars = Object.fromEntries(Object.entries(config.vars).filter(([name]) => !dashboardManagedVars.includes(name)));
  return { ...config, vars };
}
/** Copy only the dashboard-managed names from a live plain-text map. Other live vars (folded flags) are not resurrected. */
export function withLiveDashboardVars(config, live) {
  if (!config.vars || typeof config.vars !== 'object') return config;
  const vars = { ...config.vars };
  for (const name of dashboardManagedVars) if (typeof live?.[name] === 'string') vars[name] = live[name];
  return { ...config, vars };
}
/** Settings API bindings. A dashboard name that is present but not readable plain text fails closed (do not upload a blank over the live value). Absent names stay absent. */
export function plainTextFromSettings(body) {
  const bindings = body?.result?.bindings;
  if (!Array.isArray(bindings)) throw new Error('Refusing to deploy: settings response has no bindings list. Dashboard QA vars were not copied.');
  const live = {};
  for (const binding of bindings) {
    if (!dashboardManagedVars.includes(binding?.name)) continue;
    if (binding.type !== 'plain_text' || typeof binding.text !== 'string') throw new Error(`Refusing to deploy: live ${binding.name} is not a readable plain-text var.`);
    live[binding.name] = binding.text;
  }
  return live;
}
export async function readLivePlainText(env, fetchImpl = globalThis.fetch) {
  const token = env.CLOUDFLARE_API_TOKEN, account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error('Refusing to deploy: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required to copy dashboard QA vars. Deploying without them would wipe HARIMU_QA_TEST_CITIZENS and HARIMU_QA_TEST_CITIZEN_IDS.');
  if (account !== developmentTarget.accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is not the preview account.');
  const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${developmentTarget.worker}/settings`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Refusing to deploy: could not read ${developmentTarget.worker} settings (HTTP ${response.status}). Dashboard QA vars were not copied.`);
  const body = await response.json();
  if (body?.success === false) throw new Error('Refusing to deploy: Cloudflare settings read failed. Dashboard QA vars were not copied.');
  return plainTextFromSettings(body);
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
