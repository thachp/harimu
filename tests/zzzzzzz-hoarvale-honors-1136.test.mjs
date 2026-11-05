/** #1136: Hoarvale next Honors List Day once per game year (30 real days) from the Chair anchor (#1085).
 *  Flag HARIMU_HOARVALE_HONORS_LIST_DAY_ENABLED in HARIMU_GRAY_PACK. Flag off: no honorsListDay key.
 *  Awards no titles, lists no recipients, proposes no spending. [ASSUMPTION] cadence = 30 real days. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, withHoarvaleHonorsListDay } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { HOARVALE_HONORS_LIST_INTERVAL_DAYS, HOARVALE_HONORS_LIST_MS, hoarvaleNextHonorsListDayAt } from '../lib/hoarvale-honors-list-day.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {}, hoarvaleAssent: true, now: 0 };
const day = 86_400_000;
const F = 'HARIMU_HOARVALE_HONORS_LIST_DAY_ENABLED';
const cycle = 30 * day;

test('Honors List Day is once per game year (30 real days) on the Chair anchor', () => {
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(HOARVALE_HONORS_LIST_INTERVAL_DAYS, 30);
  assert.equal(HOARVALE_HONORS_LIST_INTERVAL_DAYS, realDaysPerGameYear);
  assert.equal(HOARVALE_HONORS_LIST_MS, cycle);
  assert.equal(hoarvaleNextHonorsListDayAt(VARKAND_CHAIR_ANCHOR_MS), cycle);
  assert.equal(hoarvaleNextHonorsListDayAt(cycle - 1), cycle);
  assert.equal(hoarvaleNextHonorsListDayAt(cycle), 2 * cycle);
  assert.equal(hoarvaleNextHonorsListDayAt(cycle + 1), 2 * cycle);
  assert.equal(hoarvaleNextHonorsListDayAt(-1), cycle);
  for (const now of [0, cycle * 3 + 7, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0.9, NaN, Infinity, -Infinity]) {
    const next = hoarvaleNextHonorsListDayAt(now);
    assert.equal(Number.isSafeInteger(next), true, String(now));
    assert.equal(next % cycle, 0, String(now));
    assert.ok(next > VARKAND_CHAIR_ANCHOR_MS, String(now));
  }
});

test('flag off leaves the snapshot unchanged; other nations gain no honorsListDay key', () => {
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian', 'confluence']) {
    const snapshot = ['varkand', 'veldwood', 'ilmar', 'meridian', 'confluence'].includes(nationId)
      ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
      : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withHoarvaleHonorsListDay(snapshot, day, true), snapshot, nationId);
    assert.equal('honorsListDay' in snapshot, false);
  }
  const hoarvale = simulateGovernment({ ...baseInput, nationId: 'hoarvale' });
  assert.equal(withHoarvaleHonorsListDay(hoarvale, day, false), hoarvale);
  const on = withHoarvaleHonorsListDay(hoarvale, day, true);
  assert.deepEqual(on.honorsListDay, { nextAt: cycle, intervalDays: 30, awardsTitles: false });
  assert.equal('honorsListDay' in hoarvale, false, 'input not mutated');
  assert.deepEqual({ ...on, honorsListDay: undefined }, { ...hoarvale, honorsListDay: undefined }, 'awards no titles and proposes no spend');
  assert.deepEqual(publicGovernmentSnapshot(on).honorsListDay, on.honorsListDay);
  assert.equal('honorsListDay' in publicGovernmentSnapshot(hoarvale), false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[F], undefined);
  assert.equal(prod.vars[F], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[F], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[F], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, F), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, F), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [F]: 'false' }, F), false);
});

test('government read: flag off unchanged, flag on adds honorsListDay, other nations unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const next = hoarvaleNextHonorsListDayAt(seconds * 1000);
  const off = await gov.readGovernment(r.db, 'hoarvale', seconds, 'alice', { readOnly: true, hoarvaleAssent: true });
  assert.equal(off != null && 'honorsListDay' in off, false, 'flag off');
  const on = await gov.readGovernment(r.db, 'hoarvale', seconds, 'alice', { readOnly: true, hoarvaleAssent: true, hoarvaleHonorsListDay: true });
  assert.deepEqual(on.honorsListDay, { nextAt: next, intervalDays: 30, awardsTitles: false });
  assert.deepEqual({ ...on, honorsListDay: undefined }, { ...off, honorsListDay: undefined });
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'ilmar']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, hoarvaleHonorsListDay: true });
    assert.equal(other == null || !('honorsListDay' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv('HARIMU_HOARVALE_ASSENT_ENABLED', 'true');
  const before = (await r.call('citizen', 'alice')).data.government;
  assert.equal(before == null || !('honorsListDay' in before), true, 'flag off');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [F]: 'true' }));
  assert.equal((await r.call('citizen', 'alice')).data.government.honorsListDay.nextAt, next);
  r.setFixtureEnv(F, 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.equal(direct == null || !('honorsListDay' in direct), true, 'a direct false wins');
});
