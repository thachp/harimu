/** #776 Korund plan shortfall cuts next week's ration coupons (docs 12.11 step 4), behind HARIMU_KORUND_RATION_CUT_ENABLED. Derived on read. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { korundRationCut, korundRationCutStepPercent, korundRationCutCopy, applyRationCut, buildCoupons } from '../lib/korund-coupons.ts';

const W = 50400;
test('rules: met = no cut; 1-49% short withdraws goods; 50%+ also clothing; food ration is the floor and never cut', () => {
  assert.equal(korundRationCutStepPercent, 50);
  assert.equal(korundRationCut(2, 0), null); assert.equal(korundRationCut(1, 30), null, 'no closed week');
  assert.deepEqual(korundRationCut(2, 3).withdrawn, ['goods']); assert.deepEqual(korundRationCut(2, 49).withdrawn, ['goods']);
  assert.deepEqual(korundRationCut(2, 50).withdrawn, ['goods', 'clothing']); assert.deepEqual(korundRationCut(2, 100).withdrawn, ['goods', 'clothing']);
  const book = applyRationCut(buildCoupons(false, new Set(), 'x'), korundRationCut(2, 100));
  assert.equal(book.find(c => c.kind === 'food').withdrawn, undefined, 'floor: the food ration is never withdrawn');
  assert.equal(book.find(c => c.kind === 'food').quantity, 2);
});

test('copy mirrors Content rationCut (lib/ration-copy.ts) exactly; the panel uses the mirror only', async () => {
  const src = await readFile(new URL('../lib/ration-copy.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('export const rationCut='));
  assert.ok(block.includes(`label:'${korundRationCutCopy.label}'`));
  assert.ok(block.includes(`notice:L('${korundRationCutCopy.notice.replace("'", "\\'")}')`));
  const panel = await readFile(new URL('../app/korund-plan-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /\{plan\.rationCut && /); assert.match(panel, /korundRationCutCopy\.notice/); assert.doesNotMatch(panel, /ration-copy/);
});

async function setup(t, on = true, backend = 'sqlite') {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  r.setFixtureEnv('HARIMU_KORUND_RATION_CUT_ENABLED', on ? 'true' : undefined);
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  return { r, epoch };
}
async function settle(r, user, at, shifts) {
  for (let i = 0; i < shifts; i++) {
    const id = randomUUID(), iso = new Date((at + i) * 1000).toISOString();
    await r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, user, 'aurelle-food-estate', 'Korund fixture', '4 state food', 4, iso, iso, iso).run();
    await r.db.prepare('INSERT INTO korund_settlements(shift_id,clerk_user_id,wage_minor,food_output,settled_at) VALUES (?,?,800,4,?)').bind(id, user, at + i).run();
  }
}
const plan = async (r, user = 'alice') => (await r.call('citizen', user)).data.korundPlan;
const withdrawn = p => p.coupons.filter(c => c.withdrawn).map(c => c.kind);
async function sqlDuring(r, fn) {
  const seen = [], prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { seen.push(sql.replace(/\s+/g, ' ').trim()); return prepare(sql); };
  try { await fn(); } finally { r.db.prepare = prepare; }
  return seen;
}
const isCutQuery = sql => /SUM\(food_output\),0\) AS n FROM korund_settlements WHERE settled_at>=\? AND settled_at<\?/.test(sql);
const isWrite = sql => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: shortfall cuts next week's book; re-reads are stable; met week = no cut; redeem of a withdrawn coupon is refused`, async t => {
    const { r, epoch } = await setup(t, true, backend);
    await settle(r, 'bob', epoch + 100, 5); // week 1: 20 of 40 = 50% short
    r.setNow((epoch + 1000) * 1000); assert.equal((await plan(r)).rationCut, null, 'week 1: no closed week');
    r.setNow((epoch + W + 100) * 1000);
    const p = await plan(r);
    assert.deepEqual(p.rationCut, { week: 2, percent: 50, withdrawn: ['goods', 'clothing'] }); assert.deepEqual(withdrawn(p), ['clothing', 'goods']);
    assert.deepEqual((await plan(r)).rationCut, p.rationCut, 'idempotent'); assert.deepEqual((await plan(r, 'bob')).rationCut, p.rationCut, 'same for every member');
    const refused = await r.call('citizen', 'alice', { action: 'korund-redeem-coupon', requestId: randomUUID(), coupon: 'goods' });
    assert.equal(refused.status, 409); assert.equal(refused.data.reason, 'ration_cut');
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM korund_coupon_redemptions').first()).n), 0);
    await settle(r, 'bob', epoch + W + 200, 10); r.setNow((epoch + 2 * W + 100) * 1000);
    const met = await plan(r); assert.equal(met.rationCut, null); assert.deepEqual(withdrawn(met), []);
  });
}

test('week boundaries: a shift at epoch+W-1 counts for week 1, one at exactly epoch+W does not; 1 s before rollover there is no cut', async t => {
  const { r, epoch } = await setup(t);
  await settle(r, 'bob', epoch + 200, 9); await settle(r, 'alice', epoch + W - 1, 1); await settle(r, 'alice', epoch + W, 1);
  r.setNow((epoch + W) * 1000); assert.equal((await plan(r)).rationCut, null, 'week 1 = 40 with the W-1 shift');
  await r.db.prepare('DELETE FROM korund_settlements WHERE settled_at=?').bind(epoch + W - 1).run();
  assert.deepEqual((await plan(r)).rationCut?.withdrawn, ['goods'], '36 = 10% short: the W shift is not pulled back');
  r.setNow((epoch + W - 1) * 1000); assert.equal((await plan(r)).rationCut, null);
});

test('flag off: no rationCut field, no cut query (spy) vs flag-on baseline, coupons and redeem unchanged', async t => {
  const on = await setup(t); await settle(on.r, 'bob', on.epoch + 100, 1); on.r.setNow((on.epoch + W + 100) * 1000);
  assert.ok((await sqlDuring(on.r, () => plan(on.r))).some(isCutQuery));
  const off = await setup(t, false); await settle(off.r, 'bob', off.epoch + 100, 1); off.r.setNow((off.epoch + W + 100) * 1000);
  assert.equal((await sqlDuring(off.r, () => plan(off.r))).filter(isCutQuery).length, 0);
  const p = await plan(off.r); assert.equal('rationCut' in p, false); assert.deepEqual(withdrawn(p), []);
  assert.ok(p.coupons.every(c => !('withdrawn' in c)));
});

test('Korund only: a citizen who left Korund gets no field or query', async t => {
  const { r, epoch } = await setup(t); await settle(r, 'bob', epoch + 100, 1); r.setNow((epoch + W + 100) * 1000);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  assert.equal((await plan(r))?.rationCut, undefined);
  assert.equal((await sqlDuring(r, () => plan(r))).filter(isCutQuery).length, 0);
});

test('GET makes no writes', async t => {
  const { r, epoch } = await setup(t); await settle(r, 'bob', epoch + 100, 1); r.setNow((epoch + W + 100) * 1000); await plan(r);
  const sql = await sqlDuring(r, async () => { for (let i = 0; i < 3; i++) await plan(r); });
  assert.ok(sql.some(isCutQuery)); assert.deepEqual(sql.filter(isWrite), []);
});
