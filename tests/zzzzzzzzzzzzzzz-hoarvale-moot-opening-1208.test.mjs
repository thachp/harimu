/** #1208: next Opening of the Moot is the next Moot term start (#1096), not a 30-day cycle.
 *  HARIMU_HOARVALE_MOOT_OPENING_ENABLED is GRAY 64 in HARIMU_GRAY_PACK. Flag off: no mootOpening key.
 *  [ASSUMPTION] No offset between the term start and the Opening. Date only: no rite text, no member names. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { MOOT_TERM_SECONDS, hoarvaleMootAt, hoarvaleMootOpeningSnapshot, simulateGovernment, withHoarvaleAuroraNight, withHoarvaleHonorsListDay, withHoarvaleMoot, withHoarvaleMootOpening } from '../lib/government.ts';
import { HOARVALE_MOOT_OPENING_OFFSET_MS, hoarvaleNextMootOpeningAt } from '../lib/hoarvale-moot-opening.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {}, hoarvaleAssent: true, now: 0 };
const termMs = MOOT_TERM_SECONDS * 1000;
const key = 'HARIMU_HOARVALE_MOOT_OPENING_ENABLED';
const opening = nowMs => hoarvaleNextMootOpeningAt(nowMs);

test('next Opening follows hoarvaleMootAt: zero offset, exact boundary rolls forward, before-anchor clamps', () => {
  assert.equal(HOARVALE_MOOT_OPENING_OFFSET_MS, 0);
  assert.equal(opening.length, 1);
  assert.equal(MOOT_TERM_SECONDS, 120 * 86_400);
  const boundary = 2 * MOOT_TERM_SECONDS;
  assert.equal(hoarvaleMootAt(boundary - 1).dissolvesBy, boundary);
  assert.equal(hoarvaleMootAt(boundary).electedAt, boundary, 'at dissolvesBy the next term has begun');
  assert.equal(opening(boundary * 1000 - 1), boundary * 1000);
  assert.equal(opening(boundary * 1000), hoarvaleMootAt(boundary).dissolvesBy * 1000);
  for (const seconds of [0, 1, MOOT_TERM_SECONDS - 1, MOOT_TERM_SECONDS, MOOT_TERM_SECONDS + 1, 3 * MOOT_TERM_SECONDS]) {
    assert.equal(opening(seconds * 1000), hoarvaleMootAt(seconds).dissolvesBy * 1000 + HOARVALE_MOOT_OPENING_OFFSET_MS);
    assert.ok(opening(seconds * 1000) > seconds * 1000);
  }
  for (const seconds of [-5, -1, 0, NaN]) {
    assert.equal(hoarvaleMootAt(seconds).electedAt, 0);
    const nowMs = Number.isFinite(seconds) && seconds < 0 ? seconds * 1000 : seconds;
    assert.equal(opening(nowMs), hoarvaleMootAt(seconds).dissolvesBy * 1000); assert.equal(opening(nowMs), termMs, String(seconds));
  }
  for (const now of [0, termMs - 1, termMs, termMs + 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity]) {
    const nextAt = opening(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > 0); assert.equal(nextAt % termMs, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no mootOpening key', () => {
  assert.equal(hoarvaleMootOpeningSnapshot(termMs, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'meridian', 'confluence', 'fulmara']) {
    const snapshot = ['varkand', 'veldwood', 'ilmar', 'meridian', 'confluence', 'fulmara'].includes(nationId)
      ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
      : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withHoarvaleMootOpening(snapshot, termMs, true), snapshot, nationId);
    assert.equal('mootOpening' in snapshot, false);
  }
  const hoarvale = simulateGovernment({ ...baseInput, nationId: 'hoarvale' });
  assert.equal(withHoarvaleMootOpening(hoarvale, termMs, false), hoarvale);
  const on = withHoarvaleMootOpening(hoarvale, 0, true);
  assert.deepEqual(Object.keys(on.mootOpening), ['nextAt']);
  assert.equal(on.mootOpening.nextAt, termMs);
  assert.equal('rite' in on.mootOpening, false); assert.equal('members' in on.mootOpening, false);
  assert.equal(on.decision.reason, hoarvale.decision.reason); assert.deepEqual(on.bills, hoarvale.bills);
  assert.equal('mootOpening' in hoarvale, false, 'the input snapshot is not mutated');
  assert.equal('mootOpening' in withHoarvaleMoot(hoarvale, 1, true), false);
  assert.equal('mootOpening' in withHoarvaleHonorsListDay(hoarvale, termMs, true), false);
  assert.equal('mootOpening' in withHoarvaleAuroraNight(hoarvale, termMs, true), false);
  const alone = hoarvaleMootOpeningSnapshot(0, true);
  assert.equal(alone.mootOpening.nextAt, termMs);
  assert.equal('moot' in alone || 'honorsListDay' in alone || 'auroraNight' in alone, false);
  assert.doesNotMatch(JSON.stringify(alone.mootOpening), /Kinward|rite|members/);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding'); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-9), key);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-9), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-9), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 72);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Hoarvale read is unchanged; flag on names the next date; other nations and existing Hoarvale blocks stay put', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000), expected = opening(seconds * 1000);
  const read = options => gov.readGovernment(r.db, 'hoarvale', seconds, 'alice', { readOnly: true, ...options });
  assert.equal(await read({}), null, 'flag off, no assent');
  const alone = await read({ hoarvaleMootOpening: true });
  assert.equal(alone.mootOpening.nextAt, expected); assert.deepEqual(Object.keys(alone.mootOpening), ['nextAt']);
  assert.equal('moot' in alone || 'honorsListDay' in alone || 'auroraNight' in alone, false);
  const off = await read({ hoarvaleAssent: true });
  const on = await read({ hoarvaleAssent: true, hoarvaleMootOpening: true });
  assert.equal('mootOpening' in off, false); assert.equal(on.mootOpening.nextAt, expected);
  const { mootOpening, ...rest } = on; assert.deepEqual(rest, off);
  const mootOnly = await read({ hoarvaleAssent: true, hoarvaleMoot: true });
  const honorsOnly = await read({ hoarvaleAssent: true, hoarvaleHonorsListDay: true });
  const auroraOnly = await read({ hoarvaleAssent: true, hoarvaleAuroraNight: true });
  const all = await read({ hoarvaleAssent: true, hoarvaleMoot: true, hoarvaleHonorsListDay: true, hoarvaleAuroraNight: true, hoarvaleMootOpening: true });
  assert.equal('mootOpening' in mootOnly || 'mootOpening' in honorsOnly || 'mootOpening' in auroraOnly, false);
  assert.deepEqual([all.moot, all.honorsListDay, all.auroraNight, all.mootOpening.nextAt], [mootOnly.moot, honorsOnly.honorsListDay, auroraOnly.auroraNight, expected]);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'fulmara', 'confluence', 'meridian', 'ilmar']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, hoarvaleMootOpening: true });
    assert.equal(other == null || !('mootOpening' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.mootOpening.nextAt, expected); assert.equal('moot' in packed || 'honorsListDay' in packed || 'auroraNight' in packed, false);
  r.setFixtureEnv(key, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_HOARVALE_ASSENT_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_HOARVALE_MOOT_ENABLED: 'true', HARIMU_HOARVALE_HONORS_LIST_DAY_ENABLED: 'true', HARIMU_HOARVALE_AURORA_NIGHT_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual([together.moot, together.honorsListDay, together.auroraNight, together.mootOpening.nextAt], [mootOnly.moot, honorsOnly.honorsListDay, auroraOnly.auroraNight, expected]);
  r.setFixtureEnv(key, 'false');
  const without = (await r.call('citizen', 'alice')).data.government;
  assert.equal('mootOpening' in without, false, 'flag off leaves the Moot, Honors, and Aurora blocks unchanged');
  assert.deepEqual([without.moot, without.honorsListDay, without.auroraNight], [together.moot, together.honorsListDay, together.auroraNight]);
});
