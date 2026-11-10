/** #1245: Ilmar next Clearing (Lumen Canon new year). Once per game year = realDaysPerGameYear (30 real days), offset 0.
 *  Flag HARIMU_ILMAR_CLEARING_ENABLED, at(-2) in HARIMU_GRAY_PACK (GRAY 73; #1260 Long Light is last). Flag off: no clearing key. Date only.
 *  [ASSUMPTION] "new-year" is the game-year boundary. [ASSUMPTION] Ilmar's government read only, own flag only.
 *  Accepted on #1245. Not on the world atlas nextFestival list. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { ilmarAssemblyElectionDaySnapshot, ilmarClearingSnapshot, ilmarFeastOfFirstLightSnapshot, ilmarGreatPilgrimageSnapshot, ilmarPrismContractsSnapshot, ilmarSanctumSnapshot, simulateGovernment, withIlmarClearing } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { ILMAR_CLEARING_CYCLE_DAYS, ILMAR_CLEARING_CYCLE_MS, ilmarNextClearingAt } from '../lib/ilmar-clearing.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, populationCounts: {} };
const day = 86_400_000;
const key = 'HARIMU_ILMAR_CLEARING_ENABLED';
const calendarKeys = ['cycleDays', 'nextAt'];
const block = nextAt => ({ nextAt, cycleDays: 30 });

test('the next Clearing falls once per game year from the Chair anchor, with offset 0', () => {
  const source = readFileSync('lib/ilmar-clearing.ts', 'utf8');
  assert.match(source, /Clearing \(new-year renewal of vows\)/);
  assert.match(source, /1 real month \(30 days\) = 1 game year/);
  assert.match(source, /Theocracy – the Lumen Canon is the state faith, with public duties \(Vigil, Stilldays\)/);
  assert.doesNotMatch(source, /from ['"][^'"]*db/);
  assert.equal(ILMAR_CLEARING_CYCLE_DAYS, 30);
  assert.equal(ILMAR_CLEARING_CYCLE_DAYS, realDaysPerGameYear, 'once per the existing world-clock game year');
  assert.equal(ILMAR_CLEARING_CYCLE_MS, 30 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(ilmarNextClearingAt.length, 1);
  assert.equal(ilmarNextClearingAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + ILMAR_CLEARING_CYCLE_MS);
  assert.equal(ilmarNextClearingAt(VARKAND_CHAIR_ANCHOR_MS - 1), VARKAND_CHAIR_ANCHOR_MS + ILMAR_CLEARING_CYCLE_MS);
  assert.equal(ilmarNextClearingAt(VARKAND_CHAIR_ANCHOR_MS - ILMAR_CLEARING_CYCLE_MS), VARKAND_CHAIR_ANCHOR_MS + ILMAR_CLEARING_CYCLE_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * ILMAR_CLEARING_CYCLE_MS;
    assert.equal(ilmarNextClearingAt(at), at + ILMAR_CLEARING_CYCLE_MS, 'an exact boundary rolls to the next year');
    assert.equal(ilmarNextClearingAt(at + 1), at + ILMAR_CLEARING_CYCLE_MS);
    assert.equal(ilmarNextClearingAt(at + ILMAR_CLEARING_CYCLE_MS - 1), at + ILMAR_CLEARING_CYCLE_MS);
  }
  assert.equal(ilmarNextClearingAt(29 * day), ILMAR_CLEARING_CYCLE_MS, 'day 29 is still this game year');
});

test('nextAt is always a safe integer and the helper takes only nowMs', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, ILMAR_CLEARING_CYCLE_MS, ILMAR_CLEARING_CYCLE_MS - 1, ILMAR_CLEARING_CYCLE_MS + 0.5, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = ilmarNextClearingAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS, String(now));
    assert.equal(nextAt % ILMAR_CLEARING_CYCLE_MS, 0, String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - ILMAR_CLEARING_CYCLE_MS) assert.ok(nextAt > now && nextAt - now <= ILMAR_CLEARING_CYCLE_MS, String(now));
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no clearing key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'ilmar' }), null);
  assert.equal(ilmarClearingSnapshot(ILMAR_CLEARING_CYCLE_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'hoarvale', 'confluence', 'meridian']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : ['varkand', 'veldwood', 'fulmara', 'confluence', 'meridian'].includes(nationId)
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withIlmarClearing(snapshot, day, true), snapshot, nationId);
    assert.equal(withIlmarClearing(snapshot, day, false), snapshot, nationId);
    assert.equal('clearing' in snapshot, false);
  }
  const ilmar = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'ilmar' };
  assert.equal(withIlmarClearing(ilmar, day, false), ilmar);
  assert.equal('clearing' in ilmar, false);
  const on = withIlmarClearing(ilmar, day, true);
  assert.deepEqual(on.clearing, block(ILMAR_CLEARING_CYCLE_MS));
  assert.deepEqual(Object.keys(on.clearing).sort(), calendarKeys);
  assert.equal(JSON.stringify(on.clearing).includes('vow') || JSON.stringify(on.clearing).includes('iety') || JSON.stringify(on.clearing).includes('clergy'), false);
  assert.equal('clearing' in ilmar, false, 'the input snapshot is not mutated');
  assert.equal('sanctum' in on, false);
  assert.equal('feastOfFirstLight' in on, false);
  assert.equal('greatPilgrimage' in on, false);
  assert.equal('assemblyElectionDay' in on, false);
  const read = ilmarClearingSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.deepEqual(read.clearing, block(VARKAND_CHAIR_ANCHOR_MS + ILMAR_CLEARING_CYCLE_MS));
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.match(read.decision.reason, /new-year renewal of vows/);
  assert.match(read.decision.reason, /records no vows/);
  assert.match(read.decision.reason, /no Piety/);
  assert.match(read.decision.reason, /no clergy/);
  assert.equal('sanctum' in read, false);
  assert.equal('feastOfFirstLight' in read, false);
  assert.equal('greatPilgrimage' in read, false);
  assert.equal('assemblyElectionDay' in read, false);
  assert.equal('contracts' in read, false);
  const published = publicGovernmentSnapshot(read);
  assert.deepEqual(published.clearing, read.clearing);
  assert.deepEqual(Object.keys(published.clearing).sort(), calendarKeys);
  assert.equal('clearing' in publicGovernmentSnapshot(ilmarSanctumSnapshot(day, true)), false, 'sanctum on, Clearing off');
  assert.equal('clearing' in publicGovernmentSnapshot(ilmarFeastOfFirstLightSnapshot(day, true)), false);
  assert.equal('clearing' in publicGovernmentSnapshot(ilmarGreatPilgrimageSnapshot(day, true)), false);
  assert.equal('clearing' in publicGovernmentSnapshot(ilmarAssemblyElectionDaySnapshot(day, true)), false);
  assert.equal('clearing' in publicGovernmentSnapshot(ilmarPrismContractsSnapshot(true)), false);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).clearing, undefined);
  const sanctumOnly = ilmarSanctumSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal('clearing' in sanctumOnly, false, 'the sanctum read is unchanged while this flag is off');
  assert.equal(withIlmarClearing(sanctumOnly, day, true).sanctum.nextStilldayAt, sanctumOnly.sanctum.nextStilldayAt);
  assert.deepEqual(withIlmarClearing(sanctumOnly, day, true).clearing, block(ILMAR_CLEARING_CYCLE_MS));
});

test('the flag is preview true and production false, at(-2) in HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-2), key);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-2), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), key);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-7), 'HARIMU_HOARVALE_ELECTION_NIGHT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-7), 'HARIMU_HOARVALE_ELECTION_NIGHT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 73);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/ilmar-clearing\.ts/);
  assert.doesNotMatch(readFileSync('lib/world-atlas-reads.ts', 'utf8'), /ilmarNextClearingAt|HARIMU_ILMAR_CLEARING_ENABLED/);
});

test('flag off: the Ilmar government read is unchanged; flag on names the next date; Sanctum on with Clearing off adds no key', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = ilmarNextClearingAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const sanctumOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarSanctum: true });
  assert.equal('clearing' in sanctumOnly, false, 'sanctum on, Clearing off: no clearing key');
  assert.equal('sanctum' in sanctumOnly, true);
  const pilgrimageOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarGreatPilgrimage: true });
  assert.equal('clearing' in pilgrimageOnly, false);
  const electionOnly = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarAssemblyElectionDay: true });
  assert.equal('clearing' in electionOnly, false);
  const on = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarClearing: true });
  assert.deepEqual(on.clearing, block(expected));
  assert.equal('sanctum' in on, false);
  assert.equal('feastOfFirstLight' in on, false);
  assert.equal('greatPilgrimage' in on, false);
  assert.equal('assemblyElectionDay' in on, false);
  assert.equal('contracts' in on, false);
  const both = await gov.readGovernment(r.db, 'ilmar', seconds, 'alice', { readOnly: true, ilmarSanctum: true, ilmarClearing: true });
  assert.deepEqual(both.clearing, block(expected));
  assert.equal(both.sanctum.nextStilldayAt, sanctumOnly.sanctum.nextStilldayAt);
  assert.equal(both.decision.reason, sanctumOnly.decision.reason);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'confluence', 'meridian', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, ilmarClearing: true, hoarvaleAssent: nationId === 'hoarvale' });
    assert.equal(other == null || !('clearing' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='ilmar' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.clearing, block(expected));
  assert.equal('sanctum' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(together.clearing, block(expected));
  assert.equal(together.sanctum.nextStilldayAt, sanctumOnly.sanctum.nextStilldayAt);
  r.setFixtureEnv(key, 'false');
  const sanctumPacked = (await r.call('citizen', 'alice')).data.government;
  assert.equal('clearing' in sanctumPacked, false, 'Sanctum flag on, Clearing flag off');
  assert.equal(sanctumPacked.sanctum.nextGreatPilgrimageAt, sanctumOnly.sanctum.nextGreatPilgrimageAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('clearing' in other), true);
});
