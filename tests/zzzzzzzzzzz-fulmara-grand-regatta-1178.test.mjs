/** #1178: Fulmara next Grand Regatta once per game year (30 real days) from the Chair anchor (#1085).
 *  Flag HARIMU_FULMARA_GRAND_REGATTA_ENABLED in HARIMU_GRAY_PACK. Flag off: no grandRegatta key.
 *  Holds no race, prize, or bonus. Host city Corvel Isles may be named.
 *  The zzzzzzzzzzz- name sorts after zzzzzzzzzz-fulmara-exchange-bell-1150 so Node's --test-shard
 *  round-robin does not move earlier files between Postgres shards.
 *  [ASSUMPTION] cadence = 30 real days; zero anniversary offset (Architect pre-accepted). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import {
  FULMARA_GRAND_REGATTA_HOST_CITY,
  FULMARA_GRAND_REGATTA_INTERVAL_DAYS,
  FULMARA_GRAND_REGATTA_MS,
  fulmaraNextGrandRegattaAt,
} from '../lib/fulmara-grand-regatta.ts';
import {
  fulmaraExchangeBellSnapshot,
  fulmaraGovernmentSnapshot,
  fulmaraGrandRegattaSnapshot,
  fulmaraResolutionsSnapshot,
  simulateGovernment,
  withFulmaraExchangeBell,
  withFulmaraGrandRegatta,
  withFulmaraResolutions,
} from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const F = 'HARIMU_FULMARA_GRAND_REGATTA_ENABLED';
const cycle = 30 * day;
const expected = { nextAt: cycle, intervalDays: 30, hostCity: 'Corvel Isles', holdsRegatta: false };
const calendarKeys = ['holdsRegatta', 'hostCity', 'intervalDays', 'nextAt'];

test('Grand Regatta is once per game year (30 real days) on the Chair anchor', () => {
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(FULMARA_GRAND_REGATTA_INTERVAL_DAYS, 30);
  assert.equal(FULMARA_GRAND_REGATTA_INTERVAL_DAYS, realDaysPerGameYear);
  assert.equal(FULMARA_GRAND_REGATTA_MS, cycle);
  assert.equal(FULMARA_GRAND_REGATTA_HOST_CITY, 'Corvel Isles');
  assert.equal(fulmaraNextGrandRegattaAt(VARKAND_CHAIR_ANCHOR_MS), cycle);
  assert.equal(fulmaraNextGrandRegattaAt(cycle - 1), cycle);
  assert.equal(fulmaraNextGrandRegattaAt(cycle), 2 * cycle);
  assert.equal(fulmaraNextGrandRegattaAt(cycle + 1), 2 * cycle);
  assert.equal(fulmaraNextGrandRegattaAt(-1), cycle);
  for (const now of [0, cycle * 3 + 7, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0.9, NaN, Infinity, -Infinity]) {
    const next = fulmaraNextGrandRegattaAt(now);
    assert.equal(Number.isSafeInteger(next), true, String(now));
    assert.equal(next % cycle, 0, String(now));
    assert.ok(next > VARKAND_CHAIR_ANCHOR_MS, String(now));
  }
});

test('flag off leaves the snapshot unchanged; other nations gain no grandRegatta key', () => {
  assert.equal(fulmaraGrandRegattaSnapshot(cycle, false), null);
  assert.equal(fulmaraGrandRegattaSnapshot(FULMARA_GRAND_REGATTA_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'hoarvale', 'confluence', 'ilmar']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : ['varkand', 'confluence', 'ilmar'].includes(nationId)
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withFulmaraGrandRegatta(snapshot, cycle, true), snapshot, nationId);
    assert.equal('grandRegatta' in snapshot, false);
  }
  const fulmara = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'fulmara' };
  assert.equal(withFulmaraGrandRegatta(fulmara, day, false), fulmara);
  const on = withFulmaraGrandRegatta(fulmara, day, true);
  assert.deepEqual(on.grandRegatta, expected);
  assert.deepEqual(Object.keys(on.grandRegatta).sort(), calendarKeys);
  assert.equal('grandRegatta' in fulmara, false, 'input not mutated');
  assert.deepEqual({ ...on, grandRegatta: undefined }, { ...fulmara, grandRegatta: undefined }, 'holds no race');
  assert.deepEqual(publicGovernmentSnapshot(on).grandRegatta, on.grandRegatta);
  assert.equal('grandRegatta' in publicGovernmentSnapshot(fulmara), false);
  const read = fulmaraGrandRegattaSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.deepEqual(read.grandRegatta, { nextAt: cycle, intervalDays: 30, hostCity: 'Corvel Isles', holdsRegatta: false });
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.equal(read.decision.reason.includes('holds no race'), true);
  assert.equal('grandCouncil' in read, false);
  assert.equal('resolutions' in read, false);
  assert.equal('exchangeBell' in read, false);
  const councilOnly = fulmaraGovernmentSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal('grandRegatta' in councilOnly, false, 'the Council read is unchanged while this flag is off');
  const resolutionsOnly = fulmaraResolutionsSnapshot(true);
  assert.equal('grandRegatta' in resolutionsOnly, false);
  const bellOnly = fulmaraExchangeBellSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal('grandRegatta' in bellOnly, false);
  const together = withFulmaraGrandRegatta(withFulmaraExchangeBell(withFulmaraResolutions(councilOnly, true), VARKAND_CHAIR_ANCHOR_MS, true), VARKAND_CHAIR_ANCHOR_MS, true);
  assert.deepEqual(together.grandRegatta, { nextAt: cycle, intervalDays: 30, hostCity: 'Corvel Isles', holdsRegatta: false });
  assert.equal(together.exchangeBell.nextAt, cycle);
  assert.equal(together.grandCouncil.tribuneVetoesPerSession, 1);
  assert.deepEqual(together.resolutions, resolutionsOnly.resolutions);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[F], undefined, 'not its own text binding');
  assert.equal(prod.vars[F], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[F], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[F], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-4), F, '#1179, #1184, and #1183 follow this flag');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-4), F);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), F);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), 'HARIMU_CONFLUENCE_CONGRESS_LANTERNS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 56);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, F), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, F), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [F]: 'false' }, F), false);
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/fulmara-grand-regatta\.ts/);
});

test('government read: flag off unchanged, flag on adds grandRegatta, other nations unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const next = fulmaraNextGrandRegattaAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const councilOnly = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraCouncil: true });
  assert.equal('grandRegatta' in councilOnly, false, 'council on, Grand Regatta off: no grandRegatta key');
  assert.equal('grandCouncil' in councilOnly, true);
  const on = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraGrandRegatta: true });
  assert.deepEqual(on.grandRegatta, { nextAt: next, intervalDays: 30, hostCity: 'Corvel Isles', holdsRegatta: false });
  assert.equal('grandCouncil' in on, false, 'Grand Regatta alone does not add the Council');
  assert.equal('resolutions' in on, false);
  assert.equal('exchangeBell' in on, false);
  assert.equal(on.decision.proposedSpendMinor, 0);
  const both = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', {
    readOnly: true, fulmaraCouncil: true, fulmaraResolutions: true, fulmaraExchangeBell: true, fulmaraGrandRegatta: true,
  });
  assert.deepEqual(both.grandRegatta, { nextAt: next, intervalDays: 30, hostCity: 'Corvel Isles', holdsRegatta: false });
  assert.equal(both.grandCouncil.councilOfTenNextElectionAt, councilOnly.grandCouncil.councilOfTenNextElectionAt);
  assert.equal('exchangeBell' in both, true);
  assert.equal('resolutions' in both, true);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'ilmar', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, fulmaraGrandRegatta: true });
    assert.equal(other == null || !('grandRegatta' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='fulmara' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [F]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.grandRegatta, { nextAt: next, intervalDays: 30, hostCity: 'Corvel Isles', holdsRegatta: false });
  assert.equal('grandCouncil' in packed, false);
  r.setFixtureEnv(F, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({
    HARIMU_FULMARA_COUNCIL_ENABLED: 'true', HARIMU_FULMARA_RESOLUTIONS_ENABLED: 'true',
    HARIMU_FULMARA_EXCHANGE_BELL_ENABLED: 'true', [F]: 'true',
  }));
  r.setFixtureEnv(F, undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(together.grandRegatta, { nextAt: next, intervalDays: 30, hostCity: 'Corvel Isles', holdsRegatta: false });
  assert.equal(together.grandCouncil.tribuneVetoesPerSession, councilOnly.grandCouncil.tribuneVetoesPerSession);
  r.setFixtureEnv(F, 'false');
  const councilPacked = (await r.call('citizen', 'alice')).data.government;
  assert.equal('grandRegatta' in councilPacked, false, 'flag off leaves the Council/resolutions/bell read unchanged');
  assert.equal(councilPacked.grandCouncil.councilOfTenTermDays, 30);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('grandRegatta' in other), true);
});
