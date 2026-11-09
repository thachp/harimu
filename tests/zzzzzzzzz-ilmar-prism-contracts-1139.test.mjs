/** #1139: Ilmar Prism contracts on the government read (title and a whole-number profit share).
 *  Flag HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no contracts key. #1147 follows it; #1189 is last.
 *  The zzzzzzzzz- name sorts after zzzzzzzz- so Node's --test-shard round-robin does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { ilmarPrismContractsSnapshot, ilmarSanctumSnapshot, simulateGovernment, withIlmarPrismContracts } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { ilmarPrismContracts, ilmarSharePercent } from '../lib/ilmar-prism-contracts.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const contractKeys = ['sharePercent', 'title'];
const posted = [
  { title: 'Lightshare: Mirrorhall counting-house', sharePercent: 40 },
  { title: 'Lightshare: Glassen Sunglass kiln', sharePercent: 25 },
  { title: 'Endowment lease: Lume Mesa pilgrim stair', sharePercent: 15 },
  { title: 'Endowment lease: Glassen Great Kiln', sharePercent: 10 },
];

test('the posted register is four contracts with titles and whole-number profit shares from 0 to 100', () => {
  const rows = ilmarPrismContracts();
  assert.deepEqual(rows, posted);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), contractKeys);
    assert.equal(typeof row.title, 'string');
    assert.ok(row.title.trim().length > 0);
    assert.equal(ilmarSharePercent(row.sharePercent), row.sharePercent);
    assert.equal(Number.isInteger(row.sharePercent) && row.sharePercent >= 0 && row.sharePercent <= 100, true);
  }
  rows[0].sharePercent = 0;
  rows[0].title = 'changed';
  assert.equal(ilmarPrismContracts()[0].sharePercent, 40, 'a caller cannot change the posted register');
  assert.equal(ilmarPrismContracts()[0].title, posted[0].title);
  assert.equal(ilmarSharePercent(0), 0);
  assert.equal(ilmarSharePercent(100), 100);
  for (const value of [-1, 101, 12.5, NaN, Infinity]) assert.equal(ilmarSharePercent(value), null, String(value));
});

test('flag off leaves the snapshot unchanged, and other nations gain no contracts key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'ilmar' }), null);
  assert.equal(ilmarPrismContractsSnapshot(false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'fulmara', 'hoarvale']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : nationId === 'varkand' || nationId === 'fulmara'
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withIlmarPrismContracts(snapshot, true), snapshot);
    assert.equal(withIlmarPrismContracts(snapshot, false), snapshot);
    assert.equal('contracts' in snapshot, false);
  }
  const ilmar = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'ilmar' };
  assert.equal(withIlmarPrismContracts(ilmar, false), ilmar);
  assert.equal('contracts' in ilmar, false);
  const on = withIlmarPrismContracts(ilmar, true);
  assert.deepEqual(on.contracts, posted);
  assert.equal('contracts' in ilmar, false, 'the input snapshot is not mutated');
  assert.equal('sanctum' in on, false);
  const read = ilmarPrismContractsSnapshot(true);
  assert.deepEqual(read.contracts, posted);
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.equal(read.decision.title, 'Prism contracts');
  assert.equal(read.decision.reason.includes('opens no partnership'), true);
  assert.equal('sanctum' in read, false);
  const published = publicGovernmentSnapshot(read);
  assert.deepEqual(published.contracts, posted);
  assert.deepEqual(Object.keys(published.contracts[0]).sort(), contractKeys);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).contracts, undefined);
  const sanctumOnly = ilmarSanctumSnapshot(0, true);
  assert.equal('contracts' in sanctumOnly, false, 'the sanctum read is unchanged while this flag is off');
  assert.equal(sanctumOnly.sanctum.oracleTerm, 'life');
  const both = withIlmarPrismContracts(sanctumOnly, true);
  assert.deepEqual(both.contracts, posted);
  assert.equal(both.sanctum.councilOfEldersSeats, 12);
  assert.equal('contracts' in sanctumOnly, false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED, undefined, 'not its own text binding');
  assert.equal(prod.vars.HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED, 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-21), 'HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED', '#1147, #1159, #1150, #1160, #1164, #1165, #1169, #1170, #1175, #1178, #1179, #1184, #1183, #1187, #1189, #1191, #1196, #1197, and #1193 follow this flag');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-21), 'HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-21), 'HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, 'HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED'), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED'), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED: 'false' }, 'HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED'), false, 'a direct string wins');
});

test('flag off: the Ilmar government read is unchanged; flag on posts the contracts; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  assert.equal(await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const sanctumOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarSanctum: true });
  assert.equal('contracts' in sanctumOnly, false, 'sanctum on, contracts off: no contracts key');
  assert.equal(sanctumOnly.sanctum.oracleTerm, 'life');
  const on = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarPrismContracts: true });
  assert.deepEqual(on.contracts, posted);
  assert.equal('sanctum' in on, false, 'contracts alone do not add the sanctum calendar');
  assert.equal(on.decision.proposedSpendMinor, 0);
  const both = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarSanctum: true, ilmarPrismContracts: true });
  assert.deepEqual(both.contracts, posted);
  assert.equal(both.sanctum.nextStilldayAt, sanctumOnly.sanctum.nextStilldayAt);
  assert.equal(both.sanctum.nextGreatPilgrimageAt, sanctumOnly.sanctum.nextGreatPilgrimageAt);
  assert.equal(both.sanctum.isStillday, sanctumOnly.sanctum.isStillday);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'fulmara', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, ilmarPrismContracts: true });
    assert.equal(other == null || !('contracts' in other), true, nationId);
  }
  const fulmara = await gov.readGovernment(r.db, 'fulmara', seconds, 'bob', { readOnly: true, fulmaraCouncil: true, fulmaraResolutions: true, ilmarPrismContracts: true });
  assert.equal('contracts' in fulmara, false);
  assert.equal('resolutions' in fulmara, true);
  await r.db.prepare("UPDATE citizens SET nation_id='ilmar' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.contracts, posted);
  assert.equal('sanctum' in packed, false);
  r.setFixtureEnv('HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED: 'true', HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED: 'true' }));
  r.setFixtureEnv('HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED', undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(together.contracts, posted);
  assert.equal(together.sanctum.councilOfEldersSeats, 12);
  r.setFixtureEnv('HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED', 'false');
  const sanctumPacked = (await r.call('citizen', 'alice')).data.government;
  assert.equal('contracts' in sanctumPacked, false, 'flag off leaves the sanctum read unchanged');
  assert.equal(sanctumPacked.sanctum.oracleTerm, 'life');
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('contracts' in other), true);
});
