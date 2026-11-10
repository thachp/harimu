/** #1243: Aurelle next Kite Festival, once per game year from the Varkand Chair anchor. Offset 0 is game spring.
 *  Flag HARIMU_AURELLE_KITE_FESTIVAL_ENABLED in HARIMU_GRAY_PACK. Clearing follows it. Flag off: no kiteFestival key. Date only. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AURELLE_KITE_FESTIVAL_CYCLE_DAYS, AURELLE_KITE_FESTIVAL_CYCLE_MS, aurelleNextKiteFestivalAt } from '../lib/aurelle-kite-festival.ts';
import { aurelleNextHearthNightAt } from '../lib/aurelle-hearth-night.ts';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { gameSeasonAt, seasonLengthMs, seasonOrder } from '../lib/game-season.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, withAurelleCrownCalendar, withAurelleHearthNight, withAurelleKiteFestival } from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 1000, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = AURELLE_KITE_FESTIVAL_CYCLE_MS;
const key = 'HARIMU_AURELLE_KITE_FESTIVAL_ENABLED';
const block = nextAt => ({ nextAt });
const banned = ['duel', 'winner', 'prize', 'bonus'];

test('the next Kite Festival falls once per game year at the start of game spring', () => {
  assert.equal(anchor, 0);
  assert.equal(seasonOrder[0], 'spring');
  assert.equal(seasonOrder.length * seasonLengthMs, cycle, 'four 7.5-real-day seasons are one game year');
  assert.equal(AURELLE_KITE_FESTIVAL_CYCLE_DAYS, realDaysPerGameYear, 'once per the existing world-clock game year');
  assert.equal(cycle, realDaysPerGameYear * day);
  assert.equal(aurelleNextKiteFestivalAt.length, 1, 'nowMs only');
  assert.equal(aurelleNextKiteFestivalAt(anchor), anchor + cycle);
  assert.equal(aurelleNextKiteFestivalAt(anchor - 1), anchor + cycle, 'before the anchor');
  assert.equal(aurelleNextKiteFestivalAt(anchor + cycle - 1), anchor + cycle);
  assert.equal(aurelleNextKiteFestivalAt(anchor + cycle), anchor + 2 * cycle, 'an exact boundary rolls to the next year');
  assert.equal(aurelleNextKiteFestivalAt(anchor + cycle + 1), anchor + 2 * cycle);
  assert.equal(aurelleNextKiteFestivalAt(anchor + 29 * day), anchor + cycle, 'day 29 is still this game year');
  const nextAt = aurelleNextKiteFestivalAt(anchor);
  const season = gameSeasonAt(anchor, nextAt);
  assert.equal(season.season, 'spring');
  assert.equal(season.startsAt, nextAt, 'the festival is the start of that spring');
  assert.equal(nextAt, aurelleNextHearthNightAt(anchor), 'the same instant as Hearth Night');
});

test('Kite Festival timestamps are safe integers on the 30-day cycle', () => {
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity, 1_793_000_000_000]) {
    const nextAt = aurelleNextKiteFestivalAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.equal(nextAt % cycle, 0, String(now));
    assert.ok(nextAt > anchor, String(now));
    assert.equal(nextAt, aurelleNextHearthNightAt(now), String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - cycle) assert.ok(nextAt > now && nextAt - now <= cycle, String(now));
  }
});

test('flag off leaves the Aurelle snapshot unchanged, and other nations gain no kiteFestival key', () => {
  const aurelle = simulateGovernment({ ...baseInput, nationId: 'aurelle' });
  assert.equal(aurelle.decision.proposedSpendMinor, 100);
  assert.equal(withAurelleKiteFestival(aurelle, cycle, false), aurelle);
  assert.equal('kiteFestival' in aurelle, false);
  const on = withAurelleKiteFestival(aurelle, cycle, true);
  assert.deepEqual(on.kiteFestival, block(2 * cycle));
  assert.deepEqual(Object.keys(on.kiteFestival).sort(), ['nextAt']);
  for (const word of banned) assert.equal(JSON.stringify(on.kiteFestival).includes(word), false, word);
  assert.equal(on.decision, aurelle.decision, 'the proposal is not rewritten');
  assert.equal('succession' in on, false, 'names no heir');
  assert.equal('hearthNight' in on, false, 'Hearth Night stays on its own flag');
  assert.equal('crownCalendar' in on, false);
  assert.equal('kiteFestival' in aurelle, false, 'the input is not mutated');
  const hearth = withAurelleHearthNight(aurelle, cycle, true);
  const both = withAurelleKiteFestival(hearth, cycle, true);
  assert.deepEqual(both.kiteFestival, block(2 * cycle));
  assert.equal(both.hearthNight.nextAt, hearth.hearthNight.nextAt);
  assert.equal(both.kiteFestival.nextAt, both.hearthNight.nextAt);
  assert.equal('kiteFestival' in hearth, false);
  const crowned = withAurelleCrownCalendar(aurelle, cycle, true);
  assert.equal('kiteFestival' in crowned, false);
  for (const nationId of ['kindle', 'korund', 'meridian', 'varkand', 'veldwood', 'ilmar', 'hoarvale', 'fulmara', 'confluence']) {
    const snapshot = ['kindle', 'korund', 'hoarvale'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId };
    assert.equal(withAurelleKiteFestival(snapshot, day, true), snapshot, nationId);
    assert.equal(withAurelleKiteFestival(snapshot, day, false), snapshot, nationId);
    assert.equal('kiteFestival' in snapshot, false, nationId);
  }
  const published = publicGovernmentSnapshot(on);
  assert.deepEqual(published.kiteFestival, on.kiteFestival);
  assert.equal(published.decision.proposedSpendMinor, 100);
  assert.equal('kiteFestival' in publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })), false);
  assert.equal('succession' in published, false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-2), key);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-2), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), key);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-3), 'HARIMU_KINDLE_BRASSWELL_PORT_ENABLED');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-3), 'HARIMU_KINDLE_BRASSWELL_PORT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-3), 'HARIMU_KINDLE_BRASSWELL_PORT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), 'HARIMU_VARKAND_RED_ALERT_CANCELS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 71);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Aurelle government read is unchanged; flag on adds kiteFestival; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = block(aurelleNextKiteFestivalAt(seconds * 1000));
  const off = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true });
  assert.equal('kiteFestival' in off, false, 'flag off');
  assert.equal('hearthNight' in off, false);
  const on = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true, aurelleKiteFestival: true });
  assert.deepEqual(on.kiteFestival, expected);
  assert.equal(Number.isSafeInteger(on.kiteFestival.nextAt), true);
  assert.deepEqual(Object.keys(on.kiteFestival), ['nextAt']);
  assert.deepEqual(on.decision, off.decision);
  assert.equal('hearthNight' in on, false, 'Kite Festival alone does not add Hearth Night');
  const together = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true, aurelleHearthNight: true, aurelleKiteFestival: true });
  assert.deepEqual(together.kiteFestival, expected);
  assert.equal(together.hearthNight.nextAt, together.kiteFestival.nextAt);
  for (const nationId of ['kindle', 'korund', 'meridian', 'varkand', 'veldwood', 'ilmar', 'fulmara', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, aurelleKiteFestival: true });
    assert.equal(other == null || !('kiteFestival' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run();
  const citizenOff = (await r.call('citizen', 'alice')).data.government;
  assert.equal('kiteFestival' in citizenOff, false, 'flag off leaves the citizen read unchanged');
  assert.equal(citizenOff.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.kiteFestival, expected);
  assert.equal('hearthNight' in packed, false, 'kite festival does not turn on Hearth Night');
  r.setFixtureEnv(key, 'false');
  assert.equal('kiteFestival' in (await r.call('citizen', 'alice')).data.government, false, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_AURELLE_HEARTH_NIGHT_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const bothFlags = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(bothFlags.kiteFestival, expected);
  assert.equal(bothFlags.hearthNight.nextAt, expected.nextAt);
  assert.equal(bothFlags.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('kiteFestival' in other), true);
});
