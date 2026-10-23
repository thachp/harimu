/** #737 Korund Plan medals for weekly quota over-fulfilment (docs 12.11), behind HARIMU_KORUND_MEDALS_ENABLED. Derived on read: no table, no migration. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { korundMedalCopy, korundWeeklyQuotaFood, korundQuotaValueText } from '../lib/korund-coupons.ts';
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
  assert.equal(korundMedalCopy.over(130), 'Plan over-fulfilled: 130%');
  assert.equal(korundMedalCopy.over(112.6), 'Plan over-fulfilled: 113%');
  assert.ok(korundMedalCopy.over(1000).length <= 40 && korundMedalCopy.count(999).length <= 40, '40-character label rule');
  assert.equal(korundMedalCopy.overSub, "The unit's quota is met. Extra food still counts.");
  assert.equal(korundMedalCopy.count(0), 'Plan medals: none yet'); assert.equal(korundMedalCopy.count(3), 'Plan medals: 3');
  assert.equal(korundMedalCopy.rule, `One medal per closed week when your unit reaches its ${korundWeeklyQuotaFood}-food target and you supplied at least ${korundMedalOwnFood} food yourself.`);
  const panel = await readFile(new URL('../app/korund-plan-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /korundMedalCopy\.over\(over\)/); assert.match(panel, /korundMedalCopy\.count\(medals\.total\)/); assert.match(panel, /korundMedalCopy\.rule/);
  assert.doesNotMatch(panel, /Plan medals:|Plan over-fulfilled/, 'no hard-coded medal copy in the panel');
  assert.match(panel, /const over = medals &&/, 'flag off (no medals): no over-fulfilled line');
});

/** Every SQL statement prepared while `fn` runs. */
async function sqlDuring(r, fn) {
  const seen = [], prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { seen.push(sql.replace(/\s+/g, ' ').trim()); return prepare(sql); };
  try { await fn(); } finally { r.db.prepare = prepare; }
  return seen;
}
const isMedalQuery = sql => /FROM korund_settlements WHERE clerk_user_id=\? AND settled_at>=\? AND settled_at<\?/.test(sql) || /SUM\(food_output\),0\) AS n FROM korund_settlements/.test(sql);
const isWrite = sql => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);

test('QA3 B1/B2/B3/B5: half-open week windows at exact boundaries (epoch+W-1, epoch+W, epoch+2W); a 40-food unit reached only by a boundary shift', async t => {
  const { r, epoch } = await setup(t);
  assert.equal(epoch % 7200, 0, 'epoch is tick-aligned epoch seconds from world_clock (no timezone)');
  const W = WEEK;
  // week 1: alice 1 inside + 1 at epoch+W-1 (own 8); bob 7 inside -> unit 36: no medal for anyone in week 1
  await settle(r, 'alice', epoch + 100, 1); await settle(r, 'alice', epoch + W - 1, 1); await settle(r, 'bob', epoch + 200, 7);
  // week 2: bob 1 at exactly epoch+W (the boundary shift that reaches 40) + 8 inside; alice 1 inside -> unit 40, bob medal, alice own 4
  await settle(r, 'bob', epoch + W, 1); await settle(r, 'bob', epoch + W + 200, 8); await settle(r, 'alice', epoch + W + 100, 1);
  // week 3 (open): alice 2 at exactly epoch+2W, bob 10 inside -> must not count
  await settle(r, 'alice', epoch + 2 * W, 2); await settle(r, 'bob', epoch + 2 * W + 200, 10);
  r.setNow((epoch + 2 * W + 5000) * 1000);
  assert.deepEqual((await plan(r, 'bob')).medals, { total: 1, lastWeek: true }, 'bob: week 2 only (B1 would add week 1 = 40 by double-counting epoch+W; B2 would drop it from week 2)');
  assert.deepEqual((await plan(r, 'alice')).medals, { total: 0, lastWeek: false }, 'alice: epoch+W-1 is week 1 (B5 +1h would move it into week 2 and award one); week 3 is open');
  r.setNow((epoch + 2 * W) * 1000);
  assert.deepEqual((await plan(r, 'bob')).medals, { total: 1, lastWeek: true }, 'at exactly the week-3 start, week 2 is closed and week 3 shifts are not read as closed');
});

test('QA3 F1: flag off runs no medal query at all (spy), against a flag-on baseline that does', async t => {
  const on = await setup(t); await settle(on.r, 'alice', on.epoch + 100, 2); await settle(on.r, 'bob', on.epoch + 200, 8); on.r.setNow((on.epoch + WEEK + 100) * 1000);
  assert.ok((await sqlDuring(on.r, () => plan(on.r))).some(isMedalQuery), 'baseline: flag on reads the medal queries');
  const off = await setup(t, false); await settle(off.r, 'alice', off.epoch + 100, 2); await settle(off.r, 'bob', off.epoch + 200, 8); off.r.setNow((off.epoch + WEEK + 100) * 1000);
  const sql = await sqlDuring(off.r, () => plan(off.r));
  assert.equal(sql.filter(isMedalQuery).length, 0, 'flag off: no medal query'); assert.equal('medals' in (await plan(off.r)), false);
});

test('QA3 S1: Korund only; a citizen who earned a medal in Korund and then left gets no medals field', async t => {
  const { r, epoch } = await setup(t); await settle(r, 'alice', epoch + 100, 2); await settle(r, 'bob', epoch + 200, 8);
  r.setNow((epoch + WEEK + 100) * 1000);
  assert.deepEqual((await plan(r, 'bob')).medals, { total: 1, lastWeek: true });
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='bob'").run();
  const left = await plan(r, 'bob'); assert.equal(left?.medals, undefined, 'left Korund: no medals');
  assert.equal(left?.medals?.total ?? 0, 0, 'ARC/QA2: a non-Korund citizen has zero medals');
  await r.db.prepare(`INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('carol','kindle','carol',18,0,'Good standing',?,?)`).bind(new Date(r.now).toISOString(), new Date(r.now).toISOString()).run();
  const never = await plan(r, 'carol'); assert.equal(never?.medals, undefined); assert.equal(never?.medals?.total ?? 0, 0, 'never-Korund citizen: zero medals');
  assert.equal((await sqlDuring(r, () => plan(r, 'bob'))).filter(isMedalQuery).length, 0, 'and no medal query for a non-Korund citizen');
});

test('QA3: repeated flag-on GETs make no writes', async t => {
  const { r, epoch } = await setup(t); await settle(r, 'alice', epoch + 100, 2); await settle(r, 'bob', epoch + 200, 8);
  r.setNow((epoch + WEEK + 100) * 1000); await plan(r);
  const sql = await sqlDuring(r, async () => { for (let i = 0; i < 3; i++) await plan(r); });
  assert.ok(sql.some(isMedalQuery)); assert.deepEqual(sql.filter(isWrite), [], 'GET /citizen with medals on is read-only');
});

test('ARC: the quota bar screen-reader text says over-fulfilled above 100%, and is unchanged otherwise', async () => {
  assert.equal(korundQuotaValueText(52, 40, 8, 130), '52 of 40 food, over-fulfilled at 130%; your contribution 8');
  assert.equal(korundQuotaValueText(40, 40, 8, 0), '40 of 40 food; your contribution 8', 'at target: unchanged #41 text');
  assert.equal(korundQuotaValueText(52, 40, 8), '52 of 40 food; your contribution 8', 'flag off (over = 0): unchanged');
  const panel = await readFile(new URL('../app/korund-plan-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /aria-valuetext=\{korundQuotaValueText\(quota\.unitFood, quota\.targetFood, quota\.ownFood, over\)\}/);
});
