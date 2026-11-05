/** #1145: Kindle next Founders' Forge Day once per game year (30 real days) from the Chair anchor (#1085).
 *  Flag HARIMU_KINDLE_FOUNDERS_FORGE_DAY_ENABLED in HARIMU_GRAY_PACK. Flag off: no foundersForgeDay key.
 *  Opens no fair, lists no stalls, proposes no spending. [ASSUMPTION] cadence = 30 real days. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, withKindleFoundersForgeDay } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { KINDLE_FOUNDERS_FORGE_INTERVAL_DAYS, KINDLE_FOUNDERS_FORGE_MS, kindleNextFoundersForgeDayAt } from '../lib/kindle-founders-forge-day.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {}, hoarvaleAssent: true, now: 0 };
const day = 86_400_000;
const F = 'HARIMU_KINDLE_FOUNDERS_FORGE_DAY_ENABLED';
const cycle = 30 * day;

test("Founders' Forge Day is once per game year (30 real days) on the Chair anchor", () => {
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(KINDLE_FOUNDERS_FORGE_INTERVAL_DAYS, 30);
  assert.equal(KINDLE_FOUNDERS_FORGE_INTERVAL_DAYS, realDaysPerGameYear);
  assert.equal(KINDLE_FOUNDERS_FORGE_MS, cycle);
  assert.equal(kindleNextFoundersForgeDayAt(VARKAND_CHAIR_ANCHOR_MS), cycle);
  assert.equal(kindleNextFoundersForgeDayAt(cycle - 1), cycle);
  assert.equal(kindleNextFoundersForgeDayAt(cycle), 2 * cycle);
  assert.equal(kindleNextFoundersForgeDayAt(cycle + 1), 2 * cycle);
  assert.equal(kindleNextFoundersForgeDayAt(-1), cycle);
  for (const now of [0, cycle * 3 + 7, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0.9, NaN, Infinity, -Infinity]) {
    const next = kindleNextFoundersForgeDayAt(now);
    assert.equal(Number.isSafeInteger(next), true, String(now));
    assert.equal(next % cycle, 0, String(now));
    assert.ok(next > VARKAND_CHAIR_ANCHOR_MS, String(now));
  }
});

test('flag off leaves the snapshot unchanged; other nations gain no foundersForgeDay key', () => {
  for (const nationId of ['hoarvale', 'korund', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian', 'confluence', 'fulmara']) {
    const snapshot = ['varkand', 'veldwood', 'ilmar', 'meridian', 'confluence', 'fulmara'].includes(nationId)
      ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
      : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withKindleFoundersForgeDay(snapshot, day, true), snapshot, nationId);
    assert.equal('foundersForgeDay' in snapshot, false);
  }
  const kindle = simulateGovernment({ ...baseInput, nationId: 'kindle' });
  assert.equal(withKindleFoundersForgeDay(kindle, day, false), kindle);
  const on = withKindleFoundersForgeDay(kindle, day, true);
  assert.deepEqual(on.foundersForgeDay, { nextAt: cycle, intervalDays: 30, opensFair: false });
  assert.equal('foundersForgeDay' in kindle, false, 'input not mutated');
  assert.deepEqual({ ...on, foundersForgeDay: undefined }, { ...kindle, foundersForgeDay: undefined }, 'opens no fair and proposes no spend');
  assert.deepEqual(publicGovernmentSnapshot(on).foundersForgeDay, on.foundersForgeDay);
  assert.equal('foundersForgeDay' in publicGovernmentSnapshot(kindle), false);
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

test('government read: flag off unchanged, flag on adds foundersForgeDay, other nations unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const next = kindleNextFoundersForgeDayAt(seconds * 1000);
  const off = await gov.readGovernment(r.db, 'kindle', seconds, 'alice', { readOnly: true });
  assert.equal(off != null && 'foundersForgeDay' in off, false, 'flag off');
  const on = await gov.readGovernment(r.db, 'kindle', seconds, 'alice', { readOnly: true, kindleFoundersForgeDay: true });
  assert.deepEqual(on.foundersForgeDay, { nextAt: next, intervalDays: 30, opensFair: false });
  assert.deepEqual({ ...on, foundersForgeDay: undefined }, { ...off, foundersForgeDay: undefined });
  for (const nationId of ['hoarvale', 'korund', 'aurelle', 'varkand', 'ilmar']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, kindleFoundersForgeDay: true });
    assert.equal(other == null || !('foundersForgeDay' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  const before = (await r.call('citizen', 'alice')).data.government;
  assert.equal(before == null || !('foundersForgeDay' in before), true, 'flag off');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [F]: 'true' }));
  assert.equal((await r.call('citizen', 'alice')).data.government.foundersForgeDay.nextAt, next);
  r.setFixtureEnv(F, 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.equal(direct == null || !('foundersForgeDay' in direct), true, 'a direct false wins');
});
