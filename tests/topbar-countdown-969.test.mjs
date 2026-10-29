/** #969: top-bar countdown. Flag on in preview, off in production. The chip uses only dates the client already has
 *  (Kindle / Korund / Aurelle calendars, the election snapshot, an active war's defense window or mobilization). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { AURELLE_CALENDAR, KINDLE_CALENDAR, KORUND_CALENDAR, daySeconds } from '../lib/election-calendars.ts';
import { defenseWindowConfig } from '../lib/war-rules.ts';
import { compactCountdown, countdownAccessName, countdownIntervalMs, countdownTip, defenseWindowBoundary, minuteCountdown, nextNationEvent, topbarCountdownEnabled } from '../lib/topbar-countdown.ts';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const DAY = daySeconds, start = 1_700_000_000;
const at = (days, extra = 0) => start + days * DAY + extra;
const event = (nationId, now, extra = {}) => nextNationEvent({ nationId, now, cycleStartAt: start, election: null, wars: null, ...extra });

test('flag is on only for the exact string "true", preview on and production off', async () => {
  assert.equal(topbarCountdownEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1']) assert.equal(topbarCountdownEnabled(value), false);
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_TOPBAR_COUNTDOWN":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_TOPBAR_COUNTDOWN":\s*"false"/);
  const route = await read('app/api/citizen/route.ts');
  assert.match(route, /NEXT_PUBLIC_HARIMU_TOPBAR_COUNTDOWN === 'true' \? kindleCycleStartAt/);
  assert.match(route, /cycleStartAt != null \? \{ cycleStartAt \}/);
  const shell = await read('app/game-shell.tsx');
  assert.match(shell, /topbarCountdownEnabled\(\) && countdown && <TopbarCountdown/);
});

test('every harness that defines RARE_MARKER also defines the countdown flag off by default', async () => {
  for (const file of (await readdir(new URL('../scripts/', import.meta.url))).filter(name => name.endsWith('.mjs'))) {
    const src = await read(`scripts/${file}`);
    if (/process\.env\.NEXT_PUBLIC_HARIMU_RARE_MARKER['"]\s*:/.test(src)) assert.match(src, /process\.env\.NEXT_PUBLIC_HARIMU_TOPBAR_COUNTDOWN['"]\s*:/, `${file} must define TOPBAR_COUNTDOWN`);
  }
});

test('compact chip and tooltip use real time and game time, and name the game day from the world epoch', () => {
  assert.equal(compactCountdown((3 * DAY + 4 * 3600) * 1000), '3d 4h');
  assert.equal(compactCountdown(0), null);
  const mark = { label: 'Election', at: at(30), when: 'opens' };
  const tip = countdownTip(mark, (at(30) - 3 * DAY - 4 * 3600) * 1000, start);
  assert.match(tip, /Election opens\. 3d 4h real time; .* game time\. Game day 361\./);
});

test('Kindle counts down to the election, then its close, then the Assembly; a held calendar invents nothing', () => {
  assert.equal(KINDLE_CALENDAR.foundingElectionDay, 30); assert.equal(KINDLE_CALENDAR.assemblyMidtermDay, 60); assert.equal(KINDLE_CALENDAR.voteHours, 72); assert.equal(KINDLE_CALENDAR.cycleDays, 120);
  assert.equal(KORUND_CALENDAR.confirmationDay, 30); assert.equal(KORUND_CALENDAR.congressCycleDays, 150); assert.equal(AURELLE_CALENDAR.claimsDay, 30);
  assert.equal(defenseWindowConfig.windowSeconds, 4 * 3600);
  assert.deepEqual(event('kindle', at(10)), { label: 'Election', at: at(KINDLE_CALENDAR.foundingElectionDay), when: 'opens' });
  assert.deepEqual(event('kindle', at(30, 3600)), { label: 'Election', at: at(30, KINDLE_CALENDAR.voteHours * 3600), when: 'closes' });
  assert.deepEqual(event('kindle', at(34)), { label: 'Assembly', at: at(KINDLE_CALENDAR.assemblyMidtermDay), when: 'opens' });
  assert.equal(event('kindle', at(10), { cycleStartAt: null }), null);
  assert.equal(nextNationEvent({ nationId: 'meridian', now: at(10), cycleStartAt: start }), null);
  assert.deepEqual(event('kindle', at(10), { cycleStartAt: null, election: { opensAt: null, closesAt: at(12) } }), { label: 'Election', at: at(12), when: 'closes' });
});

test('Korund counts down to Congress and Aurelle to Claims, and a published claims date is not shown', () => {
  assert.deepEqual(event('korund', at(10)), { label: 'Congress', at: at(30), when: 'opens' });
  assert.deepEqual(event('aurelle', at(10)), { label: 'Claims', at: at(30), when: 'opens' });
  assert.equal(event('aurelle', at(40)), null);
});

test('the accessible name states real time and game time, and it does not change within a minute', () => {
  const mark = { label: 'Election', at: at(30), when: 'opens' };
  const now = (at(30) - 3 * DAY - 4 * 3600 - 40) * 1000;
  assert.equal(countdownAccessName(mark, now, start), countdownAccessName(mark, now + 30_000, start));
  assert.match(countdownAccessName(mark, now, start), /Election in 3d 4h\. 3d 4h real time; 38d game time\. Game day 361\./);
  assert.equal(minuteCountdown(40_000), 'under 1m');
  assert.equal(minuteCountdown(90_000), '1m');
  assert.equal(countdownIntervalMs(false), 1000);
  assert.equal(countdownIntervalMs(true), 60_000);
});

test('the chip is a timer with no live announcements, hidden with the flag off or with no event, and reduced motion does not animate it', async () => {
  const ui = await read('app/topbar-countdown.tsx');
  assert.match(ui, /role="timer"/);
  assert.match(ui, /aria-live="off"/);
  assert.doesNotMatch(ui, /aria-live="polite"/);
  assert.match(ui, /if \(!topbarCountdownEnabled\(\)\) return null/);
  assert.match(ui, /if \(!mark \|\| !compact/);
  assert.match(ui, /countdownIntervalMs\(motionReduced\(\)\)/);
  assert.match(await read('app/game-shell.css'), /@media\(prefers-reduced-motion:reduce\)\{\.game-countdown\{animation:none;transition:none\}\}/);
  assert.match(await read('app/game-shell.css'), /html\[data-harimu-reduced-motion\] \.game-countdown\{animation:none;transition:none\}/);
});

test('an active war defense window or mobilization end wins when it is sooner, and an ended war does not', () => {
  const now = at(10, 3 * 3600);
  const boundary = defenseWindowBoundary(5, now);
  assert.equal(boundary.when, 'opens');
  assert.ok(boundary.at - now < DAY);
  const wars = { wars: [{ attacker: 'korund', defender: 'kindle', status: 'active', mobilizationEndsAt: at(9), endedAt: null }], defenseWindows: { kindle: { startHourUtc: 5 } } };
  assert.deepEqual(event('kindle', now, { wars }), { label: 'Defense', at: boundary.at, when: 'opens' });
  const ended = { wars: [{ ...wars.wars[0], status: 'ended', endedAt: at(9) }], defenseWindows: wars.defenseWindows };
  assert.deepEqual(event('kindle', now, { wars: ended }), { label: 'Election', at: at(30), when: 'opens' });
  const mobilizing = { wars: [{ attacker: 'kindle', defender: 'aurelle', status: 'mobilizing', mobilizationEndsAt: now + 3600, endedAt: null }] };
  assert.deepEqual(event('kindle', now, { wars: mobilizing }), { label: 'Mobilization', at: now + 3600, when: 'ends' });
});
