/** #631: the preview-only Tessera TEST faucet (HARIMU_TEST_FAUCET_ENABLED + the preview marker). HARIMU_TEST_STORAGE=postgres runs it on PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

let testFaucetGrantMinor, testFaucetIdPrefix, testFaucetLabel, testFaucetOpen;
const FLAG = 'HARIMU_TEST_FAUCET_ENABLED', PREVIEW = 'NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW';
const claim = (r, user) => r.call('test-faucet', user, { action: 'claim' });
const status = (r, user) => r.call('test-faucet', user);
const ledger = async r => (await r.db.prepare('SELECT id,clerk_user_id,delta_minor,reason FROM citizen_tessera_ledger').all()).results;
async function setup(t, { flag, preview } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  ({ testFaucetGrantMinor, testFaucetIdPrefix, testFaucetLabel, testFaucetOpen } = await r.importModule('lib/test-faucet.ts'));
  if (flag !== undefined) r.setFixtureEnv(FLAG, flag); if (preview !== undefined) r.setFixtureEnv(PREVIEW, preview);
  return r;
}

test('static: the flag is "true" in the file and deployed with it (not dashboard-managed), prod pins it "false"; the label is the same in the panel; the faucet never touches the exchange', async t => {
  await setup(t);
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_TEST_FAUCET_ENABLED"\s*:\s*"([^"]*)"/g)].map(x => x[1]), ['true']);
  const { dashboardManagedVars } = await import('../scripts/wrangler-pin.mjs'); assert.ok(!dashboardManagedVars.includes(FLAG), 'the file value is deployed to preview');
  const { withoutDashboardVars } = await import('../scripts/wrangler-pin.mjs'), strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
  const deployed = withoutDashboardVars(strip(cfg)).vars; assert.equal(deployed[FLAG], 'true'); assert.equal(deployed[PREVIEW], 'true', 'the faucet also needs the preview marker in the deployed config');
  const prod = strip(await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8')).vars; assert.equal(prod[FLAG], 'false'); assert.equal(prod[PREVIEW], undefined, 'production never carries the preview marker');
  assert.equal(testFaucetLabel, 'Test faucet, preview only'); assert.match(await readFile(new URL('../app/wallet-panel.tsx', import.meta.url), 'utf8'), /const testFaucetLabel = 'Test faucet, preview only'/);
  const code = ['../lib/test-faucet.ts', '../app/api/test-faucet/route.ts'].map(f => readFile(new URL(f, import.meta.url), 'utf8'));
  for (const text of await Promise.all(code)) { const body = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); assert.doesNotMatch(body, /citizen_tessera_exchanges|TESSERA_EXCHANGE|buyTessera|sparkMinor/, 'no link to the exchange'); }
  assert.equal(testFaucetOpen({}), false); assert.equal(testFaucetOpen({ [FLAG]: 'true' }), false); assert.equal(testFaucetOpen({ [PREVIEW]: 'true' }), false); assert.equal(testFaucetOpen({ [FLAG]: 'true', [PREVIEW]: 'true' }), true);
  assert.equal(testFaucetOpen({ [FLAG]: 'TRUE', [PREVIEW]: 'true' }), false, 'exactly "true"');
});

test('refused with the flag off (even in the preview world) and in production (flag on, no preview marker): 404, nothing written', async t => {
  for (const env of [{}, { preview: 'true' }, { flag: 'false', preview: 'true' }, { flag: 'true' }, { flag: 'true', preview: 'false' }, { flag: 'true', preview: '' }]) {
    const r = await setup(t, env);
    const res = await claim(r, 'alice'); assert.equal(res.status, 404, JSON.stringify(env)); assert.equal(res.data.reason, 'disabled'); assert.equal(res.data.test, true); assert.equal(res.data.label, testFaucetLabel);
    assert.equal((await ledger(r)).length, 0, 'nothing written'); assert.equal((await status(r, 'alice')).data.available, false);
    assert.equal((await r.call('world/registry', 'alice')).data.tesseraMinor, 0);
  }
});

test('open (flag and preview marker): one labeled 50.00 TSR test grant per citizen, a test ledger row, shown in the Tessera balance; the cap holds', async t => {
  const r = await setup(t, { flag: 'true', preview: 'true' });
  const before = await status(r, 'alice'); assert.equal(before.status, 200); assert.deepEqual({ ...before.data }, { test: true, label: testFaucetLabel, available: true, grantMinor: 5000, currency: 'TSR', granted: false, tesseraMinor: 0 });
  const first = await claim(r, 'alice'); assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.test, true); assert.equal(first.data.label, testFaucetLabel); assert.equal(first.data.grantedMinor, testFaucetGrantMinor); assert.equal(first.data.tesseraMinor, 5000); assert.equal(first.data.granted, true);
  assert.deepEqual((await ledger(r)).map(row => ({ ...row })), [{ id: `${testFaucetIdPrefix}alice`, clerk_user_id: 'alice', delta_minor: 5000, reason: 'starter-grant' }]);
  assert.equal((await r.call('world/registry', 'alice')).data.tesseraMinor, 5000); assert.equal((await r.call('citizen', 'alice')).data.economy.tesseraMinor, 5000);
  const again = await claim(r, 'alice'); assert.equal(again.status, 409); assert.equal(again.data.reason, 'cap_reached'); assert.equal(again.data.test, true); assert.equal((await ledger(r)).length, 1, 'capped: no second row');
  assert.equal((await claim(r, 'bob')).status, 200, 'another citizen has their own grant'); assert.equal((await ledger(r)).length, 2);
  assert.equal((await claim(r, 'nobody')).data.reason, 'no_citizen'); assert.equal((await r.call('test-faucet', null, { action: 'claim' })).status, 401);
  assert.equal((await r.call('test-faucet', 'alice', { action: 'claim' }, 'https://foreign.invalid')).status, 403); assert.equal((await r.call('test-faucet', 'alice', { action: 'mint' })).status, 400);
  assert.equal((await r.call('test-faucet', 'alice', { action: 'claim', amount: 999999 })).status, 409, 'there is no amount to choose');
});

test('the test grant is spendable on squares and nothing else opens: the exchange stays refused, no exchange row, no Spark change', async t => {
  const r = await setup(t, { flag: 'true', preview: 'true' });
  assert.equal((await claim(r, 'alice')).status, 200);
  const exchange = await r.call('world/registry', 'alice', { action: 'buy-tessera', tesseraMinor: 100, requestId: randomUUID() }); assert.equal(exchange.status, 403); assert.equal(exchange.data.reason, 'disabled');
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM citizen_tessera_exchanges').first()).n), 0);
  assert.equal(Number((await r.call('citizen', 'alice')).data.economy.walletMinor), 0, 'no Spark was created');
  r.setSquarePurchase(true); // the squares flag is a different feature; it is turned on only for the purchase below
  const bought = await r.call('world/registry', 'alice', { action: 'buy-square', x: 9, y: 8, requestId: randomUUID() });
  assert.equal(bought.status, 200, JSON.stringify(bought.data)); assert.equal(bought.data.tesseraMinor, 2500, '50.00 TSR minus the 25.00 TSR square');
});
