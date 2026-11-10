/** #1179: Fulmara next Charter Day, once per game year (30 real days) from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_FULMARA_CHARTER_DAY_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no charterDay key.
 *  [ASSUMPTION] Docs §7.10 name Charter Day and give no interval. Cadence is one game year, zero offset.
 *  The read is a date only: no charter text, shareholder vote, dividend, or bonus.
 *  The zzzzzzzzzzzzz- name sorts after zzzzzzzzzzzz-confluence-quota-day-1169 so --test-shard
 *  does not move earlier files. Opened from origin/dev f0b59da2, where this flag is last (GRAY 51). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { FULMARA_CHARTER_DAY_CYCLE_DAYS, FULMARA_CHARTER_DAY_CYCLE_MS, fulmaraNextCharterDayAt } from '../lib/fulmara-charter-day.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { fulmaraCharterDaySnapshot, fulmaraExchangeBellSnapshot, fulmaraGovernmentSnapshot, fulmaraResolutionsSnapshot, simulateGovernment, withFulmaraCharterDay, withFulmaraExchangeBell, withFulmaraResolutions } from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = FULMARA_CHARTER_DAY_CYCLE_MS;
const key = 'HARIMU_FULMARA_CHARTER_DAY_ENABLED';
const calendarKeys = ['cycleDays', 'nextAt'];
const block = nextAt => ({ nextAt, cycleDays: 30 });
const banned = ['charter', 'vote', 'dividend', 'bonus', 'share', 'text'];

test('the next Charter Day falls once per game year (30 real days) from the Chair anchor, with zero offset', () => {
  assert.equal(anchor, 0);
  assert.equal(FULMARA_CHARTER_DAY_CYCLE_DAYS, 30);
  assert.equal(FULMARA_CHARTER_DAY_CYCLE_DAYS, realDaysPerGameYear, 'once per the existing world-clock game year');
  assert.equal(cycle, 30 * day);
  assert.equal(fulmaraNextCharterDayAt(anchor), anchor + cycle, 'zero offset: the first Charter Day is one cycle after the anchor');
  assert.equal(fulmaraNextCharterDayAt(anchor - 1), anchor + cycle);
  assert.equal(fulmaraNextCharterDayAt(anchor + cycle - 1), anchor + cycle);
  assert.equal(fulmaraNextCharterDayAt(anchor + cycle), anchor + 2 * cycle);
  assert.equal(fulmaraNextCharterDayAt(anchor + cycle + 1), anchor + 2 * cycle);
  assert.equal(fulmaraNextCharterDayAt(anchor + 29 * day), anchor + cycle, 'day 29 is still this game year');
});

test('Charter Day timestamps are safe integers on the 30-day cycle', () => {
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity, 1_793_000_000_000]) {
    const nextAt = fulmaraNextCharterDayAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.equal(nextAt % cycle, 0, String(now));
    assert.ok(nextAt > anchor, String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - cycle) assert.ok(nextAt > now && nextAt - now <= cycle, String(now));
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no charterDay key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'fulmara' }), null);
  assert.equal(fulmaraCharterDaySnapshot(cycle, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'varkand', 'ilmar', 'hoarvale', 'confluence', 'veldwood']) {
    const snapshot = ['kindle', 'korund', 'aurelle', 'hoarvale'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId };
    assert.equal(withFulmaraCharterDay(snapshot, day, true), snapshot, nationId);
    assert.equal(withFulmaraCharterDay(snapshot, day, false), snapshot, nationId);
    assert.equal('charterDay' in snapshot, false, nationId);
  }
  const fulmara = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'fulmara' };
  assert.equal(withFulmaraCharterDay(fulmara, day, false), fulmara);
  assert.equal('charterDay' in fulmara, false);
  const on = withFulmaraCharterDay(fulmara, day, true);
  assert.deepEqual(on.charterDay, block(cycle));
  assert.deepEqual(Object.keys(on.charterDay).sort(), calendarKeys);
  for (const word of banned) assert.equal(JSON.stringify(on.charterDay).includes(word), false, word);
  assert.equal(on.decision, fulmara.decision, 'the proposal is not rewritten');
  assert.equal('charterDay' in fulmara, false, 'the input snapshot is not mutated');
  assert.equal('grandCouncil' in on, false);
  assert.equal('resolutions' in on, false);
  assert.equal('exchangeBell' in on, false);
  const read = fulmaraCharterDaySnapshot(anchor, true);
  assert.deepEqual(read.charterDay, block(cycle));
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.equal('grandCouncil' in read, false);
  assert.equal('resolutions' in read, false);
  assert.equal('exchangeBell' in read, false);
  const published = publicGovernmentSnapshot(read);
  assert.deepEqual(published.charterDay, read.charterDay);
  assert.deepEqual(Object.keys(published.charterDay).sort(), calendarKeys);
  assert.equal('charterDay' in publicGovernmentSnapshot(fulmara), false);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).charterDay, undefined);
  const councilOnly = fulmaraGovernmentSnapshot(anchor, true);
  assert.equal('charterDay' in councilOnly, false, 'the Council read is unchanged while this flag is off');
  const resolutionsOnly = fulmaraResolutionsSnapshot(true);
  assert.equal('charterDay' in resolutionsOnly, false);
  const bellOnly = fulmaraExchangeBellSnapshot(anchor, true);
  assert.equal('charterDay' in bellOnly, false);
  const together = withFulmaraCharterDay(withFulmaraExchangeBell(withFulmaraResolutions(councilOnly, true), anchor, true), anchor, true);
  assert.deepEqual(together.charterDay, block(cycle));
  assert.equal(together.exchangeBell.nextAt, bellOnly.exchangeBell.nextAt);
  assert.equal(together.grandCouncil.councilOfTenNextElectionAt, councilOnly.grandCouncil.councilOfTenNextElectionAt);
  assert.deepEqual(together.resolutions, resolutionsOnly.resolutions);
  assert.equal(together.decision.reason, councilOnly.decision.reason);
  assert.equal('charterDay' in councilOnly, false);
  assert.equal('charterDay' in resolutionsOnly, false);
  assert.equal('charterDay' in bellOnly, false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-21), key, '#1184, #1183, #1187, #1189, #1191, #1196, #1197, and #1193 follow this flag');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-21), key);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-22), 'HARIMU_FULMARA_GRAND_REGATTA_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-21), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-17), 'HARIMU_MERIDIAN_CONGRESS_WEEK_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-16), 'HARIMU_AURELLE_CORONATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-15), 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-14), 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-13), 'HARIMU_WORLD_ATLAS_READS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-12), 'HARIMU_VARKAND_ROTATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 74);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/fulmara-charter-day\.ts/);
});

test('flag off: the Fulmara government read is unchanged; flag on names the next Charter Day; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = block(fulmaraNextCharterDayAt(seconds * 1000));
  assert.equal(await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const councilOnly = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraCouncil: true });
  assert.equal('charterDay' in councilOnly, false, 'council on, Charter Day off: no charterDay key');
  const resolutionsOnly = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraResolutions: true });
  assert.equal('charterDay' in resolutionsOnly, false);
  const bellOnly = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraExchangeBell: true });
  assert.equal('charterDay' in bellOnly, false, 'Exchange Bell on, Charter Day off: no charterDay key');
  const on = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraCharterDay: true });
  assert.deepEqual(on.charterDay, expected);
  assert.equal(Number.isSafeInteger(on.charterDay.nextAt), true);
  assert.deepEqual(Object.keys(on.charterDay).sort(), calendarKeys);
  for (const word of banned) assert.equal(JSON.stringify(on.charterDay).includes(word), false, word);
  assert.equal('grandCouncil' in on, false, 'Charter Day alone does not add the Council');
  assert.equal('resolutions' in on, false);
  assert.equal('exchangeBell' in on, false);
  assert.equal(on.decision.proposedSpendMinor, 0);
  const together = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraCouncil: true, fulmaraResolutions: true, fulmaraExchangeBell: true, fulmaraCharterDay: true });
  assert.deepEqual(together.charterDay, expected);
  assert.equal(together.exchangeBell.nextAt, bellOnly.exchangeBell.nextAt);
  assert.equal(together.grandCouncil.councilOfTenNextElectionAt, councilOnly.grandCouncil.councilOfTenNextElectionAt);
  assert.deepEqual(together.resolutions, resolutionsOnly.resolutions);
  assert.equal(together.decision.reason, councilOnly.decision.reason);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'varkand', 'ilmar', 'confluence', 'veldwood', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, fulmaraCharterDay: true });
    assert.equal(other == null || !('charterDay' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='fulmara' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.charterDay, expected);
  assert.equal('grandCouncil' in packed, false);
  assert.equal('exchangeBell' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_FULMARA_COUNCIL_ENABLED: 'true', HARIMU_FULMARA_RESOLUTIONS_ENABLED: 'true', HARIMU_FULMARA_EXCHANGE_BELL_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const withPeers = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(withPeers.charterDay, expected);
  assert.equal(withPeers.exchangeBell.nextAt, bellOnly.exchangeBell.nextAt);
  assert.equal(withPeers.grandCouncil.tribuneVetoesPerSession, councilOnly.grandCouncil.tribuneVetoesPerSession);
  assert.deepEqual(withPeers.resolutions, resolutionsOnly.resolutions);
  r.setFixtureEnv(key, 'false');
  const councilPacked = (await r.call('citizen', 'alice')).data.government;
  assert.equal('charterDay' in councilPacked, false, 'flag off leaves the Council, resolutions, and Exchange Bell read unchanged');
  assert.equal(councilPacked.exchangeBell.nextAt, bellOnly.exchangeBell.nextAt);
  assert.deepEqual(councilPacked.resolutions, resolutionsOnly.resolutions);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('charterDay' in other), true);
});
