/** #1118: Aurelle reign-start display clock and the next Great Council window.
 *  The display reign is 70 game years (2100 real days), the lower bound of AURELLE_CALENDAR.mortalityGameAge,
 *  from the Varkand Chair anchor (#1087). Flag HARIMU_AURELLE_CROWN_CALENDAR_ENABLED, packed in HARIMU_GRAY_PACK.
 *  Flag off: no crownCalendar key. The zzzzzzz- name sorts after earlier nation schedule files so --test-shard
 *  does not move them. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AURELLE_REIGN_DISPLAY_DAYS, AURELLE_REIGN_DISPLAY_MS, aurelleNextGreatCouncilWindowAt, aurelleReignStartedAt } from '../lib/aurelle-crown-calendar.ts';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, withAurelleCrownCalendar } from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = AURELLE_REIGN_DISPLAY_MS;
const calendar = (reignStartedAt, nextGreatCouncilWindowAt) => ({ reignStartedAt, nextGreatCouncilWindowAt, reignDisplayDays: AURELLE_REIGN_DISPLAY_DAYS });

test('the display reign and the next Great Council window fall on a 2100-real-day cycle from the Chair anchor', () => {
  assert.equal(anchor, 0);
  assert.equal(AURELLE_REIGN_DISPLAY_DAYS, 70 * realDaysPerGameYear);
  assert.equal(AURELLE_REIGN_DISPLAY_DAYS, 2100);
  assert.equal(cycle, 2100 * day);
  assert.deepEqual([aurelleReignStartedAt(anchor), aurelleNextGreatCouncilWindowAt(anchor)], [anchor, anchor + cycle]);
  assert.deepEqual([aurelleReignStartedAt(anchor - 1), aurelleNextGreatCouncilWindowAt(anchor - 1)], [anchor, anchor + cycle]);
  assert.equal(aurelleReignStartedAt(anchor + cycle - 1), anchor);
  assert.equal(aurelleNextGreatCouncilWindowAt(anchor + cycle - 1), anchor + cycle);
  assert.equal(aurelleReignStartedAt(anchor + cycle), anchor + cycle);
  assert.equal(aurelleNextGreatCouncilWindowAt(anchor + cycle), anchor + 2 * cycle);
  assert.equal(aurelleNextGreatCouncilWindowAt(anchor + cycle + 1), anchor + 2 * cycle);
  assert.equal(aurelleReignStartedAt(anchor + 2099 * day), anchor, 'day 2099 is still the first display reign');
  assert.equal(aurelleNextGreatCouncilWindowAt(anchor + 2099 * day), anchor + cycle);
});

test('reign and Great Council timestamps are safe integers one display reign apart', () => {
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity, 1_793_000_000_000]) {
    const start = aurelleReignStartedAt(now), next = aurelleNextGreatCouncilWindowAt(now);
    assert.equal(Number.isSafeInteger(start), true, String(now));
    assert.equal(Number.isSafeInteger(next), true, String(now));
    assert.equal(next - start, cycle, String(now));
    assert.equal(start % cycle, 0, String(now));
    assert.equal(next % cycle, 0, String(now));
    assert.ok(next > anchor, String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - cycle) assert.ok(next > now && next - now <= cycle, String(now));
  }
});

test('flag off leaves the Aurelle snapshot unchanged, and other nations gain no crownCalendar key', () => {
  const aurelle = simulateGovernment({ ...baseInput, nationId: 'aurelle' });
  assert.equal(withAurelleCrownCalendar(aurelle, cycle, false), aurelle);
  assert.equal('crownCalendar' in aurelle, false);
  const on = withAurelleCrownCalendar(aurelle, cycle, true);
  assert.deepEqual(on.crownCalendar, calendar(cycle, 2 * cycle));
  assert.equal(on.decision.proposedSpendMinor, aurelle.decision.proposedSpendMinor);
  assert.equal(on.decision, aurelle.decision, 'the proposal is not rewritten');
  assert.equal('succession' in on, false);
  assert.equal('crownCalendar' in aurelle, false, 'the input is not mutated');
  assert.deepEqual(Object.keys(on.crownCalendar).sort(), ['nextGreatCouncilWindowAt', 'reignDisplayDays', 'reignStartedAt']);
  for (const nationId of ['kindle', 'korund', 'meridian', 'varkand', 'veldwood', 'ilmar', 'hoarvale', 'fulmara', 'confluence']) {
    const snapshot = ['kindle', 'korund', 'hoarvale'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId };
    assert.equal(withAurelleCrownCalendar(snapshot, day, true), snapshot, nationId);
    assert.equal(withAurelleCrownCalendar(snapshot, day, false), snapshot, nationId);
    assert.equal('crownCalendar' in snapshot, false, nationId);
  }
  const published = publicGovernmentSnapshot(on);
  assert.deepEqual(published.crownCalendar, on.crownCalendar);
  assert.equal('crownCalendar' in publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })), false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  const key = 'HARIMU_AURELLE_CROWN_CALENDAR_ENABLED';
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Aurelle government read is unchanged; flag on adds crownCalendar; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const nowMs = seconds * 1000;
  const expected = calendar(aurelleReignStartedAt(nowMs), aurelleNextGreatCouncilWindowAt(nowMs));
  const off = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true });
  assert.equal('crownCalendar' in off, false, 'flag off');
  assert.equal('succession' in off, false);
  const on = await gov.readGovernment(r.db, 'aurelle', seconds, 'alice', { readOnly: true, aurelleCrownCalendar: true });
  assert.deepEqual(on.crownCalendar, expected);
  assert.equal(Number.isSafeInteger(on.crownCalendar.reignStartedAt), true);
  assert.equal(Number.isSafeInteger(on.crownCalendar.nextGreatCouncilWindowAt), true);
  assert.deepEqual(on.decision, off.decision);
  assert.equal(on.decision.proposedSpendMinor, 0);
  for (const key of ['party', 'partyState', 'sanctum', 'grandCouncil', 'directorate', 'federalCouncil']) assert.equal(key in on, false, key);
  for (const nationId of ['kindle', 'korund', 'meridian', 'varkand', 'veldwood', 'ilmar', 'fulmara', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, aurelleCrownCalendar: true });
    assert.equal(other == null || !('crownCalendar' in other), true, nationId);
  }
  const kindle = await gov.readGovernment(r.db, 'kindle', seconds, 'bob', { readOnly: true, aurelleCrownCalendar: true });
  assert.equal('crownCalendar' in kindle, false);
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run();
  const citizenOff = (await r.call('citizen', 'alice')).data.government;
  assert.equal('crownCalendar' in citizenOff, false, 'flag off leaves the citizen read unchanged');
  assert.equal(citizenOff.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_AURELLE_CROWN_CALENDAR_ENABLED: 'true' }));
  assert.deepEqual((await r.call('citizen', 'alice')).data.government.crownCalendar, expected);
  r.setFixtureEnv('HARIMU_AURELLE_CROWN_CALENDAR_ENABLED', 'false');
  assert.equal('crownCalendar' in (await r.call('citizen', 'alice')).data.government, false, 'a direct false wins over the pack');
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('crownCalendar' in other), true);
});
