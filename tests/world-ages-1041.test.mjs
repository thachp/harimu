/** #1041: docs §17.2 an Age is 12 game years [ASSUMPTION], counted from the world epoch. HUD line behind HARIMU_WORLD_AGES_ENABLED. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gameSeasonAt, seasonCycleMs } from '../lib/game-season.ts';
import { gameTimeCompression } from '../lib/game-time.ts';
import { AGE_GAME_YEARS, ageHudLine, ageLengthMs, ageRemainingTip, ageYearMs, worldAgeAt, worldAgesEnabled } from '../lib/world-age.ts';
import { expandFlagPacks, flagOn, varsForProcessEnv } from '../lib/flag-pack.mjs';

const epoch = Date.UTC(2026, 9, 1);
const DAY = 86_400_000;
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));

test('an Age is 12 game years, and a game year is the 30-real-day season cycle', () => {
  assert.equal(AGE_GAME_YEARS, 12);
  assert.equal(ageYearMs, seasonCycleMs);
  assert.equal(ageLengthMs, 12 * 30 * DAY);
  assert.equal(ageLengthMs / DAY, 360, '12 real months at one game year per real month');
  assert.equal(ageYearMs * gameTimeCompression / DAY, 360);
});

test('epoch is Age 1, year 1, with a full Age remaining; before the epoch stays there', () => {
  const at = worldAgeAt(epoch, epoch);
  assert.deepEqual(at, { age: 1, year: 1, startsAt: epoch, endsAt: epoch + ageLengthMs, remainingMs: ageLengthMs });
  assert.equal(ageHudLine(at), 'Age 1, year 1 of 12');
  assert.equal(ageRemainingTip(at.endsAt, epoch), 'Next Age in 360d real · 4320d game');
  const pre = worldAgeAt(epoch, epoch - DAY);
  assert.equal(pre.age, 1); assert.equal(pre.year, 1); assert.equal(pre.remainingMs, ageLengthMs);
  assert.equal(worldAgeAt(NaN, epoch), null); assert.equal(worldAgeAt(epoch, Infinity), null);
});

test('each year boundary inside an Age, and the Age boundary at exactly 12 game years', () => {
  for (let y = 0; y < AGE_GAME_YEARS; y++) {
    const start = epoch + y * ageYearMs;
    const at = worldAgeAt(epoch, start);
    assert.equal(at.age, 1, `year ${y + 1}`); assert.equal(at.year, y + 1);
    assert.equal(ageHudLine(at), `Age 1, year ${y + 1} of 12`);
    const last = worldAgeAt(epoch, start + ageYearMs - 1);
    assert.equal(last.age, 1); assert.equal(last.year, y + 1); assert.equal(last.remainingMs, ageLengthMs - y * ageYearMs - ageYearMs + 1);
  }
  const next = worldAgeAt(epoch, epoch + ageLengthMs);
  assert.equal(next.age, 2); assert.equal(next.year, 1); assert.equal(next.remainingMs, ageLengthMs);
  assert.equal(ageHudLine(next), 'Age 2, year 1 of 12');
  const end = worldAgeAt(epoch, epoch + ageLengthMs - 1);
  assert.equal(end.age, 1); assert.equal(end.year, 12); assert.equal(end.remainingMs, 1);
  assert.equal(worldAgeAt(epoch, epoch + 2 * ageLengthMs).age, 3);
});

test('mid-Age is year 7 of Age 1, halfway through the 12 game years', () => {
  const mid = worldAgeAt(epoch, epoch + 6 * ageYearMs);
  assert.equal(mid.age, 1); assert.equal(mid.year, 7); assert.equal(mid.remainingMs, 6 * ageYearMs);
  assert.equal(ageHudLine(mid), 'Age 1, year 7 of 12');
  assert.equal(ageRemainingTip(mid.endsAt, epoch + 6 * ageYearMs), 'Next Age in 180d real · 2160d game');
  const later = worldAgeAt(epoch, epoch + ageLengthMs + 6 * ageYearMs + ageYearMs / 2);
  assert.equal(later.age, 2); assert.equal(later.year, 7); assert.equal(later.remainingMs, 5.5 * ageYearMs);
});

test('Age year tracks the season clock: season year 13 is Age 2, year 1', () => {
  for (let y = 0; y < 26; y++) {
    const now = epoch + y * seasonCycleMs + 1000;
    const season = gameSeasonAt(epoch, now), age = worldAgeAt(epoch, now);
    assert.equal(age.age, Math.floor((season.year - 1) / AGE_GAME_YEARS) + 1);
    assert.equal(age.year, ((season.year - 1) % AGE_GAME_YEARS) + 1);
  }
});

test('flag off by default; only the packed string "true" turns the HUD on, and a direct string wins', () => {
  assert.equal(worldAgesEnabled(), false, 'flag off');
  for (const value of ['false', '', 'TRUE', '1']) assert.equal(worldAgesEnabled({ HARIMU_WORLD_AGES_ENABLED: value }), false);
  assert.equal(worldAgesEnabled({ HARIMU_UI_PACK: '{' }), false, 'a bad pack is off');
  assert.equal(flagOn({ HARIMU_UI_PACK: JSON.stringify({ HARIMU_WORLD_AGES_ENABLED: 'true' }) }, 'HARIMU_WORLD_AGES_ENABLED'), true);
  assert.equal(worldAgesEnabled({ HARIMU_UI_PACK: { HARIMU_WORLD_AGES_ENABLED: 'true' }, HARIMU_WORLD_AGES_ENABLED: 'false' }), false);
});

test('flag off: the HUD clock renders no Age markup unless the flag is on (readout is gated, guest demo stays hidden)', async () => {
  const src = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
  assert.match(src, /\{worldAgesEnabled\(\) && !guestDemo && worldClock && <AgeReadout /);
  assert.equal(src.match(/<AgeReadout /g).length, 1);
  assert.match(src, /title=\{tip\}/);
  assert.match(src, /<GameTimer compact endsAt=\{age\.endsAt\} label="Next Age in"/);
  assert.match(src, /Age \$\{age\.age\}|ageHudLine\(age\)/);
});

test('preview pack is on, production pack is off, and neither file adds a text binding', async () => {
  const preview = strip(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const prod = strip(await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8'));
  assert.equal(preview.vars.HARIMU_WORLD_AGES_ENABLED, undefined);
  assert.equal(prod.vars.HARIMU_WORLD_AGES_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK.HARIMU_WORLD_AGES_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_UI_PACK.HARIMU_WORLD_AGES_ENABLED, 'false');
  assert.equal(expandFlagPacks(preview.vars).HARIMU_WORLD_AGES_ENABLED, 'true');
  assert.equal(expandFlagPacks(prod.vars).HARIMU_WORLD_AGES_ENABLED, 'false');
  assert.equal(varsForProcessEnv(preview.vars).NEXT_PUBLIC_HARIMU_WORLD_AGES_ENABLED, 'true');
  assert.equal(varsForProcessEnv(prod.vars).NEXT_PUBLIC_HARIMU_WORLD_AGES_ENABLED, 'false');
  assert.equal(preview.vars.NEXT_PUBLIC_HARIMU_WORLD_AGES_ENABLED, undefined);
  assert.equal(prod.vars.NEXT_PUBLIC_HARIMU_WORLD_AGES_ENABLED, undefined);
});
