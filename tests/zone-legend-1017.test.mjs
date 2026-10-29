/** #1017: the Zone overlay legend explains each zone (docs §6.1) and keys the ★/▲ markers (§23.2); flag off keeps the #66 legend. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as labels from '../lib/map-zone-labels.ts';
const require = createRequire(import.meta.url);
const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
// lib/land-copy.ts re-exports from an extensionless sibling; point it at the .ts file (as tests/land-copy.test.mjs does).
const lc = readFileSync('lib/land-copy.ts', 'utf8').replace("from './palace-coup-copy'", `from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const lcPath = join(mkdtempSync(join(tmpdir(), 'zone-legend-')), 'land-copy.ts'); writeFileSync(lcPath, lc);
const landCopy = await import(pathToFileURL(lcPath).href);

const src = await readFile(new URL('../app/world-zones.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', js)(mod.exports, name => {
  if (name === '@/lib/land-copy') return landCopy;
  if (name === '@/lib/map-zone-labels') return labels;
  if (name === './world-zones.module.css') return { __esModule: true, default: new Proxy({}, { get: (_, k) => String(k) }) };
  if (name === '@/lib/map-zones') return {};
  return require(name);
}, mod);
const { ZoneLegend, zoneLegendEnabled } = mod.exports;
const render = explained => renderToStaticMarkup(React.createElement(ZoneLegend, { explained }));
const esc = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;');

test('flag parsing: only "true" turns the legend on', () => {
  assert.equal(zoneLegendEnabled('true'), true);
  for (const v of ['false', '', undefined, 'TRUE', '1']) assert.equal(zoneLegendEnabled(v), false);
});

test('flag on: four zones with their §6.1 line, plus capital and outpost keys', () => {
  const html = render(true);
  for (const z of labels.zoneOrder) { assert.ok(html.includes(esc(labels.zoneLabels[z]))); assert.ok(html.includes(esc(landCopy.zoneTooltips[z].text)), z); }
  assert.ok(html.includes(esc("Heartland: a nation's core. It can never be captured.")));
  assert.match(html, /★<\/b><strong>Capital<\/strong>/);
  assert.match(html, /▲<\/b><strong>Border outpost<\/strong>/);
  assert.equal((html.match(/<li>/g) || []).length, 6);
  assert.ok(html.startsWith('<ul class="legend legendExplained"'));
});

test('swatches and marker glyphs stay aria-hidden in both legends (color is not the only cue)', () => {
  for (const explained of [true, false]) {
    const html = render(explained);
    const swatches = html.match(/<span style="background:[^"]*"[^>]*>/g) || [];
    assert.equal(swatches.length, 4, `explained=${explained}`);
    for (const s of swatches) assert.match(s, /aria-hidden="true"/, s);
  }
  const on = render(true);
  assert.match(on, /<b aria-hidden="true">★<\/b>/); assert.match(on, /<b aria-hidden="true">▲<\/b>/);
});

test('flag off: the #66 legend, names only, no keys', () => {
  const html = render(false);
  assert.equal((html.match(/<li>/g) || []).length, 4);
  assert.ok(!html.includes('Capital') && !html.includes('never be captured') && !html.includes('legendExplained'));
  assert.ok(html.startsWith('<ul class="legend" aria-label="Zone legend">'));
});

test('preview on, production off', async () => {
  for (const [f, v] of [['wrangler.jsonc', 'true'], ['wrangler.prod.jsonc', 'false']]) {
    const t = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(t, new RegExp(`"NEXT_PUBLIC_HARIMU_ZONE_LEGEND": "${v}"`), f);
  }
});
