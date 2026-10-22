/** #392 S3: UI v2 panel shape, flag NEXT_PUBLIC_HARIMU_UI_V2_PANEL ("true" in preview, "false" in production). Browser-free pins. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { uiV2PanelEnabled } from '../lib/ui-v2-panel.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('flag: preview on, production off, only the exact string "true" enables it', async () => {
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_PANEL":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_PANEL":\s*"false"/);
  assert.equal(uiV2PanelEnabled('true'), true);
  for (const v of [undefined, '', 'false', 'TRUE', '1']) assert.equal(uiV2PanelEnabled(v), false);
});

test('flag off keeps the old World panel (facts list and institutions button) and adds no panel shape', async () => {
  const page = await read('app/page.tsx');
  assert.match(page, /\{!panelV2 && <dl>\{selected\.populationBand/);
  assert.match(page, /\{!panelV2 && <button type="button" onClick=\{\(\)=>changeView\('nation'\)\}>Inspect national institutions<\/button>\}/);
  assert.equal((page.match(/<PanelV2 /g) || []).length, 2, 'World and City only');
  assert.match(page, /panelV2 \? <PanelV2 /);
  assert.match(page, /\{panelV2 && \(\(\) =>/);
});

test('the component adds no copy of its own', async () => {
  const src = await read('app/panel-v2.tsx');
  const jsxText = [...src.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map(m => m[1].trim()).filter(Boolean);
  assert.deepEqual(jsxText, []);
});

test('every esbuild harness that defines UI_V2_TOPBAR also defines UI_V2_PANEL', async () => {
  const { readdir } = await import('node:fs/promises');
  for (const f of (await readdir(new URL('../scripts/', import.meta.url))).filter(f => f.endsWith('.mjs'))) {
    const src = await read(`scripts/${f}`);
    if (/['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR['"]\s*:/.test(src)) assert.match(src, /['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_PANEL['"]\s*:/, `${f} must define UI_V2_PANEL`);
  }
});

test('Status: Capital comes from the city catalog: shown on every capital, hidden on every other city', async () => {
  const { cityStatusStat } = await import('../lib/ui-v2-panel.ts');
  const { citiesForNation, outpostCityForNation } = await import('../lib/cities.ts');
  assert.match(await read('app/page.tsx'), /stats=\{\[\.\.\.\[cityStatusStat\(activeCity\)\]\.filter\(stat => stat !== null\)/);
  let capitals = 0, others = 0;
  for (const nation of ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara']) {
    const outpost = outpostCityForNation(nation);
    for (const city of [...citiesForNation(nation), ...(outpost ? [outpost] : [])]) {
      if (city.capital) { assert.deepEqual(cityStatusStat(city), { label: 'Status', value: 'Capital' }, city.id); capitals++; }
      else { assert.equal(cityStatusStat(city), null, city.id); others++; }
    }
  }
  assert.equal(capitals, 10); assert.ok(others >= 20);
  assert.equal(cityStatusStat(null), null); assert.equal(cityStatusStat(undefined), null);
});
