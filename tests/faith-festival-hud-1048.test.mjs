/** #1048: HUD lists the next faith festival with the nation's #68 stance. Flag off leaves the clock unchanged. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { faithFestivalSlots, nextFestivalAt } from '../lib/game-season.ts';
import { faithFestivalHudEnabled, faithFestivalHudLine, nextFaithFestivalAt } from '../lib/faith-festival-hud.ts';
import { festivalStanceCopy, mvpFestivalCopy } from '../lib/mvp-festival-copy.ts';
import { faithFestivalCopy } from '../lib/festival-copy.ts';
import { expandFlagPacks, flagOn, varsForProcessEnv } from '../lib/flag-pack.mjs';

const DAY = 86_400_000 / 12;
const at = day => day * DAY + 1;
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));

test('scheduled faith festivals reuse #68 days and #209/#270 names', async () => {
  const src = await readFile(new URL('../lib/festivals.ts', import.meta.url), 'utf8');
  const days = Object.fromEntries([...src.matchAll(/'([a-z-]+)': (\d+)/g)].map(m => [m[1], Number(m[2])]));
  assert.match(src, /festivalStance, type FestivalStance \} from '\.\/festival-stance\.ts'/);
  assert.equal(faithFestivalSlots.length, 6);
  for (const slot of faithFestivalSlots) {
    assert.equal(slot.dayOfYear, days[slot.id], slot.id);
    const mvp = mvpFestivalCopy.find(c => c.id === slot.id);
    const copy = faithFestivalCopy[slot.faithId].find(c => c.id === slot.id);
    assert.equal(slot.name, mvp.name);
    assert.equal(slot.faithId, mvp.faithId);
    assert.equal(slot.name, copy.name);
  }
});

test('one endorsed, one tolerated and one banned faith festival for a nation', () => {
  const aurelle = nextFaithFestivalAt('aurelle', at(90));
  assert.equal(aurelle.name, 'Oath Day');
  assert.equal(aurelle.dayOfYear, 90);
  assert.equal(aurelle.stance, 'endorsed');
  assert.equal(aurelle.stanceLabel, 'Endorsed (public holiday)');
  assert.equal(aurelle.active, true);
  assert.equal(aurelle.tip, festivalStanceCopy.aurelle.endorsed.text);
  assert.equal(faithFestivalHudLine(aurelle), 'Next faith festival: Oath Day · day 90 · Endorsed (public holiday) · today');

  const tolerated = nextFaithFestivalAt('aurelle', at(30));
  assert.equal(tolerated.name, 'Launching');
  assert.equal(tolerated.dayOfYear, 30);
  assert.equal(tolerated.stance, 'tolerated');
  assert.equal(tolerated.stanceLabel, 'Tolerated');
  assert.equal(tolerated.tip, festivalStanceCopy.aurelle.tolerated.text);
  assert.equal(faithFestivalHudLine(tolerated), 'Next faith festival: Launching · day 30 · Tolerated · today');

  const banned = nextFaithFestivalAt('korund', at(30));
  assert.equal(banned.name, 'Launching');
  assert.equal(banned.dayOfYear, 30);
  assert.equal(banned.stance, 'banned');
  assert.equal(banned.stanceLabel, 'Banned');
  assert.equal(banned.tip, festivalStanceCopy.korund.banned.text);
  assert.equal(faithFestivalHudLine(banned), 'Next faith festival: Launching · day 30 · Banned · today');

  assert.equal(nextFaithFestivalAt('kindle', at(90)).stance, 'tolerated');
  assert.equal(nextFaithFestivalAt('hoarvale', at(30)), null);
  assert.equal(nextFaithFestivalAt('aurelle', NaN), null);
});

test('the faith festival clock matches #1029 and ignores a shifted world epoch', () => {
  const now = at(80);
  const faith = nextFaithFestivalAt('kindle', now);
  const national = nextFestivalAt('kindle', 5 * 86_400_000, now);
  assert.equal(faith.name, 'Oath Day');
  assert.equal(faith.startsAt, national.startsAt);
  assert.equal(faith.endsAt, national.endsAt);
  assert.equal(faith.active, false);
  assert.equal(nextFaithFestivalAt('korund', now).name, 'Oath Day');
  assert.equal(nextFestivalAt('korund', 0, now), null);
});

test('flag off by default; only the packed string "true" turns the HUD on, and a direct string wins', () => {
  assert.equal(faithFestivalHudEnabled(), false, 'flag off');
  for (const value of ['false', '', 'TRUE', '1']) assert.equal(faithFestivalHudEnabled({ HARIMU_FAITH_FESTIVAL_HUD_ENABLED: value }), false);
  assert.equal(faithFestivalHudEnabled({ HARIMU_UI_PACK: '{' }), false, 'a bad pack is off');
  assert.equal(flagOn({ HARIMU_UI_PACK: JSON.stringify({ HARIMU_FAITH_FESTIVAL_HUD_ENABLED: 'true' }) }, 'HARIMU_FAITH_FESTIVAL_HUD_ENABLED'), true);
  assert.equal(faithFestivalHudEnabled({ HARIMU_UI_PACK: { HARIMU_FAITH_FESTIVAL_HUD_ENABLED: 'true' }, HARIMU_FAITH_FESTIVAL_HUD_ENABLED: 'false' }), false);
});

test('the server reads the pack and the shell takes a prop; no browser bundle reads process for this flag', async () => {
  const shell = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const route = await readFile(new URL('../app/api/world/route.ts', import.meta.url), 'utf8');
  const helper = await readFile(new URL('../lib/faith-festival-hud.ts', import.meta.url), 'utf8');
  assert.match(route, /faithFestivalHud: flagOn\(env, 'HARIMU_FAITH_FESTIVAL_HUD_ENABLED'\)/);
  assert.match(page, /setFaithFestivalHud\(data\.faithFestivalHud === true\)/);
  assert.match(page, /faithFestivalHud=\{faithFestivalHud\}/);
  assert.match(shell, /\{faithFestivalHud && !guestDemo && worldClock && citizenNation && <FaithFestivalReadout /);
  assert.equal(shell.match(/<FaithFestivalReadout /g).length, 1);
  assert.doesNotMatch(shell, /faithFestivalHudEnabled\(/);
  assert.doesNotMatch(`${shell}\n${helper}\n${page}`, /process\.env\.NEXT_PUBLIC_HARIMU_FAITH_FESTIVAL_HUD_ENABLED|process\.env\.HARIMU_FAITH_FESTIVAL_HUD_ENABLED/);
  assert.match(shell, /title=\{f\.tip \?\? undefined\}/);
  assert.match(shell, /faithFestivalHudLine\(f\)/);
});

test('preview pack is on, production pack is off, and neither file adds a text binding', async () => {
  const preview = strip(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const prod = strip(await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8'));
  assert.equal(preview.vars.HARIMU_FAITH_FESTIVAL_HUD_ENABLED, undefined);
  assert.equal(prod.vars.HARIMU_FAITH_FESTIVAL_HUD_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK.HARIMU_FAITH_FESTIVAL_HUD_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_UI_PACK.HARIMU_FAITH_FESTIVAL_HUD_ENABLED, 'false');
  assert.equal(expandFlagPacks(preview.vars).HARIMU_FAITH_FESTIVAL_HUD_ENABLED, 'true');
  assert.equal(expandFlagPacks(prod.vars).HARIMU_FAITH_FESTIVAL_HUD_ENABLED, 'false');
  assert.equal(varsForProcessEnv(preview.vars).NEXT_PUBLIC_HARIMU_FAITH_FESTIVAL_HUD_ENABLED, undefined);
  assert.equal(varsForProcessEnv(prod.vars).HARIMU_FAITH_FESTIVAL_HUD_ENABLED, undefined);
  assert.equal(preview.vars.NEXT_PUBLIC_HARIMU_FAITH_FESTIVAL_HUD_ENABLED, undefined);
  assert.equal(prod.vars.NEXT_PUBLIC_HARIMU_FAITH_FESTIVAL_HUD_ENABLED, undefined);
});
