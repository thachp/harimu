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
test('dry run never uploads and real deploy keeps vars', () => {
  assert.equal(isDryRun(['node', 'x', '--dry-run'], {}), true);
  assert.equal(isDryRun(['node', 'x'], { npm_config_dry_run: 'true' }), true);
  assert.equal(isDryRun(['node', 'x'], {}), false);
  assert.ok(deployArgs(true).includes('--dry-run')); assert.ok(!deployArgs(true).includes('--keep-vars'));
  assert.ok(deployArgs(false).includes('--keep-vars')); assert.ok(!deployArgs(false).includes('--dry-run'));
});
test('legacy_env=true is stripped for current wrangler; false is refused', async () => {
  const { withoutLegacyEnv } = await import('../scripts/wrangler-pin.mjs');
  assert.deepEqual(withoutLegacyEnv({ name: 'w', legacy_env: true }), { name: 'w' });
  assert.deepEqual(withoutLegacyEnv({ name: 'w' }), { name: 'w' });
  assert.throws(() => withoutLegacyEnv({ legacy_env: false }));
});
test('#394: dashboard-managed QA vars are left out of the deploy config so --keep-vars preserves them', async () => {
  const { withoutDashboardVars, dashboardManagedVars, withoutLegacyEnv } = await import('../scripts/wrangler-pin.mjs');
  assert.deepEqual([...dashboardManagedVars], ['HARIMU_QA_TEST_CITIZENS', 'HARIMU_QA_TEST_CITIZEN_IDS']);
  const built = { name: 'w', vars: { A: '1', HARIMU_QA_TEST_CITIZENS: 'false', HARIMU_QA_TEST_CITIZEN_IDS: 'x', HARIMU_FAITH_ENABLED: 'false' } };
  assert.deepEqual(withoutDashboardVars(built), { name: 'w', vars: { A: '1', HARIMU_FAITH_ENABLED: 'false' } }, 'every other var is still deployed');
  assert.equal(built.vars.HARIMU_QA_TEST_CITIZENS, 'false', 'the input is not mutated');
  assert.deepEqual(withoutDashboardVars({ name: 'w' }), { name: 'w' });
  assert.deepEqual(withoutDashboardVars(withoutLegacyEnv({ legacy_env: true, vars: { HARIMU_QA_TEST_CITIZENS: 'false' } })), { vars: {} });
  // The deploy script applies it to the built config, still deploys with --keep-vars, and the checked-in default stays off with no ids.
  const script = await readFile(new URL('../scripts/deploy-cloudflare.mjs', import.meta.url), 'utf8');
  assert.match(script, /withoutDashboardVars\(withoutLegacyEnv\(built\)\)/);
  const { deployArgs } = await import('../scripts/wrangler-pin.mjs');
  assert.ok(deployArgs(false).includes('--keep-vars'));
  const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(config, /"HARIMU_QA_TEST_CITIZENS": "false"/); assert.doesNotMatch(config, /HARIMU_QA_TEST_CITIZEN_IDS"/);
});
