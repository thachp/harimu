/** #1212: Ilmar next Assembly Election day (120 real days from VARKAND_CHAIR_ANCHOR_MS). Docs §9.6 / §17.
 *  Flag HARIMU_ILMAR_ASSEMBLY_ELECTION_DAY_ENABLED. Flag off: no assemblyElectionDay key. Date only.
 *  [ASSUMPTION] No anniversary offset. zzzzzzzzzzzzzzz- sorts after peer government-read files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { ilmarAssemblyElectionDaySnapshot, ilmarFeastOfFirstLightSnapshot, ilmarGreatPilgrimageSnapshot, ilmarPrismContractsSnapshot, ilmarSanctumSnapshot, simulateGovernment, withIlmarAssemblyElectionDay } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_DAYS, ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS, ilmarNextAssemblyElectionDayAt } from '../lib/ilmar-assembly-election-day.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, populationCounts: {} };
const day = 86_400_000;
const key = 'HARIMU_ILMAR_ASSEMBLY_ELECTION_DAY_ENABLED';
const calendarKeys = ['cycleDays', 'nextAt'];

test('the next Assembly Election day falls on a 120-real-day cycle from the Chair anchor, with no offset', () => {
  assert.equal(ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_DAYS, 120);
  assert.equal(ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS, 120 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(ilmarNextAssemblyElectionDayAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS;
    assert.equal(ilmarNextAssemblyElectionDayAt(at), at + ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS);
    assert.equal(ilmarNextAssemblyElectionDayAt(at + 1), at + ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS);
  }
});

test('an exact boundary rolls to the next cycle, and before the anchor the next date is the anchor plus one cycle', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS;
  assert.equal(ilmarNextAssemblyElectionDayAt(boundary - 1), boundary);
  assert.equal(ilmarNextAssemblyElectionDayAt(boundary), boundary + ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS);
  assert.equal(ilmarNextAssemblyElectionDayAt(boundary + ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS - 1), boundary + ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS);
  assert.equal(ilmarNextAssemblyElectionDayAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
  assert.equal(ilmarNextAssemblyElectionDayAt(VARKAND_CHAIR_ANCHOR_MS - ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS), boundary);
});

test('nextAt is always a safe integer and the helper takes only nowMs', () => {
  assert.equal(ilmarNextAssemblyElectionDayAt.length, 1);
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS, ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = ilmarNextAssemblyElectionDayAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no assemblyElectionDay key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'ilmar' }), null);
  assert.equal(ilmarAssemblyElectionDaySnapshot(ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'hoarvale', 'confluence', 'meridian']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : ['varkand', 'veldwood', 'fulmara', 'confluence', 'meridian'].includes(nationId)
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withIlmarAssemblyElectionDay(snapshot, day, true), snapshot, nationId);
    assert.equal(withIlmarAssemblyElectionDay(snapshot, day, false), snapshot, nationId);
    assert.equal('assemblyElectionDay' in snapshot, false);
  }
  const ilmar = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'ilmar' };
  assert.equal(withIlmarAssemblyElectionDay(ilmar, day, false), ilmar);
  assert.equal('assemblyElectionDay' in ilmar, false);
  const on = withIlmarAssemblyElectionDay(ilmar, day, true);
  assert.deepEqual(Object.keys(on.assemblyElectionDay).sort(), calendarKeys);
  assert.equal(on.assemblyElectionDay.nextAt, ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS);
  assert.equal(on.assemblyElectionDay.cycleDays, 120);
  assert.equal('assemblyElectionDay' in ilmar, false, 'the input snapshot is not mutated');
  assert.equal('sanctum' in on, false);
  assert.equal('feastOfFirstLight' in on, false);
  const read = ilmarAssemblyElectionDaySnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(read.assemblyElectionDay.nextAt, VARKAND_CHAIR_ANCHOR_MS + ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_MS);
  assert.equal(read.assemblyElectionDay.cycleDays, 120);
  assert.deepEqual(Object.keys(read.assemblyElectionDay).sort(), calendarKeys);
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.match(read.decision.reason, /names the next Assembly Election day/);
  assert.match(read.decision.reason, /no candidates/);
  assert.equal('sanctum' in read, false);
  assert.equal('feastOfFirstLight' in read, false);
  assert.equal('greatPilgrimage' in read, false);
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.assemblyElectionDay.nextAt, read.assemblyElectionDay.nextAt);
  assert.equal(published.assemblyElectionDay.cycleDays, 120);
  assert.equal('assemblyElectionDay' in publicGovernmentSnapshot(ilmarSanctumSnapshot(day, true)), false);
  assert.equal('assemblyElectionDay' in publicGovernmentSnapshot(ilmarFeastOfFirstLightSnapshot(day, true)), false);
  assert.equal('assemblyElectionDay' in publicGovernmentSnapshot(ilmarGreatPilgrimageSnapshot(day, true)), false);
  assert.equal('assemblyElectionDay' in publicGovernmentSnapshot(ilmarPrismContractsSnapshot(true)), false);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).assemblyElectionDay, undefined);
  const sanctumOnly = ilmarSanctumSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  const feastOnly = ilmarFeastOfFirstLightSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  const pilgrimageOnly = ilmarGreatPilgrimageSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  const prismOnly = ilmarPrismContractsSnapshot(true);
  assert.equal('assemblyElectionDay' in sanctumOnly, false, 'the sanctum read is unchanged while this flag is off');
  assert.equal('assemblyElectionDay' in feastOnly, false);
  assert.equal('assemblyElectionDay' in pilgrimageOnly, false);
  assert.equal('assemblyElectionDay' in prismOnly, false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-18), key);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-18), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-18), key);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-19), 'HARIMU_VARKAND_LANTERN_WATCH_ENABLED');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-19), 'HARIMU_VARKAND_LANTERN_WATCH_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-19), 'HARIMU_VARKAND_LANTERN_WATCH_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-20), 'HARIMU_HOARVALE_MOOT_OPENING_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-21), 'HARIMU_VARKAND_ROTATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-22), 'HARIMU_WORLD_ATLAS_READS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_BETTER_AUTH_ENABLED'), 81); // GRAY 82 is Better Auth; #467 land tiles is last (length is not pinned)
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Ilmar government read is unchanged; flag on names the next date; other nations and existing Ilmar blocks are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = ilmarNextAssemblyElectionDayAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const sanctumOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarSanctum: true });
  assert.equal('assemblyElectionDay' in sanctumOnly, false, 'sanctum on, election day off: no assemblyElectionDay key');
  assert.equal('sanctum' in sanctumOnly, true);
  const pilgrimageOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarGreatPilgrimage: true });
  assert.equal('assemblyElectionDay' in pilgrimageOnly, false);
  assert.equal('greatPilgrimage' in pilgrimageOnly, true);
  const on = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarAssemblyElectionDay: true });
  assert.equal(on.assemblyElectionDay.nextAt, expected);
  assert.equal(on.assemblyElectionDay.cycleDays, 120);
  assert.deepEqual(Object.keys(on.assemblyElectionDay).sort(), calendarKeys);
  assert.equal('sanctum' in on, false);
  assert.equal('feastOfFirstLight' in on, false);
  assert.equal('greatPilgrimage' in on, false);
  assert.equal('contracts' in on, false);
  const both = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarSanctum: true, ilmarGreatPilgrimage: true, ilmarAssemblyElectionDay: true });
  assert.equal(both.assemblyElectionDay.nextAt, expected);
  assert.equal(both.sanctum.nextGreatPilgrimageAt, sanctumOnly.sanctum.nextGreatPilgrimageAt);
  assert.equal(both.greatPilgrimage.nextAt, pilgrimageOnly.greatPilgrimage.nextAt);
  assert.equal(both.decision.reason, sanctumOnly.decision.reason);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'confluence', 'meridian', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, ilmarAssemblyElectionDay: true, hoarvaleAssent: nationId === 'hoarvale' });
    assert.equal(other == null || !('assemblyElectionDay' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='ilmar' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.assemblyElectionDay.nextAt, expected);
  assert.equal(packed.assemblyElectionDay.cycleDays, 120);
  assert.equal('sanctum' in packed, false);
  assert.equal('feastOfFirstLight' in packed, false);
  assert.equal('greatPilgrimage' in packed, false);
  assert.equal('contracts' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED: 'true', HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.assemblyElectionDay.nextAt, expected);
  assert.equal(together.sanctum.nextStilldayAt, sanctumOnly.sanctum.nextStilldayAt);
  assert.equal(together.greatPilgrimage.nextAt, pilgrimageOnly.greatPilgrimage.nextAt);
  r.setFixtureEnv(key, 'false');
  const sanctumPacked = (await r.call('citizen', 'alice')).data.government;
  assert.equal('assemblyElectionDay' in sanctumPacked, false, 'flag off leaves the sanctum and Great Pilgrimage read unchanged');
  assert.equal(sanctumPacked.sanctum.nextGreatPilgrimageAt, sanctumOnly.sanctum.nextGreatPilgrimageAt);
  assert.equal(sanctumPacked.greatPilgrimage.nextAt, pilgrimageOnly.greatPilgrimage.nextAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('assemblyElectionDay' in other), true);
});
