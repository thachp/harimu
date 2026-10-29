/** #1023: docs §17.1 seasons rotate every 7.5 real days (spring, summer, autumn, winter); NEXT_PUBLIC_HARIMU_SEASON_CLOCK gates the HUD readout. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gameSeasonAt, seasonClockEnabled, seasonLengthMs, seasonCycleMs, seasonOrder } from '../lib/game-season.ts';
import { gameTimeCompression } from '../lib/game-time.ts';

const epoch = Date.UTC(2026, 9, 1);
const DAY = 86_400_000;

test('a season is 7.5 real days (90 game days); a cycle is 30 real days, one 360-game-day year', () => {
  assert.equal(seasonLengthMs, 7.5 * DAY);
  assert.equal(seasonCycleMs, 30 * DAY);
  assert.equal(seasonLengthMs * gameTimeCompression / DAY, 90);
});

test('each boundary: last ms of a season, then the next season at exactly 7.5-day multiples', () => {
  for (let i = 0; i < 8; i++) {
    const start = epoch + i * seasonLengthMs;
    const at = gameSeasonAt(epoch, start);
    assert.equal(at.season, seasonOrder[i % 4], `start ${i}`);
    assert.equal(at.next, seasonOrder[(i + 1) % 4]);
    assert.equal(at.remainingMs, seasonLengthMs);
    assert.equal(at.endsAt, start + seasonLengthMs);
    assert.equal(at.year, Math.floor(i / 4) + 1);
    const last = gameSeasonAt(epoch, start + seasonLengthMs - 1);
    assert.equal(last.season, seasonOrder[i % 4]); assert.equal(last.remainingMs, 1);
  }
});

test('a full 30-day cycle visits each season for 7.5 days and rolls winter over to spring of year 2', () => {
  const days = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  for (let h = 0; h < 30 * 24; h++) days[gameSeasonAt(epoch, epoch + h * 3_600_000).season] += 1;
  assert.deepEqual(days, { spring: 180, summer: 180, autumn: 180, winter: 180 });
  const roll = gameSeasonAt(epoch, epoch + seasonCycleMs);
  assert.equal(roll.season, 'spring'); assert.equal(roll.year, 2);
  assert.equal(gameSeasonAt(epoch, epoch + seasonCycleMs - 1).season, 'winter');
});

test('before the epoch it is the first spring; bad input is null', () => {
  const pre = gameSeasonAt(epoch, epoch - DAY);
  assert.equal(pre.season, 'spring'); assert.equal(pre.remainingMs, seasonLengthMs);
  assert.equal(gameSeasonAt(NaN, epoch), null); assert.equal(gameSeasonAt(epoch, Infinity), null);
});

test('flag parsing: only "true" turns the season readout on', () => {
  assert.equal(seasonClockEnabled('true'), true);
  for (const v of ['false', '', undefined, 'TRUE', '1']) assert.equal(seasonClockEnabled(v), false);
});

test('flag off: the HUD clock renders no season markup (readout is gated)', async () => {
  const src = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
  assert.match(src, /\{seasonClockEnabled\(\) && !guestDemo && worldClock && <SeasonReadout /);
  assert.equal(src.match(/<SeasonReadout /g).length, 1);
});

test('preview on, production off', async () => {
  for (const [f, v] of [['wrangler.jsonc', 'true'], ['wrangler.prod.jsonc', 'false']]) {
    const t = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(t, new RegExp(`"NEXT_PUBLIC_HARIMU_SEASON_CLOCK": "${v}"`), f);
  }
});
