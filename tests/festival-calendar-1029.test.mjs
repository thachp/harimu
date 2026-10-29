/** #1029: docs §17.1 festivals are scheduled in game time; the HUD shows the citizen nation's next one behind NEXT_PUBLIC_HARIMU_FESTIVAL_CALENDAR. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { festivalCalendarEnabled, nationFestivalSlots, nextFestivalAt, seasonCycleMs } from '../lib/game-season.ts';
import { mvpFestivalCopy } from '../lib/mvp-festival-copy.ts';

const DAY = 86_400_000, GAME_DAY = DAY / 12, YEAR = 30 * DAY;
const epoch = YEAR * 700; // a world epoch on a game-year boundary, so both clocks line up in these tests

test('faith festival days and names match lib/festivals.ts and the MVP copy', async () => {
  const src = await readFile(new URL('../lib/festivals.ts', import.meta.url), 'utf8');
  const days = Object.fromEntries([...src.matchAll(/'([a-z-]+)': (\d+)/g)].map(m => [m[1], Number(m[2])]));
  const byName = Object.fromEntries(mvpFestivalCopy.map(c => [c.name, days[c.id]]));
  for (const slot of nationFestivalSlots.kindle) assert.equal(slot.dayOfYear, byName[slot.name], slot.name);
  assert.equal(nationFestivalSlots.kindle.length, 6);
  assert.deepEqual(nationFestivalSlots.aurelle.map(s => s.name).sort(), ['Night of Names', 'Oath Day']);
  assert.deepEqual(nationFestivalSlots.korund, []);
});

test('Kindle across a full 30-real-day year: each pick is the next one, in its season, then the year rolls over', () => {
  const seen = [];
  for (let h = 0; h < 30 * 24; h++) {
    const now = epoch + h * 3_600_000, f = nextFestivalAt('kindle', epoch, now);
    assert.ok(f.endsAt > now && f.startsAt - now < 60 * GAME_DAY + 1);
    if (seen.at(-1)?.name !== f.name) seen.push({ name: f.name, season: f.season });
  }
  assert.deepEqual(seen.map(s => s.name), ['Launching', 'Oath Day', 'Bread Day', 'Safe Return', 'Night of Names', 'Day of the Open Door', 'Launching']);
  assert.deepEqual(seen.map(s => s.season), ['spring', 'summer', 'summer', 'autumn', 'winter', 'winter', 'spring']);
  const roll = nextFestivalAt('kindle', epoch, epoch + 331 * GAME_DAY);
  assert.equal(roll.name, 'Launching'); assert.equal(roll.startsAt, epoch + seasonCycleMs + 30 * GAME_DAY);
});

test('active on its game day, next one after it ends', () => {
  const start = epoch + 90 * GAME_DAY;
  assert.deepEqual(nextFestivalAt('aurelle', epoch, start + 1), { name: 'Oath Day', startsAt: start, endsAt: start + GAME_DAY, season: 'summer', active: true });
  assert.equal(nextFestivalAt('aurelle', epoch, start + GAME_DAY).name, 'Night of Names');
});

test('national festivals use the world epoch; no schedule or bad input is null', () => {
  const e = epoch + 5 * DAY + 123;
  const a = nextFestivalAt('hoarvale', e, e);
  assert.equal(a.name, 'Aurora Night'); assert.equal(a.season, 'winter'); assert.equal(a.startsAt, e + 315 * GAME_DAY);
  assert.equal(nextFestivalAt('confluence', e, e).season, 'autumn');
  assert.equal(nextFestivalAt('korund', epoch, epoch), null); assert.equal(nextFestivalAt('meridian', epoch, epoch), null);
  assert.equal(nextFestivalAt('kindle', NaN, epoch), null);
});

test('flag parsing, gating and no aria-label on the readouts', async () => {
  assert.equal(festivalCalendarEnabled('true'), true);
  for (const v of ['false', '', undefined, 'TRUE']) assert.equal(festivalCalendarEnabled(v), false);
  const src = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
  assert.match(src, /\{festivalCalendarEnabled\(\) && !guestDemo && worldClock && citizenNation && <FestivalReadout /);
  assert.equal(src.match(/<FestivalReadout /g).length, 1);
  assert.doesNotMatch(src, /<small className="game-clock-(season|festival)" aria-label/);
});

test('preview on, production off', async () => {
  for (const [f, v] of [['wrangler.jsonc', 'true'], ['wrangler.prod.jsonc', 'false']]) {
    const t = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(t, new RegExp(`"NEXT_PUBLIC_HARIMU_FESTIVAL_CALENDAR": "${v}"`), f);
  }
});
