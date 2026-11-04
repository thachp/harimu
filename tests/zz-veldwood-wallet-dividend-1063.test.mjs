/** #1063: Veldwood top-bar wallet counts down to Dividend Day. Other nations, and the flag off, keep today's chip.
 *  The zz- prefix sorts this file last. Node's --test-shard is round-robin, so a mid-alphabet file moves later files
 *  between the four Postgres shards and the slowest one passes the 45-minute job limit. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expandFlagPacks, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { dividendTarget, nextDividendDayAt, spokenRemaining, veldwoodWalletDividend, veldwoodWalletDividendEnabled, veldwoodWalletHelp, veldwoodWalletName } from '../lib/veldwood-wallet-dividend.ts';
import { loadApp } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_VELDWOOD_WALLET_DIVIDEND';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const year = 30 * 86400, epoch = 1_700_000_000, at = epoch + year;
const nowMs = (remain) => (at - remain) * 1000;
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const { GameShell } = await loadApp('game-shell');
const nation = id => ({ id, name: id[0].toUpperCase() + id.slice(1) });
const shell = (id, remain, clock = { epochSeconds: epoch, dividendDayAt: at }) => renderToStaticMarkup(React.createElement(GameShell, {
  view: 'square', nation: nation(id), citizenNation: nation(id), nations: [], capacity: 18, localDemo: false, panel: null, onNavigate() {},
  currencyCode: id === 'korund' ? 'LN' : id === 'aurelle' ? 'CRN' : 'SPK', walletMinor: 800, worldClock: clock, dividendNow: nowMs(remain),
}));
const plain = html => {
  assert.doesNotMatch(html, /Dividend Day|game-wallet-dividend/);
  assert.match(html, /Your (SPK|LN|CRN) wallet holds national money\. Amounts update after completed transactions/);
};

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(veldwoodWalletDividendEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(veldwoodWalletDividendEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true');
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_VELDWOOD_WALLET_DIVIDEND/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_VELDWOOD_WALLET_DIVIDEND/);
  assert.match(await read('lib/flag-pack.mjs'), /HARIMU_UI_PACK: \[.*NEXT_PUBLIC_HARIMU_VELDWOOD_WALLET_DIVIDEND/);
  assert.match(await read('lib/world-simulation.ts'), /dividendDayAt = nextDividendDayAt\(epoch, now\)/);
  assert.match(await read('scripts/hud-layout-check.mjs'), /checkVeldwoodWalletDividend/);
  const ui = await read('app/veldwood-wallet-dividend.tsx');
  assert.doesNotMatch(ui, /aria-live|aria-label/);
  assert.match(await read('app/game-shell.tsx'), /name=\{walletName\}/);
});

test('the countdown uses the year boundary, says one of a unit in the singular, and the name stays put for a minute', () => {
  assert.equal(nextDividendDayAt(epoch, epoch + 10), at);
  assert.equal(dividendTarget(at, at + 10), at + year);
  assert.equal(spokenRemaining(86_400_000), '1 day');
  assert.equal(spokenRemaining(2 * 86_400_000), '2 days');
  assert.equal(spokenRemaining(3_600_000), '1 hour');
  assert.equal(spokenRemaining(7_200_000), '2 hours');
  assert.equal(spokenRemaining(60_000), '1 minute');
  assert.equal(spokenRemaining(120_000), '2 minutes');
  assert.equal(spokenRemaining(86_400_000 + 3_600_000), '1 day 1 hour');
  const day = veldwoodWalletDividend('veldwood', at, nowMs(86400), epoch, true);
  assert.equal(day.text, 'Dividend Day in 1 day · 12d game');
  assert.equal(day.real, '1 day'); assert.equal(day.game, '12 days'); assert.match(day.gameDay, /Game day 361/);
  assert.equal(veldwoodWalletName(800, 'SPK', day), 'Wallet, 8.00 SPK. Dividend Day in 1 day. 1 day real time; 12 days game time. Game day 361. Dividend Day pays the Citizen Dividend equally to citizens.');
  assert.match(veldwoodWalletHelp('SPK', day), /Dividend Day pays the Citizen Dividend equally to citizens\. 1 day real time; 12 days game time\. Game day 361\./);
  const two = veldwoodWalletDividend('veldwood', at, nowMs(2 * 86400), epoch, true);
  assert.equal(two.text, 'Dividend Day in 2 days · 24d game'); assert.equal(two.game, '24 days');
  const hour = veldwoodWalletDividend('veldwood', at, nowMs(3600), epoch, true);
  assert.equal(hour.text, 'Dividend Day in 1 hour · 12h game'); assert.equal(hour.real, '1 hour'); assert.equal(hour.game, '12 hours');
  const hours = veldwoodWalletDividend('veldwood', at, nowMs(7200), epoch, true);
  assert.equal(hours.real, '2 hours'); assert.equal(hours.game, '1 day');
  const minute = veldwoodWalletDividend('veldwood', at, nowMs(60), epoch, true);
  assert.equal(minute.real, '1 minute'); assert.equal(minute.game, '12 minutes');
  const long = veldwoodWalletDividend('veldwood', at, nowMs(3 * 86400 + 4 * 3600 + 40), epoch, true);
  assert.equal(long.text, 'Dividend Day in 3 days 4 hours · 38d game');
  const later = veldwoodWalletDividend('veldwood', at, nowMs(3 * 86400 + 4 * 3600 + 40) + 30_000, epoch, true);
  assert.equal(later.text, long.text);
  assert.equal(veldwoodWalletName(800, 'SPK', later), veldwoodWalletName(800, 'SPK', long));
  assert.equal(veldwoodWalletDividend('veldwood', at, nowMs(86400), epoch, false), null);
  assert.equal(veldwoodWalletDividend('kindle', at, nowMs(86400), epoch, true), null);
  assert.equal(veldwoodWalletDividend('korund', at, nowMs(86400), epoch, true), null);
  assert.equal(veldwoodWalletDividend('aurelle', at, nowMs(86400), epoch, true), null);
  assert.equal(veldwoodWalletDividend('veldwood', null, nowMs(86400), epoch, true), null);
  assert.equal(veldwoodWalletDividend('veldwood', 1.5, nowMs(86400), epoch, true), null);
  assert.equal(veldwoodWalletHelp('SPK', null), 'Your SPK wallet holds national money. Amounts update after completed transactions; loading means the citizen snapshot has not arrived.');
});

test('a Veldwood citizen sees Dividend Day; other nations and the flag off keep today\'s chip', () => {
  const shown = withFlag('true', () => shell('veldwood', 86400));
  assert.match(shown, /game-wallet-dividend/);
  assert.match(shown, /SPK<span class="game-wallet-dividend-word"> ·<\/span><span class="game-wallet-dividend-word"> Dividend<\/span><span class="game-wallet-dividend-word"> Day<\/span><span class="game-wallet-dividend-word"> in<\/span><span class="game-wallet-dividend-word"> 1<\/span><span class="game-wallet-dividend-word"> day<\/span>/);
  assert.doesNotMatch(shown, /1 days|1 hours|1 minutes/);
  assert.match(shown, /aria-label="Wallet, 8\.00 SPK\. Dividend Day in 1 day\. 1 day real time; 12 days game time\. Game day 361\. Dividend Day pays the Citizen Dividend equally to citizens\."/);
  const two = withFlag('true', () => shell('veldwood', 2 * 86400));
  assert.match(two, /2 days/); assert.doesNotMatch(two, /1 days/);
  assert.match(two, /2 days real time; 24 days game time/);
  const hour = withFlag('true', () => shell('veldwood', 3600));
  assert.match(hour, /1 hour/); assert.doesNotMatch(hour, /1 hours/);
  assert.match(hour, /1 hour real time; 12 hours game time/);
  const hours = withFlag('true', () => shell('veldwood', 7200));
  assert.match(hours, /2 hours real time; 1 day game time/); assert.doesNotMatch(hours, /1 days|2 hour</);
  for (const html of [
    withFlag('true', () => shell('kindle', 86400)),
    withFlag('true', () => shell('korund', 86400)),
    withFlag('true', () => shell('aurelle', 86400)),
    withFlag('true', () => shell('veldwood', 86400, { epochSeconds: epoch })),
    withFlag('false', () => shell('veldwood', 86400)),
    withFlag(undefined, () => shell('veldwood', 86400)),
  ]) plain(html);
});
