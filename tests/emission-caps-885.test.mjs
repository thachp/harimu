/** #885: Labor Note monthly and Crown yearly emission caps matching Spark's Charter Limit, behind HARIMU_EMISSION_CAPS_ENABLED.
 *  Flag off: settle and decree paths stay byte-identical (no cap binds). Preview true / production false. No migration. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import {
  charterMonthCap, charterYearCap, debasementEmissionAmount, emissionCapsConfig, emissionCapsEnabled,
  laborNoteMonthWindow, crownYearWindow,
} from '../lib/emission-caps-rules.ts';
import { sparkConfig } from '../lib/spark-supply-rules.ts';
import { korundPostTerms } from '../lib/korund-posts.ts';
import { aurelleCharterTerms } from '../lib/aurelle.ts';
import { crownConfig } from '../lib/crown-debasement-rules.ts';

test('pure rules: caps match Spark Charter Limit bp; LN is monthly, Crown is yearly (ARC on #885)', () => {
  assert.equal(emissionCapsConfig.laborNoteMonthBp, 1500);
  assert.equal(emissionCapsConfig.crownYearBp, 3000);
  assert.equal(emissionCapsConfig.laborNoteMonthBp, sparkConfig.charterMonthBp);
  assert.equal(emissionCapsConfig.crownYearBp, sparkConfig.charterYearBp);
  assert.equal(emissionCapsConfig.gameMonthSeconds, sparkConfig.gameMonthSeconds);
  assert.equal(emissionCapsConfig.gameYearSeconds, crownConfig.gameYearSeconds);
  assert.equal(charterMonthCap(100000), 15000);
  assert.equal(charterYearCap(100000), 30000);
  assert.equal(debasementEmissionAmount(100000, 1500), 15000);
  assert.equal(emissionCapsEnabled({ HARIMU_EMISSION_CAPS_ENABLED: 'true' }), true);
  for (const v of [undefined, 'false', 'TRUE', '1']) assert.equal(emissionCapsEnabled({ HARIMU_EMISSION_CAPS_ENABLED: v }), false);
  const m = laborNoteMonthWindow(emissionCapsConfig.gameMonthSeconds + 10, 0);
  assert.equal(m.month, 2); assert.equal(m.start, emissionCapsConfig.gameMonthSeconds); assert.equal(m.end, emissionCapsConfig.gameMonthSeconds * 2);
  const y = crownYearWindow(emissionCapsConfig.gameYearSeconds + 10, 0);
  assert.equal(y.year, 2); assert.equal(y.start, emissionCapsConfig.gameYearSeconds); assert.equal(y.end, emissionCapsConfig.gameYearSeconds * 2);
});

test('wrangler: preview true, production false; postSettleSql and aurelleCharterSettleSql stay unflagged constants', async () => {
  const preview = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const prod = await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...preview.matchAll(/"HARIMU_EMISSION_CAPS_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['true']);
  assert.deepEqual([...prod.matchAll(/"HARIMU_EMISSION_CAPS_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
  const posts = await readFile(new URL('../lib/korund-posts.ts', import.meta.url), 'utf8');
  const aurelle = await readFile(new URL('../lib/aurelle.ts', import.meta.url), 'utf8');
  assert.match(posts, /export const postSettleSql = `/);
  assert.match(posts, /export const laborNoteMonthCapSql = `/);
  assert.match(aurelle, /export const aurelleCharterSettleSql=/);
  assert.match(aurelle, /export const crownYearCapSql=/);
  assert.match(await readFile(new URL('../lib/korund.ts', import.meta.url), 'utf8'), /postSettleSql\+laborNoteMonthCapSql/);
  assert.match(aurelle, /aurelleCharterSettleSql\+crownYearCapSql/);
  assert.match(await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8'), /emissionCaps: \(env as unknown as \{ HARIMU_EMISSION_CAPS_ENABLED/);
});

async function korundCaps(t, { caps = true, mvp = true } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'ana', { action: 'enroll', nationId: 'kindle', expectedNationId: null });
  await r.db.prepare("UPDATE citizens SET nation_id='korund', capacity=24").run();
  await r.call('world', null);
  if (mvp) r.setFixtureEnv('HARIMU_MVP_JOB_TYPES_ENABLED', 'true');
  if (caps) r.setFixtureEnv('HARIMU_EMISSION_CAPS_ENABLED', 'true');
  const post = async (job = 'korund-quarry-gang') => {
    await r.db.prepare("INSERT INTO korund_job_assignments (id,clerk_user_id,job_id,outcome,reasons,assigned_at) VALUES (?,?,?,'first-choice','[]',?)")
      .bind(randomUUID(), 'ana', job, Math.floor(r.now / 1000)).run();
  };
  const work = async () => {
    const id = randomUUID();
    const start = await r.call('citizen', 'ana', { action: 'korund-start-work', requestId: id });
    r.setNow(r.now + korundPostTerms.hours * 3600 * 1000);
    const claim = await r.call('citizen', 'ana', { action: 'korund-claim-work', shiftId: id });
    return { id, start, claim };
  };
  return { r, post, work };
}

test('flag off: a Korund post still pays and writes an issuance (byte-identical settle path)', async t => {
  const { r, post, work } = await korundCaps(t, { caps: false });
  await post();
  const w = await work();
  assert.equal(w.start.status, 200); assert.equal(w.claim.status, 200);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM labor_note_issuances').first()).n), 1);
});

test('flag on: Labor Note monthly Charter Limit refuses a post wage that would pass 15% of state initial_minor', async t => {
  const { r, post, work } = await korundCaps(t);
  // Cap at 1500 on a 10_000 pool; one 800 wage fits, a second does not once 800 is already issued this month.
  await r.db.prepare("UPDATE korund_resources SET initial_minor=10000 WHERE id='state'").run();
  await post('korund-quarry-gang');
  const first = await work();
  assert.equal(first.start.status, 200); assert.equal(first.claim.status, 200);
  await r.db.prepare("UPDATE citizens SET capacity=24").run();
  await post('korund-foundry-hand');
  const second = await work();
  assert.equal(second.start.status, 200);
  assert.equal(second.claim.status, 409, 'second wage would push month sum 1600 past cap 1500');
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM labor_note_issuances').first()).n), 1);
  assert.equal(charterMonthCap(10000), 1500);
});

async function aurelleCaps(t, { caps = true, mvp = true, debasement = false } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'bob', { action: 'enroll', nationId: 'kindle', expectedNationId: null });
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle', capacity=24").run();
  await r.call('world', null);
  if (mvp) r.setFixtureEnv('HARIMU_MVP_JOB_TYPES_ENABLED', 'true');
  if (caps) r.setFixtureEnv('HARIMU_EMISSION_CAPS_ENABLED', 'true');
  if (debasement) r.setFixtureEnv('HARIMU_CROWN_DEBASEMENT_ENABLED', 'true');
  const work = async (job = 'aurelle-quarry-charter') => {
    const id = randomUUID();
    const start = await r.call('citizen', 'bob', { action: 'aurelle-start-work', requestId: id, jobId: job });
    r.setNow(r.now + aurelleCharterTerms.hours * 3600 * 1000);
    const claim = await r.call('citizen', 'bob', { action: 'aurelle-claim-work', requestId: randomUUID(), shiftId: id });
    return { id, start, claim };
  };
  return { r, work };
}

test('flag off: an Aurelle charter wage still pays and writes a Crown issuance', async t => {
  const { work } = await aurelleCaps(t, { caps: false });
  const w = await work();
  assert.equal(w.start.status, 200); assert.equal(w.claim.status, 200);
});

test('flag on: Crown yearly Charter Limit refuses a charter wage that would pass 30% of estate initial_minor', async t => {
  const { r, work } = await aurelleCaps(t);
  // Cap at 2400 on an 8000 pool; three 800 wages = 2400 fit, a fourth does not.
  await r.db.prepare("UPDATE aurelle_resources SET initial_minor=8000 WHERE id='estate'").run();
  assert.equal(charterYearCap(8000), 2400);
  for (let i = 0; i < 3; i++) {
    await r.db.prepare("UPDATE citizens SET capacity=24").run();
    const w = await work(i % 2 ? 'aurelle-foundry-charter' : 'aurelle-quarry-charter');
    assert.equal(w.start.status, 200, `start ${i}`); assert.equal(w.claim.status, 200, `claim ${i}`);
  }
  await r.db.prepare("UPDATE citizens SET capacity=24").run();
  const over = await work('aurelle-quarry-charter');
  assert.equal(over.start.status, 200);
  assert.equal(over.claim.status, 409, 'fourth wage would push year sum past 2400');
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM crown_issuances').first()).n), 3);
});

test('flag on: Crown debasement counts toward the yearly emission total and is refused when it would pass the cap', async t => {
  const { r } = await aurelleCaps(t, { mvp: false, debasement: true });
  await r.db.prepare("UPDATE aurelle_resources SET initial_minor=10000 WHERE id='estate'").run();
  assert.equal(charterYearCap(10000), 3000);
  // Fill most of the year with charter wages first: need mvp for wages — seed issuances directly to isolate the decree guard.
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  const now = epoch + 10;
  await r.db.prepare("INSERT INTO work_orders (id,nation_id,name,detail,capacity_cost,status,sort_order) VALUES ('aurelle-quarry-charter','aurelle','seed','seed',4,'closed',1000) ON CONFLICT DO NOTHING").run();
  await r.db.prepare("INSERT INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at) VALUES ('seed-shift','bob','aurelle-quarry-charter','seed','seed',4,?,?)")
    .bind(new Date(now*1000).toISOString(), new Date(now*1000).toISOString()).run();
  await r.db.prepare("INSERT INTO aurelle_charter_settlements(shift_id,clerk_user_id,job_id,wage_minor,settled_at) VALUES ('seed-shift','bob','aurelle-quarry-charter',2500,?)").bind(now).run();
  await r.db.prepare("INSERT INTO crown_issuances(id,shift_id,clerk_user_id,amount_minor,source,issued_at) VALUES ('crn-wage:seed-shift','seed-shift','bob',2500,'aurelle-charter-wage',?)").bind(now).run();
  const c = await r.importModule('lib/crown-debasement.ts');
  // 15% of 10000 = 1500; 2500+1500=4000 > 3000 → refused
  const refused = await c.decreeDebasement(r.db, { requestId: randomUUID(), percentBp: 1500 }, now, { enabled: true, emissionCaps: true });
  assert.equal(refused.ok, false); assert.equal(refused.reason, 'charter_limit');
  // 5% = 500; 2500+500=3000 → allowed
  const ok = await c.decreeDebasement(r.db, { requestId: randomUUID(), percentBp: 500 }, now, { enabled: true, emissionCaps: true });
  assert.equal(ok.ok, true); assert.equal(ok.decree.percentBp, 500);
  // Flag off: a large decree still lands (existing 15% parity cap only)
  await r.db.prepare('DELETE FROM crown_decrees').run();
  const uncapped = await c.decreeDebasement(r.db, { requestId: randomUUID(), percentBp: 1500 }, now + crownConfig.gameYearSeconds, { enabled: true });
  assert.equal(uncapped.ok, true, 'flag-off decree path unchanged');
});
