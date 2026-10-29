import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertPinnedWrangler, deployArgs, isDryRun } from '../scripts/wrangler-pin.mjs';

test('wrangler is pinned exactly and the installed copy must match (#89)', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.devDependencies.wrangler, /^\d+\.\d+\.\d+$/);
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.packages['node_modules/wrangler'].version, pkg.devDependencies.wrangler);
  assert.equal(assertPinnedWrangler('4.92.0', '4.92.0'), '4.92.0');
  assert.throws(() => assertPinnedWrangler('4.151.0', '4.92.0'), /does not match the pinned 4\.92\.0/);
  assert.throws(() => assertPinnedWrangler('4.92.0', '^4.92.0'), /exact version/);
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes(`wrangler ${pkg.devDependencies.wrangler}`));
});
test('dry run never uploads and a real deploy does not keep every plain-text var', () => {
  assert.equal(isDryRun(['node', 'x', '--dry-run'], {}), true);
  assert.equal(isDryRun(['node', 'x'], { npm_config_dry_run: 'true' }), true);
  assert.equal(isDryRun(['node', 'x'], {}), false);
  assert.ok(deployArgs(true).includes('--dry-run')); assert.ok(!deployArgs(true).includes('--keep-vars')); assert.ok(!deployArgs(true).includes('--secrets-file'));
  assert.ok(!deployArgs(false).includes('--keep-vars')); assert.ok(deployArgs(false).includes('--secrets-file')); assert.ok(!deployArgs(false).includes('--dry-run'));
});
test('legacy_env=true is stripped for current wrangler; false is refused', async () => {
  const { withoutLegacyEnv } = await import('../scripts/wrangler-pin.mjs');
  assert.deepEqual(withoutLegacyEnv({ name: 'w', legacy_env: true }), { name: 'w' });
  assert.deepEqual(withoutLegacyEnv({ name: 'w' }), { name: 'w' });
  assert.throws(() => withoutLegacyEnv({ legacy_env: false }));
});
test('#394: dashboard QA vars are omitted from the built config and copied back only from the live Worker', async () => {
  const { withoutDashboardVars, dashboardManagedVars, withoutLegacyEnv, withLiveDashboardVars, plainTextFromSettings, readLivePlainText } = await import('../scripts/wrangler-pin.mjs');
  assert.deepEqual([...dashboardManagedVars], ['HARIMU_QA_TEST_CITIZENS', 'HARIMU_QA_TEST_CITIZEN_IDS', 'HARIMU_SQUARE_PURCHASE_ENABLED', 'HARIMU_TESSERA_EXCHANGE_ENABLED']); // #627; the test faucet (#631) is deliberately not dashboard-managed
  const built = { name: 'w', vars: { A: '1', HARIMU_QA_TEST_CITIZENS: 'false', HARIMU_QA_TEST_CITIZEN_IDS: 'x', HARIMU_FAITH_ENABLED: 'false' } };
  assert.deepEqual(withoutDashboardVars(built), { name: 'w', vars: { A: '1', HARIMU_FAITH_ENABLED: 'false' } }, 'every other var is still deployed');
  assert.equal(built.vars.HARIMU_QA_TEST_CITIZENS, 'false', 'the input is not mutated');
  assert.deepEqual(withoutDashboardVars({ name: 'w' }), { name: 'w' });
  // #627: the square and exchange flags are kept from the dashboard too; their checked-in default stays "false" (and the other flags are still deployed)
  assert.deepEqual(withoutDashboardVars({ vars: { HARIMU_SQUARE_PURCHASE_ENABLED: 'false', HARIMU_TESSERA_EXCHANGE_ENABLED: 'false', HARIMU_LABOR_BUREAU_ENABLED: 'false' } }), { vars: { HARIMU_LABOR_BUREAU_ENABLED: 'false' } });
  const checked = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'); assert.match(checked, /"HARIMU_SQUARE_PURCHASE_ENABLED": "false"/);
  assert.deepEqual(withoutDashboardVars(withoutLegacyEnv({ legacy_env: true, vars: { HARIMU_QA_TEST_CITIZENS: 'false' } })), { vars: {} });
  const kept = withLiveDashboardVars(withoutDashboardVars(built), { HARIMU_QA_TEST_CITIZENS: 'true', HARIMU_QA_TEST_CITIZEN_IDS: 'qa-1', HARIMU_GRAY_MARKET_ENABLED: 'true' });
  assert.equal(kept.vars.HARIMU_QA_TEST_CITIZENS, 'true'); assert.equal(kept.vars.HARIMU_QA_TEST_CITIZEN_IDS, 'qa-1');
  assert.equal(kept.vars.HARIMU_GRAY_MARKET_ENABLED, undefined, 'a folded flag on the live Worker is not copied back');
  assert.deepEqual(plainTextFromSettings({ result: { bindings: [{ type: 'plain_text', name: 'HARIMU_QA_TEST_CITIZENS', text: 'true' }, { type: 'secret_text', name: 'CLERK_SECRET_KEY' }, { type: 'plain_text', name: 'HARIMU_WAR_ENABLED', text: 'true' }] } }), { HARIMU_QA_TEST_CITIZENS: 'true' });
  assert.throws(() => plainTextFromSettings({ result: { bindings: [{ type: 'secret_text', name: 'HARIMU_QA_TEST_CITIZEN_IDS' }] } }), /not a readable plain-text/);
  assert.throws(() => plainTextFromSettings({}), /no bindings list/);
  await assert.rejects(readLivePlainText({}), /would wipe HARIMU_QA_TEST_CITIZENS/);
  let called = 0;
  const fetched = await readLivePlainText({ CLOUDFLARE_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: '143bccf1a31c2161142c43845a8fc65d' }, async url => { called += 1; assert.match(url, /workers\/scripts\/harimu-preview\/settings$/); return { ok: true, json: async () => ({ success: true, result: { bindings: [{ type: 'plain_text', name: 'HARIMU_QA_TEST_CITIZEN_IDS', text: 'qa-9' }] } }) }; });
  assert.equal(called, 1); assert.deepEqual(fetched, { HARIMU_QA_TEST_CITIZEN_IDS: 'qa-9' });
  await assert.rejects(readLivePlainText({ CLOUDFLARE_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: '143bccf1a31c2161142c43845a8fc65d' }, async () => ({ ok: false, status: 500, json: async () => ({}) })), /HTTP 500/);
  // The deploy script strips the repo defaults, copies live dashboard vars on a real deploy, and does not pass --keep-vars.
  const script = await readFile(new URL('../scripts/deploy-cloudflare.mjs', import.meta.url), 'utf8');
  assert.match(script, /withoutDashboardVars\(withoutLegacyEnv\(built\)\)/);
  assert.match(script, /withLiveDashboardVars\(config, await readLivePlainText/);
  assert.doesNotMatch(script, /--keep-vars/);
  const { deployArgs } = await import('../scripts/wrangler-pin.mjs');
  assert.ok(!deployArgs(false).includes('--keep-vars'));
  const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(config, /"HARIMU_QA_TEST_CITIZENS": "false"/); assert.doesNotMatch(config, /HARIMU_QA_TEST_CITIZEN_IDS"/);
});
