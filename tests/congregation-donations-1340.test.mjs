/** #1340: Kindle congregation donations (docs §14.4), copied from #863 party donations. Flag off: POST 404 with no DB statement and GET /api/congregations
 *  has no donations key and never reads the table. Members only, Kindle only (Korund refused), balance check, replay safety, wallet debit = fund credit,
 *  Spark origin sink (#465) and the #1337 reconciliation report gains no discrepancy. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { flagOn } from '../lib/flag-pack.mjs';

const F = 'HARIMU_CONGREGATION_DONATIONS_ENABLED';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
test('the flag is in HARIMU_GRAY_PACK, preview "true" and production "false"; a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')).vars.HARIMU_GRAY_PACK, prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8')).vars.HARIMU_GRAY_PACK;
  assert.deepEqual([preview[F], prod[F], Object.keys(preview).indexOf(F), Object.keys(prod).indexOf(F)], ['true', 'false', 84, 84]); // indexOf, not at(-1): #1342 chat follows at 85
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview }, F), true); assert.equal(flagOn({ HARIMU_GRAY_PACK: prod }, F), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview, [F]: 'false' }, F), false);
});

async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
async function setup(t, backend) {
  const { localRuntime } = await import('./helpers/local-runtime.mjs');
  const r = await localRuntime({ backend, accountElection: true }); t.after(() => r.close());
  r.setFaith(true); r.setFixtureEnv(F, 'true');
  const iso = new Date(r.now).toISOString();
  for (const [id, nation] of [['kai', 'korund'], ['cara', 'aurelle']]) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, iso, iso).run();
  return r;
}
const wallet = async (r, u) => Number((await r.db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?').bind(u).first())?.balance ?? 0);
const fund = (r, u, minor) => r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), u, minor).run();
const rows = async r => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM congregation_donations').first()).n);
const give = (r, u, amountMinor, requestId = randomUUID(), origin) => r.call('congregations/donations', u, { amountMinor, requestId }, origin);
async function join(r, u) {
  await r.call('faith', u, { action: 'choose-faith', faithId: 'kinward-rite', requestId: randomUUID() });
  const joined = await r.call('congregations', u, { action: 'join-congregation', requestId: randomUUID() });
  assert.equal(joined.status, 200, JSON.stringify(joined.data)); return joined.data.state.you.congregationId;
}

for (const backend of ['sqlite', 'postgres']) {
  test(`congregation donations (${backend}): flag off is a 404 POST with no DB access and a GET with no donations key or donation read`, async t => {
    const r = await setup(t, backend);
    await join(r, 'alice'); await fund(r, 'alice', 5000);
    for (const flag of [undefined, 'false', 'TRUE']) {
      r.setFixtureEnv(F, flag); r.setFixtureEnv('HARIMU_GRAY_PACK', undefined);
      const post = await spy(r, async () => [await give(r, 'alice', 100), await give(r, null, 100), await give(r, 'alice', 100, undefined, 'https://evil.invalid')]);
      assert.deepEqual(post.result.map(x => x.status), [404, 404, 404]); assert.deepEqual(post.sql, [], `flag ${flag}: no database access`);
      const get = await spy(r, () => r.call('congregations', 'alice'));
      assert.equal(get.result.status, 200); assert.equal('donations' in get.result.data, false); assert.equal(get.result.data.you.congregationId !== null, true, 'membership panel unchanged');
      assert.equal(get.sql.some(q => /congregation_donations/.test(q)), false, `flag ${flag}: GET never reads donations`);
    }
    assert.equal(await rows(r), 0); assert.equal(await wallet(r, 'alice'), 5000);
  });

  test(`congregation donations (${backend}): members only, Kindle only, balance check, replay safety, debit equals fund credit, origin sink, reconciliation clean`, async t => {
    const r = await setup(t, backend);
    await r.call('world', null);
    const recon = await r.importModule('lib/ledger-reconciliation.ts'), origin = await r.importModule('lib/spark-origin.ts');
    const congregationId = await join(r, 'alice');
    await fund(r, 'alice', 10000); await origin.recordSparkIssuance(r.db, 'alice', 10000, 'fixture-wage-1340', 'wage', 1); // tracked earned Spark
    await fund(r, 'bob', 10000);
    const before = await recon.reconcileLedger(r.db);
    assert.equal((await give(r, null, 100)).status, 401);
    assert.equal((await give(r, 'alice', 100, randomUUID(), 'https://evil.invalid')).status, 403, 'same origin');
    assert.equal((await give(r, 'bob', 100)).data.reason, 'not_member', 'non-members are refused');
    await r.db.prepare("INSERT INTO congregation_members (user_id,congregation_id,faith_id,city_id,officiant_opt_in,joined_at) VALUES ('kai',?,'open-hand',?,0,1)").bind('open-hand:x', 'x').run();
    assert.equal((await give(r, 'kai', 100)).data.reason, 'not_kindle', 'Korund is refused even with a membership row');
    assert.equal((await give(r, 'cara', 100)).data.reason, 'not_kindle', 'Aurelle is out of scope');
    for (const body of [{ amountMinor: 0, requestId: randomUUID() }, { amountMinor: 1.5, requestId: randomUUID() }, { amountMinor: -5, requestId: randomUUID() }, { amountMinor: 100 }])
      assert.equal((await r.call('congregations/donations', 'alice', body)).status, 400, JSON.stringify(body));
    const poor = await give(r, 'alice', 10001); assert.deepEqual([poor.status, poor.data.reason], [409, 'insufficient_balance']);
    assert.equal(await rows(r), 0);
    const id = randomUUID(), ok = await give(r, 'alice', 4000, id);
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.deepEqual([ok.data.donations.congregationId, ok.data.donations.fundMinor, ok.data.donations.yours.map(d => d.amountMinor)], [congregationId, 4000, [4000]]);
    assert.equal(await wallet(r, 'alice'), 6000, 'wallet debit equals the fund credit: no Spark created or destroyed');
    for (let i = 0; i < 3; i++) assert.equal((await give(r, 'alice', 4000, id)).status, 200, 'replay is idempotent');
    assert.equal(await rows(r), 1); assert.equal(await wallet(r, 'alice'), 6000);
    assert.equal((await give(r, 'alice', 4001, id)).data.reason, 'request_reused');
    assert.equal((await give(r, 'alice', 6000)).status, 200, 'up to the whole balance');
    assert.equal((await give(r, 'alice', 1)).data.reason, 'insufficient_balance');
    const panel = (await r.call('congregations', 'alice')).data.donations;
    assert.deepEqual([panel.fundMinor, panel.yours.length], [10000, 2]); assert.equal((await r.call('congregations', 'bob')).data.donations, null);
    assert.equal('donations' in (await r.call('congregations', null)).data, true); assert.equal((await r.call('congregations', null)).data.donations, null, 'no public donor list');
    const sink = (await r.db.prepare("SELECT origin, delta_minor FROM spark_origin_entries WHERE source_id=?").bind(`congregation-donation:${id}`).all()).results.map(x => [x.origin, Number(x.delta_minor)]);
    assert.deepEqual(sink, [['earned', -4000]], 'origin sink recorded like party donations');
    const after = await recon.reconcileLedger(r.db);
    assert.equal(after.mismatchCount, before.mismatchCount, JSON.stringify(after.mismatches));
    assert.equal(after.mismatches.some(x => /congregation|origin_lot/.test(x.check) || x.account === 'alice'), false, JSON.stringify(after.mismatches));
    assert.equal(after.totals.SPK.walletTotalMinor, before.totals.SPK.walletTotalMinor - 10000);
  });
}
