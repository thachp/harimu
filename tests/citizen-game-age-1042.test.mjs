/** #1042: the player's own citizen card shows age in game years (docs §17.2). Flag NEXT_PUBLIC_HARIMU_CITIZEN_GAME_AGE.
 *  Flag off: no new markup. A missing world clock stays hidden and is never treated as epoch 0. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { gameSeasonAt } from '../lib/game-season.ts';
import { gameDayAt } from '../lib/topbar-countdown.ts';
import { gameYearAt, seasonAt, seasonLengthSeconds } from '../lib/season-yield.ts';
import { citizenGameAge, citizenGameAgeEnabled, citizenGameDaySeconds, citizenYearGameDays, formatCitizenGameAge } from '../lib/citizen-game-age.ts';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const src = readFileSync('app/citizen-game-age.tsx', 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const mod = { exports: {} };
new Function('exports', 'require', js)(mod.exports, name => name === '@/lib/citizen-game-age'
  ? { citizenGameAge, citizenGameAgeEnabled, formatCitizenGameAge } : require(name));
const { CitizenGameAgeLine } = mod.exports;

const epoch = 1_700_000_000;
const year = seasonLengthSeconds * 4;
const joined = epoch + 10;
const clock = now => ({ epochSeconds: epoch, nowSeconds: now });
const age = now => citizenGameAge(clock(now), joined * 1000);
const render = props => renderToStaticMarkup(React.createElement(CitizenGameAgeLine, props));

test('a game year is four integer seasons (30 real days, 360 game days) and matches gameDayAt', () => {
  assert.equal(seasonLengthSeconds, (15 * 86_400) / 2);
  assert.equal(year, 30 * 86_400);
  assert.equal(citizenGameDaySeconds, 7200);
  assert.equal(citizenYearGameDays, 360);
  assert.equal(Number.isInteger(citizenGameDaySeconds) && Number.isInteger(citizenYearGameDays), true);
  assert.equal(gameDayAt(joined, joined + year) - 1, citizenYearGameDays);
  assert.equal(gameDayAt(joined, joined + year - 1) - 1, citizenYearGameDays - 1);
});

test('gameYearAt is seasonAt\'s year: null without a clock, and the same boundary as gameSeasonAt', () => {
  assert.equal(gameYearAt(null), null);
  assert.equal(gameYearAt(undefined), null);
  assert.equal(gameYearAt({}), null);
  assert.equal(gameYearAt({ epochSeconds: epoch, nowSeconds: 1.5 }), null);
  assert.equal(seasonAt(null), null);
  for (const extra of [0, year - 1, year, year + 1, 2 * year - 1, 2 * year]) {
    const at = epoch + extra;
    const on = { epochSeconds: epoch, nowSeconds: at };
    assert.equal(gameYearAt(on), gameSeasonAt(epoch * 1000, at * 1000).year, `year at +${extra}`);
    assert.equal(seasonAt(on), gameSeasonAt(epoch * 1000, at * 1000).season, `season at +${extra}`);
  }
  assert.equal(gameYearAt({ epochSeconds: epoch, nowSeconds: epoch + year - 1 }), 1);
  assert.equal(gameYearAt({ epochSeconds: epoch, nowSeconds: epoch + year }), 2);
});

test('day 0, exactly one game year, the second before it, and a partial year', () => {
  assert.deepEqual(age(joined), { years: 0, days: 0, joinedYear: 1 });
  assert.deepEqual(age(joined + year - 1), { years: 0, days: 359, joinedYear: 1 });
  assert.deepEqual(age(joined + year), { years: 1, days: 0, joinedYear: 1 });
  assert.deepEqual(age(joined + year + 1), { years: 1, days: 0, joinedYear: 1 }, 'one second into the new year is still day 0 of that year');
  assert.deepEqual(age(joined + 2 * year - 1), { years: 1, days: 359, joinedYear: 1 });
  assert.deepEqual(age(joined + 41 * citizenGameDaySeconds), { years: 0, days: 41, joinedYear: 1 });
  assert.deepEqual(age(joined + 3 * year + 41 * citizenGameDaySeconds), { years: 3, days: 41, joinedYear: 1 });
  assert.equal(formatCitizenGameAge({ years: 3, days: 41, joinedYear: 4 }), 'Age in game: 3 years, 41 days (joined game year 4)');
  assert.equal(formatCitizenGameAge({ years: 1, days: 1, joinedYear: 2 }), 'Age in game: 1 year, 1 day (joined game year 2)');
});

test('the join year flips on the exact second, including a join before the epoch', () => {
  const onYear = epoch + year;
  assert.equal(citizenGameAge(clock(onYear), (onYear - 1) * 1000).joinedYear, 1);
  assert.equal(citizenGameAge(clock(onYear), onYear * 1000).joinedYear, 2);
  assert.deepEqual(citizenGameAge(clock(onYear), onYear * 1000), { years: 0, days: 0, joinedYear: 2 });
  const early = epoch - year;
  assert.equal(citizenGameAge(clock(epoch), early * 1000).joinedYear, 1);
  assert.equal(citizenGameAge(clock(epoch + year), early * 1000).years, 2);
});

test('a missing clock is null and is not read as epoch 0', () => {
  const at = Date.parse('2026-10-14T00:00:00.000Z');
  const now = Math.floor(at / 1000);
  assert.equal(citizenGameAge(null, at), null);
  assert.equal(citizenGameAge(undefined, at), null);
  assert.equal(citizenGameAge({}, at), null);
  assert.equal(citizenGameAge({ epochSeconds: null, nowSeconds: now }, at), null);
  assert.equal(citizenGameAge({ nowSeconds: now }, at), null);
  assert.equal(citizenGameAge(clock(now), Number.NaN), null);
  assert.equal(citizenGameAge(clock(joined - 1), joined * 1000), null, 'a join in the future is hidden');
  const explicitZero = citizenGameAge({ epochSeconds: 0, nowSeconds: now }, at);
  assert.ok(explicitZero && explicitZero.joinedYear > 1, 'epoch 0 is a real clock only when the caller passes it');
});

test('flag parsing: only "true" turns the line on', () => {
  assert.equal(citizenGameAgeEnabled('true'), true);
  for (const value of ['false', '', undefined, 'TRUE', '1']) assert.equal(citizenGameAgeEnabled(value), false);
});

test('flag off and guest demo render no markup; flag on renders the age line; no clock renders nothing', () => {
  const enrolledAt = new Date(joined * 1000).toISOString();
  const props = { clock: clock(joined + 3 * year + 41 * citizenGameDaySeconds), enrolledAt };
  assert.equal(render({ ...props, enabled: false }), '');
  assert.equal(render({ ...props, enabled: true, guest: true }), '');
  assert.equal(render({ enabled: true, enrolledAt, clock: null }), '');
  assert.equal(render({ enabled: true, enrolledAt, clock: {} }), '');
  assert.equal(render({ enabled: true, clock: props.clock, enrolledAt: 'not-a-date' }), '');
  assert.equal(render({ enabled: true, ...props }), '<p class="citizen-game-age">Age in game: 3 years, 41 days (joined game year 1)</p>');
});

test('the citizen card paragraph is unchanged and the age line is gated; preview on, production off', () => {
  const page = readFileSync('app/page.tsx', 'utf8');
  assert.match(page, /<p>Your citizen: \{citizenNation\.name\}\. \{citizenshipRuleLabel\(citizenshipStatus,formatTime\)\}<\/p>/);
  assert.match(page, /\{citizenGameAgeEnabled\(\) && !guestActive && <CitizenGameAgeLine clock=\{simulation\?\.clock\} enrolledAt=\{citizenshipStatus\?\.enrolledAt\} \/>/);
  assert.equal(page.match(/<CitizenGameAgeLine /g).length, 1);
  assert.doesNotMatch(page, /CitizenGameAgeLine[^/]*epochSeconds=\{0\}|CitizenGameAgeLine[^/]*\?\? 0/);
  const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
  for (const [file, value] of [['wrangler.jsonc', 'true'], ['wrangler.prod.jsonc', 'false']]) {
    const config = strip(readFileSync(file, 'utf8'));
    assert.equal(config.vars.NEXT_PUBLIC_HARIMU_CITIZEN_GAME_AGE, undefined, `${file}: not its own binding`);
    assert.equal(config.vars.HARIMU_UI_PACK.NEXT_PUBLIC_HARIMU_CITIZEN_GAME_AGE, value, file);
  }
});
