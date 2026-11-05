/** #1175: Meridian next Turbine Day on a fixed 30-real-day cycle from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_MERIDIAN_TURBINE_DAY_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no turbineDay key. #1178 Grand Regatta is last.
 *  Holds no grid output, power figure, or bonus. Shen Springs hosts it; the read stores the date and that city.
 *  The zzzzzzzzzzzz- name sorts after zzzzzzzzzzz-kindle-market-bell-1164 so Node's --test-shard
 *  round-robin does not move earlier files between Postgres shards.
 *  [ASSUMPTION] Docs §7.3 name the anniversary and give no interval. Cadence is one game year (30 real days), with no anniversary offset. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { meridianExamDaySnapshot, meridianPartySnapshot, meridianTurbineDaySnapshot, simulateGovernment, withMeridianExamDay, withMeridianTurbineDay } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { MERIDIAN_TURBINE_DAY_CYCLE_DAYS, MERIDIAN_TURBINE_DAY_HOST, MERIDIAN_TURBINE_DAY_MS, meridianNextTurbineDayAt } from '../lib/meridian-turbine-day.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const key = 'HARIMU_MERIDIAN_TURBINE_DAY_ENABLED';
const calendarKeys = ['cycleDays', 'host', 'nextAt'];

test('the next Turbine Day falls on a 30-real-day cycle from the Chair anchor', () => {
  assert.equal(MERIDIAN_TURBINE_DAY_CYCLE_DAYS, 30);
  assert.equal(MERIDIAN_TURBINE_DAY_CYCLE_DAYS, realDaysPerGameYear, 'one world-clock game year');
  assert.equal(MERIDIAN_TURBINE_DAY_MS, 30 * day);
  assert.equal(MERIDIAN_TURBINE_DAY_HOST, 'Shen Springs');
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(meridianNextTurbineDayAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + MERIDIAN_TURBINE_DAY_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * MERIDIAN_TURBINE_DAY_MS;
    assert.equal(meridianNextTurbineDayAt(at), at + MERIDIAN_TURBINE_DAY_MS);
    assert.equal(meridianNextTurbineDayAt(at + 1), at + MERIDIAN_TURBINE_DAY_MS);
  }
});

test('the boundary at exactly 30 real days moves to the following cycle, and the instant before stays on this one', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + MERIDIAN_TURBINE_DAY_MS;
  assert.equal(meridianNextTurbineDayAt(boundary - 1), boundary);
  assert.equal(meridianNextTurbineDayAt(boundary), boundary + MERIDIAN_TURBINE_DAY_MS);
  assert.equal(meridianNextTurbineDayAt(boundary + MERIDIAN_TURBINE_DAY_MS - 1), boundary + MERIDIAN_TURBINE_DAY_MS);
  assert.equal(meridianNextTurbineDayAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
});

test('nextAt is always a safe integer', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, MERIDIAN_TURBINE_DAY_MS, MERIDIAN_TURBINE_DAY_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = meridianNextTurbineDayAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % MERIDIAN_TURBINE_DAY_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no turbineDay key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'meridian' }), null);
  assert.equal(meridianTurbineDaySnapshot(MERIDIAN_TURBINE_DAY_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'hoarvale', 'varkand', 'veldwood', 'ilmar', 'confluence', 'fulmara']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : ['varkand', 'veldwood', 'ilmar', 'confluence', 'fulmara'].includes(nationId)
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withMeridianTurbineDay(snapshot, day, true), snapshot, nationId);
    assert.equal(withMeridianTurbineDay(snapshot, day, false), snapshot, nationId);
    assert.equal('turbineDay' in snapshot, false);
  }
  const meridian = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'meridian' };
  assert.equal(withMeridianTurbineDay(meridian, day, false), meridian);
  assert.equal('turbineDay' in meridian, false);
  const on = withMeridianTurbineDay(meridian, day, true);
  assert.deepEqual(Object.keys(on.turbineDay).sort(), calendarKeys);
  assert.equal(on.turbineDay.nextAt, MERIDIAN_TURBINE_DAY_MS);
  assert.equal(on.turbineDay.cycleDays, 30);
  assert.equal(on.turbineDay.host, 'Shen Springs');
  assert.equal(Number.isSafeInteger(on.turbineDay.nextAt), true);
  assert.equal('grid' in on.turbineDay, false);
  assert.equal('output' in on.turbineDay, false);
  assert.equal('power' in on.turbineDay, false);
  assert.equal('bonus' in on, false);
  assert.equal(on.decision.proposedSpendMinor, meridian.decision.proposedSpendMinor);
  assert.equal(on.decision.reason, meridian.decision.reason);
  assert.equal('turbineDay' in meridian, false, 'the input snapshot is not mutated');
  assert.equal('examDay' in on, false);
  const exam = withMeridianExamDay(meridian, day, true);
  assert.equal('turbineDay' in exam, false, 'Exam Day is unchanged while this flag is off');
  const read = meridianTurbineDaySnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(read.turbineDay.nextAt, VARKAND_CHAIR_ANCHOR_MS + MERIDIAN_TURBINE_DAY_MS);
  assert.equal(read.turbineDay.host, 'Shen Springs');
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.equal('partyState' in read, false);
  assert.equal('examDay' in read, false);
  assert.match(read.decision.reason, /Shen Springs/);
  assert.match(read.decision.reason, /no grid output/);
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.turbineDay.nextAt, read.turbineDay.nextAt);
  assert.equal(published.turbineDay.host, 'Shen Springs');
  assert.equal(published.turbineDay.cycleDays, 30);
  assert.deepEqual(Object.keys(published.turbineDay).sort(), calendarKeys);
  assert.equal('turbineDay' in publicGovernmentSnapshot(meridianExamDaySnapshot(day, true)), false);
  assert.equal('turbineDay' in publicGovernmentSnapshot(meridianPartySnapshot(day, true)), false);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).turbineDay, undefined);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-3), key, '#1178 Grand Regatta, then #1179 Charter Day');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-3), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-3), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), 'HARIMU_FULMARA_GRAND_REGATTA_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), 'HARIMU_FULMARA_CHARTER_DAY_ENABLED');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/meridian-turbine-day\.ts/);
});

test('flag off: the Meridian government read is unchanged; flag on names the next Turbine Day; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = meridianNextTurbineDayAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const partyOnly = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true, meridianPartySchedule: true });
  assert.equal('turbineDay' in partyOnly, false, 'party on, Turbine Day off: no turbineDay key');
  assert.equal('partyState' in partyOnly, true);
  const examOnly = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true, meridianExamDay: true });
  assert.equal('turbineDay' in examOnly, false, 'Exam Day on, Turbine Day off: no turbineDay key');
  assert.equal('examDay' in examOnly, true);
  const on = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true, meridianTurbineDay: true });
  assert.equal(on.turbineDay.nextAt, expected);
  assert.equal(on.turbineDay.cycleDays, 30);
  assert.equal(on.turbineDay.host, 'Shen Springs');
  assert.equal(Number.isSafeInteger(on.turbineDay.nextAt), true);
  assert.deepEqual(Object.keys(on.turbineDay).sort(), calendarKeys);
  assert.equal('partyState' in on, false, 'Turbine Day alone does not add the Party Congress');
  assert.equal('examDay' in on, false, 'Turbine Day alone does not add Exam Day');
  assert.equal('grid' in on.turbineDay, false);
  assert.equal('power' in on.turbineDay, false);
  const both = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true, meridianExamDay: true, meridianTurbineDay: true });
  assert.equal(both.turbineDay.nextAt, expected);
  assert.equal(both.turbineDay.host, 'Shen Springs');
  assert.deepEqual(both.examDay, examOnly.examDay);
  assert.equal(both.decision.reason, examOnly.decision.reason);
  const withParty = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true, meridianPartySchedule: true, meridianTurbineDay: true });
  assert.equal(withParty.turbineDay.nextAt, expected);
  assert.equal(withParty.partyState.nextCongressAt, partyOnly.partyState.nextCongressAt);
  assert.equal(withParty.decision.reason, partyOnly.decision.reason);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'confluence', 'fulmara', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, meridianTurbineDay: true, hoarvaleAssent: nationId === 'hoarvale' });
    assert.equal(other == null || !('turbineDay' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='meridian' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.turbineDay.nextAt, expected);
  assert.equal(packed.turbineDay.cycleDays, 30);
  assert.equal(packed.turbineDay.host, 'Shen Springs');
  assert.equal('examDay' in packed, false);
  assert.equal('partyState' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_MERIDIAN_EXAM_DAY_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.turbineDay.nextAt, expected);
  assert.equal(together.examDay.nextAt, examOnly.examDay.nextAt);
  r.setFixtureEnv(key, 'false');
  const examPacked = (await r.call('citizen', 'alice')).data.government;
  assert.equal('turbineDay' in examPacked, false, 'flag off leaves the Exam Day read unchanged');
  assert.equal(examPacked.examDay.nextAt, examOnly.examDay.nextAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('turbineDay' in other), true);
});
