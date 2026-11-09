/** #1189: Meridian next Congress Week every 5 game years (150 real days) from the Chair anchor (#1085).
 *  Flag HARIMU_MERIDIAN_CONGRESS_WEEK_ENABLED in HARIMU_GRAY_PACK. Flag off: no congressWeek key.
 *  Date only: no congress agenda, Standing Committee roster, or SEZ text.
 *  The zzzzzzzzzzzzz- name sorts after the Turbine Day file so Node's --test-shard round-robin stays stable.
 *  [ASSUMPTION] cadence = 150 real days; zero anniversary offset (Architect pre-accepted). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import {
  meridianCongressWeekSnapshot,
  meridianExamDaySnapshot,
  meridianPartySnapshot,
  meridianTurbineDaySnapshot,
  simulateGovernment,
  withMeridianCongressWeek,
} from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import {
  MERIDIAN_CONGRESS_WEEK_INTERVAL_DAYS,
  MERIDIAN_CONGRESS_WEEK_MS,
  meridianNextCongressWeekAt,
} from '../lib/meridian-congress-week.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const F = 'HARIMU_MERIDIAN_CONGRESS_WEEK_ENABLED';
const cycle = 150 * day;
const block = nextAt => ({ nextAt, intervalDays: 150, holdsCongress: false });

test('Congress Week is every 5 game years (150 real days) on the Chair anchor', () => {
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(MERIDIAN_CONGRESS_WEEK_INTERVAL_DAYS, 150);
  assert.equal(MERIDIAN_CONGRESS_WEEK_INTERVAL_DAYS, 5 * realDaysPerGameYear);
  assert.equal(MERIDIAN_CONGRESS_WEEK_MS, cycle);
  assert.equal(meridianNextCongressWeekAt(0), cycle);
  assert.equal(meridianNextCongressWeekAt(cycle - 1), cycle);
  assert.equal(meridianNextCongressWeekAt(cycle), 2 * cycle);
  assert.equal(meridianNextCongressWeekAt(cycle + 1), 2 * cycle);
  assert.equal(meridianNextCongressWeekAt(-1), cycle);
  for (const now of [0, cycle * 3 + 7, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0.9, NaN, Infinity, -Infinity]) {
    const next = meridianNextCongressWeekAt(now);
    assert.equal(Number.isSafeInteger(next), true, String(now));
    assert.equal(next % cycle, 0, String(now));
    assert.ok(next > VARKAND_CHAIR_ANCHOR_MS, String(now));
  }
});

test('flag off leaves the snapshot unchanged; other nations gain no key; date only', () => {
  assert.equal(meridianCongressWeekSnapshot(cycle, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'confluence', 'ilmar', 'fulmara']) {
    const snapshot = ['varkand', 'confluence', 'ilmar', 'fulmara'].includes(nationId)
      ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId } : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withMeridianCongressWeek(snapshot, cycle, true), snapshot, nationId);
  }
  const meridian = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'meridian' };
  assert.equal(withMeridianCongressWeek(meridian, day, false), meridian);
  const on = withMeridianCongressWeek(meridian, day, true);
  assert.deepEqual(on.congressWeek, block(cycle));
  assert.deepEqual(Object.keys(on.congressWeek).sort(), ['holdsCongress', 'intervalDays', 'nextAt']);
  assert.equal('congressWeek' in meridian, false, 'input not mutated');
  assert.deepEqual({ ...on, congressWeek: undefined }, { ...meridian, congressWeek: undefined });
  assert.deepEqual(publicGovernmentSnapshot(on).congressWeek, on.congressWeek);
  assert.equal('congressWeek' in publicGovernmentSnapshot(meridian), false);
  const read = meridianCongressWeekSnapshot(0, true);
  assert.deepEqual(read.congressWeek, block(cycle));
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.doesNotMatch(JSON.stringify(read), /agenda|roster|standing committee|sez/i, 'no agenda, roster, or SEZ text');
  for (const peer of [meridianPartySnapshot(0, true), meridianExamDaySnapshot(0, true), meridianTurbineDaySnapshot(0, true)]) {
    assert.equal('congressWeek' in peer, false, 'peer reads unchanged while this flag is off');
  }
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[F], undefined, 'not its own text binding');
  assert.equal(prod.vars[F], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[F], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[F], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-6), F, '#1191 Coronation Day, #1196 Great Pilgrimage, #1197 Charter Fair, then #1193');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-6), F);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-6), F);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-5), 'HARIMU_AURELLE_CORONATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-3), 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), 'HARIMU_WORLD_ATLAS_READS_ENABLED');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, F), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, F), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [F]: 'false' }, F), false);
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/meridian-congress-week\.ts/);
});

test('government read: flag off unchanged, flag on adds congressWeek, other nations unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const next = meridianNextCongressWeekAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const turbineOnly = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true, meridianTurbineDay: true });
  assert.equal('congressWeek' in turbineOnly, false);
  const on = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true, meridianCongressWeek: true });
  assert.deepEqual(on.congressWeek, block(next));
  for (const k of ['partyState', 'examDay', 'turbineDay']) assert.equal(k in on, false, k);
  const all = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', {
    readOnly: true, meridianPartySchedule: true, meridianExamDay: true, meridianTurbineDay: true, meridianCongressWeek: true,
  });
  assert.deepEqual(all.congressWeek, block(next));
  for (const k of ['partyState', 'examDay', 'turbineDay']) assert.equal(k in all, true, k);
  const turbinePlus = await gov.readGovernment(r.db, 'meridian', seconds, 'alice', { readOnly: true, meridianTurbineDay: true, meridianCongressWeek: true });
  assert.deepEqual(turbinePlus.congressWeek, block(next));
  assert.deepEqual(turbinePlus.turbineDay, turbineOnly.turbineDay);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'ilmar', 'confluence', 'fulmara']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, meridianCongressWeek: true });
    assert.equal(other == null || !('congressWeek' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='meridian' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [F]: 'true' }));
  assert.deepEqual((await r.call('citizen', 'alice')).data.government.congressWeek, block(next));
  r.setFixtureEnv(F, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
});
