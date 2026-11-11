/** #392 UI 51: World atlas fact icons scale with text size. NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE is HARIMU_UI_PACK entry 48.
 *  Preview on, production off. The scale class is on the atlas root only when the fact-icon flag is also on.
 *  The svg rule uses calc(18px * var(--text-scale, 1)). Flag off keeps today's markup and has no scale class. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { worldAtlasStats } from '../lib/world-atlas.ts';
import { WORLD_ATLAS_ICONS_FLAG } from '../lib/world-atlas-icons.ts';
import { worldAtlasIconScaleEnabled, WORLD_ATLAS_ICON_SCALE_FLAG } from '../lib/world-atlas-icon-scale.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = WORLD_ATLAS_ICON_SCALE_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', motto: "Win the crown's favor - or take the crown.", government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', stability: 72, population: '924k' };
const ten = Array.from({ length: 10 }, (_, index) => ({ id: `nation-${index}` }));
const clock = { epochSeconds: 1_700_000_000, nowSeconds: 1_700_000_000, nextFestival: { at: 1_700_000_000 + 86_400, festivals: [{ name: 'Coronation Day' }] } };
const disputes = { wars: { wars: [] } };
const full = { nations: ten, nation: aurelle, clock, disputes };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 48, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(worldAtlasIconScaleEnabled(), false);
    assert.equal(worldAtlasIconScaleEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(worldAtlasIconScaleEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(worldAtlasIconScaleEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 57);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(47), key, 'entry 48');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(46), WORLD_ATLAS_ICONS_FLAG, 'fact icons stay entry 47');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 57/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 world atlas icon scale/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/world-atlas-icon-scale.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE/);
  assert.match(await read('app/world-atlas.tsx'), /iconScale = worldAtlasIconScaleEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /WORLD_ATLAS_ICON_SCALE|worldAtlasIconScaleEnabled/);
});

const bundle = async (icons, iconScale) => {
  const { build } = await import('esbuild');
  const define = { 'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_WORLD_EXPLORE': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS': 'undefined' };
  if (icons !== undefined) define['process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICONS'] = JSON.stringify(icons);
  if (iconScale !== undefined) define['process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE'] = JSON.stringify(iconScale);
  const out = await build({ entryPoints: [new URL('../app/world-atlas.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('the scale class appears only when both flags are on, and flag off has no scale class', async () => {
  const previous = process.env[key];
  delete process.env[key];
  try {
    const both = await bundle('true', 'true');
    const iconsOnly = await bundle('true', 'false');
    const iconsMissing = await bundle('true', undefined);
    const scaleOnly = await bundle('false', 'true');
    const off = await bundle('false', 'false');
    const missing = await bundle(undefined, undefined);
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const view = (mod, props) => renderToStaticMarkup(React.createElement(mod.WorldAtlas, { ...full, onView() {}, ...props }));
    const bothHtml = view(both), iconsHtml = view(iconsOnly), missingScaleHtml = view(iconsMissing);
    const scaleOnlyHtml = view(scaleOnly), offHtml = view(off), missingHtml = view(missing);
    const stripScale = html => html.replace(' world-atlas-icon-scale', '');
    assert.equal(iconsHtml, missingScaleHtml, 'a missing scale flag matches scale off');
    assert.equal(offHtml, missingHtml, 'missing flags match flag off');
    assert.equal(stripScale(bothHtml), iconsHtml, 'scale on adds only its class');
    assert.match(bothHtml, /<section class="world-atlas world-atlas-identity world-atlas-icons world-atlas-icon-scale" aria-label="World atlas">/);
    assert.match(iconsHtml, /<section class="world-atlas world-atlas-identity world-atlas-icons" aria-label="World atlas">/);
    assert.doesNotMatch(iconsHtml, /world-atlas-icon-scale/);
    assert.doesNotMatch(scaleOnlyHtml, /world-atlas-icon-scale|world-atlas-icons/);
    assert.doesNotMatch(offHtml, /world-atlas-icon-scale|world-atlas-icons/);
    assert.match(offHtml, /<section class="world-atlas world-atlas-identity" aria-label="World atlas">/);
    assert.equal(view(both, { iconScale: false }), iconsHtml, 'an explicit off prop matches scale off');
    assert.doesNotMatch(view(both, { icons: false, iconScale: true }), /world-atlas-icon-scale|world-atlas-icons/);
    assert.equal(view(both, { enabled: false, icons: true, iconScale: true }), '');
    const labels = worldAtlasStats(full).map(row => row.label);
    const values = worldAtlasStats(full).map(row => row.value);
    assert.equal(labels.every(label => bothHtml.includes(label)), true);
    assert.equal(values.every(value => bothHtml.includes(value)), true);
    assert.equal((bothHtml.match(/<dt><svg/g) ?? []).length, labels.length);
    const css = await read('app/world-atlas.css');
    const rule = css.match(/\.game-inspector-body \.world-atlas\.world-atlas-icons\.world-atlas-icon-scale \.world-atlas-stats dt svg\{[^}]+\}/);
    assert.ok(rule, 'scale rule');
    assert.match(rule[0], /flex:none/);
    assert.match(rule[0], /width:calc\(18px \* var\(--text-scale, 1\)\)/);
    assert.match(rule[0], /height:calc\(18px \* var\(--text-scale, 1\)\)/);
    assert.match(css, /\.world-atlas\.world-atlas-icons \.world-atlas-stats dt\{[^}]*min-width:min-content/);
    assert.match(css, /\.world-atlas\.world-atlas-icons \.world-atlas-stats dt svg\{flex:none;width:18px;height:18px;color:#d0ad54\}/);
    assert.doesNotMatch(rule[0], /overflow-wrap/);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});
