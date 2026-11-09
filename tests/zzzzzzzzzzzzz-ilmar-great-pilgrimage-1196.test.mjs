/** #1196: Ilmar next Great Pilgrimage on a fixed 30-real-day cycle from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED, packed in HARIMU_GRAY_PACK. #1208 follows it. Flag off: no greatPilgrimage key.
 *  Flag HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED, packed in HARIMU_GRAY_PACK. #1197 Charter Fair and #1193 world atlas reads follow it. Flag off: no greatPilgrimage key.
 *  The block holds the next date only: no pilgrim counts, routes, shrine names, or Oracle text.
 *  The zzzzzzzzzzzzz- name sorts after the other zzzzzzzzzzzzz- government-read files so Node's --test-shard
 *  round-robin does not move earlier files between Postgres shards.
 *  [ASSUMPTION] Docs §7.6 name the holiday once per game year and give no anniversary offset. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { ilmarFeastOfFirstLightSnapshot, ilmarGreatPilgrimageSnapshot, ilmarPrismContractsSnapshot, ilmarSanctumSnapshot, simulateGovernment, withIlmarFeastOfFirstLight, withIlmarGreatPilgrimage, withIlmarPrismContracts } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { ILMAR_GREAT_PILGRIMAGE_CYCLE_DAYS, ILMAR_GREAT_PILGRIMAGE_CYCLE_MS, ilmarNextGreatPilgrimageAt } from '../lib/ilmar-great-pilgrimage.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const key = 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED';
const calendarKeys = ['cycleDays', 'nextAt'];

test('the next Great Pilgrimage falls on a 30-real-day cycle from the Chair anchor, with no offset', () => {
  assert.equal(ILMAR_GREAT_PILGRIMAGE_CYCLE_DAYS, 30);
  assert.equal(ILMAR_GREAT_PILGRIMAGE_CYCLE_DAYS, realDaysPerGameYear, 'one world-clock game year');
  assert.equal(ILMAR_GREAT_PILGRIMAGE_CYCLE_MS, 30 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(ilmarNextGreatPilgrimageAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + ILMAR_GREAT_PILGRIMAGE_CYCLE_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * ILMAR_GREAT_PILGRIMAGE_CYCLE_MS;
    assert.equal(ilmarNextGreatPilgrimageAt(at), at + ILMAR_GREAT_PILGRIMAGE_CYCLE_MS);
    assert.equal(ilmarNextGreatPilgrimageAt(at + 1), at + ILMAR_GREAT_PILGRIMAGE_CYCLE_MS);
  }
});

test('an exact boundary rolls to the next cycle, and before the anchor the next date is the anchor plus one cycle', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + ILMAR_GREAT_PILGRIMAGE_CYCLE_MS;
  assert.equal(ilmarNextGreatPilgrimageAt(boundary - 1), boundary);
  assert.equal(ilmarNextGreatPilgrimageAt(boundary), boundary + ILMAR_GREAT_PILGRIMAGE_CYCLE_MS);
  assert.equal(ilmarNextGreatPilgrimageAt(boundary + ILMAR_GREAT_PILGRIMAGE_CYCLE_MS - 1), boundary + ILMAR_GREAT_PILGRIMAGE_CYCLE_MS);
  assert.equal(ilmarNextGreatPilgrimageAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
  assert.equal(ilmarNextGreatPilgrimageAt(VARKAND_CHAIR_ANCHOR_MS - ILMAR_GREAT_PILGRIMAGE_CYCLE_MS), boundary);
});

test('nextAt is always a safe integer and the helper takes only nowMs', () => {
  assert.equal(ilmarNextGreatPilgrimageAt.length, 1);
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, ILMAR_GREAT_PILGRIMAGE_CYCLE_MS, ILMAR_GREAT_PILGRIMAGE_CYCLE_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = ilmarNextGreatPilgrimageAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % ILMAR_GREAT_PILGRIMAGE_CYCLE_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no greatPilgrimage key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'ilmar' }), null);
  assert.equal(ilmarGreatPilgrimageSnapshot(ILMAR_GREAT_PILGRIMAGE_CYCLE_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'hoarvale', 'varkand', 'veldwood', 'fulmara', 'confluence', 'meridian']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : ['varkand', 'veldwood', 'fulmara', 'confluence', 'meridian'].includes(nationId)
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withIlmarGreatPilgrimage(snapshot, day, true), snapshot, nationId);
    assert.equal(withIlmarGreatPilgrimage(snapshot, day, false), snapshot, nationId);
    assert.equal('greatPilgrimage' in snapshot, false);
  }
  const ilmar = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'ilmar' };
  assert.equal(withIlmarGreatPilgrimage(ilmar, day, false), ilmar);
  assert.equal('greatPilgrimage' in ilmar, false);
  const on = withIlmarGreatPilgrimage(ilmar, day, true);
  assert.deepEqual(Object.keys(on.greatPilgrimage).sort(), calendarKeys);
  assert.equal(on.greatPilgrimage.nextAt, ILMAR_GREAT_PILGRIMAGE_CYCLE_MS);
  assert.equal(on.greatPilgrimage.cycleDays, 30);
  assert.equal(on.decision.proposedSpendMinor, ilmar.decision.proposedSpendMinor);
  assert.equal(on.decision.reason, ilmar.decision.reason);
  assert.equal('greatPilgrimage' in ilmar, false, 'the input snapshot is not mutated');
  assert.equal('sanctum' in on, false);
  assert.equal('feastOfFirstLight' in on, false);
  assert.equal('contracts' in on, false);
  const read = ilmarGreatPilgrimageSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(read.greatPilgrimage.nextAt, VARKAND_CHAIR_ANCHOR_MS + ILMAR_GREAT_PILGRIMAGE_CYCLE_MS);
  assert.equal(read.greatPilgrimage.cycleDays, 30);
  assert.deepEqual(Object.keys(read.greatPilgrimage).sort(), calendarKeys);
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.match(read.decision.reason, /names the next date/);
  assert.match(read.decision.reason, /no pilgrims/);
  assert.equal('sanctum' in read, false);
  assert.equal('feastOfFirstLight' in read, false);
  assert.equal('contracts' in read, false);
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.greatPilgrimage.nextAt, read.greatPilgrimage.nextAt);
  assert.equal(published.greatPilgrimage.cycleDays, 30);
  assert.deepEqual(Object.keys(published.greatPilgrimage).sort(), calendarKeys);
  assert.equal('greatPilgrimage' in publicGovernmentSnapshot(ilmarSanctumSnapshot(day, true)), false);
  assert.equal('greatPilgrimage' in publicGovernmentSnapshot(ilmarFeastOfFirstLightSnapshot(day, true)), false);
  assert.equal('greatPilgrimage' in publicGovernmentSnapshot(ilmarPrismContractsSnapshot(true)), false);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).greatPilgrimage, undefined);
  const sanctumOnly = ilmarSanctumSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  const feastOnly = ilmarFeastOfFirstLightSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  const prismOnly = ilmarPrismContractsSnapshot(true);
  assert.equal('greatPilgrimage' in sanctumOnly, false, 'the sanctum read is unchanged while this flag is off');
  assert.equal('greatPilgrimage' in feastOnly, false, 'the feast read is unchanged while this flag is off');
  assert.equal('greatPilgrimage' in prismOnly, false, 'the Prism contracts read is unchanged while this flag is off');
  const together = withIlmarGreatPilgrimage(withIlmarPrismContracts(withIlmarFeastOfFirstLight(sanctumOnly, VARKAND_CHAIR_ANCHOR_MS, true), true), VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(together.greatPilgrimage.nextAt, VARKAND_CHAIR_ANCHOR_MS + ILMAR_GREAT_PILGRIMAGE_CYCLE_MS);
  assert.equal(together.sanctum.nextGreatPilgrimageAt, sanctumOnly.sanctum.nextGreatPilgrimageAt);
  assert.equal(together.feastOfFirstLight.nextAt, feastOnly.feastOfFirstLight.nextAt);
  assert.deepEqual(together.contracts, prismOnly.contracts);
  assert.equal(together.decision.reason, sanctumOnly.decision.reason);
  assert.equal('greatPilgrimage' in sanctumOnly, false);
  assert.equal('greatPilgrimage' in feastOnly, false);
  assert.equal('greatPilgrimage' in prismOnly, false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-9), key);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-9), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-9), key);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-8), 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-8), 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-8), 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-7), 'HARIMU_WORLD_ATLAS_READS_ENABLED');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-6), 'HARIMU_VARKAND_ROTATION_DAY_ENABLED');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-7), 'HARIMU_WORLD_ATLAS_READS_ENABLED');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-6), 'HARIMU_VARKAND_ROTATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-7), 'HARIMU_WORLD_ATLAS_READS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-6), 'HARIMU_VARKAND_ROTATION_DAY_ENABLED');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Ilmar government read is unchanged; flag on names the next date; other nations and existing Ilmar blocks are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = ilmarNextGreatPilgrimageAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const sanctumOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarSanctum: true });
  assert.equal('greatPilgrimage' in sanctumOnly, false, 'sanctum on, Great Pilgrimage off: no greatPilgrimage key');
  assert.equal('sanctum' in sanctumOnly, true);
  const feastOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarFeastOfFirstLight: true });
  assert.equal('greatPilgrimage' in feastOnly, false, 'feast on, Great Pilgrimage off: no greatPilgrimage key');
  assert.equal('feastOfFirstLight' in feastOnly, true);
  const prismOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarPrismContracts: true });
  assert.equal('greatPilgrimage' in prismOnly, false);
  assert.equal('contracts' in prismOnly, true);
  const on = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarGreatPilgrimage: true });
  assert.equal(on.greatPilgrimage.nextAt, expected);
  assert.equal(on.greatPilgrimage.cycleDays, 30);
  assert.deepEqual(Object.keys(on.greatPilgrimage).sort(), calendarKeys);
  assert.equal('sanctum' in on, false);
  assert.equal('feastOfFirstLight' in on, false);
  assert.equal('contracts' in on, false);
  const both = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarSanctum: true, ilmarFeastOfFirstLight: true, ilmarPrismContracts: true, ilmarGreatPilgrimage: true });
  assert.equal(both.greatPilgrimage.nextAt, expected);
  assert.equal(both.sanctum.nextGreatPilgrimageAt, sanctumOnly.sanctum.nextGreatPilgrimageAt);
  assert.equal(both.feastOfFirstLight.nextAt, feastOnly.feastOfFirstLight.nextAt);
  assert.deepEqual(both.contracts, prismOnly.contracts);
  assert.equal(both.decision.reason, sanctumOnly.decision.reason);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'fulmara', 'confluence', 'meridian', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, ilmarGreatPilgrimage: true, hoarvaleAssent: nationId === 'hoarvale' });
    assert.equal(other == null || !('greatPilgrimage' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='ilmar' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.greatPilgrimage.nextAt, expected);
  assert.equal(packed.greatPilgrimage.cycleDays, 30);
  assert.equal('sanctum' in packed, false);
  assert.equal('feastOfFirstLight' in packed, false);
  assert.equal('contracts' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED: 'true', HARIMU_ILMAR_FEAST_OF_FIRST_LIGHT_ENABLED: 'true', HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.greatPilgrimage.nextAt, expected);
  assert.equal(together.sanctum.nextStilldayAt, sanctumOnly.sanctum.nextStilldayAt);
  assert.equal(together.feastOfFirstLight.cycleDays, feastOnly.feastOfFirstLight.cycleDays);
  assert.deepEqual(together.contracts, prismOnly.contracts);
  r.setFixtureEnv(key, 'false');
  const sanctumPacked = (await r.call('citizen', 'alice')).data.government;
  assert.equal('greatPilgrimage' in sanctumPacked, false, 'flag off leaves the sanctum, feast, and Prism contracts read unchanged');
  assert.equal(sanctumPacked.sanctum.nextGreatPilgrimageAt, sanctumOnly.sanctum.nextGreatPilgrimageAt);
  assert.equal(sanctumPacked.feastOfFirstLight.nextAt, feastOnly.feastOfFirstLight.nextAt);
  assert.deepEqual(sanctumPacked.contracts, prismOnly.contracts);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('greatPilgrimage' in other), true);
});
