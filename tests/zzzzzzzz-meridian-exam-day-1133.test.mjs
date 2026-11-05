/** #1133: Meridian next Exam Day, once per game year (30 real days) from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_MERIDIAN_EXAM_DAY_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no examDay key.
 *  The zzzzzzzz- name sorts after zzzzzzz- so --test-shard does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { meridianExamDaySnapshot, meridianPartySnapshot, simulateGovernment, withMeridianExamDay } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { MERIDIAN_EXAM_DAY_CYCLE_DAYS, MERIDIAN_EXAM_DAY_CYCLE_MS, meridianNextExamDayAt } from '../lib/meridian-exam-day.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const calendarKeys = ['cycleDays', 'nextAt'];

test('the next Exam Day falls once per game year from the Chair anchor', () => {
  assert.equal(MERIDIAN_EXAM_DAY_CYCLE_DAYS, 30);
  assert.equal(MERIDIAN_EXAM_DAY_CYCLE_DAYS, realDaysPerGameYear, 'one world-clock game year');
  assert.equal(MERIDIAN_EXAM_DAY_CYCLE_MS, 30 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(meridianNextExamDayAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + MERIDIAN_EXAM_DAY_CYCLE_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * MERIDIAN_EXAM_DAY_CYCLE_MS;
    assert.equal(meridianNextExamDayAt(at), at + MERIDIAN_EXAM_DAY_CYCLE_MS);
    assert.equal(meridianNextExamDayAt(at + 1), at + MERIDIAN_EXAM_DAY_CYCLE_MS);
  }
});

test('the boundary at exactly one game year moves to the following Exam Day, and the instant before stays on this one', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + MERIDIAN_EXAM_DAY_CYCLE_MS;
  assert.equal(meridianNextExamDayAt(boundary - 1), boundary);
  assert.equal(meridianNextExamDayAt(boundary), boundary + MERIDIAN_EXAM_DAY_CYCLE_MS);
  assert.equal(meridianNextExamDayAt(boundary + MERIDIAN_EXAM_DAY_CYCLE_MS - 1), boundary + MERIDIAN_EXAM_DAY_CYCLE_MS);
  assert.equal(meridianNextExamDayAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
});

test('nextAt is always a safe integer', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, MERIDIAN_EXAM_DAY_CYCLE_MS, MERIDIAN_EXAM_DAY_CYCLE_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = meridianNextExamDayAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % MERIDIAN_EXAM_DAY_CYCLE_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no examDay key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'meridian' }), null);
  assert.equal(meridianExamDaySnapshot(MERIDIAN_EXAM_DAY_CYCLE_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'hoarvale']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : nationId === 'varkand'
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withMeridianExamDay(snapshot, MERIDIAN_EXAM_DAY_CYCLE_MS, true), snapshot);
    assert.equal(withMeridianExamDay(snapshot, MERIDIAN_EXAM_DAY_CYCLE_MS, false), snapshot);
    assert.equal('examDay' in snapshot, false);
  }
  const meridian = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'meridian' };
  assert.equal(withMeridianExamDay(meridian, day, false), meridian);
  const on = withMeridianExamDay(meridian, day, true);
  assert.deepEqual(Object.keys(on.examDay).sort(), calendarKeys);
  assert.equal(on.examDay.nextAt, MERIDIAN_EXAM_DAY_CYCLE_MS);
  assert.equal(on.examDay.cycleDays, 30);
  assert.equal('examDay' in meridian, false, 'the input snapshot is not mutated');
  const read = meridianExamDaySnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(read.examDay.nextAt, VARKAND_CHAIR_ANCHOR_MS + MERIDIAN_EXAM_DAY_CYCLE_MS);
  assert.equal(read.examDay.cycleDays, 30);
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.equal('partyState' in read, false);
  assert.equal(read.decision.reason.includes('awards no rank'), true);
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.examDay.nextAt, read.examDay.nextAt);
  assert.equal(published.examDay.cycleDays, 30);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).examDay, undefined);
  const partyOnly = meridianPartySnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal('examDay' in partyOnly, false, 'the Party Congress read is unchanged while this flag is off');
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  const key = 'HARIMU_MERIDIAN_EXAM_DAY_ENABLED';
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Meridian government read is unchanged; flag on names the next Exam Day; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = meridianNextExamDayAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const partyOnly = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true, meridianPartySchedule: true });
  assert.equal('examDay' in partyOnly, false, 'party on, Exam Day off: no examDay key');
  assert.equal('partyState' in partyOnly, true);
  const on = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true, meridianExamDay: true });
  assert.equal(on.examDay.nextAt, expected);
  assert.equal(on.examDay.cycleDays, 30);
  assert.equal(Number.isSafeInteger(on.examDay.nextAt), true);
  assert.equal('partyState' in on, false, 'Exam Day alone does not add the Party Congress');
  const both = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true, meridianPartySchedule: true, meridianExamDay: true });
  assert.equal(both.examDay.nextAt, expected);
  assert.equal(both.partyState.nextCongressAt, partyOnly.partyState.nextCongressAt);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'ilmar', 'confluence', 'veldwood']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, meridianExamDay: true });
    assert.equal(other == null || !('examDay' in other), true, nationId);
  }
  const ilmar = await gov.readGovernment(r.db, 'ilmar', seconds, 'bob', { readOnly: true, ilmarSanctum: true, meridianExamDay: true });
  assert.equal('examDay' in ilmar, false);
  assert.equal('sanctum' in ilmar, true);
  await r.db.prepare("UPDATE citizens SET nation_id='meridian' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_MERIDIAN_EXAM_DAY_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.examDay.nextAt, expected);
  assert.equal(packed.examDay.cycleDays, 30);
  assert.equal('partyState' in packed, false);
  r.setFixtureEnv('HARIMU_MERIDIAN_EXAM_DAY_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_MERIDIAN_PARTY_SCHEDULE_ENABLED: 'true', HARIMU_MERIDIAN_EXAM_DAY_ENABLED: 'true' }));
  r.setFixtureEnv('HARIMU_MERIDIAN_EXAM_DAY_ENABLED', undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.examDay.nextAt, expected);
  assert.equal(together.partyState.nextCongressAt, partyOnly.partyState.nextCongressAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('examDay' in other), true);
});
