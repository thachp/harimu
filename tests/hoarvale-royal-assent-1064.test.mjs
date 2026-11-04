/** #1064: Hoarvale Civic bills show a frost-blue Royal Assent seal only when NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT is exactly "true". */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expandFlagPacks, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { nationCrest } from '../lib/nation-crests.ts';
import { nationMark } from '../lib/nation-themes.ts';
import { componentModule } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const { HoarvaleCivicBills, hoarvaleCivicBills, hoarvaleRoyalAssentEnabled } = await import(await componentModule(fileURLToPath(new URL('../app/hoarvale-royal-assent.tsx', import.meta.url))));
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const html = nationId => renderToStaticMarkup(React.createElement(HoarvaleCivicBills, { nationId }));
const lum = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const v = [lum(a), lum(b)].sort((x, y) => y - x); return (v[0] + 0.05) / (v[1] + 0.05); };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(hoarvaleRoyalAssentEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(hoarvaleRoyalAssentEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT/);
  assert.match(await read('lib/flag-pack.mjs'), /HARIMU_UI_PACK: \[.*NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT/);
  assert.match(await read('scripts/hud-layout-check.mjs'), /checkHoarvaleRoyalAssent/);
  assert.match(await read('app/page.tsx'), /citizenNation\.id === 'hoarvale' && <HoarvaleCivicBills nationId=\{citizenNation\.id\} \/>/);
});

test('seal styles use the Hoarvale crest and mark, carry a pattern, and do not animate', async () => {
  const css = await read('app/globals.css');
  const block = css.slice(css.indexOf('/* #1064'), css.indexOf('/* Greyed-out'));
  assert.match(block, /data-assent="pending"/); assert.match(block, /chevrons|135deg/); assert.match(block, /dashed/);
  assert.match(block, /min-width:\s*0/); assert.match(block, /flex-wrap:\s*wrap/); assert.match(block, /44px/);
  assert.doesNotMatch(block, /\b(animation|transition)\s*:/);
  const crest = nationCrest('hoarvale'), mark = nationMark('hoarvale');
  assert.equal(crest.field, '#3f7898'); assert.equal(crest.palette[0], 'Ice blue'); assert.equal(mark.pattern, 'chevrons'); assert.equal(mark.symbol, '✚');
  assert.ok(contrast('#ffffff', crest.field) >= 4.5, 'white seal mark on frost');
  assert.ok(contrast('#14323a', '#f4f7f8') >= 4.5, 'ink on paper');
});

test('flag off and a non-Hoarvale nation leave the Civic bills unchanged', () => {
  assert.equal(withFlag('false', () => html('hoarvale')), '');
  assert.equal(withFlag(undefined, () => html('hoarvale')), '');
  assert.equal(withFlag('true', () => html('kindle')), '');
  assert.equal(withFlag('true', () => html('aurelle')), '');
});

test('flag on: Hoarvale assented and pending bills differ by icon, pattern and announced text', () => {
  const page = withFlag('true', () => html('hoarvale'));
  assert.match(page, /aria-label="Moot bills"/);
  assert.match(page, /Inflation band/); assert.match(page, /Moot tax/);
  assert.match(page, /data-assent="assented"/); assert.match(page, /data-nation-pattern="chevrons"/); assert.match(page, /✚/);
  assert.match(page, /aria-label="Royal Assent"/); assert.match(page, /class="hoarvale-assent-label">Royal Assent</);
  assert.match(page, /data-assent="pending"/); assert.match(page, /data-nation-pattern="open-ring"/); assert.match(page, /○/);
  assert.match(page, /aria-label="Awaiting Royal Assent"/); assert.match(page, />Awaiting Royal Assent</);
  assert.match(page, /--hv-frost:#3f7898/); assert.match(page, /--hv-accent:#8ac1c6/);
  assert.equal(hoarvaleCivicBills.length, 2);
  assert.equal((page.match(/hoarvale-assent-seal/g) ?? []).length, 2);
});
