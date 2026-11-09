/** #1197: Aurelle next Charter Fair, once per 30 real days from the Varkand Chair anchor.
 *  No offset. The helper takes nowMs only and returns the next date only.
 *  Flag HARIMU_AURELLE_CHARTER_FAIR_ENABLED in HARIMU_GRAY_PACK; #1193 world atlas reads follows.
 *  Flag off: no charterFair key. Date only: no charter list, guild name, or trade right.
 *  The block is separate from Hearth Night and the crown calendar. The zzzzzzzzzzzzzz- name sorts after
 *  zzzzzzzzzzzzz- files so --test-shard does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AURELLE_CHARTER_FAIR_CYCLE_DAYS, AURELLE_CHARTER_FAIR_CYCLE_MS, aurelleNextCharterFairAt } from '../lib/aurelle-charter-fair.ts';
import { aurelleNextCoronationDayAt } from '../lib/aurelle-coronation-day.ts';
import { aurelleNextHearthNightAt } from '../lib/aurelle-hearth-night.ts';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, withAurelleCharterFair, withAurelleCoronationDay, withAurelleCrownCalendar, withAurelleHearthNight } from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 1000, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = AURELLE_CHARTER_FAIR_CYCLE_MS;
const key = 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED';
const block = nextAt => ({ nextAt, cycleDays: 30 });
const banned = ['guild', 'trade', 'right', 'persona', 'window', 'endsAt'];

test('the next Charter Fair falls once per 30 real days from the Chair anchor, with no offset', () => {
  assert.equal(anchor, 0);
  assert.equal(AURELLE_CHARTER_FAIR_CYCLE_DAYS, 30);
  assert.equal(AURELLE_CHARTER_FAIR_CYCLE_DAYS, realDaysPerGameYear);
  assert.equal(cycle, 30 * day);
  assert.equal(aurelleNextCharterFairAt(anchor), anchor + cycle);
  assert.equal(aurelleNextCharterFairAt(anchor - 1), anchor + cycle);
  assert.equal(aurelleNextCharterFairAt(anchor + cycle - 1), anchor + cycle);
  assert.equal(aurelleNextCharterFairAt(anchor + cycle), anchor + 2 * cycle);
  assert.equal(aurelleNextCharterFairAt(anchor + 29 * day), anchor + cycle);
  assert.equal(aurelleNextCharterFairAt.length, 1, 'nowMs only');
});

test('Charter Fair timestamps are safe integers on the 30-day cycle and store no window', () => {
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity]) {
    const nextAt = aurelleNextCharterFairAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.equal(nextAt % cycle, 0, String(now));
    assert.ok(nextAt > anchor, String(now));
    assert.equal(typeof nextAt, 'number');
  }
});

test('flag off leaves the Aurelle snapshot unchanged, and other nations gain no charterFair key', () => {
  const aurelle = simulateGovernment({ ...baseInput, nationId: 'aurelle' });
  assert.equal(aurelle.decision.proposedSpendMinor, 100);
  assert.equal(withAurelleCharterFair(aurelle, cycle, false), aurelle);
  assert.equal('charterFair' in aurelle, false);
  const on = withAurelleCharterFair(aurelle, cycle, true);
  assert.deepEqual(on.charterFair, block(2 * cycle));
  assert.deepEqual(Object.keys(on.charterFair).sort(), ['cycleDays', 'nextAt']);
  for (const word of banned) assert.equal(JSON.stringify(on.charterFair).includes(word), false, word);
  assert.equal(on.decision, aurelle.decision);
  assert.equal('hearthNight' in on, false);
  assert.equal('crownCalendar' in on, false);
  assert.equal('charterFair' in aurelle, false, 'the input is not mutated');
  const hearth = withAurelleHearthNight(aurelle, cycle, true);
  const both = withAurelleCharterFair(hearth, cycle, true);
  assert.deepEqual(both.charterFair, block(2 * cycle));
  assert.deepEqual(both.hearthNight, hearth.hearthNight);
  assert.equal(both.decision, aurelle.decision);
  assert.equal('charterFair' in hearth, false);
  const crowned = withAurelleCrownCalendar(aurelle, cycle, true);
  const withCrown = withAurelleCharterFair(crowned, cycle, true);
  assert.equal(withCrown.crownCalendar.nextGreatCouncilWindowAt, crowned.crownCalendar.nextGreatCouncilWindowAt);
  assert.deepEqual(withCrown.charterFair, block(2 * cycle));
  const coronation = withAurelleCoronationDay(aurelle, cycle, true);
  const withFair = withAurelleCharterFair(coronation, cycle, true);
  assert.deepEqual(withFair.coronationDay, coronation.coronationDay);
  assert.deepEqual(withFair.charterFair, block(2 * cycle));
  assert.equal(withFair.decision, aurelle.decision);
  assert.equal('charterFair' in coronation, false);
  for (const nationId of ['kindle', 'korund', 'meridian', 'varkand', 'veldwood', 'ilmar', 'hoarvale', 'fulmara', 'confluence']) {
    const snapshot = ['kindle', 'korund', 'hoarvale'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId };
    assert.equal(withAurelleCharterFair(snapshot, day, true), snapshot, nationId);
    assert.equal('charterFair' in snapshot, false, nationId);
  }
  const published = publicGovernmentSnapshot(on);
  assert.deepEqual(published.charterFair, on.charterFair);
  assert.equal('charterFair' in publicGovernmentSnapshot(aurelle), false);
  assert.equal('charterFair' in publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })), false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-2), key, '#1193 follows');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-2), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-3), 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), 'HARIMU_WORLD_ATLAS_READS_ENABLED');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/aurelle-charter-fair\.ts/);
});

test('flag off: the Aurelle government read is unchanged; flag on adds charterFair; Hearth Night and other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = block(aurelleNextCharterFairAt(seconds * 1000));
  const hearthExpected = { nextAt: aurelleNextHearthNightAt(seconds * 1000), cycleDays: 30 };
  const off = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true });
  assert.equal('charterFair' in off, false, 'flag off');
  assert.equal('hearthNight' in off, false);
  const on = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true, aurelleCharterFair: true });
  assert.deepEqual(on.charterFair, expected);
  assert.equal('hearthNight' in on, false);
  assert.deepEqual(on.decision, off.decision);
  const hearthOnly = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true, aurelleHearthNight: true });
  assert.equal('charterFair' in hearthOnly, false, 'Hearth Night does not add charterFair');
  assert.deepEqual(hearthOnly.hearthNight, hearthExpected);
  const coronationOnly = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true, aurelleCoronationDay: true });
  assert.equal('charterFair' in coronationOnly, false, 'Coronation Day alone does not add charterFair');
  const bothDays = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true, aurelleCoronationDay: true, aurelleCharterFair: true });
  assert.deepEqual(bothDays.coronationDay, coronationOnly.coronationDay);
  assert.deepEqual(bothDays.charterFair, expected);
  assert.deepEqual(bothDays.decision, off.decision);
  assert.equal(bothDays.coronationDay.nextAt, aurelleNextCoronationDayAt(seconds * 1000));
  const together = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true, aurelleCrownCalendar: true, aurelleHearthNight: true, aurelleCharterFair: true });
  assert.deepEqual(together.charterFair, expected);
  assert.deepEqual(together.hearthNight, hearthExpected);
  assert.equal('crownCalendar' in together, true);
  assert.deepEqual(together.decision, off.decision);
  for (const nationId of ['kindle', 'korund', 'meridian', 'varkand', 'veldwood', 'ilmar', 'fulmara', 'confluence', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, aurelleCharterFair: true });
    assert.equal(other == null || !('charterFair' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run();
  const citizenOff = (await r.call('citizen', 'alice')).data.government;
  assert.equal('charterFair' in citizenOff, false, 'flag off leaves the citizen read unchanged');
  assert.equal(citizenOff.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.charterFair, expected);
  for (const word of banned) assert.equal(JSON.stringify(packed.charterFair).includes(word), false, word);
  assert.equal('hearthNight' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal('charterFair' in (await r.call('citizen', 'alice')).data.government, false, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_AURELLE_HEARTH_NIGHT_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const bothFlags = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(bothFlags.charterFair, expected);
  assert.deepEqual(bothFlags.hearthNight, hearthExpected);
  assert.equal(bothFlags.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('charterFair' in other), true);
});
