/** #392 UI 57: Nation overview institution rows.
 *  NEXT_PUBLIC_HARIMU_NATION_INSTITUTION_ROWS is HARIMU_UI_PACK entry 54.
 *  Preview on, production off. Flag off keeps the plain institution buttons.
 *  Flag on adds the row class and a trailing caret, still calls onCivic, and keeps the role names.
 *  An empty list stays hidden. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CaretRight } from '@phosphor-icons/react';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { ICON_SIZE_SYNC_FLAG } from '../lib/icon-size-sync.ts';
import { nationInstitutionRowsEnabled, NATION_INSTITUTION_ROWS_FLAG } from '../lib/nation-institution-rows.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = NATION_INSTITUTION_ROWS_FLAG;
const roles = ['Sovereign', 'Royal ministers', 'Royal council'];
const longName = 'Paramount Leader (General Secretary and State Chair)';
const aurelle = { id: 'aurelle', name: 'Aurelle', capital: 'Highspire' };
const government = { nationId: 'aurelle', roles: roles.map(name => ({ name })) };
const bans = [`overflow-wrap: ${'any'}where`, `overflow-wrap:${'any'}where`, `word-break: ${'break'}-all`, `word-break:${'break'}-all`];

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 54, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(nationInstitutionRowsEnabled(), false);
    assert.equal(nationInstitutionRowsEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationInstitutionRowsEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(nationInstitutionRowsEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 65);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(53), key, 'entry 54');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(52), ICON_SIZE_SYNC_FLAG, 'icon size sync stays entry 53');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 65/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 nation institution rows/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/nation-institution-rows.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NATION_INSTITUTION_ROWS/);
  assert.match(await read('app/nation-overview.tsx'), /institutionRows = nationInstitutionRowsEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /NATION_INSTITUTION_ROWS|nationInstitutionRowsEnabled/);
  const gov = await read('lib/government.ts');
  assert.match(gov, /roles: \['Sovereign', 'Royal ministers', 'Royal council'\]/);
  assert.match(gov, /Paramount Leader \(General Secretary and State Chair\)/);
});

const bundle = async (define) => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/nation-overview.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};
const defineFor = (rows, sync = 'false') => ({
  'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_MOTTO': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_NARROW_STACK': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_ICON_SIZE_SYNC': sync === undefined ? 'undefined' : JSON.stringify(sync),
  'process.env.NEXT_PUBLIC_HARIMU_NATION_INSTITUTION_ROWS': rows === undefined ? 'undefined' : JSON.stringify(rows),
});
const view = (React, render, mod, props) => render(React.createElement(mod.NationOverview, {
  nation: aurelle, government, onExplore() {}, onCivic() {}, ...props,
}));

test('flag off markup is unchanged; flag on adds the row class and caret, keeps names, and hides an empty list', async () => {
  const previous = process.env[key];
  delete process.env[key];
  try {
    const offMod = await bundle(defineFor('false'));
    const missingMod = await bundle(defineFor(undefined));
    const onMod = await bundle(defineFor('true'));
    const syncMod = await bundle(defineFor('true', 'true'));
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const paint = (mod, props) => view(React, renderToStaticMarkup, mod, props);
    const off = paint(offMod), missing = paint(missingMod), on = paint(onMod);
    const list = html => html.match(/<ul class="nation-overview-institutions[\s\S]*?<\/ul>/)?.[0] ?? '';
    const plain = `<ul class="nation-overview-institutions" aria-label="Institutions">${roles.map(name => `<li><button type="button">${name}</button></li>`).join('')}</ul>`;
    assert.equal(off, missing, 'a missing flag matches flag off');
    assert.equal(paint(onMod, { institutionRows: false }), off, 'an explicit off prop matches flag off');
    assert.equal(list(off), plain);
    assert.doesNotMatch(list(off), /nation-overview-institution-row|<svg/);
    assert.doesNotMatch(off, /Royal institutions/);
    const caret = renderToStaticMarkup(React.createElement(CaretRight, { size: 18, 'aria-hidden': 'true' }));
    const caretEm = renderToStaticMarkup(React.createElement(CaretRight, { size: '1em', 'aria-hidden': 'true' }));
    assert.equal(paint(offMod, { institutionRows: true }), on, 'an explicit on prop matches flag on');
    assert.match(on, /<ul class="nation-overview-institutions nation-overview-institution-rows" aria-label="Institutions">/);
    assert.equal(on.includes(caret), true);
    assert.doesNotMatch(on, /nation-overview-institution-rows-sync|width="1em"|Royal institutions|law and succession/);
    const { Window } = await import('happy-dom');
    const window = new Window({ url: 'http://localhost/' });
    window.document.body.innerHTML = on;
    const buttons = [...window.document.querySelectorAll('button.nation-overview-institution-row')];
    assert.deepEqual(buttons.map(button => button.textContent), roles);
    assert.deepEqual(buttons.map(button => button.querySelector('.nation-overview-institution-name').textContent), roles);
    for (const mark of window.document.querySelectorAll('button.nation-overview-institution-row svg')) assert.equal(mark.getAttribute('aria-hidden'), 'true');
    window.close();
    const synced = paint(syncMod);
    assert.match(synced, /nation-overview-institutions nation-overview-institution-rows nation-overview-institution-rows-sync/);
    assert.equal(synced.includes(caretEm), true);
    assert.equal(paint(onMod, { iconSizeSync: true }).includes(caretEm), true);
    assert.equal(paint(syncMod, { iconSizeSync: false }).includes(caret), true);
    const foreign = paint(onMod, { government: { nationId: 'meridian', roles: [{ name: longName }] } });
    assert.doesNotMatch(foreign, /nation-overview-institutions|Paramount Leader/);
    const blank = paint(onMod, { government: { nationId: 'aurelle', roles: [{ name: '  ' }] } });
    assert.doesNotMatch(blank, /nation-overview-institutions/);
    const meridian = paint(onMod, { nation: { id: 'meridian', name: 'Meridian' }, government: { nationId: 'meridian', roles: [{ name: longName }, { name: 'Standing Committee' }] } });
    assert.match(meridian, /nation-overview-institution-name">Paramount Leader \(General Secretary and State Chair\)/);
    assert.match(meridian, /nation-overview-institution-name">Standing Committee/);
    assert.doesNotMatch(meridian, /Royal institutions|law and succession|<small>/);
    const css = await read('app/nation-overview.css');
    const block = css.slice(css.indexOf('/* #392 UI 57'));
    assert.ok(block.startsWith('/* #392 UI 57'));
    assert.match(block, /min-height:44px/);
    assert.match(block, /button\.nation-overview-institution-row:not\(\.market-item\) svg\{flex:none;width:calc\(18px \* var\(--text-scale, 1\)\);height:calc\(18px \* var\(--text-scale, 1\)\);color:#d0ad54\}/);
    assert.match(block, /font-size:calc\(18px \* var\(--text-scale, 1\)\);width:1em;height:1em/);
    assert.match(block, /focus-visible\{outline:2px solid #f3ecd6/);
    assert.match(block, /overflow-wrap:break-word;word-break:normal/);
    for (const phrase of bans) assert.equal(block.includes(phrase), false, phrase);
    assert.equal(await clickCount(onMod, { nation: aurelle, government }), roles.length);
    assert.equal(await clickCount(offMod, { nation: aurelle, government }), roles.length);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});

async function clickCount(mod, props) {
  const { Window } = await import('happy-dom');
  const window = new Window({ url: 'http://localhost/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT'];
  const prev = new Map(keys.map(name => [name, globalThis[name]]));
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    const React = (await import('react')).default;
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const host = window.document.createElement('div');
    window.document.body.appendChild(host);
    const root = createRoot(host);
    let civic = 0;
    await act(async () => { root.render(React.createElement(mod.NationOverview, { ...props, onExplore() {}, onCivic() { civic += 1; } })); });
    const buttons = [...host.querySelectorAll('.nation-overview-institutions button')];
    assert.equal(buttons.length, props.government.roles.length);
    for (const button of buttons) await act(async () => { button.click(); });
    await act(async () => { root.unmount(); });
    return civic;
  } finally {
    for (const [name, value] of prev) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; }
    window.close();
  }
}
