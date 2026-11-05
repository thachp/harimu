/** #1164: Kindle next Market Bell on a fixed 30-real-day cycle from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_KINDLE_MARKET_BELL_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no marketBell key. #1165, #1169, and #1170 follow it.
 *  Holds no market event, moves no prices, and adds no bonus. Forgehaven's Exchange hosts it; the read stores the date only.
 *  The zzzzzzzzzzz- name sorts after zzzzzzzzzz-fulmara-exchange-bell-1150 so Node's --test-shard
 *  round-robin does not move earlier files between Postgres shards.
 *  [ASSUMPTION] Docs §7.1 name the anniversary and give no interval. Cadence is one game year (30 real days). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, withKindleFoundersForgeDay, withKindleMarketBell } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { KINDLE_MARKET_BELL_CYCLE_DAYS, KINDLE_MARKET_BELL_MS, kindleNextMarketBellAt } from '../lib/kindle-market-bell.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const key = 'HARIMU_KINDLE_MARKET_BELL_ENABLED';
const calendarKeys = ['cycleDays', 'nextAt'];

test('the next Market Bell falls on a 30-real-day cycle from the Chair anchor', () => {
  assert.equal(KINDLE_MARKET_BELL_CYCLE_DAYS, 30);
  assert.equal(KINDLE_MARKET_BELL_CYCLE_DAYS, realDaysPerGameYear, 'one world-clock game year');
  assert.equal(KINDLE_MARKET_BELL_MS, 30 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(kindleNextMarketBellAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + KINDLE_MARKET_BELL_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * KINDLE_MARKET_BELL_MS;
    assert.equal(kindleNextMarketBellAt(at), at + KINDLE_MARKET_BELL_MS);
    assert.equal(kindleNextMarketBellAt(at + 1), at + KINDLE_MARKET_BELL_MS);
  }
});

test('the boundary at exactly 30 real days moves to the following cycle, and the instant before stays on this one', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + KINDLE_MARKET_BELL_MS;
  assert.equal(kindleNextMarketBellAt(boundary - 1), boundary);
  assert.equal(kindleNextMarketBellAt(boundary), boundary + KINDLE_MARKET_BELL_MS);
  assert.equal(kindleNextMarketBellAt(boundary + KINDLE_MARKET_BELL_MS - 1), boundary + KINDLE_MARKET_BELL_MS);
  assert.equal(kindleNextMarketBellAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
});

test('nextAt is always a safe integer', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, KINDLE_MARKET_BELL_MS, KINDLE_MARKET_BELL_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = kindleNextMarketBellAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % KINDLE_MARKET_BELL_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no marketBell key', () => {
  for (const nationId of ['korund', 'aurelle', 'hoarvale', 'varkand', 'veldwood', 'ilmar', 'meridian', 'confluence', 'fulmara']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : ['varkand', 'veldwood', 'ilmar', 'meridian', 'confluence', 'fulmara'].includes(nationId)
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withKindleMarketBell(snapshot, day, true), snapshot, nationId);
    assert.equal(withKindleMarketBell(snapshot, day, false), snapshot, nationId);
    assert.equal('marketBell' in snapshot, false);
  }
  const kindle = simulateGovernment({ ...baseInput, nationId: 'kindle' });
  assert.equal(withKindleMarketBell(kindle, day, false), kindle);
  assert.equal('marketBell' in kindle, false);
  const on = withKindleMarketBell(kindle, day, true);
  assert.deepEqual(Object.keys(on.marketBell).sort(), calendarKeys);
  assert.equal(on.marketBell.nextAt, KINDLE_MARKET_BELL_MS);
  assert.equal(on.marketBell.cycleDays, 30);
  assert.equal(Number.isSafeInteger(on.marketBell.nextAt), true);
  assert.equal('host' in on.marketBell, false);
  assert.equal('price' in on.marketBell, false);
  assert.equal('event' in on.marketBell, false);
  assert.equal('bonus' in on, false);
  assert.equal(on.decision.proposedSpendMinor, kindle.decision.proposedSpendMinor);
  assert.equal(on.decision.reason, kindle.decision.reason);
  assert.equal('marketBell' in kindle, false, 'the input snapshot is not mutated');
  assert.equal('foundersForgeDay' in on, false);
  const forge = withKindleFoundersForgeDay(kindle, day, true);
  assert.equal('marketBell' in forge, false, 'Founders\' Forge Day is unchanged while this flag is off');
  const published = publicGovernmentSnapshot(on);
  assert.equal(published.marketBell.nextAt, on.marketBell.nextAt);
  assert.equal(published.marketBell.cycleDays, 30);
  assert.deepEqual(Object.keys(published.marketBell).sort(), calendarKeys);
  assert.equal('marketBell' in publicGovernmentSnapshot(kindle), false);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).marketBell, undefined);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-4), key, '#1165, #1169, and #1170 follow this flag');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-4), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), key);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/kindle-market-bell\.ts/);
});

test('flag off: the Kindle government read is unchanged; flag on names the next Market Bell; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = kindleNextMarketBellAt(seconds * 1000);
  const off = await gov.readGovernment(r.db, 'kindle', seconds, 'alice', { readOnly: true });
  assert.equal(off != null && 'marketBell' in off, false, 'flag off');
  const forgeOnly = await gov.readGovernment(r.db, 'kindle', seconds, 'alice', { readOnly: true, kindleFoundersForgeDay: true });
  assert.equal('marketBell' in forgeOnly, false, 'Founders\' Forge on, Market Bell off: no marketBell key');
  assert.equal('foundersForgeDay' in forgeOnly, true);
  const on = await gov.readGovernment(r.db, 'kindle', seconds, 'alice', { readOnly: true, kindleMarketBell: true });
  assert.equal(on.marketBell.nextAt, expected);
  assert.equal(on.marketBell.cycleDays, 30);
  assert.equal(Number.isSafeInteger(on.marketBell.nextAt), true);
  assert.deepEqual(Object.keys(on.marketBell).sort(), calendarKeys);
  assert.equal('foundersForgeDay' in on, false, 'Market Bell alone does not add Founders\' Forge Day');
  assert.equal(on.decision.reason, off.decision.reason);
  assert.equal(on.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  const both = await gov.readGovernment(r.db, 'kindle', seconds, 'alice', { readOnly: true, kindleFoundersForgeDay: true, kindleMarketBell: true });
  assert.equal(both.marketBell.nextAt, expected);
  assert.deepEqual(both.foundersForgeDay, forgeOnly.foundersForgeDay);
  assert.equal(both.decision.reason, off.decision.reason);
  for (const nationId of ['korund', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian', 'confluence', 'fulmara', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, kindleMarketBell: true, hoarvaleAssent: nationId === 'hoarvale' });
    assert.equal(other == null || !('marketBell' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government == null || !('marketBell' in (await r.call('citizen', 'alice')).data.government), true, 'flag off leaves the citizen read unchanged');
  const before = (await r.call('citizen', 'alice')).data.government;
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.marketBell.nextAt, expected);
  assert.equal(packed.marketBell.cycleDays, 30);
  assert.equal('foundersForgeDay' in packed, false);
  assert.equal(packed.decision.reason, before.decision.reason);
  r.setFixtureEnv(key, 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.equal(direct == null || !('marketBell' in direct), true, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_KINDLE_FOUNDERS_FORGE_DAY_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.marketBell.nextAt, expected);
  assert.equal(together.foundersForgeDay.nextAt, forgeOnly.foundersForgeDay.nextAt);
  r.setFixtureEnv(key, 'false');
  const forgePacked = (await r.call('citizen', 'alice')).data.government;
  assert.equal('marketBell' in forgePacked, false, 'flag off leaves the Founders\' Forge Day read unchanged');
  assert.equal(forgePacked.foundersForgeDay.nextAt, forgeOnly.foundersForgeDay.nextAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('marketBell' in other), true);
});
