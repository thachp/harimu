/** #501 slice c: assertProductionConfig, the guarded (inactive) deploy and build scripts, the build config path, and the optional journal. Nothing here calls Cloudflare, PlanetScale or Clerk. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { aiTemplatesOnlyNations, assertProductionConfig, productionConfigProblems, sharesPreviewHyperdrive, productionJournalProblems, readProductionConfigRaw, wranglerConfigPath } from '../scripts/production-config.mjs';
import { databaseUrlEnv, productionDeployArgs, productionDeployProblems, main as deployMain } from '../scripts/deploy-production.mjs';
import { productionBuildEnv } from '../scripts/build-production.mjs';
import ts from 'typescript';

const checkedIn = readProductionConfigRaw(), realId = '0123456789abcdef0123456789abcdef';
const good = (change = c => c) => { const c = structuredClone(checkedIn); c.hyperdrive[0].id = realId; change(c); return c; };
const problems = change => productionConfigProblems(good(change));
const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

test('the checked-in production config fails only on the Hyperdrive placeholder; with a real id it is clean', () => {
  const found = productionConfigProblems(checkedIn); assert.equal(found.length, 1); assert.match(found[0], /placeholder/);
  assert.throws(() => assertProductionConfig(checkedIn), /Production config refused:\n- .*placeholder/);
  assert.deepEqual(problems(() => {}), []);
  const previewId = readFileSync('wrangler.jsonc', 'utf8').match(/"id": "([a-f0-9]{32})"/)[1];
  assert.deepEqual(problems(c => { c.hyperdrive[0].id = previewId; }), [], 'shared database (Patrick, Oct 15): preview\'s Hyperdrive id is accepted, it is only a config value');
  assert.equal(sharesPreviewHyperdrive(good(c => { c.hyperdrive[0].id = previewId; })), true); assert.equal(sharesPreviewHyperdrive(good()), false);
  assert.deepEqual(problems(c => { c.routes = [{ pattern: 'app.harimu.com', custom_domain: true }]; }), [], 'the one allowed route');
});

test('assertProductionConfig refuses each wrong shape, naming it', () => {
  const refuses = (change, pattern) => assert.match(problems(change).join('\n'), pattern);
  refuses(c => { c.name = 'harimu-preview'; }, /Worker name/); refuses(c => { c.account_id = 'f'.repeat(32); }, /account id/);
  refuses(c => { c.d1_databases = [{ binding: 'DB' }]; }, /d1_databases/); refuses(c => { c.workers_dev = true; }, /workers_dev/); refuses(c => { c.preview_urls = true; }, /preview_urls/);
  for (const route of [{ pattern: 'harimu.com', custom_domain: true }, { pattern: '*.harimu.com', custom_domain: true }, { pattern: 'app.harimu.com' }, 'app.harimu.com']) refuses(c => { c.routes = [route]; }, /only allowed route/);
  refuses(c => { c.routes = [{ pattern: 'app.harimu.com', custom_domain: true }, { pattern: 'www.harimu.com', custom_domain: true }]; }, /only allowed route/);
  refuses(c => { c.hyperdrive[0].id = checkedIn.hyperdrive[0].id; }, /placeholder/);
  refuses(c => { c.hyperdrive.push({ binding: 'OTHER', id: realId }); }, /Exactly one HYPERDRIVE/); refuses(c => { c.hyperdrive[0].localConnectionString = 'x'; }, /only binding and id/); refuses(c => { delete c.hyperdrive; }, /Exactly one HYPERDRIVE/);
  for (const name of ['NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'HARIMU_QA_TEST_CITIZENS', 'HARIMU_QA_TEST_CITIZEN_IDS', 'HARIMU_POSTGRES_TEMPORARY_ADMIN_APPROVED', 'HARIMU_AI_PRICE_REVIEWED_UNTIL', 'HARIMU_POSTGRES_JOURNAL_RETENTION_APPROVED']) refuses(c => { c.vars[name] = 'true'; }, new RegExp(`${name} must not exist`));
  for (const bad of [undefined, 'TRUE', 'false', '1', '']) refuses(c => { if (bad === undefined) delete c.vars.HARIMU_PRODUCTION_STORAGE; else c.vars.HARIMU_PRODUCTION_STORAGE = bad; }, /HARIMU_PRODUCTION_STORAGE is missing or has the wrong value/);
  refuses(c => { c.vars.HARIMU_STORAGE_BACKEND = 'd1'; }, /HARIMU_STORAGE_BACKEND/); refuses(c => { delete c.vars.HARIMU_POSTGRES_CUTOVER_READY; }, /CUTOVER_READY/); refuses(c => { c.vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_x'; }, /CLERK_PUBLISHABLE/);
  for (const flag of ['HARIMU_WAR_ENABLED', 'HARIMU_ACCOUNT_ELECTION_POC_ENABLED', 'HARIMU_REALTIME_PRESENCE', 'NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR', 'NEXT_PUBLIC_HARIMU_NATION_SYMBOLS', 'NEXT_PUBLIC_HARIMU_UI_V2_CREST', 'NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM', 'HARIMU_STORAGE_MAINTENANCE', 'HARIMU_NEW_UNLISTED_FLAG']) refuses(c => { c.vars[flag] = 'true'; }, new RegExp(`${flag} must be "false"`));
  refuses(c => { c.vars.HARIMU_WAR_ADMIN_SECRET = 'false'; }, /looks like a secret/); refuses(c => { c.vars.SOMETHING = 'postgres://u:p@h/db'; }, /looks like a secret/);
  const error = (() => { try { assertProductionConfig(good(c => { c.vars.HARIMU_WAR_ADMIN_SECRET = 'sekrit-value'; })); } catch (e) { return e.message; } })(); assert.doesNotMatch(error, /sekrit-value/, 'messages carry names, never values');
});

test('deploy-production refuses without explicit production env and approval inputs', async () => {
  const ok = { HARIMU_DEPLOY_ENVIRONMENT: 'production' }, run = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: checkedIn.account_id, PRODUCTION_DATABASE_ADMIN_URL: 'u' };
  const found = (argv, env) => productionDeployProblems({ argv, env, head }).join('\n'), sha = `--qa2-go-sha=${head}`;
  assert.match(found([], {}), /HARIMU_DEPLOY_ENVIRONMENT=production is required[^]*qa2-go-sha/);
  assert.match(found([sha], {}), /HARIMU_DEPLOY_ENVIRONMENT/); assert.match(found(['--qa2-go-sha=abc'], ok), /full 40 hex/); assert.match(found([`--qa2-go-sha=${'a'.repeat(40)}`], ok), /must equal the checked-out commit/);
  assert.match(found([sha], { ...ok, GITHUB_SHA: 'b'.repeat(40) }), /GITHUB_SHA does not match/); assert.equal(found([sha, '--dry-run'], ok), '', 'a dry run needs only the environment and the approved sha');
  assert.match(found([sha], ok), /refs\/heads\/main[^]*CLOUDFLARE_API_TOKEN is not set[^]*PRODUCTION_DATABASE_ADMIN_URL is not set/);
  assert.equal(databaseUrlEnv([]), 'PRODUCTION_DATABASE_ADMIN_URL'); assert.equal(found([sha, '--database-url-env=PREVIEW_DATABASE_ADMIN_URL'], { ...ok, ...run, PRODUCTION_DATABASE_ADMIN_URL: undefined, PREVIEW_DATABASE_ADMIN_URL: 'u' }), '', 'a shared database reuses preview\'s secret name');
  assert.match(found([sha, '--database-url-env=PREVIEW_DATABASE_ADMIN_URL'], { ...ok, ...run }), /PREVIEW_DATABASE_ADMIN_URL is not set/); assert.match(found([sha, '--database-url-env=HARIMU_ADMIN_TOKEN'], { ...ok, ...run }), /--database-url-env must be one of/);
  assert.match(found([sha], { ...ok, ...run, GITHUB_REF: 'refs/heads/dev' }), /only from refs\/heads\/main/); assert.match(found([sha], { ...ok, ...run, CLOUDFLARE_ACCOUNT_ID: 'x' }), /not the approved account/); assert.equal(found([sha], { ...ok, ...run }), '');
  await assert.rejects(deployMain([], { PATH: '' }), /Production deploy refused/);
  await assert.rejects(deployMain([sha, '--dry-run'], { ...ok, PATH: process.env.PATH }), /Production config refused[^]*placeholder/, 'even a dry run stops on the Hyperdrive placeholder');
  assert.deepEqual(productionDeployArgs(false), ['deploy', '--config', 'dist/server/wrangler.json']); assert.deepEqual(productionDeployArgs(false, 'b'.repeat(40)).slice(-2), ['--tag', 'b'.repeat(40)], '#486: tagged with its commit'); assert.ok(productionDeployArgs(true).includes('--dry-run')); assert.ok(!productionDeployArgs(false).includes('--keep-vars'));
  for (const script of ['deploy-production.mjs', 'build-production.mjs']) { const r = spawnSync(process.execPath, [`scripts/${script}`], { env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 20000 }); assert.equal(r.status, 1, script); assert.match(r.stderr, /refused|required/); }
});

test('build config path: preview is the default and unchanged, production is explicit, anything else is refused', () => {
  assert.equal(wranglerConfigPath({}), 'wrangler.jsonc'); assert.equal(wranglerConfigPath({ HARIMU_WRANGLER_CONFIG: 'wrangler.prod.jsonc' }), 'wrangler.prod.jsonc');
  for (const bad of ['', 'wrangler.prod.json', '../wrangler.prod.jsonc', 'dist/server/wrangler.json']) assert.throws(() => wranglerConfigPath({ HARIMU_WRANGLER_CONFIG: bad }), /must be wrangler\.jsonc or wrangler\.prod\.jsonc/);
  assert.match(readFileSync('vite.config.ts', 'utf8'), /configPath: wranglerConfigPath\(\)/); assert.doesNotMatch(readFileSync('scripts/build-development.mjs', 'utf8'), /production-config|wrangler\.prod/);
  const env = productionBuildEnv(good(), { PATH: 'p' });
  assert.equal(env.HARIMU_WRANGLER_CONFIG, 'wrangler.prod.jsonc'); assert.equal(env.HARIMU_PRODUCTION_STORAGE, 'true'); assert.equal(env.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW, undefined); assert.equal(env.HARIMU_WAR_ENABLED, 'false');
});

test('inactive: no existing workflow or npm script runs the production scripts or reads wrangler.prod.jsonc', () => {
  const mentions = /deploy-production|build-production|wrangler\.prod/;
  for (const file of readdirSync('.github/workflows').filter(f => f !== 'deploy-production.yml')) assert.doesNotMatch(readFileSync(`.github/workflows/${file}`, 'utf8'), mentions, file);
  for (const [name, command] of Object.entries(JSON.parse(readFileSync('package.json', 'utf8')).scripts)) assert.doesNotMatch(command, mentions, name);
  for (const file of ['scripts/deploy-cloudflare.mjs', 'scripts/build-development.mjs', 'scripts/development-config.mjs']) assert.doesNotMatch(readFileSync(file, 'utf8'), /production-config|wrangler\.prod/, file);
});

test('journal optional: production writes keep no journal and need no retention approval; the default still does', async () => {
  const source = readFileSync('lib/postgres/database.ts', 'utf8').replace("'./sql'", JSON.stringify(new URL('../lib/postgres/sql.ts', import.meta.url).href));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { PostgresDatabase } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`), log = [];
  const connect = async () => ({ query: async text => { log.push(text); return { rows: [], rowCount: 1 }; }, release: async () => {} });
  const write = db => db.batch([db.prepare('UPDATE citizens SET capacity=? WHERE clerk_user_id=?').bind(5, 'x')]);
  await assert.rejects(write(new PostgresDatabase(connect, {})), /journal retention is not approved/);
  await write(new PostgresDatabase(connect, { journalRetentionApproved: true })); assert.ok(log.some(q => /harimu_postgres_write_journal/.test(q)), 'preview still journals');
  log.length = 0; await write(new PostgresDatabase(connect, { journal: false }));
  assert.ok(log.includes('COMMIT') && !log.some(q => /journal/.test(q)), 'production commits without a journal write');
  assert.deepEqual(productionJournalProblems(), [], 'the shipped code keeps no production journal');
  const storage = readFileSync('lib/storage-selection.ts', 'utf8'), db = readFileSync('lib/db.ts', 'utf8');
  assert.match(productionJournalProblems(storage.replace('productionKeepsWriteJournal=false', 'productionKeepsWriteJournal=true'), db).join(), /unbounded write journal/, 'the gate refuses a production that keeps the journal');
  assert.match(productionJournalProblems(storage, db.replace("||productionKeepsWriteJournal)", ")")).join(), /no longer passes/);
  await assert.rejects(deployMain([`--qa2-go-sha=${head}`, '--dry-run'], { HARIMU_DEPLOY_ENVIRONMENT: 'production', PATH: process.env.PATH }), /Production config refused/, 'with the journal fixed, the remaining refusal is the placeholder');
});

test('#742: HARIMU_AI_TEMPLATES_ONLY is the one named operator exemption; other HARIMU_* vars must still be "false"', () => {
  const withVars = extra => { const c = good(); return productionConfigProblems({ ...c, vars: { ...c.vars, ...extra } }); };
  for (const v of ['', 'all', 'korund', 'korund,aurelle']) assert.deepEqual(withVars({ HARIMU_AI_TEMPLATES_ONLY: v }).filter(p => /TEMPLATES_ONLY/.test(p)), [], v);
  const libNations = JSON.parse(readFileSync('lib/ai-kill-switch.ts', 'utf8').match(/aiTemplatesOnlyNations = (\[[^\]]*\])/)[1].replaceAll("'", '"'));
  assert.deepEqual(aiTemplatesOnlyNations, libNations);
  for (const v of ['true', 'false', 'ALL', 'korund,', ' all', 'atlantis', 'x;y']) assert.ok(withVars({ HARIMU_AI_TEMPLATES_ONLY: v }).some(p => /HARIMU_AI_TEMPLATES_ONLY must be/.test(p)), v);
  for (const v of ['', 'all', 'true']) assert.ok(withVars({ HARIMU_AI_NEWS_ENABLED: v }).some(p => p === 'HARIMU_AI_NEWS_ENABLED must be "false" on production.'), v);
});

test('#764: HARIMU_AI_MUTED_PERSONAS is the second operator exemption: "", "all" or a persona id list', () => {
  const withVars = extra => { const c = good(); return productionConfigProblems({ ...c, vars: { ...c.vars, ...extra } }); };
  for (const v of ['', 'all', 'kindle-journalist', 'kindle-journalist,kindle-cabinet']) assert.deepEqual(withVars({ HARIMU_AI_MUTED_PERSONAS: v }).filter(p => /MUTED_PERSONAS/.test(p)), [], v);
  for (const v of ['true ', 'ALL', 'kindle-journalist,', ' all', 'x;y']) assert.ok(withVars({ HARIMU_AI_MUTED_PERSONAS: v }).some(p => p === 'HARIMU_AI_MUTED_PERSONAS must be "", "all" or a comma list of persona ids on production.'), v);
});

test('#790: HARIMU_CHAT_SHADOW_MUTE takes id@mute or id@mute..unmute entries; refuses bare ids, switch words, bad, inverted or overlapping windows and over 90; "" and up to 90 pass', () => {
  const list = n => Array.from({ length: n }, (_, i) => `user_${i}@2026-10-23T07:00:00Z`).join(',');
  const set = value => problems(c => { c.vars.HARIMU_CHAT_SHADOW_MUTE = value; });
  const A = '2026-10-23T07:00:00Z', B = '2026-10-23T08:00:00Z', C = '2026-10-23T09:00:00Z';
  for (const bad of ['all', 'ALL', 'All', 'true', 'TRUE', 'false', 'False', 'alice', 'alice,bob', `alice@${A},all`, 'alice@not-a-time', 'alice@2026-10-23', list(91),
    `a b@${A}`, `alice@${B}..${A}`, `alice@${A}..${A}`, `alice@${A}..${C},alice@${B}`, `alice@${A},alice@${B}..${C}`, `alice@${A}..`])
    assert.match(set(bad).join('\n'), /HARIMU_CHAT_SHADOW_MUTE .* on production/, String(bad).slice(0, 24));
  for (const ok of ['', ',', `alice@${A}`, `alice@${A},`, `alice@${A}..${B},alice@${B}..${C},alice@2026-10-24T00:00:00Z`, `alice@${A},user_2X-y@2026-10-23T09:00:00+02:00`, list(90)])
    assert.deepEqual(set(ok), [], String(ok).slice(0, 24));
  assert.match(set(list(91)).join('\n'), /at most 90 entries \(D1 bound-parameter limit\)/);
});
