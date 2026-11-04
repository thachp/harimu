/** #1055: Korund top-bar wallet shows this week's food coupons only for a Korund citizen with a loaded plan. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expandFlagPacks, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { couponCountWords, korundWalletHelp, korundWalletName, korundWalletRations, korundWalletRationsEnabled } from '../lib/korund-wallet-rations.ts';
import { loadApp } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_KORUND_WALLET_RATIONS';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const { GameShell } = await loadApp('game-shell');
const nation = id => ({ id, name: id[0].toUpperCase() + id.slice(1) });
const coupons = (remaining, expiresAt = '2099-01-01T00:00:00.000Z') => ({ couponFoodRemaining: remaining, couponExpiresAt: expiresAt });
const shell = (id, korundCoupons, currency = id === 'korund' ? 'LN' : id === 'aurelle' ? 'CRN' : 'SPK') => renderToStaticMarkup(React.createElement(GameShell, {
  view: 'square', nation: nation(id), citizenNation: nation(id), nations: [], capacity: 18, localDemo: false, panel: null, onNavigate() {},
  currencyCode: currency, walletMinor: 800, korundCoupons,
}));
const unchanged = html => {
  assert.doesNotMatch(html, /game-wallet-ration|food coupon|expired/);
  assert.match(html, /Your (SPK|LN|CRN) wallet holds national money\. Amounts update after completed transactions/);
};

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(korundWalletRationsEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(korundWalletRationsEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true');
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_KORUND_WALLET_RATIONS/);
  assert.match(await read('lib/flag-pack.mjs'), /HARIMU_UI_PACK: \[.*NEXT_PUBLIC_HARIMU_KORUND_WALLET_RATIONS/);
  assert.match(await read('scripts/hud-layout-check.mjs'), /checkKorundWalletRations/);
  assert.match(await read('app/page.tsx'), /korundCoupons=\{citizenNation\?\.id === 'korund' && korundPlan \? \{ couponFoodRemaining: korundPlan\.couponFoodRemaining, couponExpiresAt: korundPlan\.couponExpiresAt \}/);
});

test('the line matches the plan count, says that count in words, and says expired when the week has ended', () => {
  const now = Date.parse('2026-06-01T00:00:00.000Z');
  assert.equal(couponCountWords(0), 'zero'); assert.equal(couponCountWords(3), 'three'); assert.equal(couponCountWords(21), 'twenty one');
  const live = korundWalletRations('korund', coupons(3), now, true);
  assert.equal(live.text, '3 food coupons'); assert.equal(live.words, 'three food coupons'); assert.equal(live.expired, false);
  const one = korundWalletRations('korund', coupons(1), now, true);
  assert.equal(one.text, '1 food coupon'); assert.equal(one.words, 'one food coupon');
  assert.equal(korundWalletRations('korund', coupons(0), now, true).text, '0 food coupons');
  const ended = korundWalletRations('korund', coupons(3, '2026-06-01T00:00:00.000Z'), now, true);
  assert.equal(ended.expired, true); assert.equal(ended.text, 'expired'); assert.equal(ended.words, 'three food coupons');
  assert.equal(korundWalletName(800, 'LN', live), 'Wallet, 8.00 Labor Notes. Three food coupons.');
  assert.equal(korundWalletName(800, 'LN', ended), 'Wallet, 8.00 Labor Notes. Three food coupons, expired.');
  assert.match(korundWalletHelp('LN', live), /Remaining food coupons this week: three food coupons\./);
  assert.match(korundWalletHelp('LN', ended), /three food coupons, expired\./);
  assert.equal(korundWalletHelp('LN', null), "Your LN wallet holds national money. Amounts update after completed transactions; loading means the citizen snapshot has not arrived.");
  assert.equal(korundWalletRations('korund', coupons(3), now, false), null);
  assert.equal(korundWalletRations('kindle', coupons(3), now, true), null);
  assert.equal(korundWalletRations('aurelle', coupons(3), now, true), null);
  assert.equal(korundWalletRations('korund', null, now, true), null);
  assert.equal(korundWalletRations('korund', coupons(1.5), now, true), null);
  assert.equal(korundWalletRations('korund', { couponFoodRemaining: 3, couponExpiresAt: 'not-a-date' }, now, true), null);
});

test("Korund with plan data shows the coupon count; Korund with no plan, and every other nation, keep today's chip", () => {
  const shown = withFlag('true', () => shell('korund', coupons(3)));
  assert.match(shown, /game-wallet-rations/);
  assert.match(shown, /LN<span class="game-wallet-ration"> ·<\/span><span class="game-wallet-ration"> 3<\/span><span class="game-wallet-ration"> food<\/span><span class="game-wallet-ration"> coupons<\/span>/);
  assert.match(shown, /aria-label="Wallet, 8\.00 Labor Notes\. Three food coupons\."/);
  const one = withFlag('true', () => shell('korund', coupons(1)));
  assert.match(one, /LN<span class="game-wallet-ration"> ·<\/span><span class="game-wallet-ration"> 1<\/span><span class="game-wallet-ration"> food<\/span><span class="game-wallet-ration"> coupon<\/span>/);
  assert.doesNotMatch(one, /game-wallet-ration"> coupons</);
  assert.match(one, /aria-label="Wallet, 8\.00 Labor Notes\. One food coupon\."/);
  assert.match(shown, /Remaining food coupons this week: three food coupons\./);
  const ended = withFlag('true', () => shell('korund', coupons(2, '2000-01-01T00:00:00.000Z')));
  assert.match(ended, /game-wallet-ration"> expired</);
  assert.match(ended, /aria-label="Wallet, 8\.00 Labor Notes\. Two food coupons, expired\."/);
  assert.doesNotMatch(ended, /food<\/span>/);
  const kindle = withFlag('true', () => shell('kindle', coupons(3), 'SPK'));
  const aurelle = withFlag('true', () => shell('aurelle', coupons(3), 'CRN'));
  const gauge = withFlag('true', () => shell('gauge', coupons(3), 'SPK'));
  const missing = withFlag('true', () => shell('korund', undefined));
  const off = withFlag('false', () => shell('korund', coupons(3)));
  const unset = withFlag(undefined, () => shell('korund', coupons(3)));
  for (const html of [kindle, aurelle, gauge, missing, off, unset]) unchanged(html);
  assert.match(kindle, />SPK</); assert.match(aurelle, />CRN</); assert.match(missing, />LN</); assert.match(off, />LN</);
});
