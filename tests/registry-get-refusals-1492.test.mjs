/** #1492: with the anti-snowball flag on, GET /api/world/registry refuses no-capital and no-nation viewers on both the bare and per-square paths. Flag off is unchanged. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = 'HARIMU_SQUARE_PRICE_ANTI_SNOWBALL_ENABLED';
const listed = (r, user, query = '') => r.call('world/registry', user, undefined, 'https://fixture.invalid', query);
const buyNobody = (r) => r.call('world/registry', 'nobody', { action: 'buy-square', x: 9, y: 8, requestId: 'req-nobody-1492' });

async function site(r) {
  await r.db.prepare("UPDATE world_squares SET owner=NULL WHERE owner='kindle'").run();
  await r.db.prepare("UPDATE world_squares SET owner=NULL, zone='wildlands' WHERE x=9 AND y=8").run();
  await r.db.prepare("UPDATE world_squares SET owner='kindle', zone='frontier' WHERE x=10 AND y=8").run();
}

async function withoutCapitals(r, t, body) {
  const zones = await r.importModule('lib/map-zones.ts');
  const kept = zones.mvpNations.slice();
  zones.mvpNations.splice(0, zones.mvpNations.length);
  t.after(() => { zones.mvpNations.splice(0, zones.mvpNations.length, ...kept); });
  try { return await body(zones); }
  finally { zones.mvpNations.splice(0, zones.mvpNations.length, ...kept); }
}

for (const backend of ['sqlite', 'postgres']) {
  test(`#1492 (${backend}): bare GET with no capital is 403 no_capital; no-nation GET matches purchase; a capital is unchanged; flag off is unchanged`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const m = await r.importModule('lib/world-registry.ts');
    await site(r);

    r.setSquarePurchase(true); r.setFixtureEnv(FLAG, 'true');
    assert.equal((await listed(r, 'alice')).status, 200);
    assert.equal((await listed(r, 'alice')).data.priceMinor, 2503, 'bare GET with a capital is the d = 0 owned term');
    assert.equal((await listed(r, 'alice', '?x=9&y=8')).data.priceMinor, 2703, 'per-square GET with a capital is unchanged');

    const purchase = await buyNobody(r);
    assert.equal(purchase.status, 403);
    assert.equal(purchase.data.reason, 'no_nation');
    assert.equal(purchase.data.error, m.noNationError);
    for (const query of ['', '?x=9&y=8']) {
      const got = await listed(r, 'nobody', query);
      assert.equal(got.status, purchase.status, `GET ${query || '(bare)'} status matches purchase`);
      assert.equal(got.data.reason, 'no_nation');
      assert.equal(got.data.error, m.noNationError);
      assert.equal(got.data.error, purchase.data.error);
      assert.equal('priceMinor' in got.data, false, `GET ${query || '(bare)'} lists no price`);
    }

    await withoutCapitals(r, t, async () => {
      const bare = await listed(r, 'alice');
      const at = await listed(r, 'alice', '?x=9&y=8');
      for (const [label, got] of [['bare', bare], ['per-square', at]]) {
        assert.equal(got.status, 403, `${label} GET no capital`);
        assert.equal(got.data.reason, 'no_capital');
        assert.equal(got.data.error, m.noCapitalError);
        assert.equal('priceMinor' in got.data, false, `${label} GET lists no price`);
      }
    });
    assert.ok(m.nationCapital('kindle'), 'capitals are restored');

    r.setFixtureEnv(FLAG, 'false');
    assert.equal((await listed(r, 'alice')).data.priceMinor, 2500);
    assert.equal((await listed(r, 'alice', '?x=9&y=8')).data.priceMinor, 2500);
    assert.equal((await listed(r, 'nobody')).status, 200, 'flag off lists for a viewer with no nation');
    assert.equal((await listed(r, 'nobody')).data.priceMinor, 2500);
    assert.equal((await listed(r, 'nobody', '?x=9&y=8')).data.priceMinor, 2500);
    await withoutCapitals(r, t, async () => {
      assert.equal((await listed(r, 'alice')).status, 200, 'flag off lists without a capital');
      assert.equal((await listed(r, 'alice')).data.priceMinor, 2500);
      assert.equal((await listed(r, 'alice', '?x=9&y=8')).data.priceMinor, 2500);
    });
  });
}

const mutate = (file, find, replace) => {
  const original = readFileSync(file, 'utf8');
  const next = original.replace(find, replace);
  assert.notEqual(next, original, `mutant did not apply in ${file}: ${find}`);
  writeFileSync(file, next);
  return () => writeFileSync(file, original);
};
const run = (files, pattern) => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  return spawnSync('node', ['--experimental-strip-types', '--test', '--test-concurrency=1', '--test-name-pattern', pattern, ...files], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname, env });
};

test('#1492 mutations: a bare GET d=0 no-capital listing, lumping no-nation into no_capital, and refusing when the flag is off all fail', () => {
  const file = 'tests/registry-get-refusals-1492.test.mjs';
  const cases = [
    {
      target: 'lib/world-registry.ts',
      find: 'if (nationCapital(nationId) === null) return { ok: false, status: 403, reason: \'no_capital\', error: noCapitalError };',
      replace: 'if (parsed.at && nationCapital(nationId) === null) return { ok: false, status: 403, reason: \'no_capital\', error: noCapitalError };',
      pattern: 'bare GET with no capital',
    },
    {
      target: 'lib/world-registry.ts',
      find: 'if (!nationId || !(registryNations as readonly string[]).includes(nationId)) return { ok: false, status: 403, reason: \'no_nation\', error: noNationError };',
      replace: 'if (!nationId || !(registryNations as readonly string[]).includes(nationId)) return { ok: false, status: 403, reason: \'no_capital\', error: noCapitalError };',
      pattern: 'no-nation GET matches purchase',
    },
    {
      target: 'lib/world-registry.ts',
      find: 'if (squarePriceAntiSnowballEnabled(env)) {',
      replace: 'if (true) {',
      pattern: 'flag off is unchanged',
    },
  ];
  for (const c of cases) {
    const restore = mutate(c.target, c.find, c.replace);
    try {
      const result = run([file], c.pattern);
      assert.notEqual(result.status, 0, `mutant survived (${c.pattern}):\n${result.stdout}\n${result.stderr}`);
    } finally { restore(); }
  }
});
