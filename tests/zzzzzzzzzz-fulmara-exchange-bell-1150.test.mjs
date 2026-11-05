/** #1150: Fulmara next Exchange Bell on a fixed 30-real-day cycle from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_FULMARA_EXCHANGE_BELL_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no exchangeBell key. #1160, #1164, #1165, and #1169 follow it.
 *  The zzzzzzzzzz- name sorts after zzzzzzzzz-ilmar-prism-contracts-1139 so Node's --test-shard
 *  round-robin does not move earlier files between Postgres shards.
 *  [ASSUMPTION] Docs §7.10 name the holiday and give no interval. Cadence is one game year (30 real days). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { FULMARA_EXCHANGE_BELL_CYCLE_DAYS, FULMARA_EXCHANGE_BELL_MS, fulmaraNextExchangeBellAt } from '../lib/fulmara-exchange-bell.ts';
import { fulmaraExchangeBellSnapshot, fulmaraGovernmentSnapshot, fulmaraResolutionsSnapshot, simulateGovernment, withFulmaraExchangeBell, withFulmaraResolutions } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const calendarKeys = ['cycleDays', 'nextAt'];

test('the next Exchange Bell falls on a 30-real-day cycle from the Chair anchor', () => {
  assert.equal(FULMARA_EXCHANGE_BELL_CYCLE_DAYS, 30);
  assert.equal(FULMARA_EXCHANGE_BELL_CYCLE_DAYS, realDaysPerGameYear, 'one world-clock game year');
  assert.equal(FULMARA_EXCHANGE_BELL_MS, 30 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(fulmaraNextExchangeBellAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + FULMARA_EXCHANGE_BELL_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * FULMARA_EXCHANGE_BELL_MS;
    assert.equal(fulmaraNextExchangeBellAt(at), at + FULMARA_EXCHANGE_BELL_MS);
    assert.equal(fulmaraNextExchangeBellAt(at + 1), at + FULMARA_EXCHANGE_BELL_MS);
  }
});

test('the boundary at exactly 30 real days moves to the following cycle, and the instant before stays on this one', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + FULMARA_EXCHANGE_BELL_MS;
  assert.equal(fulmaraNextExchangeBellAt(boundary - 1), boundary);
  assert.equal(fulmaraNextExchangeBellAt(boundary), boundary + FULMARA_EXCHANGE_BELL_MS);
  assert.equal(fulmaraNextExchangeBellAt(boundary + FULMARA_EXCHANGE_BELL_MS - 1), boundary + FULMARA_EXCHANGE_BELL_MS);
  assert.equal(fulmaraNextExchangeBellAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
});

test('nextAt is always a safe integer', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, FULMARA_EXCHANGE_BELL_MS, FULMARA_EXCHANGE_BELL_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = fulmaraNextExchangeBellAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % FULMARA_EXCHANGE_BELL_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no exchangeBell key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'fulmara' }), null);
  assert.equal(fulmaraExchangeBellSnapshot(FULMARA_EXCHANGE_BELL_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'hoarvale']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : nationId === 'varkand'
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withFulmaraExchangeBell(snapshot, FULMARA_EXCHANGE_BELL_MS, true), snapshot);
    assert.equal(withFulmaraExchangeBell(snapshot, FULMARA_EXCHANGE_BELL_MS, false), snapshot);
    assert.equal('exchangeBell' in snapshot, false);
  }
  const fulmara = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'fulmara' };
  assert.equal(withFulmaraExchangeBell(fulmara, day, false), fulmara);
  assert.equal('exchangeBell' in fulmara, false);
  const on = withFulmaraExchangeBell(fulmara, day, true);
  assert.deepEqual(Object.keys(on.exchangeBell).sort(), calendarKeys);
  assert.equal(on.exchangeBell.nextAt, FULMARA_EXCHANGE_BELL_MS);
  assert.equal(on.exchangeBell.cycleDays, 30);
  assert.equal(Number.isSafeInteger(on.exchangeBell.nextAt), true);
  assert.equal('exchangeBell' in fulmara, false, 'the input snapshot is not mutated');
  assert.equal('grandCouncil' in on, false);
  assert.equal('resolutions' in on, false);
  const read = fulmaraExchangeBellSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.deepEqual(Object.keys(read.exchangeBell).sort(), calendarKeys);
  assert.equal(read.exchangeBell.nextAt, VARKAND_CHAIR_ANCHOR_MS + FULMARA_EXCHANGE_BELL_MS);
  assert.equal(read.exchangeBell.cycleDays, 30);
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.equal(read.decision.reason.includes('opens no trading session'), true);
  assert.equal('grandCouncil' in read, false);
  assert.equal('resolutions' in read, false);
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.exchangeBell.nextAt, read.exchangeBell.nextAt);
  assert.equal(published.exchangeBell.cycleDays, 30);
  assert.deepEqual(Object.keys(published.exchangeBell).sort(), calendarKeys);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).exchangeBell, undefined);
  const councilOnly = fulmaraGovernmentSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal('exchangeBell' in councilOnly, false, 'the Council read is unchanged while this flag is off');
  assert.equal('grandCouncil' in councilOnly, true);
  const resolutionsOnly = fulmaraResolutionsSnapshot(true);
  assert.equal('exchangeBell' in resolutionsOnly, false, 'the resolutions read is unchanged while this flag is off');
  assert.equal('resolutions' in resolutionsOnly, true);
  const together = withFulmaraExchangeBell(withFulmaraResolutions(councilOnly, true), VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(together.exchangeBell.nextAt, VARKAND_CHAIR_ANCHOR_MS + FULMARA_EXCHANGE_BELL_MS);
  assert.equal(together.grandCouncil.councilOfTenNextElectionAt, councilOnly.grandCouncil.councilOfTenNextElectionAt);
  assert.equal(together.grandCouncil.tribuneVetoesPerSession, 1);
  assert.deepEqual(together.resolutions, resolutionsOnly.resolutions);
  assert.equal(together.decision.reason, councilOnly.decision.reason);
  assert.equal('exchangeBell' in councilOnly, false);
  assert.equal('exchangeBell' in resolutionsOnly, false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_FULMARA_EXCHANGE_BELL_ENABLED, undefined, 'not its own text binding');
  assert.equal(prod.vars.HARIMU_FULMARA_EXCHANGE_BELL_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_FULMARA_EXCHANGE_BELL_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_FULMARA_EXCHANGE_BELL_ENABLED, 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-5), 'HARIMU_FULMARA_EXCHANGE_BELL_ENABLED', '#1160, #1164, #1165, and #1169 follow this flag');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-5), 'HARIMU_FULMARA_EXCHANGE_BELL_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-5), 'HARIMU_FULMARA_EXCHANGE_BELL_ENABLED');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, 'HARIMU_FULMARA_EXCHANGE_BELL_ENABLED'), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_FULMARA_EXCHANGE_BELL_ENABLED'), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_FULMARA_EXCHANGE_BELL_ENABLED: 'false' }, 'HARIMU_FULMARA_EXCHANGE_BELL_ENABLED'), false, 'a direct string wins');
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/fulmara-exchange-bell\.ts/);
});

test('flag off: the Fulmara government read is unchanged; flag on names the next Exchange Bell; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = fulmaraNextExchangeBellAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const councilOnly = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraCouncil: true });
  assert.equal('exchangeBell' in councilOnly, false, 'council on, Exchange Bell off: no exchangeBell key');
  assert.equal('grandCouncil' in councilOnly, true);
  const resolutionsOnly = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraResolutions: true });
  assert.equal('exchangeBell' in resolutionsOnly, false, 'resolutions on, Exchange Bell off: no exchangeBell key');
  assert.equal('resolutions' in resolutionsOnly, true);
  assert.equal('grandCouncil' in resolutionsOnly, false);
  const on = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraExchangeBell: true });
  assert.equal(on.exchangeBell.nextAt, expected);
  assert.equal(on.exchangeBell.cycleDays, 30);
  assert.equal(Number.isSafeInteger(on.exchangeBell.nextAt), true);
  assert.deepEqual(Object.keys(on.exchangeBell).sort(), calendarKeys);
  assert.equal('grandCouncil' in on, false, 'Exchange Bell alone does not add the Council');
  assert.equal('resolutions' in on, false, 'Exchange Bell alone does not add resolutions');
  assert.equal(on.decision.proposedSpendMinor, 0);
  const both = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraCouncil: true, fulmaraResolutions: true, fulmaraExchangeBell: true });
  assert.equal(both.exchangeBell.nextAt, expected);
  assert.equal(both.exchangeBell.cycleDays, 30);
  assert.equal(both.grandCouncil.councilOfTenNextElectionAt, councilOnly.grandCouncil.councilOfTenNextElectionAt);
  assert.equal(both.grandCouncil.lodestarNextElectionAt, councilOnly.grandCouncil.lodestarNextElectionAt);
  assert.equal(both.grandCouncil.tribuneSessionEndsAt, councilOnly.grandCouncil.tribuneSessionEndsAt);
  assert.deepEqual(both.resolutions, resolutionsOnly.resolutions);
  assert.equal(both.decision.reason, councilOnly.decision.reason);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'ilmar', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, fulmaraExchangeBell: true });
    assert.equal(other == null || !('exchangeBell' in other), true, nationId);
  }
  const varkand = await gov.readGovernment(r.db, 'varkand', seconds, 'bob', { readOnly: true, varkandDirectorate: true, varkandPlebiscite: true, fulmaraExchangeBell: true });
  assert.equal('exchangeBell' in varkand, false);
  assert.equal('directorate' in varkand, true);
  assert.equal('mandatePlebiscite' in varkand, true);
  await r.db.prepare("UPDATE citizens SET nation_id='fulmara' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_FULMARA_EXCHANGE_BELL_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.exchangeBell.nextAt, expected);
  assert.equal(packed.exchangeBell.cycleDays, 30);
  assert.equal('grandCouncil' in packed, false);
  assert.equal('resolutions' in packed, false);
  r.setFixtureEnv('HARIMU_FULMARA_EXCHANGE_BELL_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_FULMARA_COUNCIL_ENABLED: 'true', HARIMU_FULMARA_RESOLUTIONS_ENABLED: 'true', HARIMU_FULMARA_EXCHANGE_BELL_ENABLED: 'true' }));
  r.setFixtureEnv('HARIMU_FULMARA_EXCHANGE_BELL_ENABLED', undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.exchangeBell.nextAt, expected);
  assert.equal(together.grandCouncil.tribuneVetoesPerSession, councilOnly.grandCouncil.tribuneVetoesPerSession);
  assert.deepEqual(together.resolutions, resolutionsOnly.resolutions);
  r.setFixtureEnv('HARIMU_FULMARA_EXCHANGE_BELL_ENABLED', 'false');
  const councilPacked = (await r.call('citizen', 'alice')).data.government;
  assert.equal('exchangeBell' in councilPacked, false, 'flag off leaves the Council and resolutions read unchanged');
  assert.equal(councilPacked.grandCouncil.councilOfTenTermDays, 30);
  assert.deepEqual(councilPacked.resolutions, resolutionsOnly.resolutions);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('exchangeBell' in other), true);
});
