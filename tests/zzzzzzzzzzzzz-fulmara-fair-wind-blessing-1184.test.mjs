/** #1184: Fulmara next Fair-Wind Blessing on a fixed 30-real-day cycle from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_FULMARA_FAIR_WIND_BLESSING_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no fairWindBlessing key. #1189 is last.
 *  The block holds the next date only: no blessing text, convoy list, or Toll Coupon figure.
 *  The zzzzzzzzzzzzz- name sorts after zzzzzzzzzzzz-meridian-turbine-day-1175 so Node's --test-shard
 *  round-robin does not move earlier files between Postgres shards.
 *  [ASSUMPTION] Docs §7.10 name the holiday and give no interval. Cadence is one game year (30 real days), with no offset. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { FULMARA_FAIR_WIND_BLESSING_CYCLE_DAYS, FULMARA_FAIR_WIND_BLESSING_MS, fulmaraNextFairWindBlessingAt } from '../lib/fulmara-fair-wind-blessing.ts';
import { fulmaraExchangeBellSnapshot, fulmaraFairWindBlessingSnapshot, fulmaraGovernmentSnapshot, fulmaraResolutionsSnapshot, simulateGovernment, withFulmaraExchangeBell, withFulmaraFairWindBlessing, withFulmaraResolutions } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const key = 'HARIMU_FULMARA_FAIR_WIND_BLESSING_ENABLED';
const calendarKeys = ['cycleDays', 'nextAt'];

test('the next Fair-Wind Blessing falls on a 30-real-day cycle from the Chair anchor, with no offset', () => {
  assert.equal(FULMARA_FAIR_WIND_BLESSING_CYCLE_DAYS, 30);
  assert.equal(FULMARA_FAIR_WIND_BLESSING_CYCLE_DAYS, realDaysPerGameYear, 'one world-clock game year');
  assert.equal(FULMARA_FAIR_WIND_BLESSING_MS, 30 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(fulmaraNextFairWindBlessingAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + FULMARA_FAIR_WIND_BLESSING_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * FULMARA_FAIR_WIND_BLESSING_MS;
    assert.equal(fulmaraNextFairWindBlessingAt(at), at + FULMARA_FAIR_WIND_BLESSING_MS);
    assert.equal(fulmaraNextFairWindBlessingAt(at + 1), at + FULMARA_FAIR_WIND_BLESSING_MS);
  }
});

test('an exact boundary rolls to the next cycle, and before the anchor the next date is the anchor plus one cycle', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + FULMARA_FAIR_WIND_BLESSING_MS;
  assert.equal(fulmaraNextFairWindBlessingAt(boundary - 1), boundary);
  assert.equal(fulmaraNextFairWindBlessingAt(boundary), boundary + FULMARA_FAIR_WIND_BLESSING_MS);
  assert.equal(fulmaraNextFairWindBlessingAt(boundary + FULMARA_FAIR_WIND_BLESSING_MS - 1), boundary + FULMARA_FAIR_WIND_BLESSING_MS);
  assert.equal(fulmaraNextFairWindBlessingAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
  assert.equal(fulmaraNextFairWindBlessingAt(VARKAND_CHAIR_ANCHOR_MS - FULMARA_FAIR_WIND_BLESSING_MS), boundary);
});

test('nextAt is always a safe integer and the helper takes only nowMs', () => {
  assert.equal(fulmaraNextFairWindBlessingAt.length, 1);
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, FULMARA_FAIR_WIND_BLESSING_MS, FULMARA_FAIR_WIND_BLESSING_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = fulmaraNextFairWindBlessingAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % FULMARA_FAIR_WIND_BLESSING_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no fairWindBlessing key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'fulmara' }), null);
  assert.equal(fulmaraFairWindBlessingSnapshot(FULMARA_FAIR_WIND_BLESSING_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'hoarvale', 'varkand', 'veldwood', 'ilmar', 'confluence', 'meridian']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : ['varkand', 'veldwood', 'ilmar', 'confluence', 'meridian'].includes(nationId)
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withFulmaraFairWindBlessing(snapshot, day, true), snapshot, nationId);
    assert.equal(withFulmaraFairWindBlessing(snapshot, day, false), snapshot, nationId);
    assert.equal('fairWindBlessing' in snapshot, false);
  }
  const fulmara = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'fulmara' };
  assert.equal(withFulmaraFairWindBlessing(fulmara, day, false), fulmara);
  assert.equal('fairWindBlessing' in fulmara, false);
  const on = withFulmaraFairWindBlessing(fulmara, day, true);
  assert.deepEqual(Object.keys(on.fairWindBlessing).sort(), calendarKeys);
  assert.equal(on.fairWindBlessing.nextAt, FULMARA_FAIR_WIND_BLESSING_MS);
  assert.equal(on.fairWindBlessing.cycleDays, 30);
  assert.equal(Number.isSafeInteger(on.fairWindBlessing.nextAt), true);
  assert.equal('blessing' in on.fairWindBlessing, false);
  assert.equal('convoys' in on.fairWindBlessing, false);
  assert.equal('tollCoupon' in on.fairWindBlessing, false);
  assert.equal(on.decision.proposedSpendMinor, fulmara.decision.proposedSpendMinor);
  assert.equal(on.decision.reason, fulmara.decision.reason);
  assert.equal('fairWindBlessing' in fulmara, false, 'the input snapshot is not mutated');
  assert.equal('exchangeBell' in on, false);
  assert.equal('grandCouncil' in on, false);
  assert.equal('resolutions' in on, false);
  const read = fulmaraFairWindBlessingSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(read.fairWindBlessing.nextAt, VARKAND_CHAIR_ANCHOR_MS + FULMARA_FAIR_WIND_BLESSING_MS);
  assert.equal(read.fairWindBlessing.cycleDays, 30);
  assert.deepEqual(Object.keys(read.fairWindBlessing).sort(), calendarKeys);
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.match(read.decision.reason, /names the next date/);
  assert.match(read.decision.reason, /no blessing text/);
  assert.equal('grandCouncil' in read, false);
  assert.equal('resolutions' in read, false);
  assert.equal('exchangeBell' in read, false);
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.fairWindBlessing.nextAt, read.fairWindBlessing.nextAt);
  assert.equal(published.fairWindBlessing.cycleDays, 30);
  assert.deepEqual(Object.keys(published.fairWindBlessing).sort(), calendarKeys);
  assert.equal('fairWindBlessing' in publicGovernmentSnapshot(fulmaraExchangeBellSnapshot(day, true)), false);
  assert.equal('fairWindBlessing' in publicGovernmentSnapshot(fulmaraResolutionsSnapshot(true)), false);
  assert.equal('fairWindBlessing' in publicGovernmentSnapshot(fulmaraGovernmentSnapshot(day, true)), false);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).fairWindBlessing, undefined);
  const councilOnly = fulmaraGovernmentSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  const resolutionsOnly = fulmaraResolutionsSnapshot(true);
  const bellOnly = fulmaraExchangeBellSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal('fairWindBlessing' in councilOnly, false, 'the Council read is unchanged while this flag is off');
  assert.equal('fairWindBlessing' in resolutionsOnly, false, 'the resolutions read is unchanged while this flag is off');
  assert.equal('fairWindBlessing' in bellOnly, false, 'the Exchange Bell read is unchanged while this flag is off');
  const together = withFulmaraFairWindBlessing(withFulmaraExchangeBell(withFulmaraResolutions(councilOnly, true), VARKAND_CHAIR_ANCHOR_MS, true), VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(together.fairWindBlessing.nextAt, VARKAND_CHAIR_ANCHOR_MS + FULMARA_FAIR_WIND_BLESSING_MS);
  assert.equal(together.exchangeBell.nextAt, bellOnly.exchangeBell.nextAt);
  assert.equal(together.grandCouncil.councilOfTenNextElectionAt, councilOnly.grandCouncil.councilOfTenNextElectionAt);
  assert.deepEqual(together.resolutions, resolutionsOnly.resolutions);
  assert.equal(together.decision.reason, councilOnly.decision.reason);
  assert.equal('fairWindBlessing' in councilOnly, false);
  assert.equal('fairWindBlessing' in resolutionsOnly, false);
  assert.equal('fairWindBlessing' in bellOnly, false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-6), key, '#1183, #1187, and #1189 follow this flag');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-6), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-6), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-3), 'HARIMU_MERIDIAN_CONGRESS_WEEK_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), 'HARIMU_AURELLE_CORONATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), 'HARIMU_VARKAND_ROTATION_DAY_ENABLED');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/fulmara-fair-wind-blessing\.ts/);
});

test('flag off: the Fulmara government read is unchanged; flag on names the next date; other nations and existing Fulmara blocks are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = fulmaraNextFairWindBlessingAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const councilOnly = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraCouncil: true });
  assert.equal('fairWindBlessing' in councilOnly, false, 'council on, Fair-Wind Blessing off: no fairWindBlessing key');
  assert.equal('grandCouncil' in councilOnly, true);
  const resolutionsOnly = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraResolutions: true });
  assert.equal('fairWindBlessing' in resolutionsOnly, false);
  assert.equal('resolutions' in resolutionsOnly, true);
  const bellOnly = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraExchangeBell: true });
  assert.equal('fairWindBlessing' in bellOnly, false, 'Exchange Bell on, Fair-Wind Blessing off: no fairWindBlessing key');
  assert.equal('exchangeBell' in bellOnly, true);
  const on = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraFairWindBlessing: true });
  assert.equal(on.fairWindBlessing.nextAt, expected);
  assert.equal(on.fairWindBlessing.cycleDays, 30);
  assert.deepEqual(Object.keys(on.fairWindBlessing).sort(), calendarKeys);
  assert.equal('grandCouncil' in on, false);
  assert.equal('resolutions' in on, false);
  assert.equal('exchangeBell' in on, false);
  assert.equal('convoys' in on.fairWindBlessing, false);
  assert.equal('tollCoupon' in on.fairWindBlessing, false);
  const both = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraCouncil: true, fulmaraResolutions: true, fulmaraExchangeBell: true, fulmaraFairWindBlessing: true });
  assert.equal(both.fairWindBlessing.nextAt, expected);
  assert.equal(both.exchangeBell.nextAt, bellOnly.exchangeBell.nextAt);
  assert.equal(both.grandCouncil.councilOfTenNextElectionAt, councilOnly.grandCouncil.councilOfTenNextElectionAt);
  assert.deepEqual(both.resolutions, resolutionsOnly.resolutions);
  assert.equal(both.decision.reason, councilOnly.decision.reason);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'confluence', 'meridian', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, fulmaraFairWindBlessing: true, hoarvaleAssent: nationId === 'hoarvale' });
    assert.equal(other == null || !('fairWindBlessing' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='fulmara' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.fairWindBlessing.nextAt, expected);
  assert.equal(packed.fairWindBlessing.cycleDays, 30);
  assert.equal('exchangeBell' in packed, false);
  assert.equal('grandCouncil' in packed, false);
  assert.equal('resolutions' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_FULMARA_COUNCIL_ENABLED: 'true', HARIMU_FULMARA_RESOLUTIONS_ENABLED: 'true', HARIMU_FULMARA_EXCHANGE_BELL_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.fairWindBlessing.nextAt, expected);
  assert.equal(together.exchangeBell.nextAt, bellOnly.exchangeBell.nextAt);
  assert.equal(together.grandCouncil.tribuneVetoesPerSession, councilOnly.grandCouncil.tribuneVetoesPerSession);
  assert.deepEqual(together.resolutions, resolutionsOnly.resolutions);
  r.setFixtureEnv(key, 'false');
  const councilPacked = (await r.call('citizen', 'alice')).data.government;
  assert.equal('fairWindBlessing' in councilPacked, false, 'flag off leaves the Council, resolutions, and Exchange Bell read unchanged');
  assert.equal(councilPacked.exchangeBell.nextAt, bellOnly.exchangeBell.nextAt);
  assert.equal(councilPacked.grandCouncil.councilOfTenTermDays, 30);
  assert.deepEqual(councilPacked.resolutions, resolutionsOnly.resolutions);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('fairWindBlessing' in other), true);
});
