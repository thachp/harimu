/** #1117: Kindle presidential term end and the next Ballot Night on the government read.
 *  Anchor: HARIMU_KINDLE_CYCLE_START_AT, founding election day 30, 4 game years = 120 real days (#351/#878/#918/#936).
 *  [ASSUMPTION] Ballot Night is the presidential vote close (open + 72h). A term runs from one open to the next.
 *  Flag HARIMU_KINDLE_ELECTION_CLOCK_ENABLED, packed in HARIMU_GRAY_PACK. Flag off, or a held cycle start: no electionClock key.
 *  The zzzzzzz- name sorts after zzzzzz-confluence so --test-shard does not move earlier nation files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { KINDLE_CALENDAR, realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, withKindleElectionClock } from '../lib/government.ts';
import { KINDLE_BALLOT_NIGHT_VOTE_MS, KINDLE_MAX_CONSECUTIVE_TERMS, KINDLE_PRESIDENTIAL_TERM_DAYS, KINDLE_PRESIDENTIAL_TERM_MS, kindleElectionClock } from '../lib/kindle-election.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const start = 1_792_368_000;
const day = 86_400_000;
const term = 120 * day;
const vote = 72 * 3_600_000;
const firstOpen = start * 1000 + 30 * day;
const firstClose = firstOpen + vote;
const expected = (termEndsAt, nextBallotNightAt) => ({ termEndsAt, nextBallotNightAt, termDays: 120, maxConsecutiveTerms: 2 });

test('the term is 4 game years on the existing Kindle cycle, and Ballot Night is 72 hours after the open', () => {
  assert.equal(KINDLE_PRESIDENTIAL_TERM_DAYS, 120);
  assert.equal(KINDLE_PRESIDENTIAL_TERM_DAYS, 4 * realDaysPerGameYear);
  assert.equal(KINDLE_PRESIDENTIAL_TERM_DAYS, KINDLE_CALENDAR.cycleDays);
  assert.equal(KINDLE_CALENDAR.foundingElectionDay, 30);
  assert.equal(KINDLE_PRESIDENTIAL_TERM_MS, term);
  assert.equal(KINDLE_BALLOT_NIGHT_VOTE_MS, vote);
  assert.equal(KINDLE_BALLOT_NIGHT_VOTE_MS, KINDLE_CALENDAR.voteHours * 3_600_000);
  assert.equal(KINDLE_MAX_CONSECUTIVE_TERMS, 2);
});

test('before the founding open the first term ends one cycle later, and Ballot Night is that vote close; at a boundary the following one is next', () => {
  assert.deepEqual(kindleElectionClock(start, start * 1000), expected(firstOpen + term, firstClose));
  assert.deepEqual(kindleElectionClock(start, firstOpen - 1), expected(firstOpen + term, firstClose));
  assert.deepEqual(kindleElectionClock(start, firstOpen), expected(firstOpen + term, firstClose), 'the founding open begins the term; results are still 72h away');
  assert.deepEqual(kindleElectionClock(start, firstOpen + 3_600_000), expected(firstOpen + term, firstClose), 'inside the vote, Ballot Night is this close');
  assert.deepEqual(kindleElectionClock(start, firstClose - 1), expected(firstOpen + term, firstClose));
  assert.deepEqual(kindleElectionClock(start, firstClose), expected(firstOpen + term, firstClose + term), 'exactly at Ballot Night, the following one is next');
  assert.deepEqual(kindleElectionClock(start, firstOpen + term - 1), expected(firstOpen + term, firstClose + term));
  assert.deepEqual(kindleElectionClock(start, firstOpen + term), expected(firstOpen + 2 * term, firstClose + term), 'exactly at the next open, the new term has begun');
  assert.deepEqual(kindleElectionClock(start, firstClose + term), expected(firstOpen + 2 * term, firstClose + 2 * term));
});

test('a held cycle start or a bad clock invents no dates, and ordinary timestamps stay safe integers', () => {
  for (const cycle of [null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(kindleElectionClock(cycle, firstOpen), null, String(cycle));
  for (const now of [Number.NaN, 1.5, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER]) assert.equal(kindleElectionClock(start, now), null, String(now));
  for (const now of [start * 1000, firstOpen, firstClose, firstOpen + term, 1_793_000_000_000]) {
    const clock = kindleElectionClock(start, now);
    assert.equal(Number.isSafeInteger(clock.termEndsAt), true, String(now));
    assert.equal(Number.isSafeInteger(clock.nextBallotNightAt), true, String(now));
    assert.ok(clock.nextBallotNightAt > now, String(now));
    assert.ok(clock.termEndsAt > now, String(now));
  }
});

test('flag off leaves Kindle unchanged, a held cycle adds no key, and other nations gain no electionClock', () => {
  const kindle = simulateGovernment({ ...baseInput, nationId: 'kindle' });
  assert.equal('electionClock' in kindle, false);
  assert.equal(withKindleElectionClock(kindle, firstOpen, start, false), kindle);
  assert.equal(withKindleElectionClock(kindle, firstOpen, null, true), kindle, 'flag on but the cycle is held');
  const on = withKindleElectionClock(kindle, firstOpen, start, true);
  assert.deepEqual(on.electionClock, expected(firstOpen + term, firstClose));
  assert.equal(on.decision.title, kindle.decision.title);
  assert.equal(on.decision.proposedSpendMinor, kindle.decision.proposedSpendMinor);
  assert.equal('electionClock' in kindle, false, 'the input is not mutated');
  assert.equal('winner' in on.electionClock, false);
  assert.deepEqual(publicGovernmentSnapshot(on).electionClock, on.electionClock);
  assert.equal('electionClock' in publicGovernmentSnapshot(kindle), false);
  for (const nationId of ['korund', 'aurelle', 'hoarvale', 'varkand', 'veldwood', 'ilmar', 'meridian', 'confluence', 'fulmara']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : { ...kindle, nationId };
    assert.equal(withKindleElectionClock(snapshot, firstOpen, start, true), snapshot, nationId);
    assert.equal('electionClock' in snapshot, false);
  }
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  const key = 'HARIMU_KINDLE_ELECTION_CLOCK_ENABLED';
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Kindle government read is unchanged; flag on with a cycle start adds electionClock; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const nowMs = seconds * 1000;
  const off = await gov.readGovernment(r.db, 'kindle', seconds, 'alice', { readOnly: true });
  assert.equal('electionClock' in off, false, 'flag off');
  const held = await gov.readGovernment(r.db, 'kindle', seconds, 'alice', { readOnly: true, kindleElectionClock: true });
  assert.equal('electionClock' in held, false, 'flag on, cycle held');
  assert.equal(held.decision.title, off.decision.title);
  const on = await gov.readGovernment(r.db, 'kindle', seconds, 'alice', { readOnly: true, kindleElectionClock: true, kindleCycleStartAt: start });
  assert.deepEqual(on.electionClock, kindleElectionClock(start, nowMs));
  assert.equal(on.decision.proposedSpendMinor, off.decision.proposedSpendMinor, 'the clock proposes no spending');
  for (const nationId of ['korund', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, kindleElectionClock: true, kindleCycleStartAt: start });
    assert.equal(other == null || !('electionClock' in other), true, nationId);
  }
  assert.equal('electionClock' in (await r.call('citizen', 'alice')).data.government, false, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_KINDLE_ELECTION_CLOCK_ENABLED: 'true' }));
  assert.equal('electionClock' in (await r.call('citizen', 'alice')).data.government, false, 'flag on with the cycle unset still adds no key');
  r.setFixtureEnv('HARIMU_KINDLE_CYCLE_START_AT', String(start));
  assert.deepEqual((await r.call('citizen', 'alice')).data.government.electionClock, kindleElectionClock(start, nowMs));
  r.setFixtureEnv('HARIMU_KINDLE_ELECTION_CLOCK_ENABLED', 'false');
  assert.equal('electionClock' in (await r.call('citizen', 'alice')).data.government, false, 'a direct false wins over the pack');
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  r.setFixtureEnv('HARIMU_KINDLE_ELECTION_CLOCK_ENABLED', undefined);
  const korund = (await r.call('citizen', 'bob')).data.government;
  assert.equal(korund == null || !('electionClock' in korund), true);
});
