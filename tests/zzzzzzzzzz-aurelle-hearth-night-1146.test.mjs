/** #1146: Aurelle next Hearth Night, once per game year (30 real days) from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_AURELLE_HEARTH_NIGHT_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no hearthNight key.
 *  The read blesses no houses, names no heirs, and proposes no spending. The zzzzzzzzzz- name sorts after
 *  zzzzzzzzz- so --test-shard does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AURELLE_HEARTH_NIGHT_CYCLE_DAYS, AURELLE_HEARTH_NIGHT_CYCLE_MS, aurelleNextHearthNightAt } from '../lib/aurelle-hearth-night.ts';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, withAurelleCrownCalendar, withAurelleHearthNight } from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 1000, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = AURELLE_HEARTH_NIGHT_CYCLE_MS;
const key = 'HARIMU_AURELLE_HEARTH_NIGHT_ENABLED';
const block = nextAt => ({ nextAt, cycleDays: 30 });

test('the next Hearth Night falls once per game year (30 real days) from the Chair anchor', () => {
  assert.equal(anchor, 0);
  assert.equal(AURELLE_HEARTH_NIGHT_CYCLE_DAYS, 30);
  assert.equal(AURELLE_HEARTH_NIGHT_CYCLE_DAYS, realDaysPerGameYear, 'once per the existing world-clock game year');
  assert.equal(cycle, 30 * day);
  assert.equal(aurelleNextHearthNightAt(anchor), anchor + cycle);
  assert.equal(aurelleNextHearthNightAt(anchor - 1), anchor + cycle);
  assert.equal(aurelleNextHearthNightAt(anchor + cycle - 1), anchor + cycle);
  assert.equal(aurelleNextHearthNightAt(anchor + cycle), anchor + 2 * cycle);
  assert.equal(aurelleNextHearthNightAt(anchor + cycle + 1), anchor + 2 * cycle);
  assert.equal(aurelleNextHearthNightAt(anchor + 29 * day), anchor + cycle, 'day 29 is still this game year');
});

test('Hearth Night timestamps are safe integers on the 30-day cycle', () => {
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity, 1_793_000_000_000]) {
    const nextAt = aurelleNextHearthNightAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.equal(nextAt % cycle, 0, String(now));
    assert.ok(nextAt > anchor, String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - cycle) assert.ok(nextAt > now && nextAt - now <= cycle, String(now));
  }
});

test('flag off leaves the Aurelle snapshot unchanged, and other nations gain no hearthNight key', () => {
  const aurelle = simulateGovernment({ ...baseInput, nationId: 'aurelle' });
  assert.equal(aurelle.decision.proposedSpendMinor, 100);
  assert.equal(withAurelleHearthNight(aurelle, cycle, false), aurelle);
  assert.equal('hearthNight' in aurelle, false);
  const on = withAurelleHearthNight(aurelle, cycle, true);
  assert.deepEqual(on.hearthNight, block(2 * cycle));
  assert.deepEqual(Object.keys(on.hearthNight).sort(), ['cycleDays', 'nextAt']);
  assert.equal(on.decision, aurelle.decision, 'the proposal is not rewritten');
  assert.equal(on.decision.proposedSpendMinor, 100);
  assert.equal('succession' in on, false, 'names no heir');
  assert.equal('crownCalendar' in on, false, 'the crown calendar stays on its own flag');
  assert.equal('hearthNight' in aurelle, false, 'the input is not mutated');
  assert.equal(JSON.stringify(on.hearthNight).includes('house'), false);
  const crowned = withAurelleCrownCalendar(aurelle, cycle, true);
  const both = withAurelleHearthNight(crowned, cycle, true);
  assert.deepEqual(both.hearthNight, block(2 * cycle));
  assert.equal(both.crownCalendar.nextGreatCouncilWindowAt, crowned.crownCalendar.nextGreatCouncilWindowAt);
  assert.equal(both.decision, aurelle.decision);
  assert.equal('hearthNight' in crowned, false);
  for (const nationId of ['kindle', 'korund', 'meridian', 'varkand', 'veldwood', 'ilmar', 'hoarvale', 'fulmara', 'confluence']) {
    const snapshot = ['kindle', 'korund', 'hoarvale'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId };
    assert.equal(withAurelleHearthNight(snapshot, day, true), snapshot, nationId);
    assert.equal(withAurelleHearthNight(snapshot, day, false), snapshot, nationId);
    assert.equal('hearthNight' in snapshot, false, nationId);
  }
  const published = publicGovernmentSnapshot(on);
  assert.deepEqual(published.hearthNight, on.hearthNight);
  assert.equal(published.decision.proposedSpendMinor, 100);
  assert.equal('hearthNight' in publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })), false);
  assert.equal('succession' in published, false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Aurelle government read is unchanged; flag on adds hearthNight; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = block(aurelleNextHearthNightAt(seconds * 1000));
  const off = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true });
  assert.equal('hearthNight' in off, false, 'flag off');
  assert.equal('succession' in off, false);
  assert.equal('crownCalendar' in off, false);
  const on = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true, aurelleHearthNight: true });
  assert.deepEqual(on.hearthNight, expected);
  assert.equal(Number.isSafeInteger(on.hearthNight.nextAt), true);
  assert.deepEqual(on.decision, off.decision);
  assert.equal('succession' in on, false, 'names no heir');
  assert.equal('crownCalendar' in on, false);
  const together = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true, aurelleCrownCalendar: true, aurelleHearthNight: true });
  assert.deepEqual(together.hearthNight, expected);
  assert.equal('crownCalendar' in together, true);
  assert.deepEqual(together.decision, off.decision);
  for (const nationId of ['kindle', 'korund', 'meridian', 'varkand', 'veldwood', 'ilmar', 'fulmara', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, aurelleHearthNight: true });
    assert.equal(other == null || !('hearthNight' in other), true, nationId);
  }
  const kindle = await gov.readGovernment(r.db, 'kindle', seconds, 'bob', { readOnly: true, aurelleHearthNight: true });
  assert.equal('hearthNight' in kindle, false);
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run();
  const citizenOff = (await r.call('citizen', 'alice')).data.government;
  assert.equal('hearthNight' in citizenOff, false, 'flag off leaves the citizen read unchanged');
  assert.equal(citizenOff.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.hearthNight, expected);
  assert.equal('crownCalendar' in packed, false, 'hearth night does not turn on the crown calendar');
  assert.equal('succession' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal('hearthNight' in (await r.call('citizen', 'alice')).data.government, false, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_AURELLE_CROWN_CALENDAR_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const bothFlags = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(bothFlags.hearthNight, expected);
  assert.equal('crownCalendar' in bothFlags, true);
  assert.equal(bothFlags.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('hearthNight' in other), true);
});
