/** #1008: Aurelle's royal decree renders as a sealed scroll only when NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS is exactly "true". */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { aurelleSealedScrollsEnabled } from '../lib/aurelle-sealed-scrolls.ts';
import { simulateGovernment } from '../lib/government.ts';
import { nationThemes } from '../lib/nation-themes.ts';
import { componentModule } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const { LeaderPanel } = await import(await componentModule(fileURLToPath(new URL('../app/leader-panel.tsx', import.meta.url))));
const key = 'NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS';
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const decree = 'Food security reserve. Programme proposal: 0 minor units. This is a rule-bound proposal, not an executed allocation.';
const panel = nationId => renderToStaticMarkup(React.createElement(LeaderPanel, { snapshot: simulateGovernment({ nationId, availableBudgetMinor: 0, foodSecurity: 35, petitionCounts: {} }) }));

test('flag is on only for the exact string "true", preview on and production off, inside the UI pack', async () => {
  assert.equal(aurelleSealedScrollsEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(aurelleSealedScrollsEnabled(value), false);
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS":\s*"false"/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS/);
  assert.match(await read('lib/flag-pack.mjs'), /HARIMU_UI_PACK: \[.*NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS/);
  assert.match(await read('scripts/hud-layout-check.mjs'), /checkAurelleSealedScrolls/);
});

test('scroll styles use Aurelle nation tokens and do not animate', async () => {
  const css = await read('app/globals.css');
  const block = css.slice(css.indexOf('/* #1008'), css.indexOf('/* Greyed-out'));
  assert.ok(block.includes('aurelle-scroll-seal') && block.includes('--nation-accent') && block.includes('--nation-paper') && block.includes('--nation-edge'));
  assert.doesNotMatch(block, /\b(animation|transition)\s*:/);
  const theme = nationThemes.aurelle;
  assert.equal(theme.document, 'Royal scroll');
  assert.equal(theme.motif, 'Double border and crown seal');
});

test('flag off keeps the royal decree card, including its wording', () => {
  const html = withFlag('false', () => panel('aurelle'));
  assert.match(html, /aria-label="Royal decree"/);
  assert.match(html, /Why\? · Royal decree/);
  assert.match(html, /Aurelle · Royal scroll/);
  assert.match(html, new RegExp(decree.replace(/[.]/g, '\\.')));
  assert.match(html, /Simulated statement/);
  assert.doesNotMatch(html, /aurelle-sealed-scroll|aurelle-scroll-seal|data-nation-crest/);
  assert.equal(withFlag(undefined, () => panel('aurelle')).includes('aurelle-sealed-scroll'), false);
});

test('flag on is a sealed scroll with the same decree and a decorative Aurelle crest', () => {
  const html = withFlag('true', () => panel('aurelle'));
  assert.match(html, /class="nation-document leader-statement aurelle-sealed-scroll"/);
  assert.match(html, /aria-label="Royal decree"/);
  assert.match(html, /Why\? · Royal decree/);
  assert.match(html, /Aurelle · Royal scroll/);
  assert.match(html, /Double border and crown seal/);
  assert.match(html, new RegExp(decree.replace(/[.]/g, '\\.')));
  assert.match(html, /Simulated statement/);
  assert.match(html, /class="aurelle-scroll-seal" aria-hidden="true"/);
  assert.match(html, /data-nation-crest="aurelle"/);
  assert.match(html, /Aurelle crest: a winged crown/);
  const kindle = withFlag('true', () => panel('kindle'));
  const korund = withFlag('true', () => panel('korund'));
  assert.doesNotMatch(kindle, /aurelle-sealed-scroll|aurelle-scroll-seal/);
  assert.doesNotMatch(korund, /aurelle-sealed-scroll|aurelle-scroll-seal/);
  assert.match(kindle, /Reasoning Brief/);
  assert.match(korund, /Chairman/);
});
