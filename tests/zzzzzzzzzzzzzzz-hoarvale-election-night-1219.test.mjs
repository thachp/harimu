/** #1219: next Election Night ends the current Moot term. Flag off: no electionNight key. #1220, #1241, #1243, #1244, and #1245 follow it in HARIMU_GRAY_PACK. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { MOOT_TERM_SECONDS, hoarvaleElectionNightSnapshot, hoarvaleMootAt, simulateGovernment, withHoarvaleElectionNight } from '../lib/government.ts';
import { HOARVALE_ELECTION_NIGHT_OFFSET_MS, hoarvaleNextElectionNightAt } from '../lib/hoarvale-election-night.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const termMs = MOOT_TERM_SECONDS * 1000, key = 'HARIMU_HOARVALE_ELECTION_NIGHT_ENABLED', night = hoarvaleNextElectionNightAt;
const base = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {}, hoarvaleAssent: true, now: 0 };

test('boundaries, before the anchor, and an exact boundary rolls forward', () => {
  assert.equal(HOARVALE_ELECTION_NIGHT_OFFSET_MS, 0); assert.equal(night.length, 1);
  const boundary = 2 * MOOT_TERM_SECONDS;
  assert.equal(night(boundary * 1000 - 1), boundary * 1000);
  assert.equal(night(boundary * 1000), hoarvaleMootAt(boundary).dissolvesBy * 1000);
  for (const seconds of [-5, -1, 0, 1, MOOT_TERM_SECONDS - 1, MOOT_TERM_SECONDS, MOOT_TERM_SECONDS + 1, NaN]) {
    const nowMs = Number.isFinite(seconds) ? seconds * 1000 : seconds;
    assert.equal(night(nowMs), hoarvaleMootAt(seconds).dissolvesBy * 1000);
    assert.ok(night(nowMs) > (Number.isFinite(nowMs) ? nowMs : 0));
  }
  for (const now of [termMs, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0.9, Infinity]) assert.equal(Number.isSafeInteger(night(now)) && night(now) % termMs === 0, true, String(now));
});

test('flag off leaves the snapshot unchanged; flag on is the next date only', () => {
  const hoarvale = simulateGovernment({ ...base, nationId: 'hoarvale' }), kindle = simulateGovernment({ ...base, nationId: 'kindle' });
  assert.equal(withHoarvaleElectionNight(hoarvale, 0, false), hoarvale);
  assert.equal(withHoarvaleElectionNight(kindle, 0, true), kindle);
  assert.equal(hoarvaleElectionNightSnapshot(0, false), null);
  assert.deepEqual(withHoarvaleElectionNight(hoarvale, 0, true).electionNight, { nextAt: termMs });
  assert.equal('electionNight' in hoarvale, false);
  const alone = hoarvaleElectionNightSnapshot(0, true);
  assert.deepEqual(alone.electionNight, { nextAt: termMs });
  assert.equal('moot' in alone || 'honorsListDay' in alone || 'auroraNight' in alone, false);
  assert.doesNotMatch(JSON.stringify(alone), /candidate|results|count party/i);
});
test('pins, and the read is unchanged with the flag off', async t => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-10), key); assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-10), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-10), key); assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-9), 'HARIMU_VARKAND_RED_ALERT_CANCELS_ENABLED'); assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 76);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false);
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000), expected = night(seconds * 1000);
  const read = extra => gov.readGovernment(r.db, 'hoarvale', seconds, 'alice', { readOnly: true, ...extra });
  assert.equal(await read({}), null);
  assert.equal((await read({ hoarvaleElectionNight: true })).electionNight.nextAt, expected);
  const both = await read({ hoarvaleMootOpening: true, hoarvaleElectionNight: true });
  assert.equal(both.mootOpening.nextAt, expected); assert.equal(both.electionNight.nextAt, expected);
  const shared = { hoarvaleAssent: true, hoarvaleMoot: true, hoarvaleHonorsListDay: true, hoarvaleAuroraNight: true, hoarvaleMootOpening: true };
  const off = await read(shared), on = await read({ ...shared, hoarvaleElectionNight: true });
  const { electionNight, ...rest } = on;
  assert.equal('electionNight' in off, false); assert.equal(off.mootOpening.nextAt, expected);
  assert.equal(electionNight.nextAt, expected); assert.deepEqual(rest, off);
  await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null);
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  assert.equal((await r.call('citizen', 'alice')).data.government.electionNight.nextAt, expected);
  r.setFixtureEnv(key, 'false'); assert.equal((await r.call('citizen', 'alice')).data.government, null);
});
