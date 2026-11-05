/** #1096: Hoarvale Moot term (120 real days) and 7-day investiture deadline on the government read (docs §7.7).
 *  Flag HARIMU_HOARVALE_MOOT_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no moot key. Integer seconds throughout. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { flagOn } from '../lib/flag-pack.mjs';
import { INVESTITURE_DEADLINE_SECONDS, MOOT_INVESTITURE_VOTE_SECONDS, MOOT_TERM_SECONDS, hoarvaleMoot, hoarvaleMootAt, simulateGovernment, withHoarvaleMoot } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const DAY = 86_400;
const FLAG = 'HARIMU_HOARVALE_MOOT_ENABLED';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const E = 10 * MOOT_TERM_SECONDS; // an election instant on the cycle
const keys = ['electedAt', 'dissolvesBy', 'primeMinisterInvestedAt', 'investitureDeadline', 'reservePowersAvailable'];

test('constants are exact integer real days', () => {
  assert.equal(MOOT_TERM_SECONDS, 120 * DAY);
  assert.equal(INVESTITURE_DEADLINE_SECONDS, 7 * DAY);
  assert.equal(MOOT_INVESTITURE_VOTE_SECONDS, DAY);
});

test('dissolvesBy is exactly 120 real days and the deadline exactly 7 real days after electedAt', () => {
  const m = hoarvaleMoot(E, null, E);
  assert.deepEqual(Object.keys(m), keys);
  assert.equal(m.dissolvesBy - m.electedAt, 120 * DAY);
  assert.equal(m.investitureDeadline - m.electedAt, 7 * DAY);
});

test('uninvested: reserve powers are false 1 s before the 7-day deadline and true at it and after', () => {
  const deadline = E + 7 * DAY;
  assert.equal(hoarvaleMoot(E, null, E).reservePowersAvailable, false, 'election instant');
  assert.equal(hoarvaleMoot(E, null, deadline - 1).reservePowersAvailable, false, '1 s before');
  assert.equal(hoarvaleMoot(E, null, deadline).reservePowersAvailable, true, 'at the deadline');
  assert.equal(hoarvaleMoot(E, null, deadline + 1).reservePowersAvailable, true, 'after');
  assert.equal(hoarvaleMoot(E, null, deadline).primeMinisterInvestedAt, null);
});

test('invested: reserve powers stay false, before and after the deadline, even when the PM was invested on the last second', () => {
  const deadline = E + 7 * DAY;
  for (const investedAt of [E, E + DAY, deadline - 1]) {
    for (const now of [deadline - 1, deadline, deadline + 30 * DAY]) {
      const m = hoarvaleMoot(E, investedAt, now);
      assert.equal(m.primeMinisterInvestedAt, investedAt);
      assert.equal(m.reservePowersAvailable, false, `${investedAt} @ ${now}`);
    }
  }
  // An investiture in the future (or before the election, or not an integer) is not one yet.
  assert.equal(hoarvaleMoot(E, deadline + 5, deadline).primeMinisterInvestedAt, null);
  assert.equal(hoarvaleMoot(E, deadline + 5, deadline).reservePowersAvailable, true);
  assert.equal(hoarvaleMoot(E, E - 1, deadline).primeMinisterInvestedAt, null);
  assert.equal(hoarvaleMoot(E, E + 0.5, deadline).primeMinisterInvestedAt, null);
});

test('the live term: 120-day boundary, and the rule-bound PM is invested one day in', () => {
  const end = E + MOOT_TERM_SECONDS;
  const last = hoarvaleMootAt(end - 1);
  assert.equal(last.electedAt, E); assert.equal(last.dissolvesBy, end);
  const next = hoarvaleMootAt(end);
  assert.equal(next.electedAt, end, 'at dissolvesBy the next Moot is elected');
  assert.equal(next.dissolvesBy, end + 120 * DAY);
  assert.equal(next.primeMinisterInvestedAt, null, 'no PM in the first day');
  assert.equal(next.reservePowersAvailable, false);
  assert.equal(hoarvaleMootAt(end + DAY - 1).primeMinisterInvestedAt, null);
  assert.equal(hoarvaleMootAt(end + DAY).primeMinisterInvestedAt, end + DAY);
  assert.equal(hoarvaleMootAt(end + 7 * DAY).reservePowersAvailable, false, 'invested, so no deadlock');
  for (const m of [last, next]) for (const k of keys.slice(0, 4)) if (m[k] !== null) assert.ok(Number.isSafeInteger(m[k]), k);
  assert.equal(hoarvaleMootAt(-5).electedAt, 0); assert.equal(hoarvaleMootAt(Number.NaN).electedAt, 0);
});

test('withHoarvaleMoot: flag off or another nation returns the same snapshot without a moot key', () => {
  const base = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {}, hoarvaleAssent: true, now: E };
  const hoarvale = simulateGovernment({ ...base, nationId: 'hoarvale' });
  assert.equal(withHoarvaleMoot(hoarvale, E, false), hoarvale);
  assert.equal('moot' in hoarvale, false);
  const kindle = simulateGovernment({ ...base, nationId: 'kindle' });
  assert.equal(withHoarvaleMoot(kindle, E, true), kindle);
  const on = withHoarvaleMoot(hoarvale, E + 8 * DAY, true);
  assert.deepEqual(on.moot, hoarvaleMootAt(E + 8 * DAY));
  assert.equal('moot' in hoarvale, false, 'input not mutated');
  assert.deepEqual(publicGovernmentSnapshot(on).moot, on.moot);
  assert.equal('moot' in publicGovernmentSnapshot(hoarvale), false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined); assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, FLAG), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, FLAG), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [FLAG]: 'false' }, FLAG), false);
});

test('citizen read: flag off has no moot key; flag on adds it for Hoarvale only, with no extra query', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const now = E + 3 * DAY;
  r.setNow(now * 1000);
  await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv('HARIMU_HOARVALE_ASSENT_ENABLED', 'true');
  const prepare = r.db.prepare.bind(r.db); let count = 0;
  r.db.prepare = q => { count++; return prepare(q); };
  const off = (await r.call('citizen', 'alice')).data.government;
  const offCount = count; count = 0;
  assert.equal(off.nationId, 'hoarvale'); assert.equal('moot' in off, false, 'flag off');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [FLAG]: 'true' }));
  const on = (await r.call('citizen', 'alice')).data.government;
  assert.equal(count, offCount, 'the moot block costs no query');
  r.db.prepare = prepare;
  assert.deepEqual(on.moot, { electedAt: E, dissolvesBy: E + 120 * DAY, primeMinisterInvestedAt: E + DAY, investitureDeadline: E + 7 * DAY, reservePowersAvailable: false });
  const rest = { ...on }; delete rest.moot; assert.deepEqual(rest, off, 'nothing else changes');
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.ok(!other || !('moot' in other), 'other nations unchanged');
  r.setFixtureEnv(FLAG, 'false');
  assert.equal('moot' in (await r.call('citizen', 'alice')).data.government, false, 'a direct false wins');
});
