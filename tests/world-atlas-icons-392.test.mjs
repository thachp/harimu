/** #392 UI 50: World atlas fact-row icons. NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICONS is HARIMU_UI_PACK entry 47.
 *  Preview on, production off. Flag on: a known stat label gets a decorative aria-hidden gold icon before the text.
 *  An unknown label gets none. Labels and values stay the same. Flag off keeps today's markup. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { worldAtlasStats } from '../lib/world-atlas.ts';
import { worldAtlasIconsEnabled, worldAtlasStatIcon, WORLD_ATLAS_ICONS_FLAG, WORLD_ATLAS_STAT_ICONS } from '../lib/world-atlas-icons.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = WORLD_ATLAS_ICONS_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', motto: "Win the crown's favor - or take the crown.", government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', stability: 72, population: '924k' };
const ten = Array.from({ length: 10 }, (_, index) => ({ id: `nation-${index}` }));
const clock = { epochSeconds: 1_700_000_000, nowSeconds: 1_700_000_000, nextFestival: { at: 1_700_000_000 + 86_400, festivals: [{ name: 'Coronation Day' }] } };
const disputes = { wars: { wars: [] } };
const full = { nations: ten, nation: aurelle, clock, disputes };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 47, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(worldAtlasIconsEnabled(), false);
    assert.equal(worldAtlasIconsEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(worldAtlasIconsEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(worldAtlasIconsEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 66);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(46), key, 'entry 47');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 66/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 world atlas icons/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/world-atlas-icons.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICONS/);
  assert.match(await read('app/world-atlas.tsx'), /icons = worldAtlasIconsEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /WORLD_ATLAS_ICONS|worldAtlasIconsEnabled/);
});

test('existing stat labels map to icon keys and an unknown label maps to null', () => {
  const labels = worldAtlasStats(full).map(row => row.label);
  assert.deepEqual(labels, Object.keys(WORLD_ATLAS_STAT_ICONS));
  assert.deepEqual(labels.map(worldAtlasStatIcon), ['Globe', 'Clock', 'Scales', 'Confetti', 'Users', 'Crown', 'Bank', 'Grains', 'Coins', 'ShieldCheck']);
  assert.equal(WORLD_ATLAS_STAT_ICONS.Capital, 'Crown');
  assert.equal(WORLD_ATLAS_STAT_ICONS.Government, 'Bank');
  assert.equal(WORLD_ATLAS_STAT_ICONS.Economy, 'Grains');
  assert.equal(WORLD_ATLAS_STAT_ICONS.Currency, 'Coins');
  assert.equal(WORLD_ATLAS_STAT_ICONS.Stability, 'ShieldCheck');
  for (const label of ['Faith', 'Treasury', 'Law', 'capital', 'Epoch', '']) assert.equal(worldAtlasStatIcon(label), null, label);
});

test('known labels use distinct icons', () => {
  const keys = Object.values(WORLD_ATLAS_STAT_ICONS);
  assert.equal(new Set(keys).size, keys.length);
});

const bundle = async (icons, atlas = 'true') => {
  const { build } = await import('esbuild');
  const define = { 'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS': JSON.stringify(atlas), 'process.env.NEXT_PUBLIC_HARIMU_WORLD_EXPLORE': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE': 'undefined', 'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS': 'undefined' };
  if (icons !== undefined) define['process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICONS'] = JSON.stringify(icons);
  const out = await build({ entryPoints: [new URL('../app/world-atlas.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag on marks known labels and leaves an unknown label bare; flag off markup matches today', async () => {
  const previous = process.env[key];
  delete process.env[key];
  try {
    const onMod = await bundle('true'), offMod = await bundle('false'), missingMod = await bundle(undefined);
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const { Window } = await import('happy-dom');
    const view = (mod, props) => renderToStaticMarkup(React.createElement(mod.WorldAtlas, { ...full, onView() {}, ...props }));
    const on = view(onMod), off = view(offMod), missing = view(missingMod);
    const bare = html => html.replace(/<dt><svg[\s\S]*?<\/svg>/g, '<dt>').replace(' world-atlas-icons', '');
    assert.equal(off, missing, 'a missing flag matches flag off');
    assert.equal(bare(on), off, 'flag on adds only the icons and their class');
    assert.doesNotMatch(off, /world-atlas-icons|<dt><svg/);
    assert.match(off, /<section class="world-atlas world-atlas-identity" aria-label="World atlas">/);
    assert.match(on, /<section class="world-atlas world-atlas-identity world-atlas-icons" aria-label="World atlas">/);
    const window = new Window({ url: 'http://localhost/' });
    window.document.body.innerHTML = on;
    const rows = [...window.document.querySelectorAll('.world-atlas-stats > div')];
    assert.deepEqual(rows.map(row => row.querySelector('dt').textContent), worldAtlasStats(full).map(row => row.label));
    assert.deepEqual(rows.map(row => row.querySelector('dd').textContent), worldAtlasStats(full).map(row => row.value));
    for (const row of rows) {
      const dt = row.querySelector('dt'), svg = dt.querySelector('svg');
      assert.equal(dt.getAttribute('aria-label'), null);
      assert.ok(svg, dt.textContent);
      assert.equal(svg.getAttribute('aria-hidden'), 'true');
      assert.equal(svg.getAttribute('width'), '18');
      assert.equal([...dt.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(''), dt.textContent);
    }
    const unknown = renderToStaticMarkup(React.createElement('dt', null, React.createElement(onMod.WorldAtlasFactIcon, { label: 'Faith' }), 'Faith'));
    assert.equal(unknown, '<dt>Faith</dt>');
    assert.equal(renderToStaticMarkup(React.createElement(onMod.WorldAtlasFactIcon, { label: 'Treasury' })), '');
    const capital = renderToStaticMarkup(React.createElement('dt', null, React.createElement(onMod.WorldAtlasFactIcon, { label: 'Capital' }), 'Capital'));
    assert.match(capital, /^<dt><svg[^>]* aria-hidden="true"[^>]*>[\s\S]*<\/svg>Capital<\/dt>$/);
    assert.equal(view(onMod, { icons: false }), off, 'an explicit off prop matches flag off');
    assert.equal(renderToStaticMarkup(React.createElement(onMod.WorldAtlas, { nations: ten, nation: aurelle, enabled: false, icons: true })), '');
    window.close();
    const css = await read('app/world-atlas.css');
    const block = css.slice(css.indexOf('/* #392 UI 50'));
    assert.match(block, /\.world-atlas\.world-atlas-icons \.world-atlas-stats dt\{[^}]*display:flex[^}]*gap:6px/);
    assert.match(block, /\.world-atlas\.world-atlas-icons \.world-atlas-stats dt svg\{[^}]*width:18px[^}]*height:18px[^}]*color:#d0ad54/);
    assert.doesNotMatch(block, /overflow-wrap:\s*anywhere/);
    assert.equal(css.includes('world-atlas-icons'), true);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});
