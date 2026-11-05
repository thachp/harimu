/** #1137: Ilmar next Feast of First Light, every 15 real days (twice per game year) from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_ILMAR_FEAST_OF_FIRST_LIGHT_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no feastOfFirstLight key.
 *  The zzzzzzzzz- name sorts after zzzzzzzz- so --test-shard does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { ilmarFeastOfFirstLightSnapshot, ilmarSanctumSnapshot, simulateGovernment, withIlmarFeastOfFirstLight } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_DAYS, ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS, ilmarNextFeastOfFirstLightAt } from '../lib/ilmar-feast-of-first-light.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const calendarKeys = ['cycleDays', 'nextAt'];

test('the next Feast of First Light falls every 15 real days, twice per game year, from the Chair anchor', () => {
  assert.equal(ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_DAYS, 15);
  assert.equal(ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_DAYS * 2, realDaysPerGameYear, 'twice per the existing world-clock game year');
  assert.equal(ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS, 15 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(ilmarNextFeastOfFirstLightAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS;
    assert.equal(ilmarNextFeastOfFirstLightAt(at), at + ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS);
    assert.equal(ilmarNextFeastOfFirstLightAt(at + 1), at + ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS);
  }
});

test('the boundary at exactly 15 real days moves to the following feast, and the instant before stays on this one', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS;
  assert.equal(ilmarNextFeastOfFirstLightAt(boundary - 1), boundary);
  assert.equal(ilmarNextFeastOfFirstLightAt(boundary), boundary + ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS);
  assert.equal(ilmarNextFeastOfFirstLightAt(boundary + ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS - 1), boundary + ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS);
  assert.equal(ilmarNextFeastOfFirstLightAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
});

test('nextAt is always a safe integer', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS, ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = ilmarNextFeastOfFirstLightAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no feastOfFirstLight key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'ilmar' }), null);
  assert.equal(ilmarFeastOfFirstLightSnapshot(ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'hoarvale', 'meridian']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : nationId === 'varkand' || nationId === 'meridian'
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withIlmarFeastOfFirstLight(snapshot, ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS, true), snapshot);
    assert.equal(withIlmarFeastOfFirstLight(snapshot, ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS, false), snapshot);
    assert.equal('feastOfFirstLight' in snapshot, false);
  }
  const ilmar = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'ilmar' };
  assert.equal(withIlmarFeastOfFirstLight(ilmar, day, false), ilmar);
  const on = withIlmarFeastOfFirstLight(ilmar, day, true);
  assert.deepEqual(Object.keys(on.feastOfFirstLight).sort(), calendarKeys);
  assert.equal(on.feastOfFirstLight.nextAt, ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS);
  assert.equal(on.feastOfFirstLight.cycleDays, 15);
  assert.equal('feastOfFirstLight' in ilmar, false, 'the input snapshot is not mutated');
  const read = ilmarFeastOfFirstLightSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(read.feastOfFirstLight.nextAt, VARKAND_CHAIR_ANCHOR_MS + ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_MS);
  assert.equal(read.feastOfFirstLight.cycleDays, 15);
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.equal('sanctum' in read, false);
  assert.equal(read.roles.some(role => /oracle|elder|clergy/i.test(role.name)), false);
  assert.equal(read.decision.reason.includes('chooses no Oracle'), true);
  assert.equal(read.decision.reason.includes('lists no clergy'), true);
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.feastOfFirstLight.nextAt, read.feastOfFirstLight.nextAt);
  assert.equal(published.feastOfFirstLight.cycleDays, 15);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).feastOfFirstLight, undefined);
  const sanctumOnly = ilmarSanctumSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal('feastOfFirstLight' in sanctumOnly, false, 'the sanctum read is unchanged while this flag is off');
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  const key = 'HARIMU_ILMAR_FEAST_OF_FIRST_LIGHT_ENABLED';
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Ilmar government read is unchanged; flag on names the next feast; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = ilmarNextFeastOfFirstLightAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const sanctumOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarSanctum: true });
  assert.equal('feastOfFirstLight' in sanctumOnly, false, 'sanctum on, feast off: no feastOfFirstLight key');
  assert.equal('sanctum' in sanctumOnly, true);
  const on = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarFeastOfFirstLight: true });
  assert.equal(on.feastOfFirstLight.nextAt, expected);
  assert.equal(on.feastOfFirstLight.cycleDays, 15);
  assert.equal(Number.isSafeInteger(on.feastOfFirstLight.nextAt), true);
  assert.equal(on.decision.proposedSpendMinor, 0);
  assert.equal('sanctum' in on, false, 'the feast alone does not add the sanctum calendar');
  assert.equal(on.roles.some(role => /oracle|elder|clergy/i.test(role.name)), false);
  const both = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarSanctum: true, ilmarFeastOfFirstLight: true });
  assert.equal(both.feastOfFirstLight.nextAt, expected);
  assert.equal(both.sanctum.nextGreatPilgrimageAt, sanctumOnly.sanctum.nextGreatPilgrimageAt);
  assert.equal(both.decision.proposedSpendMinor, 0);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'meridian', 'confluence', 'veldwood']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, ilmarFeastOfFirstLight: true });
    assert.equal(other == null || !('feastOfFirstLight' in other), true, nationId);
  }
  const meridian = await gov.readGovernment(r.db, 'meridian', seconds, 'bob', { readOnly: true, meridianExamDay: true, ilmarFeastOfFirstLight: true });
  assert.equal('feastOfFirstLight' in meridian, false);
  assert.equal('examDay' in meridian, true);
  await r.db.prepare("UPDATE citizens SET nation_id='ilmar' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_ILMAR_FEAST_OF_FIRST_LIGHT_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.feastOfFirstLight.nextAt, expected);
  assert.equal(packed.feastOfFirstLight.cycleDays, 15);
  assert.equal('sanctum' in packed, false);
  r.setFixtureEnv('HARIMU_ILMAR_FEAST_OF_FIRST_LIGHT_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED: 'true', HARIMU_ILMAR_FEAST_OF_FIRST_LIGHT_ENABLED: 'true' }));
  r.setFixtureEnv('HARIMU_ILMAR_FEAST_OF_FIRST_LIGHT_ENABLED', undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.feastOfFirstLight.nextAt, expected);
  assert.equal(together.sanctum.nextGreatPilgrimageAt, sanctumOnly.sanctum.nextGreatPilgrimageAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('feastOfFirstLight' in other), true);
});
