/** #1122: Veldwood next Vote Day on a fixed 15-real-day cycle from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_VELDWOOD_VOTE_DAY_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no voteDayCalendar key.
 *  The zzzzzzz- name sorts after zzzzzz-confluence-party-1113 so Node's --test-shard round-robin
 *  does not move earlier files between Postgres shards. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, veldwoodCouncilSnapshot, veldwoodVoteDaySnapshot, withVeldwoodVoteDay } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { VELDWOOD_VOTE_DAY_CYCLE_DAYS, VELDWOOD_VOTE_DAY_MS, veldwoodNextVoteDayAt } from '../lib/veldwood-vote-day.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const calendarKeys = ['cycleDays', 'nextAt'];

test('the next Vote Day falls on a 15-real-day cycle from the Chair anchor', () => {
  assert.equal(VELDWOOD_VOTE_DAY_CYCLE_DAYS, 15);
  assert.equal(VELDWOOD_VOTE_DAY_MS, 15 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(veldwoodNextVoteDayAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + VELDWOOD_VOTE_DAY_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * VELDWOOD_VOTE_DAY_MS;
    assert.equal(veldwoodNextVoteDayAt(at), at + VELDWOOD_VOTE_DAY_MS);
    assert.equal(veldwoodNextVoteDayAt(at + 1), at + VELDWOOD_VOTE_DAY_MS);
  }
});

test('the boundary at exactly 15 real days moves to the following cycle, and the instant before stays on this one', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + VELDWOOD_VOTE_DAY_MS;
  assert.equal(veldwoodNextVoteDayAt(boundary - 1), boundary);
  assert.equal(veldwoodNextVoteDayAt(boundary), boundary + VELDWOOD_VOTE_DAY_MS);
  assert.equal(veldwoodNextVoteDayAt(boundary + VELDWOOD_VOTE_DAY_MS - 1), boundary + VELDWOOD_VOTE_DAY_MS);
  assert.equal(veldwoodNextVoteDayAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
});

test('nextAt is always a safe integer', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, VELDWOOD_VOTE_DAY_MS, VELDWOOD_VOTE_DAY_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = veldwoodNextVoteDayAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % VELDWOOD_VOTE_DAY_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no voteDayCalendar key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'veldwood' }), null);
  assert.equal(veldwoodVoteDaySnapshot(VELDWOOD_VOTE_DAY_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'hoarvale']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : nationId === 'varkand'
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withVeldwoodVoteDay(snapshot, VELDWOOD_VOTE_DAY_MS, true), snapshot);
    assert.equal(withVeldwoodVoteDay(snapshot, VELDWOOD_VOTE_DAY_MS, false), snapshot);
    assert.equal('voteDayCalendar' in snapshot, false);
  }
  const veldwood = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'veldwood' };
  assert.equal(withVeldwoodVoteDay(veldwood, day, false), veldwood);
  assert.equal('voteDayCalendar' in veldwood, false);
  const on = withVeldwoodVoteDay(veldwood, day, true);
  assert.deepEqual(Object.keys(on.voteDayCalendar).sort(), calendarKeys);
  assert.equal(on.voteDayCalendar.nextAt, VELDWOOD_VOTE_DAY_MS);
  assert.equal(on.voteDayCalendar.cycleDays, 15);
  assert.equal(Number.isSafeInteger(on.voteDayCalendar.nextAt), true);
  assert.equal('voteDayCalendar' in veldwood, false, 'the input snapshot is not mutated');
  assert.equal('federalCouncil' in on, false);
  assert.equal('directorate' in on, false);
  const read = veldwoodVoteDaySnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.deepEqual(Object.keys(read.voteDayCalendar).sort(), calendarKeys);
  assert.equal(read.voteDayCalendar.nextAt, VARKAND_CHAIR_ANCHOR_MS + VELDWOOD_VOTE_DAY_MS);
  assert.equal(read.voteDayCalendar.cycleDays, 15);
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.equal('federalCouncil' in read, false);
  assert.equal(read.decision.reason.includes('opens no ballot'), true);
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.voteDayCalendar.nextAt, read.voteDayCalendar.nextAt);
  assert.equal(published.voteDayCalendar.cycleDays, 15);
  assert.deepEqual(Object.keys(published.voteDayCalendar).sort(), calendarKeys);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).voteDayCalendar, undefined);
  const councilOnly = veldwoodCouncilSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal('voteDayCalendar' in councilOnly, false, 'the Council read is unchanged while this flag is off');
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_VELDWOOD_VOTE_DAY_ENABLED, undefined, 'not its own text binding');
  assert.equal(prod.vars.HARIMU_VELDWOOD_VOTE_DAY_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_VELDWOOD_VOTE_DAY_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_VELDWOOD_VOTE_DAY_ENABLED, 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, 'HARIMU_VELDWOOD_VOTE_DAY_ENABLED'), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_VELDWOOD_VOTE_DAY_ENABLED'), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_VELDWOOD_VOTE_DAY_ENABLED: 'false' }, 'HARIMU_VELDWOOD_VOTE_DAY_ENABLED'), false, 'a direct string wins');
});

test('flag off: the Veldwood government read is unchanged; flag on names the next Vote Day; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = veldwoodNextVoteDayAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const councilOnly = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true, veldwoodCouncil: true });
  assert.equal('voteDayCalendar' in councilOnly, false, 'council on, Vote Day off: no voteDayCalendar key');
  assert.equal('federalCouncil' in councilOnly, true);
  const on = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true, veldwoodVoteDay: true });
  assert.equal(on.voteDayCalendar.nextAt, expected);
  assert.equal(on.voteDayCalendar.cycleDays, 15);
  assert.equal(Number.isSafeInteger(on.voteDayCalendar.nextAt), true);
  assert.deepEqual(Object.keys(on.voteDayCalendar).sort(), calendarKeys);
  assert.equal('federalCouncil' in on, false, 'Vote Day alone does not add the Federal Council');
  const both = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true, veldwoodCouncil: true, veldwoodVoteDay: true });
  assert.equal(both.voteDayCalendar.nextAt, expected);
  assert.equal(both.voteDayCalendar.cycleDays, 15);
  assert.equal(both.federalCouncil.nextElectionAt, councilOnly.federalCouncil.nextElectionAt);
  assert.equal(both.federalCouncil.speakerSeat, councilOnly.federalCouncil.speakerSeat);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'ilmar', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, veldwoodVoteDay: true });
    assert.equal(other == null || !('voteDayCalendar' in other), true, nationId);
  }
  const varkand = await gov.readGovernment(r.db, 'varkand', seconds, 'bob', { readOnly: true, varkandDirectorate: true, varkandPlebiscite: true, veldwoodVoteDay: true });
  assert.equal('voteDayCalendar' in varkand, false);
  assert.equal('directorate' in varkand, true);
  assert.equal('mandatePlebiscite' in varkand, true);
  await r.db.prepare("UPDATE citizens SET nation_id='veldwood' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_VELDWOOD_VOTE_DAY_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.voteDayCalendar.nextAt, expected);
  assert.equal(packed.voteDayCalendar.cycleDays, 15);
  assert.equal('federalCouncil' in packed, false);
  r.setFixtureEnv('HARIMU_VELDWOOD_VOTE_DAY_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_VELDWOOD_COUNCIL_ENABLED: 'true', HARIMU_VELDWOOD_VOTE_DAY_ENABLED: 'true' }));
  r.setFixtureEnv('HARIMU_VELDWOOD_VOTE_DAY_ENABLED', undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.voteDayCalendar.nextAt, expected);
  assert.equal(together.federalCouncil.speakerSeat, councilOnly.federalCouncil.speakerSeat);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('voteDayCalendar' in other), true);
});
