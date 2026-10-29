/** #970: Korund ration coupons render as a stamped booklet only when NEXT_PUBLIC_HARIMU_KORUND_RATION_BOOKLET is exactly "true". */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyRationCut, buildCoupons, korundRationBookletEnabled, korundRationCut } from '../lib/korund-coupons.ts';
import { nationThemes } from '../lib/nation-themes.ts';
import { componentModule } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const { CouponBook } = await import(await componentModule(fileURLToPath(new URL('../app/korund-plan-panel.tsx', import.meta.url))));
const key = 'NEXT_PUBLIC_HARIMU_KORUND_RATION_BOOKLET';
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const book = (coupons, now = Date.parse('2026-06-01T00:00:00.000Z')) => renderToStaticMarkup(React.createElement(CouponBook, {
  now, gameWeek: 4, coupons, walletMinor: 800, clothing: 1, goods: 0, reason: null, onRedeem() {}, onFood() {},
}));
const open = buildCoupons(false, new Set(['clothing']), '2099-01-01T00:00:00.000Z');

test('flag is on only for the exact string "true", preview on and production off', async () => {
  assert.equal(korundRationBookletEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(korundRationBookletEnabled(value), false);
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_KORUND_RATION_BOOKLET":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_KORUND_RATION_BOOKLET":\s*"false"/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_KORUND_RATION_BOOKLET/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_KORUND_RATION_BOOKLET/);
  assert.match(await read('app/korund-plan-panel.tsx'), /gameWeek=\{plan\.gameWeek\}/);
  assert.match(await read('scripts/hud-layout-check.mjs'), /checkKorundRationBooklet/);
});

test('booklet styles use Korund nation tokens and do not animate', async () => {
  const css = await read('app/globals.css');
  const block = css.slice(css.indexOf('/* #970'), css.indexOf('/* Greyed-out'));
  assert.ok(block.includes('korund-booklet-stamp') && block.includes('--nation-accent') && block.includes('--nation-paper'));
  assert.doesNotMatch(block, /\b(animation|transition)\s*:/);
  const theme = nationThemes.korund;
  assert.equal(theme.document, 'Ration booklet');
  assert.equal(theme.motif, 'Stamped grid booklet');
});

test('flag off keeps the plain coupon list, including when a week is passed', () => {
  const html = withFlag('false', () => book(open));
  assert.match(html, /aria-label="Weekly ration coupons"/);
  assert.match(html, /This week’s ration coupons/);
  assert.match(html, /cannot be traded or sent/);
  assert.match(html, /2\.00 LN fixed price/);
  assert.match(html, /used this week/);
  assert.match(html, /Redeem at the ration counter/);
  assert.match(html, /Household stores: 1 clothing · 0 goods bundles\./);
  assert.doesNotMatch(html, /korund-ration-booklet|korund-booklet-stamp|data-nation-crest|Game week 4/);
  assert.equal(withFlag(undefined, () => book(open)).includes('korund-ration-booklet'), false);
});

test('flag on is a stamped booklet with the same coupon information and the Korund crest', () => {
  const html = withFlag('true', () => book(open));
  assert.match(html, /class="korund-coupons korund-ration-booklet"/);
  assert.match(html, /aria-label="Weekly ration coupons"/);
  assert.match(html, /<h4>Game week 4<\/h4>/);
  assert.match(html, /This week’s ration coupons/);
  assert.match(html, /cannot be traded or sent/);
  assert.match(html, /no LN charge/);
  assert.match(html, /2\.00 LN fixed price/);
  assert.match(html, /3\.00 LN fixed price/);
  assert.match(html, /Household stores: 1 clothing · 0 goods bundles\./);
  assert.match(html, /data-nation-crest="korund"/);
  assert.match(html, /Korund crest: a stone keystone/);
  const pages = html.split('class="korund-booklet-page"').slice(1);
  assert.equal(pages.length, 3);
  assert.equal(pages.filter(page => page.includes('korund-booklet-stamp')).length, 1);
  assert.match(pages.find(page => page.includes('Clothing coupon')), /used this week[\s\S]*aria-hidden="true"/);
  assert.doesNotMatch(pages.find(page => page.includes('Food coupon')), /korund-booklet-stamp/);
  assert.match(pages.find(page => page.includes('Food coupon')), /Redeem at the ration counter/);
});

test('a withdrawn coupon is not stamped, and an expired book still explains why redeem is off', () => {
  const cut = applyRationCut(buildCoupons(true, new Set(), '2099-01-01T00:00:00.000Z'), korundRationCut(2, 20));
  const html = withFlag('true', () => book(cut));
  const goods = html.split('class="korund-booklet-page"').find(page => page.includes('Goods coupon'));
  assert.match(goods, /withdrawn this week \(ration cut\)/);
  assert.doesNotMatch(goods, /korund-booklet-stamp/);
  assert.match(html, /korund-booklet-stamp/); // the used food coupon
  const expired = withFlag('true', () => book(open, Date.parse('2099-01-02T00:00:00.000Z')));
  assert.match(expired, /expired at the weekly reset/);
  assert.match(expired, /disabled/);
});
