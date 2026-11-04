/** #1050: Aurelle top-bar coins show the Royal Mint official rate only for an Aurelle citizen with mint data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expandFlagPacks, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { officialTesseraMilli } from '../lib/crown-debasement-rules.ts';
import { aurelleMintRate, aurelleWalletParity, aurelleWalletParityEnabled, parityRateWords } from '../lib/aurelle-wallet-parity.ts';
import { loadApp } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_AURELLE_WALLET_PARITY';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const { GameShell } = await loadApp('game-shell');
const nation = id => ({ id, name: id[0].toUpperCase() + id.slice(1) });
const mint = milli => ({ officialRate: { from: 'CRN', to: 'TSR', tesseraMilliPerCrown: milli, source: 'strip' }, lastDecree: null });
const shell = (id, crownMint, currency = id === 'aurelle' ? 'CRN' : 'SPK') => renderToStaticMarkup(React.createElement(GameShell, {
  view: 'square', nation: nation(id), citizenNation: nation(id), nations: [], capacity: 18, localDemo: false, panel: null, onNavigate() {},
  currencyCode: currency, walletMinor: 650, crownMint,
}));

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(aurelleWalletParityEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(aurelleWalletParityEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true');
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_AURELLE_WALLET_PARITY/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_AURELLE_WALLET_PARITY/);
  assert.match(await read('lib/flag-pack.mjs'), /HARIMU_UI_PACK: \[.*NEXT_PUBLIC_HARIMU_AURELLE_WALLET_PARITY/);
  assert.match(await read('scripts/hud-layout-check.mjs'), /checkAurelleWalletParity/);
});

test('the chip rate is the Royal Mint strip rate, and the accessible label says that rate in words', () => {
  const milli = officialTesseraMilli(1000);
  assert.equal(aurelleMintRate(mint(milli)), (milli / 1000).toFixed(3));
  assert.equal(parityRateWords('0.500'), 'zero point five zero zero');
  const line = aurelleWalletParity('aurelle', 'CRN', mint(milli), true);
  assert.equal(line.rate, '0.500'); assert.equal(line.words, 'zero point five zero zero'); assert.equal(line.moved, false);
  const changed = aurelleWalletParity('aurelle', 'CRN', { ...mint(469), lastDecree: { parityBefore: 1000, parityAfter: 1066 } }, true);
  assert.equal(changed.moved, true);
  assert.equal(aurelleWalletParity('aurelle', 'CRN', mint(milli), false), null);
  assert.equal(aurelleWalletParity('kindle', 'SPK', mint(milli), true), null);
  assert.equal(aurelleWalletParity('aurelle', 'CRN', {}, true), null);
  assert.equal(aurelleWalletParity('aurelle', 'CRN', null, true), null);
});

test('Aurelle with mint data shows the parity; non-Aurelle and missing mint data keep today\'s chip', () => {
  const shown = withFlag('true', () => shell('aurelle', mint(officialTesseraMilli(1000))));
  assert.match(shown, /game-wallet-parity/);
  assert.match(shown, /CRN<span class="game-wallet-parity"> ·<\/span><span class="game-wallet-parity"> parity<\/span><span class="game-wallet-parity"> 0\.500<\/span>/);
  assert.match(shown, /aria-label="Wallet, 6\.50 Crowns\. Current mint parity is zero point five zero zero Tessera per Crown\."/);
  assert.match(shown, /Current mint parity is zero point five zero zero Tessera per Crown, the Royal Mint official rate of 0\.500\./);
  assert.doesNotMatch(shown, /game-wallet-moved/);
  const marked = withFlag('true', () => shell('aurelle', { ...mint(469), lastDecree: { parityBefore: 1000, parityAfter: 1066 } }));
  assert.match(marked, /game-wallet-moved/);
  assert.match(marked, / · moved/);
  assert.match(marked, /The parity has moved since the last mint change/);
  const kindle = withFlag('true', () => shell('kindle', mint(500), 'SPK'));
  const korund = withFlag('true', () => shell('korund', mint(500), 'LN'));
  const missing = withFlag('true', () => shell('aurelle', undefined));
  const off = withFlag('false', () => shell('aurelle', mint(500)));
  const unset = withFlag(undefined, () => shell('aurelle', mint(500)));
  for (const html of [kindle, korund, missing, off, unset]) {
    assert.doesNotMatch(html, /parity|game-wallet-parity|game-wallet-moved|zero point/);
    assert.match(html, /Your (SPK|LN|CRN) wallet holds national money\. Amounts update after completed transactions/);
  }
  assert.match(kindle, />SPK</); assert.match(korund, />LN</); assert.match(missing, />CRN</); assert.match(off, />CRN</);
});
