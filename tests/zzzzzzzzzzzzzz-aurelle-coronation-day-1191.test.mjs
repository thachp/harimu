/** #1191: Aurelle next Coronation Day, once per game year (30 real days) from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_AURELLE_CORONATION_DAY_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no coronationDay key.
 *  [ASSUMPTION] Docs §7.5 name Coronation Day and give no interval. Cadence is one game year, zero offset.
 *  The read is a date only: no rite text, Privy Council roster, or Crown debasement figures.
 *  The zzzzzzzzzzzzzz- name sorts after zzzzzzzzzzzzz-fulmara-charter-day-1179 so --test-shard
 *  does not move earlier files. Merged origin/dev 5eeebe48 (GRAY 58, #1189 last). Coronation Day is GRAY 59. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AURELLE_CORONATION_DAY_CYCLE_DAYS, AURELLE_CORONATION_DAY_CYCLE_MS, aurelleNextCoronationDayAt } from '../lib/aurelle-coronation-day.ts';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, withAurelleCoronationDay, withAurelleCrownCalendar, withAurelleHearthNight } from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 1000, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = AURELLE_CORONATION_DAY_CYCLE_MS;
const key = 'HARIMU_AURELLE_CORONATION_DAY_ENABLED';
const calendarKeys = ['cycleDays', 'nextAt'];
const block = nextAt => ({ nextAt, cycleDays: 30 });
const banned = ['rite', 'privy', 'council', 'debasement', 'roster', 'crown'];

test('the next Coronation Day falls once per game year (30 real days) from the Chair anchor, with zero offset', () => {
  assert.equal(anchor, 0);
  assert.equal(AURELLE_CORONATION_DAY_CYCLE_DAYS, 30);
  assert.equal(AURELLE_CORONATION_DAY_CYCLE_DAYS, realDaysPerGameYear, 'once per the existing world-clock game year');
  assert.equal(cycle, 30 * day);
  assert.equal(aurelleNextCoronationDayAt(anchor), anchor + cycle, 'zero offset: the first Coronation Day is one cycle after the anchor');
  assert.equal(aurelleNextCoronationDayAt(anchor - 1), anchor + cycle);
  assert.equal(aurelleNextCoronationDayAt(anchor + cycle - 1), anchor + cycle);
  assert.equal(aurelleNextCoronationDayAt(anchor + cycle), anchor + 2 * cycle);
  assert.equal(aurelleNextCoronationDayAt(anchor + cycle + 1), anchor + 2 * cycle);
  assert.equal(aurelleNextCoronationDayAt(anchor + 29 * day), anchor + cycle, 'day 29 is still this game year');
});

test('Coronation Day timestamps are safe integers on the 30-day cycle', () => {
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity, 1_793_000_000_000]) {
    const nextAt = aurelleNextCoronationDayAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.equal(nextAt % cycle, 0, String(now));
    assert.ok(nextAt > anchor, String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - cycle) assert.ok(nextAt > now && nextAt - now <= cycle, String(now));
  }
});

test('flag off leaves the Aurelle snapshot unchanged, and other nations gain no coronationDay key', () => {
  const aurelle = simulateGovernment({ ...baseInput, nationId: 'aurelle' });
  assert.equal(aurelle.decision.proposedSpendMinor, 100);
  assert.equal(withAurelleCoronationDay(aurelle, cycle, false), aurelle);
  assert.equal('coronationDay' in aurelle, false);
  const on = withAurelleCoronationDay(aurelle, cycle, true);
  assert.deepEqual(on.coronationDay, block(2 * cycle));
  assert.deepEqual(Object.keys(on.coronationDay).sort(), calendarKeys);
  for (const word of banned) assert.equal(JSON.stringify(on.coronationDay).includes(word), false, word);
  assert.equal(on.decision, aurelle.decision, 'the proposal is not rewritten');
  assert.equal(on.decision.proposedSpendMinor, 100);
  assert.equal('hearthNight' in on, false, 'Hearth Night stays on its own flag');
  assert.equal('crownCalendar' in on, false, 'the crown calendar stays on its own flag');
  assert.equal('succession' in on, false, 'names no heir');
  assert.equal('coronationDay' in aurelle, false, 'the input is not mutated');
  const crowned = withAurelleCrownCalendar(aurelle, cycle, true);
  const hearth = withAurelleHearthNight(crowned, cycle, true);
  const together = withAurelleCoronationDay(hearth, cycle, true);
  assert.deepEqual(together.coronationDay, block(2 * cycle));
  assert.equal(together.hearthNight.nextAt, hearth.hearthNight.nextAt);
  assert.equal(together.crownCalendar.nextGreatCouncilWindowAt, crowned.crownCalendar.nextGreatCouncilWindowAt);
  assert.equal(together.decision, aurelle.decision);
  assert.equal('coronationDay' in hearth, false);
  for (const nationId of ['kindle', 'korund', 'meridian', 'varkand', 'veldwood', 'ilmar', 'hoarvale', 'fulmara', 'confluence']) {
    const snapshot = ['kindle', 'korund', 'hoarvale'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId };
    assert.equal(withAurelleCoronationDay(snapshot, day, true), snapshot, nationId);
    assert.equal(withAurelleCoronationDay(snapshot, day, false), snapshot, nationId);
    assert.equal('coronationDay' in snapshot, false, nationId);
  }
  const published = publicGovernmentSnapshot(on);
  assert.deepEqual(published.coronationDay, on.coronationDay);
  assert.deepEqual(Object.keys(published.coronationDay).sort(), calendarKeys);
  assert.equal(published.decision.proposedSpendMinor, 100);
  assert.equal('coronationDay' in publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })), false);
  assert.equal('succession' in published, false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-15), key, 'GRAY 59; #1193 is last after #1197 Charter Fair');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-15), key);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-16), 'HARIMU_MERIDIAN_CONGRESS_WEEK_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-15), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-14), 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-13), 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-12), 'HARIMU_WORLD_ATLAS_READS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-11), 'HARIMU_VARKAND_ROTATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 73);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/aurelle-coronation-day\.ts/);
});

test('flag off: the Aurelle government read is unchanged; flag on names the next Coronation Day; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = block(aurelleNextCoronationDayAt(seconds * 1000));
  const off = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true });
  assert.equal('coronationDay' in off, false, 'flag off');
  assert.equal('hearthNight' in off, false);
  assert.equal('crownCalendar' in off, false);
  assert.equal('succession' in off, false);
  const on = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true, aurelleCoronationDay: true });
  assert.deepEqual(on.coronationDay, expected);
  assert.equal(Number.isSafeInteger(on.coronationDay.nextAt), true);
  assert.deepEqual(Object.keys(on.coronationDay).sort(), calendarKeys);
  for (const word of banned) assert.equal(JSON.stringify(on.coronationDay).includes(word), false, word);
  assert.deepEqual(on.decision, off.decision);
  assert.equal('hearthNight' in on, false, 'Coronation Day alone does not add Hearth Night');
  assert.equal('crownCalendar' in on, false);
  assert.equal('succession' in on, false);
  const together = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true, aurelleCrownCalendar: true, aurelleHearthNight: true, aurelleCoronationDay: true });
  assert.deepEqual(together.coronationDay, expected);
  assert.equal('hearthNight' in together, true);
  assert.equal('crownCalendar' in together, true);
  assert.deepEqual(together.decision, off.decision);
  for (const nationId of ['kindle', 'korund', 'meridian', 'varkand', 'veldwood', 'ilmar', 'fulmara', 'confluence', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, aurelleCoronationDay: true });
    assert.equal(other == null || !('coronationDay' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run();
  const citizenOff = (await r.call('citizen', 'alice')).data.government;
  assert.equal('coronationDay' in citizenOff, false, 'flag off leaves the citizen read unchanged');
  assert.equal(citizenOff.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.coronationDay, expected);
  assert.equal('hearthNight' in packed, false, 'Coronation Day does not turn on Hearth Night');
  assert.equal('crownCalendar' in packed, false);
  assert.equal('succession' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal('coronationDay' in (await r.call('citizen', 'alice')).data.government, false, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_AURELLE_CROWN_CALENDAR_ENABLED: 'true', HARIMU_AURELLE_HEARTH_NIGHT_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const bothFlags = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(bothFlags.coronationDay, expected);
  assert.equal('hearthNight' in bothFlags, true);
  assert.equal('crownCalendar' in bothFlags, true);
  assert.equal(bothFlags.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('coronationDay' in other), true);
});
