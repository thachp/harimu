/** #392 UI 52: World atlas Explore action icons. NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS is HARIMU_UI_PACK entry 49.
 *  Preview on, production off. Flag on: a gold compass leads the existing kicker, and the Explore button gains a bank mark and the trailing chevron.
 *  The button's accessible name stays the same. Flag off adds no markup. The Nation overview button is unchanged. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Bank, CaretRight, Compass } from '@phosphor-icons/react';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { WORLD_ATLAS_ICON_SCALE_FLAG } from '../lib/world-atlas-icon-scale.ts';
import { worldAtlasExploreIconsEnabled, WORLD_ATLAS_EXPLORE_ICONS_FLAG } from '../lib/world-atlas-explore-icons.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = WORLD_ATLAS_EXPLORE_ICONS_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', motto: "Win the crown's favor - or take the crown.", government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', stability: 72, population: '924k' };
const ten = Array.from({ length: 10 }, (_, index) => ({ id: `nation-${index}` }));
const full = { nations: ten, nation: aurelle, onView() {} };
const buttonOf = html => html.match(/<button type="button" class="world-atlas-primary"[\s\S]*?<\/button>/)?.[0] ?? '';
const kickerOf = html => html.match(/<p class="world-atlas-explore-kicker">[\s\S]*?<\/p>/)?.[0] ?? '';

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 49, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(worldAtlasExploreIconsEnabled(), false);
    assert.equal(worldAtlasExploreIconsEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(worldAtlasExploreIconsEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(worldAtlasExploreIconsEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 69);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(48), key, 'entry 49');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(47), WORLD_ATLAS_ICON_SCALE_FLAG, 'icon scale stays entry 48');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 69/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 world atlas explore icons/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/world-atlas-explore-icons.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS/);
  assert.match(await read('app/world-atlas.tsx'), /exploreIcons = worldAtlasExploreIconsEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /WORLD_ATLAS_EXPLORE_ICONS|worldAtlasExploreIconsEnabled/);
  assert.match(await read('app/nation-overview.tsx'), /<ExplorePrimaryButton label=\{explore\} ariaLabel=\{`\$\{explore\}: open the city`\} onClick=\{onExplore\} chevron/);
  assert.doesNotMatch(await read('app/nation-overview.tsx'), /WORLD_ATLAS_EXPLORE_ICONS|worldAtlasExploreIconsEnabled/);
});

const bundle = async (file, define) => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL(`../${file}`, import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

const atlasDefine = exploreIcons => ({
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS': '"true"',
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_EXPLORE': '"true"',
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY': '"true"',
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICONS': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE': 'undefined',
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS': exploreIcons === undefined ? 'undefined' : JSON.stringify(exploreIcons),
});

test('flag on paints Bank, the chevron and Compass; flag off markup matches today', async () => {
  const previous = process.env[key];
  delete process.env[key];
  try {
    const onMod = await bundle('app/world-atlas.tsx', atlasDefine('true'));
    const offMod = await bundle('app/world-atlas.tsx', atlasDefine('false'));
    const missingMod = await bundle('app/world-atlas.tsx', atlasDefine(undefined));
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const { Window } = await import('happy-dom');
    const icon = node => renderToStaticMarkup(node);
    const bank = icon(React.createElement(Bank, { size: 18, 'aria-hidden': 'true' }));
    const caret = icon(React.createElement(CaretRight, { size: 18, 'aria-hidden': 'true' }));
    const compass = icon(React.createElement(Compass, { size: 18, 'aria-hidden': 'true' }));
    const view = (mod, props) => renderToStaticMarkup(React.createElement(mod.WorldAtlas, { ...full, ...props }));
    const on = view(onMod), off = view(offMod), missing = view(missingMod);
    const plainButton = '<button type="button" class="world-atlas-primary" aria-label="Explore Aurelle: open the nation map">Explore Aurelle</button>';
    const plainKicker = '<p class="world-atlas-explore-kicker">Explore the world</p>';
    assert.equal(off, missing, 'a missing flag matches flag off');
    assert.equal(buttonOf(off), plainButton);
    assert.equal(kickerOf(off), plainKicker);
    assert.doesNotMatch(off, /world-atlas-explore-icons|world-atlas-primary-label/);
    assert.equal(view(onMod, { exploreIcons: false }), off, 'an explicit off prop matches flag off');
    const bare = html => html.replace(' world-atlas-explore-icons', '').replace(kickerOf(html), plainKicker).replace(buttonOf(html), plainButton);
    assert.equal(bare(on), off, 'flag on adds only the icons and their class');
    assert.match(on, /<section class="world-atlas world-atlas-identity world-atlas-explore-icons" aria-label="World atlas">/);
    const onButton = buttonOf(on), onKicker = kickerOf(on);
    assert.equal(onButton.includes(bank), true);
    assert.equal(onButton.includes(caret), true);
    assert.equal(onButton.includes(compass), false);
    assert.equal(onKicker.includes(compass), true);
    assert.equal(onKicker.includes(bank), false);
    assert.match(onButton, /aria-label="Explore Aurelle: open the nation map"/);
    assert.equal(onButton.match(/aria-label="([^"]*)"/)[1], buttonOf(off).match(/aria-label="([^"]*)"/)[1]);
    const window = new Window({ url: 'http://localhost/' });
    window.document.body.innerHTML = on;
    assert.equal(window.document.querySelector('.world-atlas-explore-kicker').textContent, 'Explore the world');
    assert.equal(window.document.querySelector('button.world-atlas-primary').textContent, 'Explore Aurelle');
    const marks = [...window.document.querySelectorAll('.world-atlas-explore-kicker svg, button.world-atlas-primary svg')];
    assert.equal(marks.length, 3);
    for (const mark of marks) assert.equal(mark.getAttribute('aria-hidden'), 'true');
    window.close();
    const quiet = renderToStaticMarkup(React.createElement(onMod.WorldAtlas, { nations: ten, nation: aurelle, exploreIcons: true }));
    assert.doesNotMatch(quiet, /world-atlas-explore-icons|world-atlas-primary|world-atlas-explore-kicker|Explore the world/);
    const noExplore = view(onMod, { explore: false, exploreIcons: true });
    assert.doesNotMatch(noExplore, /world-atlas-explore-icons|world-atlas-primary|Explore the world/);
    const plain = view(onMod, { identity: false });
    assert.match(plain, /world-atlas-explore-icons/);
    assert.equal(buttonOf(plain).includes(bank), true);
    assert.equal(buttonOf(plain).includes(caret), true);
    assert.doesNotMatch(plain, /world-atlas-explore-kicker|Explore the world/);
    assert.equal(view(onMod, { enabled: false, exploreIcons: true }), '');
    const longName = 'The Kindling Republic of the Eastern Marches';
    const long = view(onMod, { nation: { ...aurelle, shortName: longName, name: longName } });
    const longOff = view(offMod, { nation: { ...aurelle, shortName: longName, name: longName } });
    const longLabel = `Explore ${longName}`;
    assert.match(buttonOf(long), new RegExp(`<span class="world-atlas-primary-label">${longLabel}</span>`));
    assert.equal(buttonOf(longOff), `<button type="button" class="world-atlas-primary" aria-label="${longLabel}: open the nation map">${longLabel}</button>`);
    assert.doesNotMatch(buttonOf(long), /<wbr|&#8203;/);
    const css = await read('app/world-atlas.css');
    const block = css.slice(css.indexOf('/* #392 UI 52'));
    assert.match(block, /p\.world-atlas-explore-kicker\{[^}]*display:inline-flex/);
    assert.match(block, /p\.world-atlas-explore-kicker svg\{[^}]*flex:none;width:calc\(18px \* var\(--text-scale, 1\)\);height:calc\(18px \* var\(--text-scale, 1\)\);color:#d0ad54\}/);
    assert.match(block, /button\.world-atlas-primary:not\(\.market-item\)\{[^}]*display:flex;align-items:center;justify-content:center;gap:8px/);
    assert.match(block, /button\.world-atlas-primary:not\(\.market-item\) svg\{[^}]*flex:none;width:calc\(18px \* var\(--text-scale, 1\)\);height:calc\(18px \* var\(--text-scale, 1\)\)\}/);
    assert.match(block, /\.world-atlas-primary-label\{[^}]*overflow-wrap:normal;word-break:normal\}/);
    assert.match(css, /button\.world-atlas-primary:not\(\.market-item\)\{[^}]*min-height:44px[^}]*background:#d0ad54;color:#071820/);
    assert.doesNotMatch(block, /overflow-wrap:\s*anywhere/);
    assert.doesNotMatch(await read('app/explore-primary.tsx'), /overflow-wrap:\s*anywhere/);
    assert.doesNotMatch(await read('lib/world-atlas-explore-icons.ts'), /overflow-wrap:\s*anywhere/);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});

test('the Nation overview Explore button stays the label plus its chevron', async () => {
  const mod = await bundle('app/nation-overview.tsx', {
    'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS': '"true"',
    'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': '"false"',
    'process.env.NEXT_PUBLIC_HARIMU_NATION_MOTTO': '"false"',
    'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"',
    'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS': '"true"',
    'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS': 'undefined',
    'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK': 'undefined',
  });
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const caret = renderToStaticMarkup(React.createElement(CaretRight, { size: 18, 'aria-hidden': 'true' }));
  const html = renderToStaticMarkup(React.createElement(mod.NationOverview, {
    nation: { id: 'aurelle', name: 'Aurelle', capital: 'Highspire' }, onExplore() {}, onCivic() {},
  }));
  const button = buttonOf(html);
  assert.equal(button, `<button type="button" class="world-atlas-primary" aria-label="Explore Highspire: open the city">Explore Highspire${caret}</button>`);
  assert.doesNotMatch(button, /world-atlas-primary-label/);
  assert.equal(button.includes(renderToStaticMarkup(React.createElement(Bank, { size: 18, 'aria-hidden': 'true' }))), false);
});
