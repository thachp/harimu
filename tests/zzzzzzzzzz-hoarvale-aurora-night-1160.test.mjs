/** #1160: Hoarvale next Aurora Night, once per game year (30 real days) from the Varkand Chair anchor.
 *  No midwinter offset. Flag HARIMU_HOARVALE_AURORA_NIGHT_ENABLED, packed in HARIMU_GRAY_PACK.
 *  Flag off: no auroraNight key. Holds no festival and adds no rest bonus.
 *  The zzzzzzzzzz- name sorts after zzzzzzzzz- files so --test-shard does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, withHoarvaleAuroraNight, withHoarvaleHonorsListDay } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { HOARVALE_AURORA_NIGHT_CYCLE_DAYS, HOARVALE_AURORA_NIGHT_CYCLE_MS, hoarvaleNextAuroraNightAt } from '../lib/hoarvale-aurora-night.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {}, hoarvaleAssent: true, now: 0 };
const day = 86_400_000;
const key = 'HARIMU_HOARVALE_AURORA_NIGHT_ENABLED';
const calendarKeys = ['cycleDays', 'nextAt'];

test('the next Aurora Night falls once per game year from the Chair anchor, with no midwinter offset', () => {
  assert.equal(HOARVALE_AURORA_NIGHT_CYCLE_DAYS, 30);
  assert.equal(HOARVALE_AURORA_NIGHT_CYCLE_DAYS, realDaysPerGameYear, 'one world-clock game year');
  assert.equal(HOARVALE_AURORA_NIGHT_CYCLE_MS, 30 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(hoarvaleNextAuroraNightAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + HOARVALE_AURORA_NIGHT_CYCLE_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * HOARVALE_AURORA_NIGHT_CYCLE_MS;
    assert.equal(hoarvaleNextAuroraNightAt(at), at + HOARVALE_AURORA_NIGHT_CYCLE_MS);
    assert.equal(hoarvaleNextAuroraNightAt(at + 1), at + HOARVALE_AURORA_NIGHT_CYCLE_MS);
  }
});

test('the boundary at exactly one game year moves to the following night, and the instant before stays on this one', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + HOARVALE_AURORA_NIGHT_CYCLE_MS;
  assert.equal(hoarvaleNextAuroraNightAt(boundary - 1), boundary);
  assert.equal(hoarvaleNextAuroraNightAt(boundary), boundary + HOARVALE_AURORA_NIGHT_CYCLE_MS);
  assert.equal(hoarvaleNextAuroraNightAt(boundary + HOARVALE_AURORA_NIGHT_CYCLE_MS - 1), boundary + HOARVALE_AURORA_NIGHT_CYCLE_MS);
  assert.equal(hoarvaleNextAuroraNightAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
});

test('nextAt is always a safe integer', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, HOARVALE_AURORA_NIGHT_CYCLE_MS, HOARVALE_AURORA_NIGHT_CYCLE_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = hoarvaleNextAuroraNightAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % HOARVALE_AURORA_NIGHT_CYCLE_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no auroraNight key', () => {
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian', 'confluence']) {
    const snapshot = ['varkand', 'veldwood', 'ilmar', 'meridian', 'confluence'].includes(nationId)
      ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
      : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withHoarvaleAuroraNight(snapshot, day, true), snapshot, nationId);
    assert.equal('auroraNight' in snapshot, false);
  }
  const hoarvale = simulateGovernment({ ...baseInput, nationId: 'hoarvale' });
  assert.equal(withHoarvaleAuroraNight(hoarvale, day, false), hoarvale);
  const on = withHoarvaleAuroraNight(hoarvale, day, true);
  assert.deepEqual(Object.keys(on.auroraNight).sort(), calendarKeys);
  assert.equal(on.auroraNight.nextAt, HOARVALE_AURORA_NIGHT_CYCLE_MS);
  assert.equal(on.auroraNight.cycleDays, 30);
  assert.equal('festival' in on.auroraNight, false);
  assert.equal('host' in on.auroraNight, false);
  assert.equal('restBonus' in on, false);
  assert.deepEqual(on.roles, hoarvale.roles);
  assert.equal(on.decision.proposedSpendMinor, hoarvale.decision.proposedSpendMinor);
  assert.equal('auroraNight' in hoarvale, false, 'the input snapshot is not mutated');
  assert.equal('auroraNight' in withHoarvaleHonorsListDay(hoarvale, day, true), false, 'the honors read is unchanged while this flag is off');
  const published = publicGovernmentSnapshot(on);
  assert.equal(published.auroraNight.nextAt, on.auroraNight.nextAt);
  assert.equal(published.auroraNight.cycleDays, 30);
  assert.equal('auroraNight' in publicGovernmentSnapshot(hoarvale), false);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'kindle' })).auroraNight, undefined);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-28), key, '#1164, #1165, #1169, #1170, #1175, #1178, #1179, #1184, #1183, #1187, #1189, #1191, #1196, #1197, and #1193 follow this flag');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-28), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-28), key);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Hoarvale government read is unchanged; flag on names the next night; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = hoarvaleNextAuroraNightAt(seconds * 1000);
  const off = await gov.readGovernment(r.db, 'hoarvale', seconds, 'alice', { readOnly: true, hoarvaleAssent: true });
  assert.equal(off != null && 'auroraNight' in off, false, 'flag off');
  const honorsOnly = await gov.readGovernment(r.db, 'hoarvale', seconds, 'alice', { readOnly: true, hoarvaleAssent: true, hoarvaleHonorsListDay: true });
  assert.equal('auroraNight' in honorsOnly, false, 'honors on, aurora off: no auroraNight key');
  assert.equal('honorsListDay' in honorsOnly, true);
  const on = await gov.readGovernment(r.db, 'hoarvale', seconds, 'alice', { readOnly: true, hoarvaleAssent: true, hoarvaleAuroraNight: true });
  assert.deepEqual(Object.keys(on.auroraNight).sort(), calendarKeys);
  assert.equal(on.auroraNight.nextAt, expected);
  assert.equal(on.auroraNight.cycleDays, 30);
  assert.equal(Number.isSafeInteger(on.auroraNight.nextAt), true);
  assert.equal('festival' in on.auroraNight, false);
  assert.equal('restBonus' in on, false);
  assert.equal('honorsListDay' in on, false, 'aurora night alone does not add honors list day');
  assert.deepEqual({ ...on, auroraNight: undefined }, { ...off, auroraNight: undefined });
  const both = await gov.readGovernment(r.db, 'hoarvale', seconds, 'alice', { readOnly: true, hoarvaleAssent: true, hoarvaleHonorsListDay: true, hoarvaleAuroraNight: true });
  assert.equal(both.auroraNight.nextAt, expected);
  assert.deepEqual(both.honorsListDay, honorsOnly.honorsListDay);
  assert.equal(both.decision.proposedSpendMinor, off.decision.proposedSpendMinor);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, hoarvaleAuroraNight: true });
    assert.equal(other == null || !('auroraNight' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv('HARIMU_HOARVALE_ASSENT_ENABLED', 'true');
  const before = (await r.call('citizen', 'alice')).data.government;
  assert.equal(before == null || !('auroraNight' in before), true, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.auroraNight.nextAt, expected);
  assert.equal(packed.auroraNight.cycleDays, 30);
  assert.equal('festival' in packed.auroraNight, false);
  assert.equal('honorsListDay' in packed, false);
  r.setFixtureEnv(key, 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.equal(direct == null || !('auroraNight' in direct), true, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_HOARVALE_HONORS_LIST_DAY_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.auroraNight.nextAt, expected);
  assert.equal(together.honorsListDay.nextAt, honorsOnly.honorsListDay.nextAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('auroraNight' in other), true);
});
