/** #501 slice d: the manual production workflow, rollback, smoke checks, the built-config key allowlist, the clean build environment, and QA3's #644 gaps. Nothing here calls Cloudflare, PlanetScale or Clerk (spawn and fetch are injected). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { productionConfigProblems, productionKeyProblems, readProductionConfigRaw } from '../scripts/production-config.mjs';
import { main as deployMain, productionDeployProblems, productionRollbackArgs } from '../scripts/deploy-production.mjs';
import { buildProduction, productionBuildEnv } from '../scripts/build-production.mjs';
import { smokeBase, smokeProblems } from '../scripts/smoke-production.mjs';

const workflow = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), realId = '0123456789abcdef0123456789abcdef', version = '0b3f9c52-1a2d-4e0b-9a77-6c1d2e3f4a5b';
const good = (change = c => c) => { const c = structuredClone(readProductionConfigRaw()); c.hyperdrive[0].id = realId; change(c); return c; };
const steps = workflow.split(/\n      - /).slice(1), step = name => steps.find(s => s.includes(`name: ${name}`)) ?? assert.fail(name);

test('workflow is manual only, main only, behind the production environment, and dry-run by default', () => {
  const on = workflow.slice(workflow.indexOf('\non:\n'), workflow.indexOf('\nconcurrency:'));
  assert.deepEqual([...on.matchAll(/^ {2}(\w+):/gm)].map(m => m[1]), ['workflow_dispatch'], 'the only trigger');
  assert.match(workflow, /environment: production\n/); assert.match(workflow, /if: >-\n\s+github\.ref == 'refs\/heads\/main' &&\n\s+github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /dry_run:\n[^]*?type: boolean\n\s+default: true/); assert.match(workflow, /backup_confirmed:\n[^]*?default: false/); assert.match(workflow, /rollback_version:\n/); assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /permissions:\n\s+contents: read/); assert.doesNotMatch(workflow, /--keep-vars|secrets: inherit/);
});

test('workflow: every step that changes anything is gated on dry_run == false, secrets reach only the steps that need them, inputs never enter shell text', () => {
  for (const name of ['Roll back the Worker', 'Refuse a real deploy without the backup confirmation', 'Apply pending Postgres migrations', 'Build production', 'Deploy production', 'Smoke checks']) assert.match(step(name), /if: inputs\.dry_run == false/, name);
  assert.match(step('Dry run'), /--dry-run/); assert.doesNotMatch(step('Dry run'), /secrets\./);
  assert.doesNotMatch(step('Build production'), /secrets\./); assert.doesNotMatch(step('Smoke checks'), /secrets\./); assert.doesNotMatch(step('Check'), /secrets\./);
  assert.doesNotMatch(step('Roll back the Worker'), /DATABASE_ADMIN_URL/, 'a rollback needs no database');
  for (const name of ['Build production', 'Deploy production']) assert.match(step(name), /rollback_version == ''/);
  assert.match(step('Roll back'), /rollback_version != ''/);
  assert.match(step('Refuse a real deploy'), /backup_confirmed != true/);
  assert.ok(workflow.indexOf('- name: Apply pending Postgres migrations') < workflow.indexOf('- name: Deploy production') && workflow.indexOf('- name: Deploy production') < workflow.indexOf('- name: Smoke checks\n'));
  for (const s of steps) for (const line of (s.match(/run: \|?\n?([^]*?)(?=\n {6,8}\w+:|$)/)?.[1] ?? '').split('\n')) assert.doesNotMatch(line, /\$\{\{/, 'inputs reach shell only through env variables');
  assert.match(workflow, /Smoke checks FAILED: roll back/);
});

test('rollback: validated version id, dry run spawns nothing, a real run needs main in Actions and Cloudflare inputs but no database, no build and no config assertion', async () => {
  const ok = { HARIMU_DEPLOY_ENVIRONMENT: 'production' }, found = (argv, env) => productionDeployProblems({ argv, env, head }).join('\n');
  assert.equal(found([`--rollback=${version}`, '--dry-run'], ok), ''); assert.match(found(['--rollback=latest', '--dry-run'], ok), /--rollback=.*invalid/); assert.match(found([`--rollback=${version}; rm`, '--dry-run'], ok), /invalid/);
  assert.match(found([`--rollback=${version}`], ok), /refs\/heads\/main[^]*CLOUDFLARE_API_TOKEN is not set/); assert.doesNotMatch(found([`--rollback=${version}`], ok), /ADMIN_URL|qa2-go-sha/);
  const run = { ...ok, GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: readProductionConfigRaw().account_id };
  assert.equal(found([`--rollback=${version}`], run), ''); assert.match(found([`--rollback=${version}`], { ...run, HARIMU_DEPLOY_ENVIRONMENT: '' }), /HARIMU_DEPLOY_ENVIRONMENT/);
  // #486: a real rollback first reads the target version's commit tag and checks the floor (git), then rolls back
  const tagged = JSON.stringify({ annotations: { 'workers/tag': 'a'.repeat(40) } });
  const calls = [], spawn = (cmd, args, options) => { calls.push({ cmd, args, options }); return { status: 0, stdout: args[0] === 'versions' ? tagged : '' }; };
  assert.equal(await deployMain([`--rollback=${version}`, '--dry-run'], ok, { spawn }), 0); assert.equal(calls.length, 0, 'a dry run spawns nothing');
  assert.equal(await deployMain([`--rollback=${version}`], run, { spawn }), 0); assert.equal(calls.length, 3); calls.splice(0, 2);
  assert.deepEqual(calls[0].args, productionRollbackArgs(version)); assert.deepEqual(calls[0].args.slice(0, 4), ['rollback', version, '--name', 'harimu-production']); assert.ok(calls[0].args.includes('wrangler.prod.jsonc'));
  await assert.rejects(deployMain([`--rollback=${version}`], { ...run, GITHUB_REF: 'refs/heads/dev' }, { spawn }), /only from refs\/heads\/main/); assert.equal(calls.length, 1);
});

test('smoke checks: read-only GETs against the one production host, sha must match the deployed commit, failures are reported, and the network is never used', async () => {
  const respond = (overrides = {}) => async url => { const path = new URL(url).pathname; if (path in overrides) { const v = overrides[path]; if (v instanceof Error) throw v; return v; } return Response.json(path === '/api/version' ? { sha: head } : { nations: [{ id: 'aurelle' }] }); };
  const seen = []; const spy = f => async (url, options) => { seen.push([url, options?.method]); return f(url, options); };
  assert.deepEqual(await smokeProblems(head, spy(respond())), []); assert.deepEqual(seen.map(s => s[0]), [`${smokeBase}/`, `${smokeBase}/api/version`, `${smokeBase}/api/world`]); assert.ok(seen.every(s => s[0].startsWith('https://app.harimu.com/') && s[1] === undefined), 'GET only, one host');
  assert.match((await smokeProblems('a'.repeat(40), respond())).join(), /not the deployed commit/); assert.deepEqual(await smokeProblems('any', respond()), []);
  assert.match((await smokeProblems(head, respond({ '/api/world': new Response('x', { status: 500 }) }))).join(), /\/api\/world: status 500/);
  assert.match((await smokeProblems(head, respond({ '/api/world': Response.json({}) }))).join(), /no nations/); assert.match((await smokeProblems(head, respond({ '/': new Response('', { status: 302 }) }))).join(), /\/: status 302/);
  assert.match((await smokeProblems(head, respond({ '/api/version': new Error('down') }))).join(), /request failed/);
  await assert.rejects(smokeProblems(head, respond(), 'https://harimu-preview.example.workers.dev'), /only against https:\/\/app\.harimu\.com/); await assert.rejects(smokeProblems('abc', respond()), /40 hex/);
});

test('built-config key allowlist (QA3): unknown or non-empty binding blocks, env, unsafe and altered pinned blocks are refused; wrangler\'s empty defaults are not', () => {
  const builtLike = good(c => { Object.assign(c, { configPath: '/w/wrangler.prod.jsonc', userConfigPath: '/w/wrangler.prod.jsonc', topLevelName: 'harimu-production', definedEnvironments: [], rules: [{ type: 'ESModule', globs: ['**/*.js'] }], main: 'index.js', assets: { directory: '../client' }, triggers: {},
    workflows: [], kv_namespaces: [], d1_databases: [], r2_buckets: [], queues: { producers: [], consumers: [] }, services: [], vectorize: [], logfwdr: { bindings: [] }, unsafe_hello_world: [], dev: { ip: 'localhost' }, no_bundle: true }); });
  assert.deepEqual(productionConfigProblems(builtLike), []); assert.deepEqual(productionKeyProblems(good()), []);
  const refused = (change, pattern) => assert.match(productionConfigProblems(good(change)).join('\n'), pattern);
  refused(c => { c.env = {}; }, /env must not exist/); refused(c => { c.unsafe = {}; }, /unsafe must not exist/); refused(c => { c.unsafe = { bindings: [{ name: 'X' }] }; }, /unsafe must not exist/);
  refused(c => { c.r2_buckets = { BUCKET: { bucket_name: 'x' } }; }, /r2_buckets is not allowed/); refused(c => { c.r2_buckets = [{ binding: 'B', bucket_name: 'x' }]; }, /r2_buckets is not allowed/);
  refused(c => { c.queues = { producers: [{ binding: 'Q', queue: 'q' }], consumers: [] }; }, /queues is not allowed/); refused(c => { c.vpc_services = [{ binding: 'V' }]; }, /vpc_services is not allowed/); refused(c => { c.some_future_binding = { a: 1 }; }, /some_future_binding is not allowed/);
  refused(c => { c.durable_objects.bindings.push({ name: 'OTHER', class_name: 'Other' }); }, /durable_objects must be exactly/); refused(c => { c.migrations.push({ tag: 'v2', deleted_classes: ['CityPresence'] }); }, /migrations must be exactly/);
  refused(c => { c.ai = { binding: 'AI', staging: true }; }, /ai must be exactly/); refused(c => { c.placement = { region: 'aws:eu-west-1' }; }, /placement must be exactly/); refused(c => { c.compatibility_flags.push('experimental'); }, /compatibility_flags must be exactly/);
  refused(c => { c.triggers.crons = ['* * * * *']; }, /triggers may only be the one approved cron/); refused(c => { c.triggers.workflows = []; }, /triggers may only/); refused(c => { c.main = 'evil.js'; }, /main must be/); refused(c => { c.assets = { directory: '../client', binding: 'ASSETS' }; }, /assets may only carry a directory/);
});

test('build runs in a clean environment (QA3), and build-production asserts the config before spawning anything', () => {
  const ambient = { PATH: '/bin', HOME: '/h', GITHUB_SHA: head, CLOUDFLARE_API_TOKEN: 'secret-token', CLOUDFLARE_ACCOUNT_ID: 'acct', PREVIEW_DATABASE_ADMIN_URL: 'postgres://u', HARIMU_ADMIN_TOKEN: 'x', HARIMU_QA_TEST_CITIZENS: 'true', NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_WAR_ENABLED: 'true' };
  const env = productionBuildEnv(good(), ambient);
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'PREVIEW_DATABASE_ADMIN_URL', 'HARIMU_ADMIN_TOKEN', 'HARIMU_QA_TEST_CITIZENS', 'NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW']) assert.equal(env[name], undefined, name);
  assert.equal(env.PATH, '/bin'); assert.equal(env.GITHUB_SHA, head, 'the build stamp still works'); assert.equal(env.HARIMU_WAR_ENABLED, 'false', 'config vars win over ambient flags'); assert.equal(env.HARIMU_PRODUCTION_STORAGE, 'true');
  const calls = [], spawn = (cmd, args, options) => { calls.push({ cmd, args, options }); return { status: 0 }; };
  assert.throws(() => buildProduction({}, { spawn, readConfig: () => good() }), /HARIMU_DEPLOY_ENVIRONMENT=production is required/);
  assert.throws(() => buildProduction({ HARIMU_DEPLOY_ENVIRONMENT: 'production' }, { spawn }), /Production config refused[^]*placeholder/, 'the checked-in placeholder config is asserted, not built');
  assert.throws(() => buildProduction({ HARIMU_DEPLOY_ENVIRONMENT: 'production' }, { spawn, readConfig: () => good(c => { c.vars.HARIMU_WAR_ENABLED = 'true'; }) }), /Production config refused/); assert.equal(calls.length, 0, 'nothing is spawned when the assertion fails');
  assert.equal(buildProduction({ ...ambient, HARIMU_DEPLOY_ENVIRONMENT: 'production' }, { spawn, readConfig: () => good() }), 0); assert.deepEqual(calls[0].args, ['build']); assert.equal(calls[0].options.env.CLOUDFLARE_API_TOKEN, undefined);
});

test('QA3 #644 gaps: main() runs the journal gate, and the driver keeps the journal on unless production turns it off', async () => {
  const base = { HARIMU_DEPLOY_ENVIRONMENT: 'production', PATH: process.env.PATH }, argv = [`--qa2-go-sha=${head}`, '--dry-run'];
  let gateCalls = 0;
  await assert.rejects(deployMain(argv, base, { journalProblems: () => { gateCalls++; return ['Production would keep the unbounded write journal: test.']; } }), /Production deploy refused:\n- Production would keep the unbounded write journal/); assert.equal(gateCalls, 1);
  await assert.rejects(deployMain(argv, base, { journalProblems: () => { gateCalls++; return []; } }), /Production config refused[^]*placeholder/, 'with the gate clean, the next refusal is the config assertion'); assert.equal(gateCalls, 2);
  assert.match(readFileSync('scripts/deploy-production.mjs', 'utf8'), /journalProblems\(\);[^]*assertProductionConfig\(readProductionConfigRaw\(\)\)/, 'gate runs before the config assertion');
  const driver = readFileSync('lib/postgres/driver.ts', 'utf8');
  assert.match(driver, /export function postgresConnection\([^)]*journal=true\)/, 'the driver default keeps the journal (preview unchanged)'); assert.match(driver, /\{journalRetentionApproved,allowAccountElectionWrites,journal\}/, 'the switch reaches PostgresDatabase');
});

test('#501e follow-up (QA2 on #647): the migrate step fails closed, actions are pinned by sha, smoke has timeouts and runs without secrets, the build precedes the database change', async () => {
  assert.doesNotMatch(workflow, /&&\s*secrets\.[A-Z_]+\s*\|\|/, 'no a && b || c fallback between admin secrets');
  const production = step('Apply pending Postgres migrations with the production admin secret'), preview = step('Apply pending Postgres migrations with preview');
  assert.match(production, /inputs\.database_url_env == 'PRODUCTION_DATABASE_ADMIN_URL'/); assert.match(production, /PREVIEW_DATABASE_ADMIN_URL: \$\{\{ secrets\.PRODUCTION_DATABASE_ADMIN_URL \}\}/); assert.doesNotMatch(production, /secrets\.PREVIEW_DATABASE_ADMIN_URL/, 'the production choice can never read preview\'s secret');
  assert.match(preview, /inputs\.database_url_env == 'PREVIEW_DATABASE_ADMIN_URL'/); assert.doesNotMatch(preview, /secrets\.PRODUCTION_DATABASE_ADMIN_URL/);
  for (const s of [production, preview]) { assert.match(s, /test -n "\$PREVIEW_DATABASE_ADMIN_URL" \|\| \{[^}]*exit 1; \}\n\s+npm run db:postgres:migrate/, 'an empty secret stops before the migrator'); assert.match(s, /inputs\.dry_run == false/); }
  const at = name => workflow.indexOf(`- name: ${name}`);
  assert.ok(at('Build production') < at('Apply pending Postgres migrations') && at('Refuse a real deploy') < at('Build production'), 'backup confirmation, then build, then the first database change');
  const uses = [...workflow.matchAll(/uses: (\S+)/g)].map(m => m[1]); assert.ok(uses.length >= 2);
  for (const use of uses) assert.match(use, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${use} is pinned by commit sha`);
  assert.match(workflow, /persist-credentials: false/); assert.match(workflow, /timeout-minutes: 45/);
  assert.match(step('Smoke checks after rollback'), /scripts\/smoke-production\.mjs --sha=any/); assert.doesNotMatch(step('Smoke checks after rollback'), /secrets\.|CLOUDFLARE_API_TOKEN/); assert.doesNotMatch(step('Roll back the Worker'), /smoke-production/);
  const source = readFileSync('scripts/smoke-production.mjs', 'utf8'); assert.match(source, /smokeTimeoutMs = 10_000/);
  let signal; await smokeProblems(head, async (url, options) => { signal ??= options.signal; return Response.json({ sha: head, nations: [] }); });
  assert.ok(signal instanceof AbortSignal, 'every smoke request carries a timeout signal');
});
