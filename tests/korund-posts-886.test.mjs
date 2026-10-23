/** #886 (b): Korund's four Labor Bureau posts are playable shifts paid in Labor Notes from the state pool; each payment writes one Labor Note issuance
 *  record (ARC on #886/#885). Behind HARIMU_MVP_JOB_TYPES_ENABLED: flag off, korund-start-work is the food brigade exactly as before. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { korundPosts, korundPostTerms, isKorundPost } from '../lib/korund-posts.ts';
import { bureauJobs } from '../lib/labor-bureau-rules.ts';
import { mvpJobs } from '../lib/mvp-job-types.ts';

async function korund(t, { on = true, backend = 'sqlite' } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  await r.call('citizen', 'ana', { action: 'enroll', nationId: 'kindle', expectedNationId: null }); await r.db.prepare("UPDATE citizens SET nation_id='korund', capacity=24").run(); await r.call('world', null);
  r.setFixtureEnv('HARIMU_MVP_JOB_TYPES_ENABLED', on ? 'true' : undefined);
  const post = (job, user = 'ana') => r.db.prepare("INSERT INTO korund_job_assignments (id,clerk_user_id,job_id,outcome,reasons,assigned_at) VALUES (?,?,?,'first-choice','[]',?)").bind(randomUUID(), user, job, Math.floor(r.now / 1000)).run();
  const work = async (user = 'ana') => {
    const id = randomUUID(); const start = await r.call('citizen', user, { action: 'korund-start-work', requestId: id });
    r.setNow(r.now + korundPostTerms.hours * 3600 * 1000); const claim = await r.call('citizen', user, { action: 'korund-claim-work', shiftId: id });
    return { id, start, claim, order: (await r.db.prepare('SELECT work_order_id FROM work_shifts WHERE id=?').bind(id).first())?.work_order_id };
  };
  const issuances = async () => (await r.db.prepare('SELECT shift_id, clerk_user_id, amount_minor, source FROM labor_note_issuances ORDER BY issued_at').all()).results.map(x => ({ ...x, amount_minor: Number(x.amount_minor) }));
  const plan = async () => (await r.call('citizen', 'ana')).data.korundPlan;
  return { r, post, work, issuances, plan };
}

test('the four posts are the Bureau posts other than the brigade, and the catalog types them', () => {
  assert.deepEqual(Object.keys(korundPosts).sort(), bureauJobs.map(j => j.id).filter(id => id !== 'korund-food-production').sort());
  for (const id of Object.keys(korundPosts)) assert.equal(mvpJobs.find(j => j.id === id)?.nation, 'korund');
  assert.deepEqual(korundPostTerms, { capacityCost: 4, hours: 2, wageMinor: 800 }, '[ASSUMPTION] copied from the brigade');
  assert.equal(isKorundPost('korund-food-production'), false); assert.equal(isKorundPost('constructor'), false);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag on, each post pays 800 LN from the state pool and writes one issuance record; wallet and pool move together; reconciliation balances`, async t => {
    const { r, post, work, issuances, plan } = await korund(t, { backend });
    const before = await plan();
    let n = 0;
    for (const job of Object.keys(korundPosts)) {
      await post(job); const w = await work();
      assert.equal(w.start.status, 200, job); assert.equal(w.claim.status, 200, job); assert.equal(w.order, job); n++;
      const p = await plan();
      assert.equal(p.walletMinor, before.walletMinor + 800 * n); assert.equal(p.publicFundMinor, before.publicFundMinor - 800 * n);
      assert.equal(p.publicFoodRemaining, before.publicFoodRemaining, 'posts produce no state food');
      assert.equal(p.shifts[0].rewardItem, undefined);
    }
    assert.deepEqual((await issuances()).map(i => [i.clerk_user_id, i.amount_minor, i.source]), Array(4).fill(['ana', 800, 'korund-post-wage']));
    const rec = await (await r.importModule('lib/ledger-reconciliation.ts')).reconcileLedger(r.db);
    assert.equal(rec.mismatchCount, 0, JSON.stringify(rec.mismatches));
  });

  test(`${backend}: flag off, a post assignment still works the food brigade, no post table row, no issuance`, async t => {
    const { r, post, work, issuances, plan } = await korund(t, { on: false, backend });
    await post('korund-quarry-gang'); const w = await work();
    assert.equal(w.start.status, 200); assert.equal(w.claim.status, 200); assert.equal(w.order, 'korund-food-production');
    assert.deepEqual(await issuances(), []);
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM korund_post_settlements').first()).n), 0);
    assert.equal((await plan()).shifts[0].rewardItem, 'state food');
  });
}

test('flag on: the brigade assignment (or none) is unchanged; a replayed claim is idempotent and pays once; an unfinished shift pays nothing; an empty pool refuses', async t => {
  const { r, post, work, issuances } = await korund(t);
  assert.equal((await work()).order, 'korund-food-production', 'no assignment yet');
  await post('korund-food-production'); assert.equal((await work()).order, 'korund-food-production');
  await post('korund-rail-crew'); const w = await work();
  assert.equal((await r.call('citizen', 'ana', { action: 'korund-claim-work', shiftId: w.id })).status, 200, 'a replayed claim answers as before (idempotent)');
  assert.equal((await issuances()).length, 1);
  const early = randomUUID(); assert.equal((await r.call('citizen', 'ana', { action: 'korund-start-work', requestId: early })).status, 200);
  assert.equal((await r.call('citizen', 'ana', { action: 'korund-claim-work', shiftId: early })).status, 409, 'unfinished');
  r.setNow(r.now + 7200 * 1000);
  await r.db.prepare("UPDATE korund_resources SET initial_minor=0 WHERE id='state'").run();
  assert.equal((await r.call('citizen', 'ana', { action: 'korund-claim-work', shiftId: early })).status, 409, 'the pool cannot cover it');
  assert.equal((await issuances()).length, 1, 'no issuance without a payment');
});

test('migration 0089 (pg and drizzle) creates both tables; the issuance row rides in the settle batch', async () => {
  for (const f of ['../db/postgres/0089_korund_post_shifts.sql', '../drizzle/0089_korund_post_shifts.sql']) {
    const sql = await readFile(new URL(f, import.meta.url), 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS korund_post_settlements/); assert.match(sql, /CREATE TABLE IF NOT EXISTS labor_note_issuances/);
  }
  const src = await readFile(new URL('../lib/korund.ts', import.meta.url), 'utf8');
  assert.match(src, /db\.batch\(\[db\.prepare\(korundPoolLockSql\),db\.prepare\(postSettleSql\)[^\n]*db\.prepare\(laborNoteIssuanceSql\)/); // #906: pool row lock first
  assert.match(src, /const post=options\.mvpJobTypes\?/);
});
