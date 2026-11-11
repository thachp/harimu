/** #392 UI 56: icon size attribute follows --text-scale. NEXT_PUBLIC_HARIMU_ICON_SIZE_SYNC is HARIMU_UI_PACK entry 53.
 *  Preview on, production off. Flag off keeps width="18". Flag on, the svg width is 1em and font-size carries the scale. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { iconSizeSyncEnabled, ICON_SIZE_SYNC_FLAG } from '../lib/icon-size-sync.ts';
import { NATION_ACTIONS_NARROW_STACK_FLAG } from '../lib/nation-actions-narrow-stack.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = ICON_SIZE_SYNC_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', motto: "Win the crown's favor - or take the crown.", government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', stability: 72, population: '924k' };
const ten = Array.from({ length: 10 }, (_, index) => ({ id: `nation-${index}` }));
const clock = { epochSeconds: 1_700_000_000, nowSeconds: 1_700_000_000, nextFestival: { at: 1_700_000_000 + 86_400, festivals: [{ name: 'Coronation Day' }] } };
const full = { nations: ten, nation: aurelle, clock, disputes: { wars: { wars: [] } }, onView() {} };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 53, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(iconSizeSyncEnabled(), false);
    assert.equal(iconSizeSyncEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(iconSizeSyncEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(iconSizeSyncEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 64);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(52), key, 'entry 53');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(51), NATION_ACTIONS_NARROW_STACK_FLAG, 'narrow stack stays entry 52');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 64/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 icon size sync/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/icon-size-sync.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_ICON_SIZE_SYNC/);
  assert.match(await read('app/world-atlas.tsx'), /iconSizeSync = iconSizeSyncEnabled\(\)/);
  assert.match(await read('app/nation-overview.tsx'), /iconSizeSync = iconSizeSyncEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /ICON_SIZE_SYNC|iconSizeSyncEnabled/);
});

const bundle = async (file, define) => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL(`../${file}`, import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

const atlasDefine = sync => ({
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS': '"true"',
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_EXPLORE': '"true"',
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY': '"true"',
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICONS': '"true"',
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE': '"true"',
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS': '"true"',
  'process.env.NEXT_PUBLIC_HARIMU_ICON_SIZE_SYNC': sync === undefined ? 'undefined' : JSON.stringify(sync),
});
const nationDefine = sync => ({
  'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_MOTTO': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS': '"true"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS': '"true"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_NARROW_STACK': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_ICON_SIZE_SYNC': sync === undefined ? 'undefined' : JSON.stringify(sync),
});
const selectors = ['.world-atlas-stats dt svg', '.world-atlas-explore-kicker svg', 'button.world-atlas-primary svg', 'button.nation-overview-secondary svg'];

test('flag off keeps width="18"; flag on the svg uses 1em and the CSS font-size calc exists', async () => {
  const previous = process.env[key];
  delete process.env[key];
  try {
    const atlasOn = await bundle('app/world-atlas.tsx', atlasDefine('true'));
    const atlasOff = await bundle('app/world-atlas.tsx', atlasDefine('false'));
    const atlasMissing = await bundle('app/world-atlas.tsx', atlasDefine(undefined));
    const nationOn = await bundle('app/nation-overview.tsx', nationDefine('true'));
    const nationOff = await bundle('app/nation-overview.tsx', nationDefine('false'));
    const nationMissing = await bundle('app/nation-overview.tsx', nationDefine(undefined));
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const { Window } = await import('happy-dom');
    const atlas = (mod, props) => renderToStaticMarkup(React.createElement(mod.WorldAtlas, { ...full, ...props }));
    const nation = (mod, props) => renderToStaticMarkup(React.createElement(mod.NationOverview, {
      nation: { id: 'aurelle', name: 'Aurelle', capital: 'Highspire' }, onExplore() {}, onCivic() {}, onInstitutions() {}, ...props,
    }));
    const widths = html => {
      const window = new Window({ url: 'http://localhost/' });
      window.document.body.innerHTML = html;
      const values = selectors.flatMap(selector => [...window.document.querySelectorAll(selector)].map(node => node.getAttribute('width')));
      window.close();
      return values;
    };
    const offAtlas = atlas(atlasOff), missingAtlas = atlas(atlasMissing), onAtlas = atlas(atlasOn);
    const offNation = nation(nationOff), missingNation = nation(nationMissing), onNation = nation(nationOn);
    assert.equal(offAtlas, missingAtlas, 'a missing atlas flag matches flag off');
    assert.equal(offNation, missingNation, 'a missing nation flag matches flag off');
    assert.equal(atlas(atlasOn, { iconSizeSync: false }), offAtlas, 'an explicit off prop matches flag off');
    assert.equal(nation(nationOn, { iconSizeSync: false }), offNation, 'an explicit off prop matches flag off');
    assert.equal(atlas(atlasOff, { iconSizeSync: true }), onAtlas, 'an explicit on prop matches flag on');
    const offWidths = widths(`${offAtlas}${offNation}`);
    const onWidths = widths(`${onAtlas}${onNation}`);
    assert.ok(offWidths.length >= 16, `expected the UI 50-53 marks, got ${offWidths.length}`);
    assert.deepEqual(offWidths, offWidths.map(() => '18'));
    assert.deepEqual(onWidths, onWidths.map(() => '1em'));
    assert.equal(offWidths.length, onWidths.length);
    assert.doesNotMatch(offAtlas + offNation, /icon-size-sync|width="1em"/);
    assert.match(onAtlas, /world-atlas-icon-size-sync/);
    assert.match(onNation, /nation-overview-icon-size-sync/);
    const atlasCss = await read('app/world-atlas.css'), nationCss = await read('app/nation-overview.css');
    for (const css of [atlasCss.slice(atlasCss.indexOf('/* #392 UI 56')), nationCss.slice(nationCss.indexOf('/* #392 UI 56'))]) {
      assert.ok(css.startsWith('/* #392 UI 56'));
      assert.match(css, /font-size:calc\(18px \* var\(--text-scale, 1\)\);width:1em;height:1em/);
    }
    assert.match(atlasCss, /\.world-atlas-icon-scale \.world-atlas-stats dt svg\{flex:none;width:calc\(18px \* var\(--text-scale, 1\)\);height:calc\(18px \* var\(--text-scale, 1\)\)\}/);
    assert.match(nationCss, /nation-overview-action-icons>button\.nation-overview-secondary:not\(\.market-item\) svg\{flex:none;width:calc\(18px \* var\(--text-scale, 1\)\);height:calc\(18px \* var\(--text-scale, 1\)\)\}/);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});
