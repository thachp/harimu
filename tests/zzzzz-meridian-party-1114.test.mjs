/** #1114: Meridian Paramount Leader roles, 7-seat Standing Committee, and the next Party Congress
 *  (150 real days = 5 game years) from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_MERIDIAN_PARTY_SCHEDULE_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no partyState key.
 *  The zzzzz- name sorts after earlier nation schedule files so --test-shard does not move them. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { meridianPartySnapshot, simulateGovernment, withMeridianPartyState } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { MERIDIAN_CONGRESS_INTERVAL_DAYS, MERIDIAN_CONGRESS_INTERVAL_MS, meridianNextPartyCongressAt } from '../lib/meridian-party.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = 150 * day;
const expected = nextCongressAt => ({ paramountLeaderRoles: ['general_secretary', 'state_chair'], standingCommitteeSeats: 7, nextCongressAt, congressIntervalDays: 150, termLimitsSuspendable: true, suspendSupermajority: '2/3' });

test('the next Party Congress falls on a 150-real-day (5 game year) cycle from the Chair anchor; exactly at 150 days the following one is next', () => {
  assert.equal(anchor, 0);
  assert.equal(MERIDIAN_CONGRESS_INTERVAL_DAYS, 150);
  assert.equal(MERIDIAN_CONGRESS_INTERVAL_DAYS, 5 * realDaysPerGameYear);
  assert.equal(MERIDIAN_CONGRESS_INTERVAL_MS, cycle);
  assert.equal(meridianNextPartyCongressAt(anchor), anchor + cycle);
  assert.equal(meridianNextPartyCongressAt(anchor - 1), anchor + cycle);
  assert.equal(meridianNextPartyCongressAt(anchor + 1), anchor + cycle);
  assert.equal(meridianNextPartyCongressAt(anchor + cycle - 1), anchor + cycle);
  assert.equal(meridianNextPartyCongressAt(anchor + cycle), anchor + 2 * cycle);
  assert.equal(meridianNextPartyCongressAt(anchor + cycle + 1), anchor + 2 * cycle);
  assert.equal(meridianNextPartyCongressAt(anchor + 2 * cycle - 1), anchor + 2 * cycle);
  assert.equal(meridianNextPartyCongressAt(anchor + 149 * day), anchor + cycle, 'day 149 is still before the Congress');
});

test('Party Congress timestamps are safe integers on the cycle', () => {
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity, 1_793_000_000_000]) {
    const at = meridianNextPartyCongressAt(now);
    assert.equal(Number.isSafeInteger(at), true, String(now));
    assert.ok(at > anchor, String(now));
    assert.equal(at % cycle, 0, String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - cycle) assert.ok(at > now && at - now <= cycle, String(now));
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no partyState key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'meridian' }), null);
  assert.equal(meridianPartySnapshot(cycle, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'hoarvale']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : ['varkand', 'veldwood', 'ilmar'].includes(nationId)
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withMeridianPartyState(snapshot, day, true), snapshot, nationId);
    assert.equal(withMeridianPartyState(snapshot, day, false), snapshot, nationId);
    assert.equal('partyState' in snapshot, false);
  }
  const meridian = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'meridian' };
  assert.equal(withMeridianPartyState(meridian, day, false), meridian);
  const on = withMeridianPartyState(meridian, day, true);
  assert.deepEqual(on.partyState, expected(cycle));
  assert.equal('partyState' in meridian, false, 'the input is not mutated');
  const read = meridianPartySnapshot(cycle, true);
  assert.equal(read.nationId, 'meridian');
  assert.deepEqual(read.partyState, expected(2 * cycle));
  for (const key of ['sanctum', 'directorate', 'federalCouncil', 'moot', 'mandatePlebiscite']) assert.equal(key in read, false, key);
  assert.deepEqual(publicGovernmentSnapshot(read).partyState, read.partyState);
  assert.equal('partyState' in publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })), false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  const key = 'HARIMU_MERIDIAN_PARTY_SCHEDULE_ENABLED';
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Meridian government read is unchanged; flag on adds partyState; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const nextCongressAt = meridianNextPartyCongressAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const on = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true, meridianPartySchedule: true });
  assert.deepEqual(on.partyState, expected(nextCongressAt));
  assert.equal(Number.isSafeInteger(on.partyState.nextCongressAt), true);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'ilmar']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, meridianPartySchedule: true });
    assert.equal(other == null || !('partyState' in other), true, nationId);
  }
  const ilmar = await gov.readGovernment(r.db, 'ilmar', seconds, 'bob', { readOnly: true, ilmarSanctum: true, meridianPartySchedule: true });
  assert.equal('partyState' in ilmar, false);
  assert.equal('sanctum' in ilmar, true);
  await r.db.prepare("UPDATE citizens SET nation_id='meridian' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_MERIDIAN_PARTY_SCHEDULE_ENABLED: 'true' }));
  assert.deepEqual((await r.call('citizen', 'alice')).data.government.partyState, expected(nextCongressAt));
  r.setFixtureEnv('HARIMU_MERIDIAN_PARTY_SCHEDULE_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('partyState' in other), true);
});
