/** #1260: Ilmar next Long Light midsummer vigil on the government read.
 *  Flag HARIMU_ILMAR_LONG_LIGHT_ENABLED, GRAY 75 in HARIMU_GRAY_PACK. #1266 Vakk Harbor is 76 and #1270 Ruel Works is 77; Dunkar Pass is last (GRAY 78), so this flag is at(-4).
 *  Flag off: no longLight key, including when the Sanctum or Clearing flag is on.
 *  Date only: no vigil, vows, Piety, or clergy.
 *  The zzzzzzzzzzzzzzzzzz- name sorts after zzzzzzzzzzzzzzzzz- so --test-shard does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import {
  simulateGovernment, ilmarAssemblyElectionDaySnapshot, ilmarFeastOfFirstLightSnapshot,
  ilmarGreatPilgrimageSnapshot, ilmarLongLightSnapshot, ilmarPrismContractsSnapshot, ilmarSanctumSnapshot,
  withIlmarAssemblyElectionDay, withIlmarFeastOfFirstLight, withIlmarGreatPilgrimage, withIlmarLongLight,
  withIlmarPrismContracts, withIlmarSanctum,
} from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import {
  ILMAR_LONG_LIGHT_CYCLE_DAYS, ILMAR_LONG_LIGHT_CYCLE_MS, ILMAR_LONG_LIGHT_OFFSET_MS, ilmarNextLongLightAt,
} from '../lib/ilmar-long-light.ts';
import { VELDWOOD_RING_MOOT_OFFSET_MS } from '../lib/veldwood-ring-moot.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = ILMAR_LONG_LIGHT_CYCLE_MS;
const offset = ILMAR_LONG_LIGHT_OFFSET_MS;
const first = anchor + offset;
const key = 'HARIMU_ILMAR_LONG_LIGHT_ENABLED';
const block = nextAt => ({ nextAt, cycleDays: 30 });

test('the next Long Light falls at midsummer (11.25 days) into each 30-day game year from the Chair anchor', () => {
  assert.equal(anchor, 0);
  assert.equal(ILMAR_LONG_LIGHT_CYCLE_DAYS, 30);
  assert.equal(ILMAR_LONG_LIGHT_CYCLE_DAYS, realDaysPerGameYear, 'once per the existing world-clock game year');
  assert.equal(cycle, 30 * day);
  assert.equal(offset, 972_000_000, '11.25 real days');
  assert.equal(offset, 11.25 * day);
  assert.equal(offset, VELDWOOD_RING_MOOT_OFFSET_MS, 'same midsummer offset as Ring Moot (#1244)');
  assert.equal(ilmarNextLongLightAt.length, 1, 'nowMs is the only input');
  // Pre-anchor and before the first midsummer: first date after the anchor.
  assert.equal(ilmarNextLongLightAt(anchor - 1), first);
  assert.equal(ilmarNextLongLightAt(anchor), first);
  assert.equal(ilmarNextLongLightAt(first - 1), first);
  // Exact boundary rolls to the next year.
  assert.equal(ilmarNextLongLightAt(first), first + cycle);
  assert.equal(ilmarNextLongLightAt(first + 1), first + cycle);
  assert.equal(ilmarNextLongLightAt(first + cycle - 1), first + cycle);
  assert.equal(ilmarNextLongLightAt(first + cycle), first + 2 * cycle);
  // Year rollover mid-cycle.
  assert.equal(ilmarNextLongLightAt(anchor + 11 * day), first, 'day 11 is still before midsummer');
  assert.equal(ilmarNextLongLightAt(anchor + 12 * day), first + cycle, 'day 12 is past midsummer');
});

test('Long Light timestamps are safe integers on the midsummer offset cycle', () => {
  for (const now of [anchor, first, first - 1, first + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity, 1_793_000_000_000]) {
    const nextAt = ilmarNextLongLightAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.equal((nextAt - offset) % cycle, 0, String(now));
    assert.ok(nextAt >= first, String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - cycle) assert.ok(nextAt > now && nextAt - now <= cycle, String(now));
  }
});

test('flag off leaves the Ilmar snapshot unchanged, and other nations gain no longLight key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'ilmar' }), null);
  assert.equal(ilmarLongLightSnapshot(first, false), null);
  const ilmar = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'ilmar' };
  assert.equal(withIlmarLongLight(ilmar, first, false), ilmar);
  assert.equal('longLight' in ilmar, false);
  const on = withIlmarLongLight(ilmar, first - 1, true);
  assert.deepEqual(on.longLight, block(first));
  assert.deepEqual(Object.keys(on.longLight).sort(), ['cycleDays', 'nextAt']);
  assert.equal(on.longLight.nextAt, ilmarNextLongLightAt(first - 1), 'block uses ilmarNextLongLightAt');
  assert.equal(JSON.stringify(on.longLight).includes('vigil'), false);
  assert.equal(JSON.stringify(on.longLight).includes('vow'), false);
  assert.equal(JSON.stringify(on.longLight).includes('Piety'), false);
  assert.equal(on.decision, ilmar.decision, 'the proposal is not rewritten');
  assert.equal('longLight' in ilmar, false, 'the input is not mutated');
  assert.equal('sanctum' in on, false);
  assert.equal('feastOfFirstLight' in on, false);
  assert.equal('greatPilgrimage' in on, false);
  assert.equal('assemblyElectionDay' in on, false);
  assert.equal('contracts' in on, false);
  const sanctum = withIlmarSanctum(ilmar, first, true);
  const both = withIlmarLongLight(sanctum, first - 1, true);
  assert.deepEqual(both.longLight, block(first));
  assert.equal(both.sanctum.nextStilldayAt, sanctum.sanctum.nextStilldayAt);
  assert.equal('longLight' in sanctum, false);
  const feast = withIlmarFeastOfFirstLight(ilmar, first, true);
  const withFeast = withIlmarLongLight(feast, first - 1, true);
  assert.deepEqual(withFeast.longLight, block(first));
  assert.equal(withFeast.feastOfFirstLight.nextAt, feast.feastOfFirstLight.nextAt);
  const pilgrimage = withIlmarGreatPilgrimage(ilmar, first, true);
  const withPilgrimage = withIlmarLongLight(pilgrimage, first - 1, true);
  assert.deepEqual(withPilgrimage.longLight, block(first));
  assert.equal(withPilgrimage.greatPilgrimage.nextAt, pilgrimage.greatPilgrimage.nextAt);
  const election = withIlmarAssemblyElectionDay(ilmar, first, true);
  const withElection = withIlmarLongLight(election, first - 1, true);
  assert.deepEqual(withElection.longLight, block(first));
  assert.equal(withElection.assemblyElectionDay.nextAt, election.assemblyElectionDay.nextAt);
  const contracts = withIlmarPrismContracts(ilmar, true);
  const withContracts = withIlmarLongLight(contracts, first - 1, true);
  assert.deepEqual(withContracts.longLight, block(first));
  assert.equal(withContracts.contracts, contracts.contracts);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'varkand', 'veldwood', 'hoarvale', 'fulmara', 'confluence']) {
    const snapshot = ['kindle', 'korund', 'aurelle', 'hoarvale'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId };
    assert.equal(withIlmarLongLight(snapshot, day, true), snapshot, nationId);
    assert.equal(withIlmarLongLight(snapshot, day, false), snapshot, nationId);
    assert.equal('longLight' in snapshot, false, nationId);
  }
  const read = ilmarLongLightSnapshot(anchor, true);
  assert.deepEqual(read.longLight, block(first));
  assert.equal(read.longLight.nextAt, ilmarNextLongLightAt(anchor), 'snapshot uses ilmarNextLongLightAt');
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.equal(read.decision.reason.includes('holds no vigil'), true);
  assert.equal('sanctum' in read, false);
  assert.equal('feastOfFirstLight' in read, false);
  assert.equal('greatPilgrimage' in read, false);
  assert.equal('assemblyElectionDay' in read, false);
  assert.equal('contracts' in read, false);
  const published = publicGovernmentSnapshot(read);
  assert.deepEqual(published.longLight, read.longLight);
  assert.equal('longLight' in publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })), false);
  const sanctumOnly = ilmarSanctumSnapshot(anchor, true);
  assert.equal('longLight' in sanctumOnly, false, 'the Sanctum read is unchanged while this flag is off');
  const feastOnly = ilmarFeastOfFirstLightSnapshot(anchor, true);
  assert.equal('longLight' in feastOnly, false, 'the Feast read is unchanged while this flag is off');
  const pilgrimageOnly = ilmarGreatPilgrimageSnapshot(anchor, true);
  assert.equal('longLight' in pilgrimageOnly, false, 'the Pilgrimage read is unchanged while this flag is off');
  const electionOnly = ilmarAssemblyElectionDaySnapshot(anchor, true);
  assert.equal('longLight' in electionOnly, false, 'the Assembly Election day read is unchanged while this flag is off');
  const contractsOnly = ilmarPrismContractsSnapshot(true);
  assert.equal('longLight' in contractsOnly, false, 'the Prism contracts read is unchanged while this flag is off');
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-4), key);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-4), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-5), 'HARIMU_FULMARA_CORVEL_ISLES_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-6), 'HARIMU_AURELLE_DUNMORROW_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-7), 'HARIMU_ILMAR_CLEARING_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-8), 'HARIMU_VELDWOOD_RING_MOOT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-9), 'HARIMU_AURELLE_KITE_FESTIVAL_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-10), 'HARIMU_KINDLE_BRASSWELL_PORT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-11), 'HARIMU_VARKAND_RED_ALERT_CANCELS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 78);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Ilmar government read is unchanged; flag on adds longLight; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = block(ilmarNextLongLightAt(seconds * 1000));
  assert.equal(await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const sanctumOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarSanctum: true });
  assert.equal('longLight' in sanctumOnly, false, 'Sanctum on, Long Light off: no longLight key');
  assert.equal('sanctum' in sanctumOnly, true);
  const clearingOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarClearing: true });
  assert.equal('longLight' in clearingOnly, false, 'Clearing on, Long Light off: no longLight key');
  assert.equal('clearing' in clearingOnly, true);
  const feastOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarFeastOfFirstLight: true });
  assert.equal('longLight' in feastOnly, false, 'Feast on, Long Light off: no longLight key');
  const pilgrimageOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarGreatPilgrimage: true });
  assert.equal('longLight' in pilgrimageOnly, false, 'Pilgrimage on, Long Light off: no longLight key');
  const electionOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarAssemblyElectionDay: true });
  assert.equal('longLight' in electionOnly, false, 'Assembly Election day on, Long Light off: no longLight key');
  const contractsOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarPrismContracts: true });
  assert.equal('longLight' in contractsOnly, false, 'Prism contracts on, Long Light off: no longLight key');
  const on = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarLongLight: true });
  assert.deepEqual(on.longLight, expected);
  assert.equal(on.longLight.nextAt, ilmarNextLongLightAt(seconds * 1000), 'read uses ilmarNextLongLightAt');
  assert.equal(Number.isSafeInteger(on.longLight.nextAt), true);
  assert.deepEqual(Object.keys(on.longLight).sort(), ['cycleDays', 'nextAt']);
  assert.equal(on.decision.proposedSpendMinor, 0);
  assert.equal('sanctum' in on, false, 'Long Light alone does not add the Sanctum calendar');
  assert.equal('feastOfFirstLight' in on, false);
  assert.equal('greatPilgrimage' in on, false);
  assert.equal('assemblyElectionDay' in on, false);
  assert.equal('contracts' in on, false);
  assert.equal('clearing' in on, false, 'Long Light alone does not add the Clearing key');
  const together = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', {
    readOnly: true, ilmarSanctum: true, ilmarFeastOfFirstLight: true, ilmarGreatPilgrimage: true,
    ilmarAssemblyElectionDay: true, ilmarPrismContracts: true, ilmarClearing: true, ilmarLongLight: true,
  });
  assert.deepEqual(together.longLight, expected);
  assert.equal(together.sanctum.nextStilldayAt, sanctumOnly.sanctum.nextStilldayAt);
  assert.equal(together.feastOfFirstLight.nextAt, feastOnly.feastOfFirstLight.nextAt);
  assert.equal(together.greatPilgrimage.nextAt, pilgrimageOnly.greatPilgrimage.nextAt);
  assert.equal(together.assemblyElectionDay.nextAt, electionOnly.assemblyElectionDay.nextAt);
  assert.equal(together.clearing.nextAt, clearingOnly.clearing.nextAt);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'varkand', 'veldwood', 'fulmara', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, ilmarLongLight: true });
    assert.equal(other == null || !('longLight' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='ilmar' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.longLight, expected);
  assert.equal('sanctum' in packed, false);
  assert.equal('feastOfFirstLight' in packed, false);
  assert.equal('greatPilgrimage' in packed, false);
  assert.equal('assemblyElectionDay' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({
    HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED: 'true', HARIMU_ILMAR_FEAST_OF_FIRST_LIGHT_ENABLED: 'true',
    HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED: 'true', HARIMU_ILMAR_ASSEMBLY_ELECTION_DAY_ENABLED: 'true',
    HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED: 'true', HARIMU_ILMAR_CLEARING_ENABLED: 'true', [key]: 'true',
  }));
  r.setFixtureEnv(key, undefined);
  const bothFlags = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(bothFlags.longLight, expected);
  assert.equal('clearing' in bothFlags, true);
  assert.equal(bothFlags.sanctum.nextStilldayAt, sanctumOnly.sanctum.nextStilldayAt);
  assert.equal(bothFlags.feastOfFirstLight.nextAt, feastOnly.feastOfFirstLight.nextAt);
  assert.equal(bothFlags.greatPilgrimage.nextAt, pilgrimageOnly.greatPilgrimage.nextAt);
  assert.equal(bothFlags.assemblyElectionDay.nextAt, electionOnly.assemblyElectionDay.nextAt);
  // Sanctum + Clearing pack bits on, Long Light off: no longLight key. Clearing is wired (#1251 landed).
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({
    HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED: 'true', HARIMU_ILMAR_CLEARING_ENABLED: 'true',
  }));
  const sanctumClearingOff = (await r.call('citizen', 'alice')).data.government;
  assert.equal('longLight' in sanctumClearingOff, false, 'Sanctum/Clearing flags on, Long Light flag off: no longLight key');
  assert.equal('sanctum' in sanctumClearingOff, true);
  assert.equal('clearing' in sanctumClearingOff, true);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('longLight' in other), true);
});
