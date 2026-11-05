/** #1107: Ilmar Oracle life term, Stilldays (7 real days, first day is the rest), and the Great Pilgrimage
 *  (30 real days, one game year). Both clocks use the Varkand Chair anchor (#1085).
 *  Flag HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no sanctum key.
 *  The zzzzz- name sorts after zzzz-veldwood-council-1098 so Node's --test-shard round-robin
 *  does not move earlier files between Postgres shards. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { ilmarSanctumSnapshot, simulateGovernment, withIlmarSanctum } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { ILMAR_COUNCIL_OF_ELDERS_SEATS, ILMAR_ORACLE_TERM, ILMAR_PILGRIMAGE_CYCLE_DAYS, ILMAR_PILGRIMAGE_CYCLE_MS, ILMAR_STILLDAY_CYCLE_DAYS, ILMAR_STILLDAY_CYCLE_MS, ILMAR_STILLDAY_WINDOW_MS, ilmarIsStillday, ilmarNextGreatPilgrimageAt, ilmarNextStilldayAt } from '../lib/ilmar-sanctum.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;

test('the next Stillday falls on a 7-real-day cycle from the Chair anchor, and the boundary moves to the following week', () => {
  assert.equal(ILMAR_STILLDAY_CYCLE_DAYS, 7);
  assert.equal(ILMAR_STILLDAY_CYCLE_MS, 7 * day);
  assert.equal(ILMAR_STILLDAY_WINDOW_MS, day);
  assert.equal(anchor, 0);
  assert.equal(ilmarNextStilldayAt(anchor), anchor + ILMAR_STILLDAY_CYCLE_MS);
  assert.equal(ilmarNextStilldayAt(anchor - 1), anchor + ILMAR_STILLDAY_CYCLE_MS);
  const boundary = anchor + ILMAR_STILLDAY_CYCLE_MS;
  assert.equal(ilmarNextStilldayAt(boundary - 1), boundary);
  assert.equal(ilmarNextStilldayAt(boundary), boundary + ILMAR_STILLDAY_CYCLE_MS);
  assert.equal(ilmarNextStilldayAt(anchor + ILMAR_STILLDAY_WINDOW_MS), boundary, 'after the rest day the next Stillday is still this week\'s end');
});

test('isStillday is true only inside the first real day of each week', () => {
  assert.equal(ilmarIsStillday(anchor - 1), false);
  assert.equal(ilmarIsStillday(anchor), true);
  assert.equal(ilmarIsStillday(anchor + ILMAR_STILLDAY_WINDOW_MS - 1), true);
  assert.equal(ilmarIsStillday(anchor + ILMAR_STILLDAY_WINDOW_MS), false);
  assert.equal(ilmarIsStillday(anchor + ILMAR_STILLDAY_CYCLE_MS - 1), false);
  const next = anchor + ILMAR_STILLDAY_CYCLE_MS;
  assert.equal(ilmarIsStillday(next), true);
  assert.equal(ilmarIsStillday(next + ILMAR_STILLDAY_WINDOW_MS), false);
  for (let dayIndex = 0; dayIndex < ILMAR_STILLDAY_CYCLE_DAYS; dayIndex++) {
    assert.equal(ilmarIsStillday(anchor + dayIndex * day), dayIndex === 0, `day ${dayIndex}`);
  }
});

test('the next Great Pilgrimage falls on a 30-real-day game year from the Chair anchor', () => {
  assert.equal(ILMAR_PILGRIMAGE_CYCLE_DAYS, 30);
  assert.equal(ILMAR_PILGRIMAGE_CYCLE_DAYS, realDaysPerGameYear);
  assert.equal(ILMAR_PILGRIMAGE_CYCLE_MS, 30 * day);
  assert.equal(ilmarNextGreatPilgrimageAt(anchor), anchor + ILMAR_PILGRIMAGE_CYCLE_MS);
  assert.equal(ilmarNextGreatPilgrimageAt(anchor - 1), anchor + ILMAR_PILGRIMAGE_CYCLE_MS);
  const boundary = anchor + ILMAR_PILGRIMAGE_CYCLE_MS;
  assert.equal(ilmarNextGreatPilgrimageAt(boundary - 1), boundary);
  assert.equal(ilmarNextGreatPilgrimageAt(boundary), boundary + ILMAR_PILGRIMAGE_CYCLE_MS);
  assert.equal(ilmarNextGreatPilgrimageAt(boundary + ILMAR_PILGRIMAGE_CYCLE_MS - 1), boundary + ILMAR_PILGRIMAGE_CYCLE_MS);
});

test('Stillday and pilgrimage timestamps are safe integers', () => {
  for (const now of [anchor, ILMAR_STILLDAY_CYCLE_MS, ILMAR_STILLDAY_CYCLE_MS - 1, ILMAR_STILLDAY_WINDOW_MS, ILMAR_STILLDAY_WINDOW_MS - 1, ILMAR_PILGRIMAGE_CYCLE_MS, ILMAR_PILGRIMAGE_CYCLE_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextStilldayAt = ilmarNextStilldayAt(now);
    const nextGreatPilgrimageAt = ilmarNextGreatPilgrimageAt(now);
    assert.equal(Number.isSafeInteger(nextStilldayAt), true, `stillday ${now}`);
    assert.equal(Number.isSafeInteger(nextGreatPilgrimageAt), true, `pilgrimage ${now}`);
    assert.ok(nextStilldayAt > anchor);
    assert.ok(nextGreatPilgrimageAt > anchor);
    assert.equal(nextStilldayAt % ILMAR_STILLDAY_CYCLE_MS, 0);
    assert.equal(nextGreatPilgrimageAt % ILMAR_PILGRIMAGE_CYCLE_MS, 0);
    assert.equal(typeof ilmarIsStillday(now), 'boolean');
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no sanctum key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'ilmar' }), null);
  assert.equal(ilmarSanctumSnapshot(ILMAR_STILLDAY_CYCLE_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'hoarvale']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : nationId === 'varkand' || nationId === 'veldwood'
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withIlmarSanctum(snapshot, ILMAR_STILLDAY_WINDOW_MS, true), snapshot);
    assert.equal(withIlmarSanctum(snapshot, ILMAR_STILLDAY_WINDOW_MS, false), snapshot);
    assert.equal('sanctum' in snapshot, false);
  }
  const ilmar = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'ilmar' };
  assert.equal(withIlmarSanctum(ilmar, day, false), ilmar);
  assert.equal('sanctum' in ilmar, false);
  const on = withIlmarSanctum(ilmar, day, true);
  assert.equal(on.sanctum.oracleTerm, 'life');
  assert.equal(on.sanctum.oracleTerm, ILMAR_ORACLE_TERM);
  assert.equal(on.sanctum.councilOfEldersSeats, 12);
  assert.equal(on.sanctum.councilOfEldersSeats, ILMAR_COUNCIL_OF_ELDERS_SEATS);
  assert.equal(on.sanctum.isStillday, false);
  assert.equal(on.sanctum.nextStilldayAt, ILMAR_STILLDAY_CYCLE_MS);
  assert.equal(on.sanctum.nextGreatPilgrimageAt, ILMAR_PILGRIMAGE_CYCLE_MS);
  assert.equal('sanctum' in ilmar, false, 'the input snapshot is not mutated');
  assert.equal('federalCouncil' in on, false);
  assert.equal('directorate' in on, false);
  const read = ilmarSanctumSnapshot(anchor, true);
  assert.equal(read.sanctum.oracleTerm, 'life');
  assert.equal(read.sanctum.councilOfEldersSeats, 12);
  assert.equal(read.sanctum.isStillday, true);
  assert.equal(read.sanctum.nextStilldayAt, anchor + ILMAR_STILLDAY_CYCLE_MS);
  assert.equal(read.sanctum.nextGreatPilgrimageAt, anchor + ILMAR_PILGRIMAGE_CYCLE_MS);
  assert.equal(Number.isSafeInteger(read.sanctum.nextStilldayAt), true);
  assert.equal(Number.isSafeInteger(read.sanctum.nextGreatPilgrimageAt), true);
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.sanctum.oracleTerm, 'life');
  assert.equal(published.sanctum.councilOfEldersSeats, 12);
  assert.equal(published.sanctum.isStillday, true);
  assert.equal(published.sanctum.nextStilldayAt, read.sanctum.nextStilldayAt);
  assert.equal(published.sanctum.nextGreatPilgrimageAt, read.sanctum.nextGreatPilgrimageAt);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).sanctum, undefined);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED, undefined, 'not its own text binding');
  assert.equal(prod.vars.HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED, 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, 'HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED'), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED'), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED: 'false' }, 'HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED'), false, 'a direct string wins');
});

test('flag off: the Ilmar government read is unchanged; flag on names the Oracle, Elders, Stillday, and Great Pilgrimage; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const nowMs = seconds * 1000;
  const nextStilldayAt = ilmarNextStilldayAt(nowMs);
  const nextGreatPilgrimageAt = ilmarNextGreatPilgrimageAt(nowMs);
  const isStillday = ilmarIsStillday(nowMs);
  assert.equal(await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const on = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarSanctum: true });
  assert.equal(on.sanctum.oracleTerm, 'life');
  assert.equal(on.sanctum.councilOfEldersSeats, 12);
  assert.equal(on.sanctum.isStillday, isStillday);
  assert.equal(on.sanctum.nextStilldayAt, nextStilldayAt);
  assert.equal(on.sanctum.nextGreatPilgrimageAt, nextGreatPilgrimageAt);
  assert.equal(Number.isSafeInteger(on.sanctum.nextStilldayAt), true);
  assert.equal(Number.isSafeInteger(on.sanctum.nextGreatPilgrimageAt), true);
  assert.equal('federalCouncil' in on, false);
  assert.equal('directorate' in on, false);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, ilmarSanctum: true });
    assert.equal(other == null || !('sanctum' in other), true, nationId);
  }
  const veldwood = await gov.readGovernment(r.db, 'veldwood', seconds, 'bob', { readOnly: true, veldwoodCouncil: true, ilmarSanctum: true });
  assert.equal('sanctum' in veldwood, false);
  assert.equal('federalCouncil' in veldwood, true);
  const varkand = await gov.readGovernment(r.db, 'varkand', seconds, 'bob', { readOnly: true, varkandDirectorate: true, varkandPlebiscite: true, ilmarSanctum: true });
  assert.equal('sanctum' in varkand, false);
  assert.equal('directorate' in varkand, true);
  assert.equal('mandatePlebiscite' in varkand, true);
  await r.db.prepare("UPDATE citizens SET nation_id='ilmar' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.sanctum.oracleTerm, 'life');
  assert.equal(packed.sanctum.councilOfEldersSeats, 12);
  assert.equal(packed.sanctum.isStillday, isStillday);
  assert.equal(packed.sanctum.nextStilldayAt, nextStilldayAt);
  assert.equal(packed.sanctum.nextGreatPilgrimageAt, nextGreatPilgrimageAt);
  r.setFixtureEnv('HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('sanctum' in other), true);
});
