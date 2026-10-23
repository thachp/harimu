/** #878: the Kindle cycle start (HARIMU_KINDLE_CYCLE_START_AT) and the Korund and Aurelle transition calendars. Unset or malformed: fail closed, every calendar
 *  is held and the Assembly never opens on its own. Set: dates follow the docs constants. HARIMU_TEST_STORAGE=postgres runs the runtime tests on PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { AURELLE_CALENDAR, KINDLE_CALENDAR, KORUND_CALENDAR, kindleCycleStartAt, realDaysPerGameYear, transitionCalendar } from '../lib/election-calendars.ts';

const DAY = 86400, start = 1_792_368_000, backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';

test('#878 the calendar constants match the docs', () => {
  assert.equal(realDaysPerGameYear, 30, '1 real month = 1 game year');
  assert.deepEqual({ ...KINDLE_CALENDAR }, { cycleDays: 120, foundingElectionDay: 30, assemblyMidtermDay: 60, voteHours: 72 });
  assert.equal(KINDLE_CALENDAR.cycleDays, 4 * realDaysPerGameYear, 'a 4-game-year presidential term');
  assert.deepEqual({ ...KORUND_CALENDAR }, { confirmationDay: 30, congressCycleDays: 150, emergencyUnrest: 65, emergencyUnrestDays: 7 });
  assert.equal(KORUND_CALENDAR.congressCycleDays, 5 * realDaysPerGameYear, 'a Five-Year Plan');
  assert.equal(AURELLE_CALENDAR.claimsDay, 30); assert.deepEqual([...AURELLE_CALENDAR.mortalityGameAge], [70, 90]);
  assert.ok(Object.isFrozen(KINDLE_CALENDAR) && Object.isFrozen(KORUND_CALENDAR) && Object.isFrozen(AURELLE_CALENDAR));
});

test('#878 unset or malformed cycle start fails closed: every calendar is held', () => {
  for (const raw of [undefined, '', ' 1792368000', '1792368000 ', '-5', '0', '1.5', '1e9', 'abc', '1234567890123', 'true'])
    { assert.equal(kindleCycleStartAt({ HARIMU_KINDLE_CYCLE_START_AT: raw }), null, String(raw)); assert.deepEqual(transitionCalendar({ HARIMU_KINDLE_CYCLE_START_AT: raw }, start + 400 * DAY), { status: 'held', reason: 'cycle_start_unset' }); }
  assert.deepEqual(transitionCalendar({}, start), { status: 'held', reason: 'cycle_start_unset' });
  assert.equal(transitionCalendar({ HARIMU_KINDLE_CYCLE_START_AT: String(start) }, 1.5).status, 'held', 'a bad clock is held too');
});

test('#878 set: Kindle, Korund and Aurelle dates follow the constants', () => {
  const b = { HARIMU_KINDLE_CYCLE_START_AT: String(start) };
  const at = d => transitionCalendar(b, start + d * DAY);
  const d0 = at(0);
  assert.equal(d0.status, 'scheduled'); assert.equal(d0.worldDay, 0); assert.equal(d0.kindle.cycle, 0);
  assert.equal(d0.kindle.nextPresidentialAt, start + 30 * DAY); assert.equal(d0.kindle.nextAssemblyAt, start + 60 * DAY); assert.equal(d0.kindle.voteSeconds, 72 * 3600);
  assert.equal(d0.korund.nextCongressAt, start + 30 * DAY); assert.equal(d0.korund.congress, 0);
  assert.equal(d0.aurelle.claimsAt, start + 30 * DAY); assert.equal(d0.aurelle.claimsPublished, false);
  assert.equal(at(30).kindle.nextPresidentialAt, start + 30 * DAY, 'the day itself is still the next date');
  const d31 = at(31); assert.equal(d31.kindle.nextPresidentialAt, start + 150 * DAY); assert.equal(d31.korund.nextCongressAt, start + 180 * DAY); assert.equal(d31.korund.congress, 1); assert.equal(d31.aurelle.claimsPublished, true);
  const d130 = at(130); assert.equal(d130.kindle.cycle, 1); assert.equal(d130.kindle.nextAssemblyAt, start + 180 * DAY); assert.equal(d130.worldDay, 130);
  assert.equal(at(-5).worldDay, -5, 'before the start: scheduled, nothing yet'); assert.equal(at(-5).kindle.nextPresidentialAt, start + 30 * DAY);
});

test('#878 config: preview sets a cycle start near now; production leaves it unset', async () => {
  const preview = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), prod = await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8');
  const value = Number(preview.match(/^\s*"HARIMU_KINDLE_CYCLE_START_AT": "(\d{1,12})",$/m)?.[1]);
  assert.equal(value, start); assert.equal(value % DAY, 0, 'start of a UTC day');
  assert.doesNotMatch(prod, /^\s*"HARIMU_KINDLE_CYCLE_START_AT"/m);
});

async function assemblyRows(t, cycleStart) {
  const r = await localRuntime({ accountElectionBindings: { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_ACCOUNT_ELECTION_POC_ENABLED: 'true' } }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_KINDLE_ASSEMBLY_ENABLED', 'true');
  const now = Math.floor(r.now / 1000);
  if (cycleStart !== undefined) r.setFixtureEnv('HARIMU_KINDLE_CYCLE_START_AT', cycleStart === 'now' ? String(now) : cycleStart);
  for (const d of [0, 61, 200]) { r.setNow((now + d * DAY) * 1000); await r.call('world', null); await r.call('world', null); }
  const n = Number((await r.db.prepare('SELECT COUNT(*) AS n FROM assembly_elections').first()).n);
  return { n, body: (await r.call('assembly', 'alice')).data };
}
test(`#878 ${backend}: with the cycle start unset (or malformed) the Assembly election is held and never opens on its own`, async t => {
  for (const raw of [undefined, 'not-a-date', '0']) {
    const { n, body } = await assemblyRows(t, raw);
    assert.equal(n, 0, `no election row (${raw})`); assert.notEqual(body.status, 'open'); assert.equal(body.nextOpensAt ?? null, null);
  }
});
test(`#878 ${backend}: with the cycle start set the Assembly opens on the calendar`, async t => {
  const { n } = await assemblyRows(t, 'now');
  assert.ok(n >= 1, 'the day-60 election opened');
});
