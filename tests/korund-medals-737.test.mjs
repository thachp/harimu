/** #737 Korund Plan medals for weekly quota over-fulfilment (docs 12.11), behind HARIMU_KORUND_MEDALS_ENABLED. Derived on read: no table, no migration. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { korundMedalCopy, korundWeeklyQuotaFood } from '../lib/korund-coupons.ts';
import { readFile } from 'node:fs/promises';
import { korundMedalOwnFood, earnsMedal, planMedals, overFulfilledPercent } from '../lib/korund-medals-rules.ts';

const WEEK = 50400;
test('rules: medal at target with own >= 8; no medal below either boundary or for an open week; over-fulfilment is unclamped', () => {
  assert.equal(korundMedalOwnFood, 8);
  assert.equal(earnsMedal({ week: 1, unitFood: 40, ownFood: 8 }, 40), true);
  assert.equal(earnsMedal({ week: 1, unitFood: 39, ownFood: 8 }, 40), false);
  assert.equal(earnsMedal({ week: 1, unitFood: 40, ownFood: 7 }, 40), false);
  assert.deepEqual(planMedals([{ week: 1, unitFood: 40, ownFood: 8 }, { week: 1, unitFood: 40, ownFood: 8 }, { week: 3, unitFood: 99, ownFood: 99 }], 3, 40), { total: 1, lastWeek: false }, 'one per week; week 3 is open');
  assert.deepEqual(planMedals([{ week: 2, unitFood: 44, ownFood: 8 }], 3, 40), { total: 1, lastWeek: true });
  assert.equal(overFulfilledPercent(40, 40), 0); assert.equal(overFulfilledPercent(52, 40), 130);
});

async function setup(t, on = true) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  r.setFixtureEnv('HARIMU_KORUND_MEDALS_ENABLED', on ? 'true' : undefined);
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

test('flag on: a closed week at target with own >= 8 gives exactly one medal; re-reads never add one; open week gives none', async t => {
  const { r, epoch } = await setup(t);
  await settle(r, 'alice', epoch + 100, 2); await settle(r, 'bob', epoch + 200, 8);    // unit 40, alice 8
  r.setNow((epoch + 1000) * 1000); assert.deepEqual((await plan(r)).medals, { total: 0, lastWeek: false }, 'week 1 still open');
  r.setNow((epoch + WEEK + 100) * 1000);
  assert.deepEqual((await plan(r)).medals, { total: 1, lastWeek: true });
  assert.deepEqual((await plan(r)).medals, { total: 1, lastWeek: true }, 'idempotent re-read');
  assert.deepEqual((await plan(r, 'bob')).medals, { total: 1, lastWeek: true });
});

test('no medal when the unit missed its target or own share is below 8', async t => {
  const { r, epoch } = await setup(t);
  await settle(r, 'alice', epoch + 100, 2); await settle(r, 'bob', epoch + 200, 7);    // unit 36
  await settle(r, 'alice', epoch + WEEK + 100, 1); await settle(r, 'bob', epoch + WEEK + 200, 10); // week 2: unit 44, alice 4
  r.setNow((epoch + 2 * WEEK + 100) * 1000);
  assert.deepEqual((await plan(r)).medals, { total: 0, lastWeek: false });
  assert.deepEqual((await plan(r, 'bob')).medals, { total: 1, lastWeek: true }, 'bob: week 2 only');
});

test('flag off: no medals field, quota unchanged', async t => {
  const { r, epoch } = await setup(t, false);
  await settle(r, 'alice', epoch + 100, 2); await settle(r, 'bob', epoch + 200, 8);
  r.setNow((epoch + WEEK + 100) * 1000);
  assert.equal('medals' in (await plan(r)), false);
});

test('copy (Content, #737): exact strings, whole-number percent, none-yet at 0; the rule line matches the constants; panel uses the copy module only', async () => {
  assert.equal(korundMedalCopy.over(130), 'Plan over-fulfilled: 130% of the weekly target');
  assert.equal(korundMedalCopy.over(112.6), 'Plan over-fulfilled: 113% of the weekly target');
  assert.equal(korundMedalCopy.overSub, "The unit's quota is met. Extra food still counts.");
  assert.equal(korundMedalCopy.count(0), 'Plan medals: none yet'); assert.equal(korundMedalCopy.count(3), 'Plan medals: 3');
  assert.equal(korundMedalCopy.rule, `One medal per closed week when your unit reaches its ${korundWeeklyQuotaFood}-food target and you supplied at least ${korundMedalOwnFood} food yourself.`);
  const panel = await readFile(new URL('../app/korund-plan-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /korundMedalCopy\.over\(over\)/); assert.match(panel, /korundMedalCopy\.count\(medals\.total\)/); assert.match(panel, /korundMedalCopy\.rule/);
  assert.doesNotMatch(panel, /Plan medals:|Plan over-fulfilled/, 'no hard-coded medal copy in the panel');
  assert.match(panel, /const over = medals &&/, 'flag off (no medals): no over-fulfilled line');
});
