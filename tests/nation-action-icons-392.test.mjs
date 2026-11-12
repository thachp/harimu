/** #392 UI 53: Nation overview action icons. NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS is HARIMU_UI_PACK entry 50.
 *  Preview on, production off. With the nation action row also on, Explore {capital} leads with Bank and keeps the chevron.
 *  View institutions leads with BookOpen. Labels and accessible names stay the same. Flag off markup matches the row as it is.
 *  Icons appear only on buttons that already render. The World atlas is unchanged. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Bank, BookOpen, CaretRight } from '@phosphor-icons/react';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { NATION_ACTIONS_FLAG } from '../lib/nation-actions.ts';
import { nationActionIconsEnabled, NATION_ACTION_ICONS_FLAG } from '../lib/nation-action-icons.ts';
import { WORLD_ATLAS_EXPLORE_ICONS_FLAG } from '../lib/world-atlas-explore-icons.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = NATION_ACTION_ICONS_FLAG;
const primaryOf = html => html.match(/<button type="button" class="world-atlas-primary"[\s\S]*?<\/button>/)?.[0] ?? '';
const secondaryOf = html => html.match(/<button type="button" class="nation-overview-secondary"[\s\S]*?<\/button>/)?.[0] ?? '';

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 50, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(nationActionIconsEnabled(), false);
    assert.equal(nationActionIconsEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationActionIconsEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(nationActionIconsEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 68);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(49), key, 'entry 50');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(48), WORLD_ATLAS_EXPLORE_ICONS_FLAG, 'explore icons stay entry 49');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(39), NATION_ACTIONS_FLAG, 'nation actions stay entry 40');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 68/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 nation action icons/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/nation-action-icons.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS/);
  assert.match(await read('app/nation-overview.tsx'), /actionIcons = nationActionIconsEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /NATION_ACTION_ICONS|nationActionIconsEnabled/);
  assert.doesNotMatch(await read('app/world-atlas.tsx'), /NATION_ACTION_ICONS|nationActionIconsEnabled|BookOpen/);
  assert.doesNotMatch(await read('app/world-atlas.css'), /nation-overview-action-icons/);
});

const bundle = async (file, define) => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL(`../${file}`, import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

const nationDefine = (icons, actions = 'true') => ({
  'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_MOTTO': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS': JSON.stringify(actions),
  'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS': '"true"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS': icons === undefined ? 'undefined' : JSON.stringify(icons),
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK': 'undefined',
});

test('flag on paints Bank, the chevron and BookOpen; labels stay; flag off markup matches the row', async () => {
  const previous = process.env[key];
  delete process.env[key];
  try {
    const onMod = await bundle('app/nation-overview.tsx', nationDefine('true'));
    const offMod = await bundle('app/nation-overview.tsx', nationDefine('false'));
    const missingMod = await bundle('app/nation-overview.tsx', nationDefine(undefined));
    const actionsOff = await bundle('app/nation-overview.tsx', nationDefine('true', 'false'));
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const { Window } = await import('happy-dom');
    const icon = node => renderToStaticMarkup(node);
    const bank = icon(React.createElement(Bank, { size: 18, 'aria-hidden': 'true' }));
    const caret = icon(React.createElement(CaretRight, { size: 18, 'aria-hidden': 'true' }));
    const book = icon(React.createElement(BookOpen, { size: 18, 'aria-hidden': 'true' }));
    const view = (mod, props) => renderToStaticMarkup(React.createElement(mod.NationOverview, {
      nation: { id: 'aurelle', name: 'Aurelle', capital: 'Highspire' }, onExplore() {}, onCivic() {}, onInstitutions() {}, ...props,
    }));
    const on = view(onMod), off = view(offMod), missing = view(missingMod);
    const plainPrimary = `<button type="button" class="world-atlas-primary" aria-label="Explore Highspire: open the city">Explore Highspire${caret}</button>`;
    const plainSecondary = '<button type="button" class="nation-overview-secondary">View institutions</button>';
    assert.equal(off, missing, 'a missing flag matches flag off');
    assert.equal(primaryOf(off), plainPrimary);
    assert.equal(secondaryOf(off), plainSecondary);
    assert.match(off, /<div class="nation-overview-actions">/);
    assert.doesNotMatch(off, /nation-overview-action-icons|world-atlas-primary-label/);
    assert.equal(view(onMod, { actionIcons: false }), off, 'an explicit off prop matches flag off');
    const onPrimary = primaryOf(on), onSecondary = secondaryOf(on);
    assert.equal(onPrimary.includes(bank), true);
    assert.equal(onPrimary.includes(caret), true);
    assert.equal(onPrimary.includes(book), false);
    assert.equal(onSecondary.includes(book), true);
    assert.equal(onSecondary.includes(bank), false);
    assert.equal(onSecondary.includes(caret), false);
    assert.match(on, /<div class="nation-overview-actions nation-overview-action-icons">/);
    assert.match(onPrimary, /aria-label="Explore Highspire: open the city"/);
    assert.equal(onPrimary.match(/aria-label="([^"]*)"/)[1], primaryOf(off).match(/aria-label="([^"]*)"/)[1]);
    assert.match(onPrimary, /<span class="world-atlas-primary-label">Explore Highspire<\/span>/);
    assert.match(onSecondary, /View institutions<\/button>/);
    const window = new Window({ url: 'http://localhost/' });
    window.document.body.innerHTML = on;
    const primary = window.document.querySelector('button.world-atlas-primary');
    const secondary = window.document.querySelector('button.nation-overview-secondary');
    assert.equal(primary.textContent, 'Explore Highspire');
    assert.equal(primary.getAttribute('aria-label'), 'Explore Highspire: open the city');
    assert.equal(secondary.textContent, 'View institutions');
    assert.equal(secondary.getAttribute('aria-label'), null);
    const marks = [...window.document.querySelectorAll('.nation-overview-actions svg')];
    assert.equal(marks.length, 3);
    for (const mark of marks) assert.equal(mark.getAttribute('aria-hidden'), 'true');
    window.close();
    const alone = view(onMod, { onInstitutions: undefined });
    assert.equal(primaryOf(alone).includes(bank), true);
    assert.equal(primaryOf(alone).includes(caret), true);
    assert.equal(secondaryOf(alone), '');
    assert.doesNotMatch(alone, /View institutions|BookOpen/);
    const noCapital = renderToStaticMarkup(React.createElement(onMod.NationOverview, {
      nation: { id: 'aurelle', name: 'Aurelle', capital: ' ' }, onExplore() {}, onCivic() {}, onInstitutions() {},
    }));
    assert.equal(primaryOf(noCapital), '');
    assert.equal(secondaryOf(noCapital).includes(book), true);
    assert.doesNotMatch(noCapital, /Explore /);
    const quiet = renderToStaticMarkup(React.createElement(onMod.NationOverview, { nation: { id: 'aurelle', name: 'Aurelle' }, onExplore() {}, onCivic() {} }));
    assert.doesNotMatch(quiet, /nation-overview-actions|world-atlas-primary|View institutions/);
    const listed = renderToStaticMarkup(React.createElement(onMod.NationOverview, {
      nation: { id: 'aurelle', name: 'Aurelle', capital: 'Highspire' }, government: { nationId: 'aurelle', roles: [{ name: 'Crown' }] }, onExplore() {}, onCivic() {}, onInstitutions() {},
    }));
    const institutions = listed.match(/<ul class="nation-overview-institutions"[\s\S]*?<\/ul>/)?.[0] ?? '';
    assert.match(institutions, />Crown</);
    assert.doesNotMatch(institutions, /<svg/);
    const closed = renderToStaticMarkup(React.createElement(actionsOff.NationOverview, {
      nation: { id: 'aurelle', name: 'Aurelle', capital: 'Highspire' }, onExplore() {}, onCivic() {}, onInstitutions() {}, actionIcons: true,
    }));
    assert.equal(closed.includes(bank), false);
    assert.equal(closed.includes(book), false);
    assert.doesNotMatch(closed, /nation-overview-actions|nation-overview-secondary|world-atlas-primary|View institutions/);
    assert.match(closed, /<button type="button" class="nation-overview-primary" aria-label="Explore Highspire: open the city">Explore Highspire<\/button>/);
    const longCapital = 'The Royal Seat of the Eastern Marches';
    const long = view(onMod, { nation: { id: 'aurelle', name: 'Aurelle', capital: longCapital } });
    const longOff = view(offMod, { nation: { id: 'aurelle', name: 'Aurelle', capital: longCapital } });
    const longLabel = `Explore ${longCapital}`;
    assert.match(primaryOf(long), new RegExp(`<span class="world-atlas-primary-label">${longLabel}</span>`));
    assert.equal(primaryOf(longOff), `<button type="button" class="world-atlas-primary" aria-label="${longLabel}: open the city">${longLabel}${caret}</button>`);
    assert.doesNotMatch(primaryOf(long), /<wbr|&#8203;/);
    const css = await read('app/nation-overview.css');
    const block = css.slice(css.indexOf('/* #392 UI 53'));
    assert.match(block, /button\.world-atlas-primary:not\(\.market-item\)\{[^}]*overflow-wrap:normal;word-break:normal\}/);
    assert.match(block, /\.world-atlas-primary-label\{[^}]*overflow-wrap:normal;word-break:normal\}/);
    assert.match(block, /svg\{[^}]*flex:none;width:calc\(18px \* var\(--text-scale, 1\)\);height:calc\(18px \* var\(--text-scale, 1\)\)\}/);
    assert.match(block, /button\.nation-overview-secondary:not\(\.market-item\)\{[^}]*display:inline-flex;align-items:center;justify-content:center;gap:8px\}/);
    assert.match(block, /button\.nation-overview-secondary:not\(\.market-item\) svg\{color:#d0ad54\}/);
    assert.doesNotMatch(await read('app/world-atlas.css'), /nation-overview-action-icons|BookOpen/);
    assert.doesNotMatch(await read('app/explore-primary.tsx'), /BookOpen|NATION_ACTION_ICONS/);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});

test('the World atlas Explore button is unchanged by the nation action icons flag', async () => {
  const mod = await bundle('app/world-atlas.tsx', {
    'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS': '"true"',
    'process.env.NEXT_PUBLIC_HARIMU_WORLD_EXPLORE': '"true"',
    'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY': '"true"',
    'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICONS': '"false"',
    'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE': 'undefined',
    'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS': '"true"',
    'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS': '"true"',
  });
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const bank = renderToStaticMarkup(React.createElement(Bank, { size: 18, 'aria-hidden': 'true' }));
  const caret = renderToStaticMarkup(React.createElement(CaretRight, { size: 18, 'aria-hidden': 'true' }));
  const book = renderToStaticMarkup(React.createElement(BookOpen, { size: 18, 'aria-hidden': 'true' }));
  const html = renderToStaticMarkup(React.createElement(mod.WorldAtlas, {
    nations: Array.from({ length: 10 }, (_, index) => ({ id: `nation-${index}` })),
    nation: { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', motto: 'Land in order.', government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown', economy: 'Royal charters', stability: 72, population: '924k' },
    onView() {},
  }));
  const button = primaryOf(html);
  assert.equal(button.includes(bank), true);
  assert.equal(button.includes(caret), true);
  assert.equal(button.includes(book), false);
  assert.doesNotMatch(html, /nation-overview-action-icons|View institutions|BookOpen/);
  assert.match(button, /aria-label="Explore Aurelle: open the nation map"/);
});
