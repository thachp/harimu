/** #886 (c): Aurelle's quarry and foundry charter jobs pay Crowns from the estate treasury; each payment writes one Crown issuance record (ARC on #886/#885).
 *  Behind HARIMU_MVP_JOB_TYPES_ENABLED: flag off, aurelle-start-work (with or without jobId) is the food-estate service exactly as before. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { aurelleCharterJobs, aurelleCharterTerms, isAurelleCharter } from '../lib/aurelle.ts';
import { mvpJobs } from '../lib/mvp-job-types.ts';

async function aurelle(t, { on = true, backend = 'sqlite' } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  await r.call('citizen', 'ana', { action: 'enroll', nationId: 'kindle', expectedNationId: null }); await r.db.prepare("UPDATE citizens SET nation_id='aurelle', capacity=24").run(); await r.call('world', null);
  r.setFixtureEnv('HARIMU_MVP_JOB_TYPES_ENABLED', on ? 'true' : undefined);
  const work = async jobId => {
    const id = randomUUID(); const start = await r.call('citizen', 'ana', { action: 'aurelle-start-work', requestId: id, ...(jobId ? { jobId } : {}) });
    r.setNow(r.now + aurelleCharterTerms.hours * 3600 * 1000); const claim = await r.call('citizen', 'ana', { action: 'aurelle-claim-work', requestId: randomUUID(), shiftId: id });
    return { id, start, claim, order: (await r.db.prepare('SELECT work_order_id FROM work_shifts WHERE id=?').bind(id).first())?.work_order_id };
  };
  const issuances = async () => (await r.db.prepare('SELECT clerk_user_id, amount_minor, source FROM crown_issuances ORDER BY issued_at').all()).results.map(x => [x.clerk_user_id, Number(x.amount_minor), x.source]);
  const plan = async () => (await r.call('citizen', 'ana')).data.aurellePlan;
  return { r, work, issuances, plan };
}

test('the two ARC charter jobs (quarrying, foundry), [ASSUMPTION] terms copied from the food estate', () => {
  assert.deepEqual(Object.keys(aurelleCharterJobs), ['aurelle-quarry-charter', 'aurelle-foundry-charter']);
  assert.deepEqual(Object.keys(aurelleCharterJobs).map(id => mvpJobs.find(j => j.id === id)?.type), ['quarrying', 'foundry']);
  assert.deepEqual(aurelleCharterTerms, { capacityCost: 4, hours: 2, wageMinor: 800 });
  assert.equal(isAurelleCharter('aurelle-food-estate'), false);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag on, each charter pays 800 CRN from the treasury and writes one Crown issuance; wallet and treasury move together; reconciliation balances`, async t => {
    const { r, work, issuances, plan } = await aurelle(t, { backend });
    const before = await plan(); let n = 0;
    for (const job of Object.keys(aurelleCharterJobs)) {
      const w = await work(job); assert.equal(w.start.status, 200, job); assert.equal(w.claim.status, 200, job); assert.equal(w.order, job); n++;
      const p = await plan();
      assert.equal(p.walletMinor, before.walletMinor + 800 * n); assert.equal(p.publicFundMinor, before.publicFundMinor - 800 * n);
      assert.equal(p.publicFoodRemaining, before.publicFoodRemaining); assert.equal(p.favor, before.favor, 'no estate food, no Favor');
      assert.equal(p.shifts[0].rewardItem, undefined);
    }
    assert.deepEqual(await issuances(), Array(2).fill(['ana', 800, 'aurelle-charter-wage']));
    const rec = await (await r.importModule('lib/ledger-reconciliation.ts')).reconcileLedger(r.db);
    assert.equal(rec.mismatchCount, 0, JSON.stringify(rec.mismatches));
  });

  test(`${backend}: flag off, a jobId is ignored: the food estate runs, no charter row; #957 still writes a food-estate issuance`, async t => {
    const { r, work, issuances, plan } = await aurelle(t, { on: false, backend });
    const w = await work('aurelle-quarry-charter');
    assert.equal(w.start.status, 200); assert.equal(w.claim.status, 200); assert.equal(w.order, 'aurelle-food-estate');
    assert.deepEqual(await issuances(), [['ana', 800, 'aurelle-food-estate-wage']]);
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM aurelle_charter_settlements').first()).n), 0);
    assert.equal((await plan()).shifts[0].rewardItem, 'estate food');
  });
}

test('flag on: no jobId or an unknown one is the food estate; an unfinished charter pays nothing; an empty treasury refuses; no issuance without a payment', async t => {
  const { r, work, issuances } = await aurelle(t);
  assert.equal((await work()).order, 'aurelle-food-estate'); assert.equal((await work('constructor')).order, 'aurelle-food-estate');
  // #957: the two food-estate wages each write an issuance; the refused charter adds none.
  assert.deepEqual(await issuances(), Array(2).fill(['ana', 800, 'aurelle-food-estate-wage']));
  const id = randomUUID(); assert.equal((await r.call('citizen', 'ana', { action: 'aurelle-start-work', requestId: id, jobId: 'aurelle-foundry-charter' })).status, 200);
  assert.equal((await r.call('citizen', 'ana', { action: 'aurelle-claim-work', requestId: randomUUID(), shiftId: id })).status, 409, 'unfinished');
  r.setNow(r.now + 7200 * 1000); await r.db.prepare("UPDATE aurelle_resources SET initial_minor=0 WHERE id='estate'").run();
  assert.equal((await r.call('citizen', 'ana', { action: 'aurelle-claim-work', requestId: randomUUID(), shiftId: id })).status, 409, 'the treasury cannot cover it');
  assert.deepEqual(await issuances(), Array(2).fill(['ana', 800, 'aurelle-food-estate-wage']), 'no issuance without a payment');
});

test('migration 0091 (pg and drizzle) creates both tables; the Crown issuance rides in the settle batch', async () => {
  for (const f of ['../db/postgres/0091_aurelle_charter_jobs.sql', '../drizzle/0091_aurelle_charter_jobs.sql']) {
    const sql = await readFile(new URL(f, import.meta.url), 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS aurelle_charter_settlements/); assert.match(sql, /CREATE TABLE IF NOT EXISTS crown_issuances/);
  }
  const src = await readFile(new URL('../lib/aurelle.ts', import.meta.url), 'utf8');
  assert.match(src, /aurelleCharterSettleSql/); assert.match(src, /crownIssuanceSql/); // #885: settle may be capped before issuance
});
