/** #1147: Korund next Chairman's Birthday, once per game year (30 real days) from the Varkand Chair anchor (#1087).
 *  Flag HARIMU_KORUND_CHAIRMAN_BIRTHDAY_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no chairmanBirthday key.
 *  The zzzzzzzzzz- name sorts after zzzzzzzzz-ilmar-feast-first-light-1137 so --test-shard does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, withKorundChairmanBirthday, withKorundPlanCalendar } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { KORUND_CHAIRMAN_BIRTHDAY_CYCLE_DAYS, KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS, korundNextChairmanBirthdayAt } from '../lib/korund-chairman-birthday.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const calendarKeys = ['cycleDays', 'nextAt'];

test('the next Chairman\'s Birthday falls once per game year from the Chair anchor', () => {
  assert.equal(KORUND_CHAIRMAN_BIRTHDAY_CYCLE_DAYS, 30);
  assert.equal(KORUND_CHAIRMAN_BIRTHDAY_CYCLE_DAYS, realDaysPerGameYear, 'one world-clock game year');
  assert.equal(KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS, 30 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(korundNextChairmanBirthdayAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS;
    assert.equal(korundNextChairmanBirthdayAt(at), at + KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS);
    assert.equal(korundNextChairmanBirthdayAt(at + 1), at + KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS);
  }
});

test('the boundary at exactly one game year moves to the following birthday, and the instant before stays on this one', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS;
  assert.equal(korundNextChairmanBirthdayAt(boundary - 1), boundary);
  assert.equal(korundNextChairmanBirthdayAt(boundary), boundary + KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS);
  assert.equal(korundNextChairmanBirthdayAt(boundary + KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS - 1), boundary + KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS);
  assert.equal(korundNextChairmanBirthdayAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
});

test('nextAt is always a safe integer', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS, KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = korundNextChairmanBirthdayAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no chairmanBirthday key', () => {
  for (const nationId of ['kindle', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian', 'hoarvale']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : ['varkand', 'veldwood', 'ilmar', 'meridian'].includes(nationId)
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withKorundChairmanBirthday(snapshot, day, true), snapshot, nationId);
    assert.equal('chairmanBirthday' in snapshot, false);
  }
  const korund = simulateGovernment({ ...baseInput, nationId: 'korund' });
  assert.equal(withKorundChairmanBirthday(korund, day, false), korund);
  const on = withKorundChairmanBirthday(korund, day, true);
  assert.deepEqual(Object.keys(on.chairmanBirthday).sort(), calendarKeys);
  assert.equal(on.chairmanBirthday.nextAt, KORUND_CHAIRMAN_BIRTHDAY_CYCLE_MS);
  assert.equal(on.chairmanBirthday.cycleDays, 30);
  assert.equal('name' in on.chairmanBirthday, false);
  assert.equal('medals' in on, false);
  assert.deepEqual(on.roles, korund.roles);
  assert.equal(on.decision.proposedSpendMinor, korund.decision.proposedSpendMinor);
  assert.equal('chairmanBirthday' in korund, false, 'the input snapshot is not mutated');
  assert.equal('chairmanBirthday' in withKorundPlanCalendar(korund, day, true), false, 'the plan calendar read is unchanged while this flag is off');
  const published = publicGovernmentSnapshot(on);
  assert.equal(published.chairmanBirthday.nextAt, on.chairmanBirthday.nextAt);
  assert.equal(published.chairmanBirthday.cycleDays, 30);
  assert.equal('chairmanBirthday' in publicGovernmentSnapshot(korund), false);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'kindle' })).chairmanBirthday, undefined);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  const key = 'HARIMU_KORUND_CHAIRMAN_BIRTHDAY_ENABLED';
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Korund government read is unchanged; flag on names the next birthday; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = korundNextChairmanBirthdayAt(seconds * 1000);
  const off = await gov.readGovernment(r.db, 'korund', seconds, 'alice', { readOnly: true });
  assert.equal(off != null && 'chairmanBirthday' in off, false, 'flag off');
  const planOnly = await gov.readGovernment(r.db, 'korund', seconds, 'alice', { readOnly: true, korundPlanCalendar: true });
  assert.equal('chairmanBirthday' in planOnly, false, 'plan calendar on, birthday off: no chairmanBirthday key');
  assert.equal('planCalendar' in planOnly, true);
  const on = await gov.readGovernment(r.db, 'korund', seconds, 'alice', { readOnly: true, korundChairmanBirthday: true });
  assert.deepEqual(Object.keys(on.chairmanBirthday).sort(), calendarKeys);
  assert.equal(on.chairmanBirthday.nextAt, expected);
  assert.equal(on.chairmanBirthday.cycleDays, 30);
  assert.equal(Number.isSafeInteger(on.chairmanBirthday.nextAt), true);
  assert.equal('name' in on.chairmanBirthday, false);
  assert.equal('medals' in on, false);
  assert.equal('planCalendar' in on, false, 'the birthday alone does not add the plan calendar');
  assert.deepEqual({ ...on, chairmanBirthday: undefined }, { ...off, chairmanBirthday: undefined });
  const both = await gov.readGovernment(r.db, 'korund', seconds, 'alice', { readOnly: true, korundPlanCalendar: true, korundChairmanBirthday: true });
  assert.equal(both.chairmanBirthday.nextAt, expected);
  assert.deepEqual(both.planCalendar, planOnly.planCalendar);
  assert.equal(both.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  for (const nationId of ['kindle', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, korundChairmanBirthday: true });
    assert.equal(other == null || !('chairmanBirthday' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
  const before = (await r.call('citizen', 'alice')).data.government;
  assert.equal(before == null || !('chairmanBirthday' in before), true, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_KORUND_CHAIRMAN_BIRTHDAY_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.chairmanBirthday.nextAt, expected);
  assert.equal(packed.chairmanBirthday.cycleDays, 30);
  assert.equal('name' in packed.chairmanBirthday, false);
  assert.equal('planCalendar' in packed, false);
  r.setFixtureEnv('HARIMU_KORUND_CHAIRMAN_BIRTHDAY_ENABLED', 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.equal(direct == null || !('chairmanBirthday' in direct), true, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_KORUND_PLAN_CALENDAR_ENABLED: 'true', HARIMU_KORUND_CHAIRMAN_BIRTHDAY_ENABLED: 'true' }));
  r.setFixtureEnv('HARIMU_KORUND_CHAIRMAN_BIRTHDAY_ENABLED', undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.chairmanBirthday.nextAt, expected);
  assert.equal(together.planCalendar.nextPlanDayAt, planOnly.planCalendar.nextPlanDayAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('chairmanBirthday' in other), true);
});
