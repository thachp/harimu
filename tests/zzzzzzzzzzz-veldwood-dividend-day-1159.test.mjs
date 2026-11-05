/** #1159: Veldwood next Dividend Day, once per game year (30 real days) from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_VELDWOOD_DIVIDEND_DAY_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no dividendDay key.
 *  The read pays no dividend and states no amount. The zzzzzzzzzzz- name sorts after zzzzzzzzzz- so
 *  --test-shard does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, veldwoodCouncilSnapshot, veldwoodDividendDaySnapshot, veldwoodVoteDaySnapshot, withVeldwoodDividendDay, withVeldwoodVoteDay } from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { VELDWOOD_DIVIDEND_DAY_CYCLE_DAYS, VELDWOOD_DIVIDEND_DAY_CYCLE_MS, veldwoodNextDividendDayAt } from '../lib/veldwood-dividend-day.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = VELDWOOD_DIVIDEND_DAY_CYCLE_MS;
const key = 'HARIMU_VELDWOOD_DIVIDEND_DAY_ENABLED';
const block = nextAt => ({ nextAt, cycleDays: 30 });

test('the next Dividend Day falls once per game year (30 real days) from the Chair anchor', () => {
  assert.equal(anchor, 0);
  assert.equal(VELDWOOD_DIVIDEND_DAY_CYCLE_DAYS, 30);
  assert.equal(VELDWOOD_DIVIDEND_DAY_CYCLE_DAYS, realDaysPerGameYear, 'once per the existing world-clock game year');
  assert.equal(cycle, 30 * day);
  assert.equal(veldwoodNextDividendDayAt(anchor), anchor + cycle);
  assert.equal(veldwoodNextDividendDayAt(anchor - 1), anchor + cycle);
  assert.equal(veldwoodNextDividendDayAt(anchor + cycle - 1), anchor + cycle);
  assert.equal(veldwoodNextDividendDayAt(anchor + cycle), anchor + 2 * cycle);
  assert.equal(veldwoodNextDividendDayAt(anchor + cycle + 1), anchor + 2 * cycle);
  assert.equal(veldwoodNextDividendDayAt(anchor + 29 * day), anchor + cycle, 'day 29 is still this game year');
});

test('Dividend Day timestamps are safe integers on the 30-day cycle', () => {
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity, 1_793_000_000_000]) {
    const nextAt = veldwoodNextDividendDayAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.equal(nextAt % cycle, 0, String(now));
    assert.ok(nextAt > anchor, String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - cycle) assert.ok(nextAt > now && nextAt - now <= cycle, String(now));
  }
});

test('flag off leaves the Veldwood snapshot unchanged, and other nations gain no dividendDay key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'veldwood' }), null);
  assert.equal(veldwoodDividendDaySnapshot(cycle, false), null);
  const veldwood = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'veldwood' };
  assert.equal(withVeldwoodDividendDay(veldwood, cycle, false), veldwood);
  assert.equal('dividendDay' in veldwood, false);
  const on = withVeldwoodDividendDay(veldwood, cycle, true);
  assert.deepEqual(on.dividendDay, block(2 * cycle));
  assert.deepEqual(Object.keys(on.dividendDay).sort(), ['cycleDays', 'nextAt']);
  assert.equal('amount' in on.dividendDay, false);
  assert.equal(JSON.stringify(on.dividendDay).includes('amount'), false);
  assert.equal(on.decision, veldwood.decision, 'the proposal is not rewritten');
  assert.equal('dividendDay' in veldwood, false, 'the input is not mutated');
  assert.equal('federalCouncil' in on, false);
  assert.equal('voteDayCalendar' in on, false);
  const voted = withVeldwoodVoteDay(veldwood, cycle, true);
  const both = withVeldwoodDividendDay(voted, cycle, true);
  assert.deepEqual(both.dividendDay, block(2 * cycle));
  assert.equal(both.voteDayCalendar.nextAt, voted.voteDayCalendar.nextAt);
  assert.equal('dividendDay' in voted, false);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'varkand', 'ilmar', 'hoarvale', 'fulmara', 'confluence']) {
    const snapshot = ['kindle', 'korund', 'aurelle', 'hoarvale'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId };
    assert.equal(withVeldwoodDividendDay(snapshot, day, true), snapshot, nationId);
    assert.equal(withVeldwoodDividendDay(snapshot, day, false), snapshot, nationId);
    assert.equal('dividendDay' in snapshot, false, nationId);
  }
  const read = veldwoodDividendDaySnapshot(anchor, true);
  assert.deepEqual(read.dividendDay, block(cycle));
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.equal(read.decision.reason.includes('pays no dividend'), true);
  assert.equal(read.decision.reason.includes('states no amount'), true);
  assert.equal('federalCouncil' in read, false);
  assert.equal('voteDayCalendar' in read, false);
  const published = publicGovernmentSnapshot(read);
  assert.deepEqual(published.dividendDay, read.dividendDay);
  assert.equal('dividendDay' in publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })), false);
  const councilOnly = veldwoodCouncilSnapshot(anchor, true);
  assert.equal('dividendDay' in councilOnly, false, 'the Council read is unchanged while this flag is off');
  const voteOnly = veldwoodVoteDaySnapshot(anchor, true);
  assert.equal('dividendDay' in voteOnly, false, 'the Vote Day read is unchanged while this flag is off');
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Veldwood government read is unchanged; flag on adds dividendDay; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = block(veldwoodNextDividendDayAt(seconds * 1000));
  assert.equal(await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const councilOnly = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true, veldwoodCouncil: true });
  assert.equal('dividendDay' in councilOnly, false, 'council on, Dividend Day off: no dividendDay key');
  assert.equal('federalCouncil' in councilOnly, true);
  const voteOnly = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true, veldwoodVoteDay: true });
  assert.equal('dividendDay' in voteOnly, false, 'Vote Day on, Dividend Day off: no dividendDay key');
  const on = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true, veldwoodDividendDay: true });
  assert.deepEqual(on.dividendDay, expected);
  assert.equal(Number.isSafeInteger(on.dividendDay.nextAt), true);
  assert.deepEqual(Object.keys(on.dividendDay).sort(), ['cycleDays', 'nextAt']);
  assert.equal(on.decision.proposedSpendMinor, 0);
  assert.equal('federalCouncil' in on, false, 'Dividend Day alone does not add the Federal Council');
  assert.equal('voteDayCalendar' in on, false, 'Dividend Day alone does not add Vote Day');
  const together = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true, veldwoodCouncil: true, veldwoodVoteDay: true, veldwoodDividendDay: true });
  assert.deepEqual(together.dividendDay, expected);
  assert.equal(together.federalCouncil.nextElectionAt, councilOnly.federalCouncil.nextElectionAt);
  assert.equal(together.federalCouncil.speakerSeat, councilOnly.federalCouncil.speakerSeat);
  assert.equal(together.voteDayCalendar.nextAt, voteOnly.voteDayCalendar.nextAt);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'varkand', 'ilmar', 'fulmara', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, veldwoodDividendDay: true });
    assert.equal(other == null || !('dividendDay' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='veldwood' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.dividendDay, expected);
  assert.equal('federalCouncil' in packed, false);
  assert.equal('voteDayCalendar' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_VELDWOOD_COUNCIL_ENABLED: 'true', HARIMU_VELDWOOD_VOTE_DAY_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const bothFlags = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(bothFlags.dividendDay, expected);
  assert.equal(bothFlags.federalCouncil.speakerSeat, councilOnly.federalCouncil.speakerSeat);
  assert.equal(bothFlags.voteDayCalendar.nextAt, voteOnly.voteDayCalendar.nextAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('dividendDay' in other), true);
});
