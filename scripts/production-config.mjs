import { readFileSync } from 'node:fs';
import { developmentTarget } from './development-config.mjs';

/** #501 slice b: helpers for wrangler.prod.jsonc. Slice c's assertProductionConfig builds on these; nothing deploys from here. */
export const productionWorker = 'harimu-production';
export const productionConfigPath = 'wrangler.prod.jsonc';
export const productionTarget = Object.freeze({ worker: productionWorker, accountId: developmentTarget.accountId, hostname: 'app.harimu.com' }); // same Cloudflare account as preview (Patrick ruling 3)

/** #501c: which wrangler config the build reads. Unset means the preview config, exactly as before; anything but the two known files is refused so a typo can never build the wrong Worker. */
export function wranglerConfigPath(env = process.env) {
  const path = env.HARIMU_WRANGLER_CONFIG ?? 'wrangler.jsonc';
  if (path !== 'wrangler.jsonc' && path !== productionConfigPath) throw new Error('HARIMU_WRANGLER_CONFIG must be wrangler.jsonc or wrangler.prod.jsonc.');
  return path;
}

/** Same rule as scripts/development-config.mjs: the checked-in JSONC has full-line // comments only. Reads no secret file. */
export function readProductionConfigRaw(path = productionConfigPath) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
}

/** A Hyperdrive config id is 32 lowercase hex characters. Anything else (the checked-in PLACEHOLDER, an empty or missing id) is a placeholder. The id is a pure config value: Patrick decided (Oct 15) that production shares preview's PlanetScale database for now,
 *  so using preview's id or a second config on the same database are both accepted, and splitting later is a config change only. */
export function hyperdriveIdProblem(id) {
  return typeof id === 'string' && /^[a-f0-9]{32}$/.test(id) ? null : 'The production Hyperdrive id is a placeholder or not a valid config id.';
}
/** Informational only (never a refusal): true when production points at the same Hyperdrive config as preview. */
export const sharesPreviewHyperdrive = (config, previewId = readPreviewHyperdriveId()) => config?.hyperdrive?.[0]?.id === previewId;
/** The admin-URL secret the deploy reads is a name chosen by input, so a shared database can reuse preview's secret name. Names only; the allowed list keeps a typo from reading some other variable. */
export const databaseUrlEnvNames = ['PRODUCTION_DATABASE_ADMIN_URL', 'PREVIEW_DATABASE_ADMIN_URL'];

/** The runtime role's grants (the role the Worker reaches through Hyperdrive), run once by the admin role after the first bootstrap. The Worker's startup check (assertPostgresApplicationRole) refuses a role that
 *  is superuser, can CREATE in public, or can UPDATE the storage marker table, so the marker table is SELECT only. Do not use a managed pg_write_all_data role: it would let the role UPDATE the marker. */
export function runtimeRoleGrantSql(role) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error('Use a lowercase role name of letters, digits and underscores.');
  return [
    'REVOKE CREATE ON SCHEMA public FROM PUBLIC', `REVOKE CREATE ON SCHEMA public FROM ${role}`,
    `GRANT USAGE ON SCHEMA public TO ${role}`, `GRANT USAGE ON SCHEMA harimu_compat TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    `REVOKE INSERT, UPDATE, DELETE ON harimu_storage_migrations FROM ${role}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
  ];
}

const forbiddenVars = ['NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'HARIMU_QA_TEST_CITIZENS', 'HARIMU_QA_TEST_CITIZEN_IDS', 'HARIMU_POSTGRES_TEMPORARY_ADMIN_APPROVED', 'HARIMU_AI_PRICE_REVIEWED_UNTIL', 'HARIMU_POSTGRES_JOURNAL_RETENTION_APPROVED'];
// The only vars that may be anything but "false" on production, with the exact value (or a pattern).
// #742: the AI kill switch is the one operator setting that may differ from "false" on production: "" (off), "all", or a comma list of nation ids. Named, not a pattern, so no other var is loosened.
export const aiTemplatesOnlyNations = ['kindle', 'korund', 'aurelle']; // must match lib/ai-kill-switch.ts (checked by tests/production-deploy-501c)
const nationAlt = aiTemplatesOnlyNations.join('|');
// #764: the per-persona mute is the second operator setting: "", "all" or a comma list of persona ids (lib/ai-kill-switch.ts fails closed on unknown ids).
export const operatorVars = Object.freeze({ HARIMU_AI_TEMPLATES_ONLY: new RegExp(`^(|all|(${nationAlt})(,(${nationAlt}))*)$`), HARIMU_AI_MUTED_PERSONAS: /^(|all|[a-z0-9-]+(,[a-z0-9-]+)*)$/ });
const requiredVars = { HARIMU_STORAGE_BACKEND: 'postgres', HARIMU_PRODUCTION_STORAGE: 'true', HARIMU_POSTGRES_CUTOVER_READY: 'true', HARIMU_AI_GATEWAY_ID: 'harimu-production', HARIMU_AI_DAILY_BUDGET_MICRO: /^\d+$/, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: /^pk_live_/ };
export const readPreviewHyperdriveId = () => JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, '')).hyperdrive?.[0]?.id;

/** #501d (QA3): top-level key allowlist, for both the checked-in config and the built dist/server/wrangler.json. Any key outside the list must be an empty binding list (wrangler writes many `[]`/`{}` defaults), so a bound
 *  d1/kv/r2/queue/service of any shape (array or object form) is refused. `env` blocks and `unsafe` are refused even when empty. The few legitimate non-empty blocks are pinned to the exact preview-equal value. */
const allowedKeys = ['$schema', 'name', 'account_id', 'main', 'compatibility_date', 'compatibility_flags', 'placement', 'triggers', 'hyperdrive', 'ai', 'workers_dev', 'preview_urls', 'vars', 'durable_objects', 'migrations', 'assets', 'routes', 'route',
  'configPath', 'userConfigPath', 'topLevelName', 'definedEnvironments', 'jsx_factory', 'jsx_fragment', 'rules', 'dev', 'no_bundle', 'python_modules'];
const isEmptyDeep = value => Array.isArray(value) ? value.every(isEmptyDeep) : value !== null && typeof value === 'object' && Object.values(value).every(isEmptyDeep);
const pinned = { placement: { region: 'gcp:us-central1' }, ai: { binding: 'AI' }, compatibility_flags: ['nodejs_compat'], durable_objects: { bindings: [{ name: 'CITY_PRESENCE', class_name: 'CityPresence' }] }, migrations: [{ tag: 'v1-city-presence', new_sqlite_classes: ['CityPresence'] }] };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function productionKeyProblems(config) {
  const problems = [];
  for (const key of Object.keys(config ?? {})) {
    if (key === 'env' || key === 'unsafe') problems.push(`${key} must not exist on production.`);
    else if (!allowedKeys.includes(key) && !isEmptyDeep(config[key])) problems.push(`${key} is not allowed on production (only an empty binding list may be present).`);
  }
  for (const [key, expected] of Object.entries(pinned)) if (key in (config ?? {}) && !same(config[key], expected)) problems.push(`${key} must be exactly the approved value.`);
  const triggers = config?.triggers ?? {};
  if (Object.keys(triggers).some(k => k !== 'crons') || (triggers.crons && !same(triggers.crons, ['*/15 * * * *']))) problems.push('triggers may only be the one approved cron.');
  if (config?.main !== undefined && !['./worker/entry.ts', 'index.js'].includes(config.main)) problems.push('main must be the Worker entry or the built index.js.');
  if (config?.assets && (Object.keys(config.assets).some(k => k !== 'directory') || typeof config.assets.directory !== 'string')) problems.push('assets may only carry a directory.');
  return problems;
}

/** #501c: refuse any production config (the checked-in wrangler.prod.jsonc or the built dist/server/wrangler.json) that is not exactly the inactive-by-default production shape. Collects every problem, names only. */
export function productionConfigProblems(config) {
  const problems = [], vars = config?.vars ?? {};
  if (config?.name !== productionTarget.worker) problems.push(`Worker name must be ${productionTarget.worker}.`);
  if (config?.account_id !== productionTarget.accountId) problems.push('Cloudflare account id is not the approved account.');
  problems.push(...productionKeyProblems(config));
  if (config?.workers_dev !== false || config?.preview_urls !== false) problems.push('workers_dev and preview_urls must be false.');
  const routes = [...(config?.routes ?? []), ...(config?.route ? [config.route] : [])];
  if (routes.length > 1 || routes.some(route => typeof route !== 'object' || route.pattern !== productionTarget.hostname || route.custom_domain !== true)) problems.push(`The only allowed route is the custom domain ${productionTarget.hostname}.`);
  const hyperdrive = config?.hyperdrive ?? [];
  if (hyperdrive.length !== 1 || hyperdrive[0].binding !== 'HYPERDRIVE') problems.push('Exactly one HYPERDRIVE binding is required.');
  else { const bad = hyperdriveIdProblem(hyperdrive[0].id); if (bad) problems.push(bad); if (Object.keys(hyperdrive[0]).some(k => !['binding', 'id'].includes(k))) problems.push('The Hyperdrive binding must carry only binding and id.'); }
  for (const name of forbiddenVars) if (name in vars) problems.push(`${name} must not exist on production.`);
  for (const [name, expected] of Object.entries(requiredVars)) if (typeof vars[name] !== 'string' || (expected instanceof RegExp ? !expected.test(vars[name]) : vars[name] !== expected)) problems.push(`${name} is missing or has the wrong value.`);
  for (const [name, value] of Object.entries(vars)) {
    if (name in operatorVars) { if (typeof value !== 'string' || !operatorVars[name].test(value)) problems.push(`${name} must be "", "all" or a comma list of ${name === 'HARIMU_AI_MUTED_PERSONAS' ? 'persona' : 'nation'} ids on production.`); }
    else if (!(name in requiredVars) && value !== 'false') problems.push(`${name} must be "false" on production.`);
    if (/SECRET|TOKEN|PASSWORD|ADMIN_URL|PRIVATE/.test(name) || /^(sk_|postgres(ql)?:\/\/)/.test(String(value))) problems.push(`${name} looks like a secret and must not be in the config.`);
  }
  return problems;
}
/** #501c gate (QA3): refuse to deploy while production would keep the unbounded write journal. Reads the source text, so it holds for the code that is actually being shipped. */
export function productionJournalProblems(storageSource = readFileSync('lib/storage-selection.ts', 'utf8'), dbSource = readFileSync('lib/db.ts', 'utf8')) {
  const problems = [];
  if (!/export const productionKeepsWriteJournal\s*=\s*false\s*;/.test(storageSource)) problems.push('Production would keep the unbounded write journal: productionKeepsWriteJournal must be false until a pruned journal is approved.');
  if (!/accountElectionEnabled\(bindings\),bindings\.HARIMU_PRODUCTION_STORAGE!=='true'\|\|productionKeepsWriteJournal\)/.test(dbSource)) problems.push('lib/db.ts no longer passes the production journal switch to the Postgres connection.');
  return problems;
}
export function assertProductionConfig(config, options) {
  const problems = productionConfigProblems(config, options);
  if (problems.length) throw new Error(`Production config refused:\n- ${problems.join('\n- ')}`);
  return config;
}
