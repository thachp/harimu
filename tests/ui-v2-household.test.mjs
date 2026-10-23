/** #392 S9: Household panel (existing data only), flag NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD ("true" in preview, "false" in production). The real HouseholdSummary
 *  rendered from a build with the flag off and one with it on (same assertions), plus flag, scope and harness pins. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { itemCount, uiV2HouseholdEnabled } from '../lib/ui-v2-household.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('flag: preview on, production off, only the exact string "true" enables it, and only with the S3 panel', async () => {
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD":\s*"false"/);
  assert.equal(uiV2HouseholdEnabled('true', true), true);
  for (const v of [undefined, '', 'false', 'TRUE', '1']) assert.equal(uiV2HouseholdEnabled(v, true), false);
  assert.equal(uiV2HouseholdEnabled('true', false), false);
});

test('itemCount reads the inventory and is 0 when an item is absent', () => {
  const inv = [{ item: 'food', quantity: 6 }, { item: 'materials', quantity: 2 }];
  assert.equal(itemCount(inv, 'food'), 6); assert.equal(itemCount(inv, 'materials'), 2); assert.equal(itemCount(inv, 'knowledge'), 0); assert.equal(itemCount(null, 'food'), 0);
});

const render = async (flag, props = {}) => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD': JSON.stringify(flag), 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"' } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  return { mod, html: renderToStaticMarkup(React.createElement(mod.HouseholdSummary, { nation: { name: 'Kindle Republic', currency: 'Spark' }, walletMinor: 4000, inventory: [{ item: 'food', quantity: 6 }, { item: 'materials', quantity: 2 }], residence: 'Forgehaven', ...props })) };
};

for (const flag of ['false', 'true']) test(`flag ${flag}: the Household panel shows only with the flag on, from existing data only`, async () => {
  const { html, mod } = await render(flag), on = flag === 'true';
  assert.equal(html.includes('class="panel-v2"'), on);
  for (const [dt, dd] of [['Wallet', '40.00 Spark'], ['Food', '6'], ['Residence', 'Forgehaven'], ['Pantry', '6 food · 2 materials']]) assert.equal(html.includes(`<dt>${dt}</dt><dd>${dd}</dd>`), on, dt);
  assert.equal((html.match(/<img /g) ?? []).length, on ? 4 : 0, 'four Vale portraits');
  for (const m of mod.valeFamily) { assert.equal(html.includes(`src="${m.image}"`), on); await access(new URL(`../public${m.image}`, import.meta.url)); }
  assert.doesNotMatch(html, /alt="[^"]+"/, 'portraits are decorative: the name is the card text');
  assert.doesNotMatch(html, /Furnish|Honou?r|Arrange your home|mood|Wellbeing|%/i, 'no furnishings, honors, needs or mood (no data)');
});

test('page.tsx passes data, never the flag; every harness that defines UI_V2_MOBILE defines UI_V2_HOUSEHOLD; the check is registered', async () => {
  const page = await read('app/page.tsx');
  assert.match(page, /<HouseholdSummary nation=\{citizenNation\} walletMinor=\{householdWalletMinor\(citizenNation\.id, economy\?\.walletMinor, aurellePlan\?\.walletMinor, korundPlan\?\.walletMinor\)\} \{\.\.\.householdStock\(citizenNation\.id, economy\?\.inventory, aurellePlan\?\.foodQuantity, korundPlan\?\.foodQuantity\)\}/);
  assert.doesNotMatch(page, /UI_V2_HOUSEHOLD|uiV2HouseholdEnabled/);
  for (const f of (await readdir(new URL('../scripts/', import.meta.url))).filter(f => f.endsWith('.mjs'))) {
    const src = await read(`scripts/${f}`);
    if (/['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_MOBILE['"]\s*:/.test(src)) assert.match(src, /['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD['"]\s*:/, f);
  }
  assert.match(await read('scripts/hud-layout-check.mjs'), /checkUiV2Household/);
});

test('non-Kindle nations: the Wallet row shows the nation\'s own balance, or hides when existing data has none (never Spark)', async () => {
  const { mod, html } = await render('true', { nation: { name: 'Gauge Union', currency: 'Gauge (GAU) · crawling peg' }, walletMinor: undefined });
  assert.doesNotMatch(html, /<dt>Wallet<\/dt>/, 'no Wallet row without the nation\'s own balance');
  for (const dt of ['Food', 'Residence', 'Pantry']) assert.match(html, new RegExp(`<dt>${dt}</dt>`), dt);
  const { householdWalletMinor } = await import('../lib/ui-v2-household.ts');
  assert.equal(householdWalletMinor('kindle', 4000, 1, 2), 4000);
  assert.equal(householdWalletMinor('aurelle', 4000, 150, 2), 150);
  assert.equal(householdWalletMinor('korund', 4000, 1, 275), 275);
  for (const id of ['confluence', 'meridian', 'gauge']) assert.equal(householdWalletMinor(id, 4000, 1, 2), undefined, id);
  assert.equal(householdWalletMinor('aurelle', 4000, null, 2), undefined, 'Aurelle plan not loaded: hidden, not Spark');
  const aurelle = await render('true', { nation: { name: 'Aurelle', currency: 'Crown (CRN) · gold-backed' }, walletMinor: 150 });
  assert.match(aurelle.html, /<dt>Wallet<\/dt><dd>1\.50 Crown \(CRN\) · gold-backed<\/dd>/);
});

test('#861 non-Kindle nations: Food and Pantry use the nation\'s own stock or hide (never Kindle\'s inventory)', async () => {
  const { householdStock } = await import('../lib/ui-v2-household.ts'), kindle = [{ item: 'food', quantity: 6 }, { item: 'materials', quantity: 2 }];
  assert.deepEqual(householdStock('kindle', kindle, 3, 4), { inventory: kindle, pantry: true });
  assert.deepEqual(householdStock('aurelle', kindle, 3, 4), { inventory: [{ item: 'food', quantity: 3 }], pantry: false });
  assert.deepEqual(householdStock('korund', kindle, 3, 4), { inventory: [{ item: 'food', quantity: 4 }], pantry: false });
  assert.deepEqual(householdStock('korund', kindle, 3, null), { inventory: undefined, pantry: false }, 'Korund plan not loaded: hidden');
  for (const id of ['gauge', 'confluence']) assert.deepEqual(householdStock(id, kindle, 3, 4), { inventory: undefined, pantry: false }, id);
  const korund = await render('true', { nation: { name: 'Korund', currency: 'Labor Note (LN) + ration coupons' }, walletMinor: 275, ...householdStock('korund', kindle, 3, 4) });
  assert.match(korund.html, /<dt>Food<\/dt><dd>4<\/dd>/);
  assert.doesNotMatch(korund.html, /<dt>Pantry<\/dt>|<dd>6<\/dd>/, 'no Kindle counts, no Pantry without a materials count');
  const gauge = await render('true', { nation: { name: 'Gauge Union', currency: 'Gauge (GAU)' }, walletMinor: undefined, ...householdStock('gauge', kindle) });
  assert.doesNotMatch(gauge.html, /<dt>(Food|Pantry|Wallet)<\/dt>/);
  assert.match(gauge.html, /<dt>Residence<\/dt>/);
});
