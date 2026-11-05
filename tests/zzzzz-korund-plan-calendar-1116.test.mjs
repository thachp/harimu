/** #1116: Korund Five-Year Plan start, next Plan Day (150 real days = 5 game years) and next quarterly Quota Rally
 *  (37.5 real days) from the Varkand Chair anchor (#1085). Flag HARIMU_KORUND_PLAN_CALENDAR_ENABLED, packed in HARIMU_GRAY_PACK.
 *  Flag off: no planCalendar key. The zzzzz- name sorts after earlier nation schedule files so --test-shard does not move them. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, withKorundPlanCalendar } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { KORUND_PLAN_INTERVAL_DAYS, KORUND_PLAN_INTERVAL_MS, KORUND_QUOTA_RALLIES_PER_PLAN, KORUND_QUOTA_RALLY_INTERVAL_MS, korundCurrentPlanStartedAt, korundNextPlanDayAt, korundNextQuotaRallyAt } from '../lib/korund-plan-calendar.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = 150 * day;
const quarter = 3_240_000_000;
const expected = now => ({ currentPlanStartedAt: korundCurrentPlanStartedAt(now), nextPlanDayAt: korundNextPlanDayAt(now), nextQuotaRallyAt: korundNextQuotaRallyAt(now), planIntervalDays: 150, quotaRalliesPerPlan: 4 });

test('a Five-Year Plan is 150 real days and a Quota Rally every exact-integer quarter of it', () => {
  assert.equal(anchor, 0);
  assert.equal(KORUND_PLAN_INTERVAL_DAYS, 150);
  assert.equal(KORUND_PLAN_INTERVAL_DAYS, 5 * realDaysPerGameYear);
  assert.equal(KORUND_PLAN_INTERVAL_MS, cycle);
  assert.equal(KORUND_QUOTA_RALLIES_PER_PLAN, 4);
  assert.equal(KORUND_QUOTA_RALLY_INTERVAL_MS, quarter);
  assert.equal(KORUND_QUOTA_RALLY_INTERVAL_MS * 4, cycle);
  assert.equal(Number.isSafeInteger(KORUND_QUOTA_RALLY_INTERVAL_MS), true);
});

test('Plan Day boundaries: exactly at a Plan Day the current Plan starts then and the following one is next', () => {
  for (const [now, start] of [[anchor, 0], [anchor - 1, 0], [1, 0], [cycle - 1, 0], [cycle, cycle], [cycle + 1, cycle], [2 * cycle - 1, cycle], [149 * day, 0]]) {
    assert.equal(korundCurrentPlanStartedAt(now), start, String(now));
    assert.equal(korundNextPlanDayAt(now), start + cycle, String(now));
  }
});

test('Quota Rally boundaries: quarterly, the following one next at a boundary, every fourth on a Plan Day', () => {
  assert.equal(korundNextQuotaRallyAt(anchor), quarter);
  assert.equal(korundNextQuotaRallyAt(anchor - 1), quarter);
  assert.equal(korundNextQuotaRallyAt(quarter - 1), quarter);
  assert.equal(korundNextQuotaRallyAt(quarter), 2 * quarter);
  assert.equal(korundNextQuotaRallyAt(quarter + 1), 2 * quarter);
  assert.equal(korundNextQuotaRallyAt(37 * day), quarter, 'day 37 is still before the first rally');
  assert.equal(korundNextQuotaRallyAt(38 * day), 2 * quarter);
  assert.equal(korundNextQuotaRallyAt(3 * quarter), cycle, 'the fourth rally falls on the next Plan Day');
  assert.equal(korundNextQuotaRallyAt(cycle - 1), korundNextPlanDayAt(cycle - 1));
  assert.equal(korundNextQuotaRallyAt(cycle), cycle + quarter);
});

test('Plan timestamps are safe integers on their cycles for odd inputs', () => {
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity, 1_793_000_000_000]) {
    const start = korundCurrentPlanStartedAt(now), plan = korundNextPlanDayAt(now), rally = korundNextQuotaRallyAt(now);
    for (const at of [start, plan, rally]) assert.equal(Number.isSafeInteger(at), true, String(now));
    assert.equal(start % cycle, 0); assert.equal(plan % cycle, 0); assert.equal(rally % quarter, 0);
    assert.equal(plan - start, cycle, String(now));
    assert.ok(rally > anchor && plan > anchor, String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - cycle) {
      assert.ok(start <= now && plan > now && rally > now && rally - now <= quarter && rally <= plan, String(now));
    }
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no planCalendar key', () => {
  for (const nationId of ['kindle', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian', 'hoarvale']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : ['varkand', 'veldwood', 'ilmar', 'meridian'].includes(nationId)
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withKorundPlanCalendar(snapshot, day, true), snapshot, nationId);
    assert.equal('planCalendar' in snapshot, false);
  }
  const korund = simulateGovernment({ ...baseInput, nationId: 'korund' });
  assert.equal(withKorundPlanCalendar(korund, day, false), korund);
  const on = withKorundPlanCalendar(korund, cycle + day, true);
  assert.deepEqual(on.planCalendar, { currentPlanStartedAt: cycle, nextPlanDayAt: 2 * cycle, nextQuotaRallyAt: cycle + quarter, planIntervalDays: 150, quotaRalliesPerPlan: 4 });
  assert.equal('planCalendar' in korund, false, 'the input is not mutated');
  assert.deepEqual({ ...on, planCalendar: undefined }, { ...korund, planCalendar: undefined }, 'no rally opened, no quota or spend changed');
  assert.deepEqual(publicGovernmentSnapshot(on).planCalendar, on.planCalendar);
  assert.equal('planCalendar' in publicGovernmentSnapshot(korund), false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  const key = 'HARIMU_KORUND_PLAN_CALENDAR_ENABLED';
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Korund government read is unchanged; flag on adds planCalendar; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const off = await gov.readGovernment(r.db, 'korund', seconds, 'alice', { readOnly: true });
  assert.equal(off != null && 'planCalendar' in off, false, 'flag off');
  const on = await gov.readGovernment(r.db, 'korund', seconds, 'alice', { readOnly: true, korundPlanCalendar: true });
  assert.deepEqual(on.planCalendar, expected(seconds * 1000));
  assert.deepEqual({ ...on, planCalendar: undefined }, { ...off, planCalendar: undefined });
  for (const nationId of ['kindle', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, korundPlanCalendar: true, meridianPartySchedule: true });
    assert.equal(other == null || !('planCalendar' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
  const before = (await r.call('citizen', 'alice')).data.government;
  assert.equal(before == null || !('planCalendar' in before), true, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_KORUND_PLAN_CALENDAR_ENABLED: 'true' }));
  const cal = (await r.call('citizen', 'alice')).data.government.planCalendar;
  assert.equal(cal.planIntervalDays, 150);
  assert.equal(cal.quotaRalliesPerPlan, 4);
  assert.equal(cal.nextPlanDayAt - cal.currentPlanStartedAt, cycle);
  r.setFixtureEnv('HARIMU_KORUND_PLAN_CALENDAR_ENABLED', 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.equal(direct == null || !('planCalendar' in direct), true, 'a direct false wins over the pack');
});
