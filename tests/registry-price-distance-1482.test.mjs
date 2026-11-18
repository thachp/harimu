/** #1482: World Registry price also rises with Chebyshev distance from the capital (docs §15.1). No new flag. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = 'HARIMU_SQUARE_PRICE_ANTI_SNOWBALL_ENABLED';
const buy = (r, user, x, y, over = {}) => r.call('world/registry', user, { action: 'buy-square', x, y, requestId: randomUUID(), ...over });
const listed = (r, user, query = '') => r.call('world/registry', user, undefined, 'https://fixture.invalid', query);
const priceOf = async (r, user, query = '') => (await listed(r, user, query)).data.priceMinor;

async function setTessera(r, user, minor) {
  await r.db.prepare('DELETE FROM citizen_tessera_ledger WHERE clerk_user_id=?').bind(user).run();
  await r.db.prepare('DELETE FROM citizen_tessera_exchanges WHERE clerk_user_id=?').bind(user).run();
  if (minor > 0) await r.db.prepare("INSERT INTO citizen_tessera_exchanges(request_id,clerk_user_id,nation_id,spark_minor,tessera_minor,occurred_at) VALUES (?,?,'kindle',?,?,0)").bind(randomUUID(), user, minor * 4, minor).run();
}
/** Target (x,y) is unowned Wildlands; one adjacent square is Kindle's, plus off-grid extras so owned === n. */
async function site(r, x, y, n = 1) {
  await r.db.prepare("UPDATE world_squares SET owner=NULL WHERE owner='kindle'").run();
  await r.db.prepare('DELETE FROM world_squares WHERE y<0').run();
  await r.db.prepare('DELETE FROM world_square_purchases').run();
  await r.db.prepare("UPDATE world_squares SET owner=NULL, zone='wildlands' WHERE x=? AND y=?").bind(x, y).run();
  const ax = x + 1, ay = y;
  await r.db.prepare("UPDATE world_squares SET owner='kindle', zone='frontier' WHERE x=? AND y=?").bind(ax, ay).run();
  if (n > 1) {
    const values = Array.from({ length: n - 1 }, () => "(?,-1,'wildlands','kindle','plains',NULL,NULL)").join(',');
    await r.db.prepare(`INSERT INTO world_squares (x,y,zone,owner,terrain,resource,feature) VALUES ${values}`).bind(...Array.from({ length: n - 1 }, (_, i) => 2000 + i)).run();
  }
}

test('#1482 pure rules: d = 0 matches today; d = 10 is 20% more; rounding and the floor hold', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const m = await r.importModule('lib/world-registry.ts');
  assert.equal(m.squareDistanceDivisor, 50);
  assert.equal(m.squareChargeMinor(0), 2500);
  assert.equal(m.squareChargeMinor(0, 0), 2500, 'd = 0 is today\'s price');
  assert.equal(m.squareChargeMinor(1, 0), 2503);
  assert.equal(m.squareChargeMinor(1), 2503, 'omitted distance is d = 0');
  assert.equal(m.squareChargeMinor(0, 1), 2550, 'd = 1 is 2% more');
  assert.equal(m.squareChargeMinor(0, 10), 3000, 'd = 10 is 20% more');
  assert.equal(m.squareChargeMinor(1, 4), 2703);
  assert.equal(m.squareChargeMinor(1000, 4), 5400);
  assert.equal(m.squareChargeMinor(-3, -8), 2500, 'non-positive counts clamp to 0');
  assert.ok(m.squareChargeMinor(0, 0) >= 1);
  const kindle = (await r.importModule('lib/map-zones.ts')).mvpNations.find(n => n.id === 'kindle').capital;
  assert.equal(m.squareCapitalDistance('kindle', kindle.x, kindle.y), 0);
  assert.equal(m.squareCapitalDistance('kindle', 9, 8), 4);
  assert.equal(m.squareCapitalDistance('kindle', 15, 4), 10);
  assert.equal(m.squareCapitalDistance('unknown', 9, 8), 0);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`#1482 (${backend}): charged price follows d = 0 and the far-square charge; listing equals charge; the client cannot pick the price`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    r.setSquarePurchase(true); r.setFixtureEnv(FLAG, 'true');
    const m = await r.importModule('lib/world-registry.ts');
    const kindle = (await r.importModule('lib/map-zones.ts')).mvpNations.find(n => n.id === 'kindle').capital;

    await site(r, kindle.x, kindle.y, 1);
    await setTessera(r, 'alice', 2503);
    assert.equal(m.squareCapitalDistance('kindle', kindle.x, kindle.y), 0);
    assert.equal(await priceOf(r, 'alice'), 2503, 'listing without x,y is the d = 0 term');
    assert.equal(await priceOf(r, 'alice', `?x=${kindle.x}&y=${kindle.y}`), 2503);
    const zero = await buy(r, 'alice', kindle.x, kindle.y);
    assert.equal(zero.status, 200, JSON.stringify(zero.data));
    assert.equal(zero.data.priceMinor, 2503, 'a square at the capital charges the owned-only price');

    await site(r, 9, 8, 1);
    await setTessera(r, 'alice', 2703);
    assert.equal(await priceOf(r, 'alice', '?x=9&y=8'), 2703);
    const mid = await buy(r, 'alice', 9, 8);
    assert.equal(mid.status, 200, JSON.stringify(mid.data));
    assert.equal(mid.data.priceMinor, 2703);
    assert.equal(Number((await r.db.prepare('SELECT price_minor FROM world_square_purchases WHERE x=9 AND y=8').first()).price_minor), 2703);

    await site(r, 15, 4, 1);
    await setTessera(r, 'alice', 3003);
    assert.equal(m.squareCapitalDistance('kindle', 15, 4), 10);
    assert.equal(m.squareChargeMinor(1, 10), 3003);
    assert.equal(await priceOf(r, 'alice', '?x=15&y=4'), 3003, 'listing equals the far-square charge');
    const far = await buy(r, 'alice', 15, 4);
    assert.equal(far.status, 200, JSON.stringify(far.data));
    assert.equal(far.data.priceMinor, 3003);

    await site(r, 9, 8, 1);
    await setTessera(r, 'alice', 2703);
    const sneaky = await buy(r, 'alice', 9, 8, { priceMinor: 1, price: 1 });
    assert.equal(sneaky.status, 200, JSON.stringify(sneaky.data));
    assert.equal(sneaky.data.priceMinor, 2703, 'the client cannot pick the price');
    assert.equal(Number((await r.db.prepare('SELECT price_minor FROM world_square_purchases WHERE x=9 AND y=8').first()).price_minor), 2703);
  });

  test(`#1482 (${backend}): flag off stays 2500 with no COUNT and no distance; insufficient Tessera quotes the per-square price; GET does not write`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    r.setSquarePurchase(true);
    await site(r, 9, 8, 1);
    await setTessera(r, 'alice', 2703);
    const prepare = r.db.prepare.bind(r.db), seen = [], writes = [];
    r.db.prepare = sql => { seen.push(sql); if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 40)); return prepare(sql); };
    const offList = await listed(r, 'alice', '?x=9&y=8');
    const offBuy = await buy(r, 'alice', 9, 8);
    r.db.prepare = prepare;
    assert.equal(offList.data.priceMinor, 2500);
    assert.equal(offBuy.status, 200, JSON.stringify(offBuy.data));
    assert.equal(offBuy.data.priceMinor, 2500);
    assert.ok(!seen.some(sql => /SELECT COUNT\(\*\) AS n FROM world_squares WHERE owner=\?/.test(sql) || /\(50\+\?\)/.test(sql)), 'flag off runs no owned count and no distance term');

    r.setFixtureEnv(FLAG, 'true');
    await site(r, 9, 8, 1);
    await setTessera(r, 'alice', 2702);
    const broke = await buy(r, 'alice', 9, 8);
    assert.equal(broke.data.reason, 'insufficient_tessera');
    assert.match(broke.data.error, /costs 27\.03 TSR; you hold 27\.02 TSR/);
    assert.equal(await r.db.prepare('SELECT request_id FROM world_square_purchases WHERE x=9 AND y=8').first(), null);

    const prep = r.db.prepare.bind(r.db), wrote = [], batch = r.db.batch.bind(r.db);
    r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) wrote.push(sql.slice(0, 40)); return prep(sql); };
    r.db.batch = x => { wrote.push('batch'); return batch(x); };
    try { await listed(r, 'alice', '?x=9&y=8'); } finally { r.db.prepare = prep; r.db.batch = batch; }
    assert.deepEqual(wrote, [], 'GET listing never writes');
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

test('#1482 mutations: dropping distance, a wrong divisor, and honoring a client price all fail', () => {
  const file = 'tests/registry-price-distance-1482.test.mjs';
  const cases = [
    {
      file: 'lib/world-registry.ts',
      find: 'const distance = squareCapitalDistance(nationId, x, y);',
      replace: 'const distance = 0;',
      pattern: 'far-square charge',
    },
    {
      file: 'lib/world-registry.ts',
      find: 'export const squareDistanceDivisor = 50;',
      replace: 'export const squareDistanceDivisor = 100;',
      pattern: 'd = 10 is 20% more',
    },
    {
      file: 'app/api/world/registry/route.ts',
      find: "const result = await buySquare(await getDatabase(), userId, command, Math.floor(Date.now() / 1000), enabled(), env);",
      replace: "if (typeof body.priceMinor === 'number') return privateJson({ ok: true, square: { x: command.x, y: command.y, owner: 'kindle', zone: 'frontier' }, priceMinor: body.priceMinor, tesseraMinor: 0 });\n  const result = await buySquare(await getDatabase(), userId, command, Math.floor(Date.now() / 1000), enabled(), env);",
      pattern: 'the client cannot pick the price',
    },
  ];
  for (const c of cases) {
    const restore = mutate(c.file, c.find, c.replace);
    try {
      const result = run([file], c.pattern);
      assert.notEqual(result.status, 0, `mutant survived (${c.find}):\n${result.stdout}\n${result.stderr}`);
    } finally { restore(); }
  }
});
