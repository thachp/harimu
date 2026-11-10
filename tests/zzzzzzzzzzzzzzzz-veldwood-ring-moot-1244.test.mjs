/** #1244: Veldwood next midsummer Ring Moot on the government read.
 *  Flag HARIMU_VELDWOOD_RING_MOOT_ENABLED in HARIMU_GRAY_PACK. Clearing follows it.
 *  Flag HARIMU_VELDWOOD_RING_MOOT_ENABLED, packed in HARIMU_GRAY_PACK (GRAY 77; Ruel Works last, Vakk Harbor 76).
 *  Flag off: no ringMoot key. Date only: no motions, votes, turnout, or potluck text.
 *  The zzzzzzzzzzzzzzzz- name sorts after zzzzzzzzzzzzzzz- so --test-shard does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import {
  simulateGovernment, veldwoodCouncilSnapshot, veldwoodDividendDaySnapshot, veldwoodRingMootSnapshot,
  veldwoodVoteDaySnapshot, withVeldwoodDividendDay, withVeldwoodRingMoot, withVeldwoodVoteDay,
} from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import {
  VELDWOOD_RING_MOOT_CYCLE_DAYS, VELDWOOD_RING_MOOT_CYCLE_MS, VELDWOOD_RING_MOOT_OFFSET_MS, veldwoodNextRingMootAt,
} from '../lib/veldwood-ring-moot.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = VELDWOOD_RING_MOOT_CYCLE_MS;
const offset = VELDWOOD_RING_MOOT_OFFSET_MS;
const first = anchor + offset;
const key = 'HARIMU_VELDWOOD_RING_MOOT_ENABLED';
const block = nextAt => ({ nextAt, cycleDays: 30 });

test('the next Ring Moot falls at midsummer (11.25 days) into each 30-day game year from the Chair anchor', () => {
  assert.equal(anchor, 0);
  assert.equal(VELDWOOD_RING_MOOT_CYCLE_DAYS, 30);
  assert.equal(VELDWOOD_RING_MOOT_CYCLE_DAYS, realDaysPerGameYear, 'once per the existing world-clock game year');
  assert.equal(cycle, 30 * day);
  assert.equal(offset, 972_000_000, '11.25 real days');
  assert.equal(offset, 11.25 * day);
  assert.equal(veldwoodNextRingMootAt.length, 1, 'nowMs is the only input');
  // Pre-anchor and before the first midsummer: first date after the anchor.
  assert.equal(veldwoodNextRingMootAt(anchor - 1), first);
  assert.equal(veldwoodNextRingMootAt(anchor), first);
  assert.equal(veldwoodNextRingMootAt(first - 1), first);
  // Exact boundary rolls to the next year.
  assert.equal(veldwoodNextRingMootAt(first), first + cycle);
  assert.equal(veldwoodNextRingMootAt(first + 1), first + cycle);
  assert.equal(veldwoodNextRingMootAt(first + cycle - 1), first + cycle);
  assert.equal(veldwoodNextRingMootAt(first + cycle), first + 2 * cycle);
  // Year rollover mid-cycle.
  assert.equal(veldwoodNextRingMootAt(anchor + 11 * day), first, 'day 11 is still before midsummer');
  assert.equal(veldwoodNextRingMootAt(anchor + 12 * day), first + cycle, 'day 12 is past midsummer');
});

test('Ring Moot timestamps are safe integers on the midsummer offset cycle', () => {
  for (const now of [anchor, first, first - 1, first + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity, 1_793_000_000_000]) {
    const nextAt = veldwoodNextRingMootAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.equal((nextAt - offset) % cycle, 0, String(now));
    assert.ok(nextAt >= first, String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - cycle) assert.ok(nextAt > now && nextAt - now <= cycle, String(now));
  }
});

test('flag off leaves the Veldwood snapshot unchanged, and other nations gain no ringMoot key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'veldwood' }), null);
  assert.equal(veldwoodRingMootSnapshot(first, false), null);
  const veldwood = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'veldwood' };
  assert.equal(withVeldwoodRingMoot(veldwood, first, false), veldwood);
  assert.equal('ringMoot' in veldwood, false);
  const on = withVeldwoodRingMoot(veldwood, first - 1, true);
  assert.deepEqual(on.ringMoot, block(first));
  assert.deepEqual(Object.keys(on.ringMoot).sort(), ['cycleDays', 'nextAt']);
  assert.equal(on.ringMoot.nextAt, veldwoodNextRingMootAt(first - 1), 'block uses veldwoodNextRingMootAt');
  assert.equal(JSON.stringify(on.ringMoot).includes('motion'), false);
  assert.equal(JSON.stringify(on.ringMoot).includes('turnout'), false);
  assert.equal(on.decision, veldwood.decision, 'the proposal is not rewritten');
  assert.equal('ringMoot' in veldwood, false, 'the input is not mutated');
  assert.equal('federalCouncil' in on, false);
  assert.equal('voteDayCalendar' in on, false);
  assert.equal('dividendDay' in on, false);
  const voted = withVeldwoodVoteDay(veldwood, first, true);
  const both = withVeldwoodRingMoot(voted, first - 1, true);
  assert.deepEqual(both.ringMoot, block(first));
  assert.equal(both.voteDayCalendar.nextAt, voted.voteDayCalendar.nextAt);
  assert.equal('ringMoot' in voted, false);
  const withDividend = withVeldwoodDividendDay(veldwood, first, true);
  const all = withVeldwoodRingMoot(withDividend, first - 1, true);
  assert.deepEqual(all.ringMoot, block(first));
  assert.equal(all.dividendDay.nextAt, withDividend.dividendDay.nextAt);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'varkand', 'ilmar', 'hoarvale', 'fulmara', 'confluence']) {
    const snapshot = ['kindle', 'korund', 'aurelle', 'hoarvale'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId };
    assert.equal(withVeldwoodRingMoot(snapshot, day, true), snapshot, nationId);
    assert.equal(withVeldwoodRingMoot(snapshot, day, false), snapshot, nationId);
    assert.equal('ringMoot' in snapshot, false, nationId);
  }
  const read = veldwoodRingMootSnapshot(anchor, true);
  assert.deepEqual(read.ringMoot, block(first));
  assert.equal(read.ringMoot.nextAt, veldwoodNextRingMootAt(anchor), 'snapshot uses veldwoodNextRingMootAt');
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.equal(read.decision.reason.includes('opens no vote'), true);
  assert.equal('federalCouncil' in read, false);
  assert.equal('voteDayCalendar' in read, false);
  assert.equal('dividendDay' in read, false);
  const published = publicGovernmentSnapshot(read);
  assert.deepEqual(published.ringMoot, read.ringMoot);
  assert.equal('ringMoot' in publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })), false);
  const councilOnly = veldwoodCouncilSnapshot(anchor, true);
  assert.equal('ringMoot' in councilOnly, false, 'the Council read is unchanged while this flag is off');
  const voteOnly = veldwoodVoteDaySnapshot(anchor, true);
  assert.equal('ringMoot' in voteOnly, false, 'the Vote Day read is unchanged while this flag is off');
  const dividendOnly = veldwoodDividendDaySnapshot(anchor, true);
  assert.equal('ringMoot' in dividendOnly, false, 'the Dividend Day read is unchanged while this flag is off');
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-7), key);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-7), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-7), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-8), 'HARIMU_AURELLE_KITE_FESTIVAL_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-9), 'HARIMU_KINDLE_BRASSWELL_PORT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-10), 'HARIMU_VARKAND_RED_ALERT_CANCELS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-11), 'HARIMU_HOARVALE_ELECTION_NIGHT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 77);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Veldwood government read is unchanged; flag on adds ringMoot; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = block(veldwoodNextRingMootAt(seconds * 1000));
  assert.equal(await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const councilOnly = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true, veldwoodCouncil: true });
  assert.equal('ringMoot' in councilOnly, false, 'council on, Ring Moot off: no ringMoot key');
  assert.equal('federalCouncil' in councilOnly, true);
  const voteOnly = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true, veldwoodVoteDay: true });
  assert.equal('ringMoot' in voteOnly, false, 'Vote Day on, Ring Moot off: no ringMoot key');
  const dividendOnly = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true, veldwoodDividendDay: true });
  assert.equal('ringMoot' in dividendOnly, false, 'Dividend Day on, Ring Moot off: no ringMoot key');
  const on = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true, veldwoodRingMoot: true });
  assert.deepEqual(on.ringMoot, expected);
  assert.equal(on.ringMoot.nextAt, veldwoodNextRingMootAt(seconds * 1000), 'read uses veldwoodNextRingMootAt');
  assert.equal(Number.isSafeInteger(on.ringMoot.nextAt), true);
  assert.deepEqual(Object.keys(on.ringMoot).sort(), ['cycleDays', 'nextAt']);
  assert.equal(on.decision.proposedSpendMinor, 0);
  assert.equal('federalCouncil' in on, false, 'Ring Moot alone does not add the Federal Council');
  assert.equal('voteDayCalendar' in on, false, 'Ring Moot alone does not add Vote Day');
  assert.equal('dividendDay' in on, false, 'Ring Moot alone does not add Dividend Day');
  const together = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', {
    readOnly: true, veldwoodCouncil: true, veldwoodVoteDay: true, veldwoodDividendDay: true, veldwoodRingMoot: true,
  });
  assert.deepEqual(together.ringMoot, expected);
  assert.equal(together.federalCouncil.nextElectionAt, councilOnly.federalCouncil.nextElectionAt);
  assert.equal(together.federalCouncil.speakerSeat, councilOnly.federalCouncil.speakerSeat);
  assert.equal(together.voteDayCalendar.nextAt, voteOnly.voteDayCalendar.nextAt);
  assert.equal(together.dividendDay.nextAt, dividendOnly.dividendDay.nextAt);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'varkand', 'ilmar', 'fulmara', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, veldwoodRingMoot: true });
    assert.equal(other == null || !('ringMoot' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='veldwood' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.ringMoot, expected);
  assert.equal('federalCouncil' in packed, false);
  assert.equal('voteDayCalendar' in packed, false);
  assert.equal('dividendDay' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({
    HARIMU_VELDWOOD_COUNCIL_ENABLED: 'true', HARIMU_VELDWOOD_VOTE_DAY_ENABLED: 'true',
    HARIMU_VELDWOOD_DIVIDEND_DAY_ENABLED: 'true', [key]: 'true',
  }));
  r.setFixtureEnv(key, undefined);
  const bothFlags = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(bothFlags.ringMoot, expected);
  assert.equal(bothFlags.federalCouncil.speakerSeat, councilOnly.federalCouncil.speakerSeat);
  assert.equal(bothFlags.voteDayCalendar.nextAt, voteOnly.voteDayCalendar.nextAt);
  assert.equal(bothFlags.dividendDay.nextAt, dividendOnly.dividendDay.nextAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('ringMoot' in other), true);
});
