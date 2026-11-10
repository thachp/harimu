/** #1170: Korund next People's Congress, once per game year (30 real days) from the Varkand Chair anchor.
 *  Zero offset. Flag HARIMU_KORUND_PEOPLES_CONGRESS_ENABLED, packed in HARIMU_GRAY_PACK.
 *  Flag off: no peoplesCongress key. Holds no votes, motions, delegates, or outcomes.
 *  The zzzzzzzzzz- name sorts after zzzzzzzzz- files so --test-shard does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, withKorundChairmanBirthday, withKorundPeoplesCongress } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { KORUND_PEOPLES_CONGRESS_CYCLE_DAYS, KORUND_PEOPLES_CONGRESS_CYCLE_MS, korundNextPeoplesCongressAt } from '../lib/korund-peoples-congress.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const key = 'HARIMU_KORUND_PEOPLES_CONGRESS_ENABLED';
const calendarKeys = ['cycleDays', 'nextAt'];

test('the next People\'s Congress falls once per game year from the Chair anchor, with zero offset', () => {
  assert.equal(KORUND_PEOPLES_CONGRESS_CYCLE_DAYS, 30);
  assert.equal(KORUND_PEOPLES_CONGRESS_CYCLE_DAYS, realDaysPerGameYear, 'one world-clock game year');
  assert.equal(KORUND_PEOPLES_CONGRESS_CYCLE_MS, 30 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(korundNextPeoplesCongressAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + KORUND_PEOPLES_CONGRESS_CYCLE_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * KORUND_PEOPLES_CONGRESS_CYCLE_MS;
    assert.equal(korundNextPeoplesCongressAt(at), at + KORUND_PEOPLES_CONGRESS_CYCLE_MS);
    assert.equal(korundNextPeoplesCongressAt(at + 1), at + KORUND_PEOPLES_CONGRESS_CYCLE_MS);
  }
});

test('the boundary at exactly one game year moves to the following congress, and the instant before stays on this one', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + KORUND_PEOPLES_CONGRESS_CYCLE_MS;
  assert.equal(korundNextPeoplesCongressAt(boundary - 1), boundary);
  assert.equal(korundNextPeoplesCongressAt(boundary), boundary + KORUND_PEOPLES_CONGRESS_CYCLE_MS);
  assert.equal(korundNextPeoplesCongressAt(boundary + KORUND_PEOPLES_CONGRESS_CYCLE_MS - 1), boundary + KORUND_PEOPLES_CONGRESS_CYCLE_MS);
  assert.equal(korundNextPeoplesCongressAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
});

test('nextAt is always a safe integer', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, KORUND_PEOPLES_CONGRESS_CYCLE_MS, KORUND_PEOPLES_CONGRESS_CYCLE_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = korundNextPeoplesCongressAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % KORUND_PEOPLES_CONGRESS_CYCLE_MS, 0, 'zero offset from the anchor');
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no peoplesCongress key', () => {
  for (const nationId of ['kindle', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian', 'hoarvale']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : ['varkand', 'veldwood', 'ilmar', 'meridian'].includes(nationId)
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withKorundPeoplesCongress(snapshot, day, true), snapshot, nationId);
    assert.equal('peoplesCongress' in snapshot, false);
  }
  const korund = simulateGovernment({ ...baseInput, nationId: 'korund' });
  assert.equal(withKorundPeoplesCongress(korund, day, false), korund);
  const on = withKorundPeoplesCongress(korund, day, true);
  assert.deepEqual(Object.keys(on.peoplesCongress).sort(), calendarKeys);
  assert.equal(on.peoplesCongress.nextAt, KORUND_PEOPLES_CONGRESS_CYCLE_MS);
  assert.equal(on.peoplesCongress.cycleDays, 30);
  for (const absent of ['votes', 'motions', 'delegates', 'outcomes', 'persona', 'name']) assert.equal(absent in on.peoplesCongress, false, absent);
  assert.deepEqual(on.roles, korund.roles);
  assert.equal(on.decision.proposedSpendMinor, korund.decision.proposedSpendMinor);
  assert.equal('peoplesCongress' in korund, false, 'the input snapshot is not mutated');
  assert.equal('peoplesCongress' in withKorundChairmanBirthday(korund, day, true), false, 'the birthday read is unchanged while this flag is off');
  const published = publicGovernmentSnapshot(on);
  assert.equal(published.peoplesCongress.nextAt, on.peoplesCongress.nextAt);
  assert.equal(published.peoplesCongress.cycleDays, 30);
  assert.equal('peoplesCongress' in publicGovernmentSnapshot(korund), false);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'kindle' })).peoplesCongress, undefined);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-30), key, '#1175, #1178, #1179, #1184, #1183, #1187, #1189, #1191, #1196, #1197, and #1193 follow this flag');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-30), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-30), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-23), 'HARIMU_MERIDIAN_CONGRESS_WEEK_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-22), 'HARIMU_AURELLE_CORONATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-21), 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-20), 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-19), 'HARIMU_WORLD_ATLAS_READS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-18), 'HARIMU_VARKAND_ROTATION_DAY_ENABLED');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Korund government read is unchanged; flag on names the next congress; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = korundNextPeoplesCongressAt(seconds * 1000);
  const off = await gov.readGovernment(r.db, 'korund', seconds, 'alice', { readOnly: true });
  assert.equal(off != null && 'peoplesCongress' in off, false, 'flag off');
  const birthdayOnly = await gov.readGovernment(r.db, 'korund', seconds, 'alice', { readOnly: true, korundChairmanBirthday: true });
  assert.equal('peoplesCongress' in birthdayOnly, false, 'birthday on, congress off: no peoplesCongress key');
  assert.equal('chairmanBirthday' in birthdayOnly, true);
  const on = await gov.readGovernment(r.db, 'korund', seconds, 'alice', { readOnly: true, korundPeoplesCongress: true });
  assert.deepEqual(Object.keys(on.peoplesCongress).sort(), calendarKeys);
  assert.equal(on.peoplesCongress.nextAt, expected);
  assert.equal(on.peoplesCongress.cycleDays, 30);
  assert.equal(Number.isSafeInteger(on.peoplesCongress.nextAt), true);
  for (const absent of ['votes', 'motions', 'delegates', 'outcomes', 'persona']) assert.equal(absent in on.peoplesCongress, false, absent);
  assert.equal('chairmanBirthday' in on, false, 'the congress alone does not add the birthday');
  assert.deepEqual({ ...on, peoplesCongress: undefined }, { ...off, peoplesCongress: undefined });
  const both = await gov.readGovernment(r.db, 'korund', seconds, 'alice', { readOnly: true, korundChairmanBirthday: true, korundPeoplesCongress: true });
  assert.equal(both.peoplesCongress.nextAt, expected);
  assert.deepEqual(both.chairmanBirthday, birthdayOnly.chairmanBirthday);
  assert.equal(both.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  for (const nationId of ['kindle', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian', 'confluence', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, korundPeoplesCongress: true });
    assert.equal(other == null || !('peoplesCongress' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
  const before = (await r.call('citizen', 'alice')).data.government;
  assert.equal(before == null || !('peoplesCongress' in before), true, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.peoplesCongress.nextAt, expected);
  assert.equal(packed.peoplesCongress.cycleDays, 30);
  assert.equal('votes' in packed.peoplesCongress, false);
  assert.equal('chairmanBirthday' in packed, false);
  r.setFixtureEnv(key, 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.equal(direct == null || !('peoplesCongress' in direct), true, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_KORUND_CHAIRMAN_BIRTHDAY_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.peoplesCongress.nextAt, expected);
  assert.equal(together.chairmanBirthday.nextAt, birthdayOnly.chairmanBirthday.nextAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('peoplesCongress' in other), true);
});
