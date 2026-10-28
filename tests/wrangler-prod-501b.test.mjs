/** #501 slice b: wrangler.prod.jsonc is the inactive production Worker config. This drift guard keeps it in sync with wrangler.jsonc except for the intentional differences listed here,
 *  so a new preview flag or binding cannot be forgotten or default on in production. Nothing reads the file yet; the Hyperdrive id is a placeholder until Patrick creates the config. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { assertPostgresApplicationRole } from '../lib/storage-selection.ts';
import { bootstrapEmptyPostgres } from '../scripts/postgres-migrations.mjs';
import { hyperdriveIdProblem, productionWorker, readProductionConfigRaw, runtimeRoleGrantSql } from '../scripts/production-config.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = readProductionConfigRaw();
// Vars present in preview and deliberately absent in production.
const previewOnlyVars = ['NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'HARIMU_POSTGRES_TEMPORARY_ADMIN_APPROVED', 'HARIMU_QA_TEST_CITIZENS', 'HARIMU_POSTGRES_JOURNAL_RETENTION_APPROVED', 'HARIMU_KINDLE_CYCLE_START_AT']; // #501c; #878: the cycle start is preview-only (unset in production: calendars held): no journal in production
// Top-level keys present in preview and deliberately absent in production (preview-only observability, Patrick approved via PM).
const previewOnlyTopLevelKeys = ['d1_databases', 'observability'];
// Vars production adds, with their required values.
const productionOnlyVars = { HARIMU_PRODUCTION_STORAGE: 'true' };
// Vars present in both whose value intentionally differs.
// Feature flags the preview turns on for QA (the preview-flags-on change). Production keeps every one "false". Adding a flag here is a deliberate preview-only decision.
// Build-time UI flags (baked into the client bundle at build): on in preview, always "false" in production. Exactly these four.
const previewOnUiFlags = ['NEXT_PUBLIC_HARIMU_REALTIME_PRESENCE', 'NEXT_PUBLIC_HARIMU_NATION_SYMBOLS', 'NEXT_PUBLIC_HARIMU_UI_V2_CREST', 'NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM', 'NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR', 'NEXT_PUBLIC_HARIMU_UI_V2_PANEL', 'NEXT_PUBLIC_HARIMU_UI_V2_RAIL', 'NEXT_PUBLIC_HARIMU_UI_V2_WORLD', 'NEXT_PUBLIC_HARIMU_UI_V2_NATION', 'NEXT_PUBLIC_HARIMU_UI_V2_CITY', 'NEXT_PUBLIC_HARIMU_UI_V2_MOBILE', 'NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD', 'NEXT_PUBLIC_HARIMU_MOD_CONSOLE', 'NEXT_PUBLIC_HARIMU_NATION_SKIN', 'NEXT_PUBLIC_HARIMU_WIRE_BYLINES', 'NEXT_PUBLIC_HARIMU_RARE_MARKER'];
const previewOnFlags = [
  'HARIMU_KINDLE_ASSEMBLY_ENABLED', 'HARIMU_PRIMARIES_ENABLED', 'HARIMU_CANVASSING_ENABLED', 'HARIMU_TOWN_HALLS_ENABLED', 'HARIMU_DEBATE_ENABLED', 'HARIMU_CITY_FOUNDING_ENABLED', 'HARIMU_REALTIME_PRESENCE', // preview-flags-on (politics, founding, presence)
  'HARIMU_TEST_FAUCET_ENABLED',
  'HARIMU_LABOR_BUREAU_ENABLED',
  'HARIMU_GRAY_MARKET_ENABLED',
  'HARIMU_GRAY_DAILY_CAP_ENABLED', // #736
  'HARIMU_GRAY_SUSPICION_ENABLED', // #749
  'HARIMU_GRAY_SEIZURE_ENABLED', // #797
  'HARIMU_KORUND_MEDALS_ENABLED', // #737
  'HARIMU_KORUND_SHORTFALL_ENABLED', // #759
  'HARIMU_MARKET_FEE_ENABLED', // #777
  'HARIMU_HOME_CITY_MOVE_ENABLED', // #781
  'HARIMU_SAVINGS_SHIELD_ENABLED', // #824
  'HARIMU_KINDLE_SALES_TAX_ENABLED', // #844
  'HARIMU_MVP_JOB_TYPES_ENABLED', // #886
  'HARIMU_WALLET_STREET_RATE_ENABLED', // #758
  'HARIMU_KORUND_RATION_CUT_ENABLED', // #776
  'HARIMU_FAVOR_DECAY_ENABLED',
  'HARIMU_KINDLE_INCOME_TAX_ENABLED',
  'HARIMU_ORDER_BOOK_ENABLED',
  'HARIMU_MARKET_TICKER_ENABLED', // #459
  'HARIMU_AURELLE_RISING_ENABLED',
  'HARIMU_AURELLE_COUP_ENABLED',
  'HARIMU_AURELLE_CHARTERS_ENABLED',
  'HARIMU_TRAVEL_ENABLED',
  'HARIMU_KORUND_PRESIDIUM_ENABLED',
  'HARIMU_FAITH_ENABLED',
  'HARIMU_DIPLOMATIC_HALL_ENABLED',
  'HARIMU_MAP_OVERLAYS_ENABLED', // #82
  'HARIMU_CIVIC_RANK_ENABLED', // #741
  'HARIMU_ARMIES_ENABLED', // #738
  'HARIMU_RELIGIOUS_HARMONY_ENABLED', // #842
  'HARIMU_ARMY_DRILLS_ENABLED', // #738 slice 2
  'HARIMU_ARMY_MAP_ENABLED', // #738 slice 4
  'HARIMU_ARMY_SUPPLY_ENABLED', // #738 slice 5
  'HARIMU_ARMY_BATTLES_ENABLED', // #738 battles
  'HARIMU_I_VOTED_BADGE_ENABLED', // #782
  'HARIMU_KINDLE_POLLING_ENABLED', // #740
  'HARIMU_PLANK_VOTES_ENABLED', // #831
  'HARIMU_PARTY_DONATIONS_ENABLED', // #863
  'HARIMU_KINDLE_RALLIES_ENABLED', // #867
  'HARIMU_AI_RALLY_SPEECHES_ENABLED', // #876
  'HARIMU_CITY_CHAT_ENABLED', // #881
  'HARIMU_GLOBAL_CHAT_ENABLED', // #881 part 2
  'HARIMU_DM_CHAT_ENABLED', // #881 part 3
  'HARIMU_EMBASSY_CHAT_ENABLED', // #882
  'HARIMU_FOUNDING_PERIOD_ENABLED',
  'HARIMU_AURELLE_SUCCESSION_ENABLED',
  'HARIMU_WAR_ENABLED',
  'HARIMU_RELOCATION_SUPPORT_ENABLED',
  'HARIMU_WAR_WEARINESS_ENABLED',
  'HARIMU_WAR_WEARINESS_LOSSES_ENABLED',
  'HARIMU_WAR_DECLARATION_LIMITS_ENABLED',
  'HARIMU_WAR_ASSEMBLY_ENABLED',
  'HARIMU_WAR_LOSS_CAP_ENABLED', // #912
  'HARIMU_WAR_ENDINGS_ENABLED',
  'HARIMU_AI_REVIEW_QUEUE_ENABLED', // #753
  'HARIMU_REPORTS_ENABLED', // #743
  'HARIMU_DORMANCY_ENABLED', // #739
  'HARIMU_VOTE_BUYING_WATCH_ENABLED', // #825
  'HARIMU_RISK_SCORING_ENABLED', // #879
  'HARIMU_CLERK_RISK_SIGNALS_ENABLED', // #943
  'HARIMU_KINDLE_BUDGET_VIEW_ENABLED', // #789
  'HARIMU_DIPLOMACY_ENABLED',
  'HARIMU_EMBARGO_ENABLED',
  'HARIMU_TARGETED_SANCTIONS_ENABLED',
  'HARIMU_CROWN_DEBASEMENT_ENABLED',
  'HARIMU_SPARK_SUPPLY_ENABLED',
  'HARIMU_LEDGER_RECONCILIATION_ENABLED', 'HARIMU_AI_COST_DASHBOARD_ENABLED',
  'HARIMU_NATION_WORK_ENABLED', // #487
  'HARIMU_CONFLUENCE_ENABLED', // #487 (QA allowlist only)
  'HARIMU_NATION_READINESS_ENABLED', // #486
  // Workers AI flags (capped by HARIMU_AI_DAILY_BUDGET_MICRO, which stays at its current value).
  'HARIMU_AI_NEWS_ENABLED',
  'HARIMU_NOTABLES_ENABLED',
  'HARIMU_AI_CABINET_RESPONSES_ENABLED',
  'HARIMU_AI_TOWN_HALL_ANSWERS_ENABLED',
  'HARIMU_AI_DEBATE_ANSWERS_ENABLED',
  ...previewOnUiFlags,
];
// Flags that stay "false" in preview on purpose: Decision 111 exchange, QA1's square-purchase objection, the unset-secret (fail-closed) flags, and the PoCs or scaffolding listed in the PR.
const previewOffFlags = ['HARIMU_TESSERA_EXCHANGE_ENABLED', 'HARIMU_SQUARE_PURCHASE_ENABLED', 'HARIMU_TESSERA_REWARDS_ENABLED', 'HARIMU_MERIDIAN_ENABLED', 'HARIMU_ILMAR_ENABLED', 'HARIMU_HOARVALE_ENABLED', 'HARIMU_VARKAND_ENABLED', 'HARIMU_VELDWOOD_ENABLED', 'HARIMU_FULMARA_ENABLED'];
const differingVars = { HARIMU_ACCOUNT_ELECTION_POC_ENABLED: ['true', 'false'], HARIMU_AI_GATEWAY_ID: ['harimu-preview', 'harimu-production'], ...Object.fromEntries(previewOnFlags.map(name => [name, ['true', 'false']])) };
// The only non-"false" values production may carry.
const nonFalse = { HARIMU_STORAGE_BACKEND: 'postgres', HARIMU_AI_GATEWAY_ID: 'harimu-production', HARIMU_POSTGRES_CUTOVER_READY: 'true', HARIMU_AI_DAILY_BUDGET_MICRO: preview.vars.HARIMU_AI_DAILY_BUDGET_MICRO, HARIMU_AI_TEMPLATES_ONLY: '', HARIMU_AI_MUTED_PERSONAS: '', HARIMU_CHAT_SHADOW_MUTE: '' /* #790 operator list, empty */, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: preview.vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, ...productionOnlyVars };

test('wrangler.prod.jsonc has only full-line // comments (the #633 rule) and parses', () => {
  const offenders = readFileSync('wrangler.prod.jsonc', 'utf8').split('\n').map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => !/^\s*\/\//.test(line)).filter(({ line }) => /\/\/|\/\*|\*\//.test(line.replace(/"(?:[^"\\]|\\.)*"/g, '""')))
    .map(({ line, number }) => `${number}: ${line.trim().slice(0, 80)}`);
  assert.deepEqual(offenders, [], 'move each comment to its own full line');
  assert.equal(prod.name, productionWorker);
});

test('identity and bindings: own Worker, same account and runtime shape, no D1, no route, no workers.dev', () => {
  assert.notEqual(prod.name, preview.name); assert.equal(prod.account_id, preview.account_id, 'same Cloudflare account (Patrick ruling 3)');
  for (const key of ['main', 'compatibility_date', 'compatibility_flags', 'placement', 'triggers', 'ai', 'durable_objects', 'migrations']) assert.deepEqual(prod[key], preview[key], key);
  for (const key of ['d1_databases', 'routes', 'route', 'kv_namespaces', 'r2_buckets', 'services', 'queues', 'tail_consumers', 'env']) assert.equal(prod[key], undefined, `${key} must not exist on production yet`);
  assert.equal(prod.workers_dev, false); assert.equal(prod.preview_urls, false);
  assert.deepEqual(Object.keys(prod).sort(), Object.keys(preview).filter(key => !previewOnlyTopLevelKeys.includes(key)).sort(), 'no top-level key beyond the preview set (minus the preview-only keys)');
});

test('observability: on in preview only; production carries no observability block', () => {
  assert.deepEqual(preview.observability, { enabled: true, logs: { invocation_logs: false } }, 'invocation logs (which capture request headers, e.g. Cookie/Authorization) must stay off; console logs stay on');
  assert.strictEqual(preview.observability.logs.invocation_logs, false);
  assert.equal(prod.observability, undefined, 'production stays unchanged');
  assert.equal(previewOnlyTopLevelKeys.every(key => key in preview), true, 'every listed preview-only key exists in preview');
});

test('vars: same names as preview except the listed differences; every flag false; no preview-only or secret-looking var', () => {
  const previewNames = Object.keys(preview.vars), prodNames = Object.keys(prod.vars);
  assert.deepEqual(prodNames.filter(n => !previewNames.includes(n)).sort(), Object.keys(productionOnlyVars).sort());
  assert.deepEqual(previewNames.filter(n => !prodNames.includes(n)).sort(), [...previewOnlyVars].sort());
  for (const name of ['NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'HARIMU_QA_TEST_CITIZENS', 'HARIMU_QA_TEST_CITIZEN_IDS', 'HARIMU_POSTGRES_TEMPORARY_ADMIN_APPROVED', 'HARIMU_AI_PRICE_REVIEWED_UNTIL', 'HARIMU_POSTGRES_JOURNAL_RETENTION_APPROVED']) assert.equal(name in prod.vars, false, name);
  for (const [name, value] of Object.entries(prod.vars)) {
    if (name in differingVars) assert.equal(value, differingVars[name][1], name);
    else if (name in productionOnlyVars) assert.equal(value, productionOnlyVars[name], name);
    else assert.equal(value, preview.vars[name], `${name} must equal preview unless listed in differingVars`);
    if (name in nonFalse) assert.equal(value, nonFalse[name], name); else assert.equal(value, 'false', `${name} must be "false" on production`);
    assert.ok(!/SECRET|TOKEN|PASSWORD|ADMIN_URL|PRIVATE/.test(name), `${name} looks like a secret name`);
    assert.ok(!/^(sk_|postgres(ql)?:\/\/)/.test(value), `${name} looks like a secret value`);
  }
  const flags = config => Object.keys(config.vars).filter(n => /_ENABLED$/.test(n)).sort();
  assert.deepEqual(flags(prod), flags(preview), 'the *_ENABLED flag set equals preview, so a new flag cannot be forgotten');
  assert.ok(flags(prod).length > 40); for (const flag of flags(prod)) assert.equal(prod.vars[flag], 'false', flag);
  assert.equal(prod.vars.HARIMU_STORAGE_MAINTENANCE, 'false');
  assert.strictEqual(prod.vars.HARIMU_PRODUCTION_STORAGE, 'true', 'exactly "true": TRUE, 1 or "" silently take the old (non-production) path in selectStorageBackend');
});

test('preview flags: exactly the previewOnFlags are "true", the deliberate exceptions stay "false", and production is "false" for every one', () => {
  const flags = config => Object.keys(config.vars).filter(n => /_ENABLED$/.test(n) || previewOnUiFlags.includes(n) || previewOnFlags.includes(n));
  const previewTrue = flags(preview).filter(n => preview.vars[n] === 'true').sort();
  assert.deepEqual(previewTrue, [...previewOnFlags, 'HARIMU_ACCOUNT_ELECTION_POC_ENABLED'].sort(), 'a new "true" preview flag must be added to previewOnFlags on purpose');
  for (const name of previewOffFlags) assert.equal(preview.vars[name], 'false', `${name} must stay "false" in preview`);
  for (const name of [...previewOnFlags, ...previewOffFlags]) assert.equal(prod.vars[name], 'false', `${name} must be "false" in production`);
  assert.equal(preview.vars.HARIMU_QA_TEST_CITIZENS, 'false'); assert.equal(preview.vars.HARIMU_QA_TEST_CITIZEN_IDS, undefined);
  assert.equal(preview.vars.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW, 'true', 'the test faucet needs the preview marker too');
  for (const name of previewOnFlags) assert.ok(name in preview.vars, name);
  for (const name of previewOnUiFlags) { assert.equal(preview.vars[name], 'true', `${name} preview`); assert.equal(prod.vars[name], 'false', `${name} production`); } // the production allowlist (nonFalse) never lists them
});

test('flag comments copied into wrangler.prod.jsonc equal the preview comments (they cannot drift unnoticed)', () => {
  const commentsByVar = text => { const map = {}; let buffer = []; for (const line of text.split('\n')) { const t = line.trim(), name = /^"([A-Z0-9_]+)":/.exec(t)?.[1]; if (t.startsWith('//')) buffer.push(t); else { if (name) map[name] = buffer.join('\n'); buffer = []; } } return map; };
  const previewComments = commentsByVar(readFileSync('wrangler.jsonc', 'utf8')), prodComments = commentsByVar(readFileSync('wrangler.prod.jsonc', 'utf8'));
  const shared = Object.keys(prod.vars).filter(name => name in preview.vars && previewComments[name]);
  assert.ok(shared.length > 15, 'most flags carry a comment');
  for (const name of shared) assert.equal(prodComments[name], previewComments[name], `${name}: the comment above it differs from wrangler.jsonc; copy it again`);
});

test('Hyperdrive: one binding, id only (no connection string), checked-in id is a detected placeholder', () => {
  assert.equal(prod.hyperdrive.length, 1); assert.deepEqual(Object.keys(prod.hyperdrive[0]).sort(), ['binding', 'id']); assert.equal(prod.hyperdrive[0].binding, 'HYPERDRIVE');
  const previewId = preview.hyperdrive[0].id;
  assert.match(hyperdriveIdProblem(prod.hyperdrive[0].id), /placeholder/, 'slice c must refuse to deploy with this id');
  assert.match(prod.hyperdrive[0].id, /^PLACEHOLDER/);
  assert.equal(hyperdriveIdProblem('0123456789abcdef0123456789abcdef'), null, 'a real-looking id is accepted');
  assert.equal(hyperdriveIdProblem(previewId), null, 'Patrick Oct 15: production may share preview\'s Hyperdrive config for now (a config value only)');
  for (const bad of [undefined, null, '', 'PLACEHOLDER-production-hyperdrive-config-id', 'A1F662C88F3B485190C402D9548AE360', 'abc123', 'a1f662c88f3b485190c402d9548ae36', 'a1f662c88f3b485190c402d9548ae360 ', 42]) assert.match(hyperdriveIdProblem(bad), /placeholder or not a valid/, String(bad));
  assert.doesNotMatch(readFileSync('wrangler.prod.jsonc', 'utf8'), /postgres(ql)?:\/\/|connectionString|localConnectionString/i);
});

test('the preview config is untouched by production: it never gains the production switch or a production name', () => {
  assert.equal(preview.vars.HARIMU_PRODUCTION_STORAGE, undefined); assert.equal(preview.name, 'harimu-preview'); assert.equal(preview.vars.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW, 'true');
});

test('QA3 on #641: the CLI refuses --fresh-world without --bootstrap-empty before it connects; bootstrap re-checks emptiness after BEGIN', async () => {
  const run = args => spawnSync(process.execPath, ['scripts/apply-postgres-migrations.mjs', ...args], { env: { PATH: process.env.PATH, PREVIEW_DATABASE_ADMIN_URL: 'postgres://nobody@127.0.0.1:1/none' }, encoding: 'utf8', timeout: 20000 });
  for (const args of [['--fresh-world'], ['--fresh-world', '--dry-run']]) { const result = run(args); assert.equal(result.status, 1); assert.match(result.stderr, /--fresh-world only works with --bootstrap-empty/); assert.doesNotMatch(result.stderr, /connection/i); }
  const pg = new PGlite(); await pg.waitReady;
  const racing = { query: (t, p) => pg.query(t, p), exec: async t => { if (t === 'BEGIN') await pg.exec('CREATE TABLE late_stray(id int)'); return pg.exec(t); } }; // a table appears between the first check and BEGIN
  await assert.rejects(bootstrapEmptyPostgres(racing, { freshWorld: true }), /refuses: schema public already has 1 table/);
  assert.deepEqual((await pg.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r => r.tablename), ['late_stray'], 'nothing was bootstrapped over it');
  assert.equal((await pg.query('SELECT pg_try_advisory_lock(1191280) AS ok')).rows[0].ok, true, 'lock released'); await pg.close();
});

test('QA3 on #641: the runtime role grants, applied on a real Postgres (PGlite) after the fresh-world bootstrap, satisfy the startup role check and the Worker queries work', async () => {
  const pg = new PGlite(); await pg.waitReady; const db = { query: (t, p) => pg.query(t, p), exec: t => pg.exec(t) };
  await bootstrapEmptyPostgres(db, { freshWorld: true }); await pg.exec('CREATE ROLE harimu_runtime NOLOGIN; CREATE ROLE bad_runtime NOLOGIN');
  for (const sql of runtimeRoleGrantSql('harimu_runtime')) await pg.exec(sql);
  const check = async role => { await pg.exec(`SET ROLE ${role}`); try { return (await pg.query("SELECT has_schema_privilege(current_user,'public','CREATE')::int AS can_create_schema,has_any_column_privilege(current_user,'harimu_storage_migrations','UPDATE')::int AS can_change_marker,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user)::int AS superuser")).rows[0]; } finally { await pg.exec('RESET ROLE'); } };
  const good = await check('harimu_runtime'); assert.deepEqual(good, { can_create_schema: 0, can_change_marker: 0, superuser: 0 });
  assertPostgresApplicationRole({ canCreateSchema: good.can_create_schema, canChangeMarker: good.can_change_marker, superuser: good.superuser });
  await pg.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO bad_runtime; GRANT CREATE ON SCHEMA public TO bad_runtime'); // what a blanket write role would allow
  const bad = await check('bad_runtime'); assert.throws(() => assertPostgresApplicationRole({ canCreateSchema: bad.can_create_schema, canChangeMarker: bad.can_change_marker, superuser: bad.superuser }));
  await pg.exec('SET ROLE harimu_runtime');
  try {
    assert.equal((await pg.query("SELECT id FROM harimu_storage_migrations WHERE id='fresh-world-v1'")).rows.length, 1);
    assert.equal((await pg.query("SELECT harimu_compat.json_valid('{}') AS ok")).rows[0].ok, true);
    await pg.exec('UPDATE citizens SET capacity=capacity WHERE false'); await pg.exec('DELETE FROM citizens WHERE false'); assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM citizens')).rows[0].n, 0); // read and write on the game tables
    await assert.rejects(pg.exec("UPDATE harimu_storage_migrations SET validated=0"), /permission denied/);
    await assert.rejects(pg.exec('CREATE TABLE runtime_made_this(id int)'), /permission denied/);
  } finally { await pg.exec('RESET ROLE'); }
  assert.throws(() => runtimeRoleGrantSql('Bad Role; DROP'), /lowercase role name/);
  await pg.close();
});

test('#742: the AI kill switch HARIMU_AI_TEMPLATES_ONLY is present and "" (off) in both files', () => {
  assert.equal(preview.vars.HARIMU_AI_TEMPLATES_ONLY, '');
  assert.equal(prod.vars.HARIMU_AI_TEMPLATES_ONLY, '');
});

test('#764: the per-persona mute HARIMU_AI_MUTED_PERSONAS is present and "" (off) in both files', () => {
  assert.equal(preview.vars.HARIMU_AI_MUTED_PERSONAS, '');
  assert.equal(prod.vars.HARIMU_AI_MUTED_PERSONAS, '');
});

test('#790: the production guard and the runtime parser share one HARIMU_CHAT_SHADOW_MUTE rule (id@mute[..unmute] entries, cap 90, D1 bound-parameter limit)', async () => {
  const { shadowMuteListProblem, parseShadowMute, SHADOW_MUTE_MAX_IDS } = await import('../lib/chat-shadow-mute.ts');
  assert.equal(SHADOW_MUTE_MAX_IDS, 90);
  assert.match(readFileSync('scripts/production-config.mjs', 'utf8'), /import \{ shadowMuteListProblem \} from '\.\.\/lib\/chat-shadow-mute\.ts'/);
  const list = n => Array.from({ length: n }, (_, i) => `user_${i}@2026-10-23T07:00:00Z`).join(',');
  const refused = ['all', 'ALL', 'true', 'false', 'alice', 'alice@bad', list(91), 'alice@2026-10-23T08:00:00Z..2026-10-23T07:00:00Z', 'alice@2026-10-23T07:00:00Z,alice@2026-10-23T08:00:00Z'];
  for (const value of [...refused, '', 'alice@2026-10-23T07:00:00Z', 'alice@2026-10-23T07:00:00Z..2026-10-23T08:00:00Z,alice@2026-10-23T09:00:00Z', list(90)]) {
    const isRefused = shadowMuteListProblem(value) !== null;
    assert.equal(isRefused, refused.includes(value), String(value).slice(0, 12));
    assert.equal(parseShadowMute(value, () => {}).size, isRefused || value === '' ? 0 : new Set(value.split(',').map(e => e.split('@')[0])).size, 'runtime agrees');
  }
  assert.equal(prod.vars.HARIMU_CHAT_SHADOW_MUTE, '', 'checked-in production value is empty');
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).engines.node, '>=22.18.0', 'scripts import lib .ts: Node with type stripping on by default');
});
