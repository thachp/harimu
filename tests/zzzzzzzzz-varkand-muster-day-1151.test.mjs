/** #1151: Varkand next Muster Day once per game year (30 real days) from the Chair anchor (#1085).
 *  Flag HARIMU_VARKAND_MUSTER_DAY_ENABLED in HARIMU_GRAY_PACK. Flag off: no musterDay key.
 *  Musters no troops, changes no Alert Level. [ASSUMPTION] cadence = 30 real days. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, withVarkandMusterDay } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { VARKAND_MUSTER_DAY_INTERVAL_DAYS, VARKAND_MUSTER_DAY_MS, varkandNextMusterDayAt } from '../lib/varkand-muster-day.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {}, hoarvaleAssent: true, now: 0 };
const day = 86_400_000;
const F = 'HARIMU_VARKAND_MUSTER_DAY_ENABLED';
const cycle = 30 * day;

test("Muster Day is once per game year (30 real days) on the Chair anchor", () => {
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(VARKAND_MUSTER_DAY_INTERVAL_DAYS, 30);
  assert.equal(VARKAND_MUSTER_DAY_INTERVAL_DAYS, realDaysPerGameYear);
  assert.equal(VARKAND_MUSTER_DAY_MS, cycle);
  assert.equal(varkandNextMusterDayAt(VARKAND_CHAIR_ANCHOR_MS), cycle);
  assert.equal(varkandNextMusterDayAt(cycle - 1), cycle);
  assert.equal(varkandNextMusterDayAt(cycle), 2 * cycle);
  assert.equal(varkandNextMusterDayAt(cycle + 1), 2 * cycle);
  assert.equal(varkandNextMusterDayAt(-1), cycle);
  for (const now of [0, cycle * 3 + 7, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0.9, NaN, Infinity, -Infinity]) {
    const next = varkandNextMusterDayAt(now);
    assert.equal(Number.isSafeInteger(next), true, String(now));
    assert.equal(next % cycle, 0, String(now));
    assert.ok(next > VARKAND_CHAIR_ANCHOR_MS, String(now));
  }
});

test('flag off leaves the snapshot unchanged; other nations gain no musterDay key', () => {
  for (const nationId of ['hoarvale', 'korund', 'aurelle', 'kindle', 'veldwood', 'ilmar', 'meridian', 'confluence', 'fulmara']) {
    const snapshot = ['veldwood', 'ilmar', 'meridian', 'confluence', 'fulmara'].includes(nationId)
      ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
      : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withVarkandMusterDay(snapshot, day, true), snapshot, nationId);
    assert.equal('musterDay' in snapshot, false);
  }
  const varkand = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'varkand' };
  assert.equal(withVarkandMusterDay(varkand, day, false), varkand);
  const on = withVarkandMusterDay(varkand, day, true);
  assert.deepEqual(on.musterDay, { nextAt: cycle, intervalDays: 30, mustersTroops: false });
  assert.equal('musterDay' in varkand, false, 'input not mutated');
  assert.deepEqual({ ...on, musterDay: undefined }, { ...varkand, musterDay: undefined }, 'musters no troops');
  assert.deepEqual(publicGovernmentSnapshot(on).musterDay, on.musterDay);
  assert.equal('musterDay' in publicGovernmentSnapshot(varkand), false);
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

test('government read: flag off unchanged, flag on adds musterDay, other nations unaffected', async t => {
  // Muster Day rides on an existing Varkand read (Directorate here); with every Varkand flag off the read stays null.
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const next = varkandNextMusterDayAt(seconds * 1000);
  const off = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandDirectorate: true });
  assert.equal(await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandMusterDay: true }), null, 'no Varkand read: still null');
  assert.equal(off != null && 'musterDay' in off, false, 'flag off');
  const on = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandDirectorate: true, varkandMusterDay: true });
  assert.deepEqual(on.musterDay, { nextAt: next, intervalDays: 30, mustersTroops: false });
  assert.deepEqual({ ...on, musterDay: undefined }, { ...off, musterDay: undefined });
  for (const nationId of ['hoarvale', 'korund', 'aurelle', 'kindle', 'ilmar']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, varkandMusterDay: true });
    assert.equal(other == null || !('musterDay' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_VARKAND_DIRECTORATE_ENABLED: 'true' }));
  const before = (await r.call('citizen', 'alice')).data.government;
  assert.equal(before == null || !('musterDay' in before), true, 'flag off');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_VARKAND_DIRECTORATE_ENABLED: 'true', [F]: 'true' }));
  assert.equal((await r.call('citizen', 'alice')).data.government.musterDay.nextAt, next);
  r.setFixtureEnv(F, 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.equal(direct == null || !('musterDay' in direct), true, 'a direct false wins');
});
