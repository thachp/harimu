/** #392 UI 54: Nation overview actions stack. NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK is HARIMU_UI_PACK entry 51.
 *  Preview on, production off. The stack class is on the action row only when this flag and the nation action row are both on.
 *  Flag off markup matches the row as it is. The added CSS sizes each button from its longest word and wraps on spaces. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { capitalCityForNation } from '../lib/cities.ts';
import { NATION_ACTIONS_FLAG } from '../lib/nation-actions.ts';
import { NATION_ACTION_ICONS_FLAG } from '../lib/nation-action-icons.ts';
import { nationActionsStackEnabled, NATION_ACTIONS_STACK_FLAG } from '../lib/nation-actions-stack.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = NATION_ACTIONS_STACK_FLAG;
const nationIds = ['aurelle', 'confluence', 'fulmara', 'hoarvale', 'ilmar', 'kindle', 'korund', 'meridian', 'varkand', 'veldwood'];
const capitals = nationIds.map(id => ({ id, capital: capitalCityForNation(id)?.name })).filter(row => row.capital);
const byLength = [...capitals].sort((a, b) => b.capital.length - a.capital.length || a.capital.localeCompare(b.capital));
const wrapBans = [`overflow-wrap: ${'any'}where`, `overflow-wrap:${'any'}where`, `word-break: ${'break'}-all`, `word-break:${'break'}-all`];

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 51, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(nationActionsStackEnabled(), false);
    assert.equal(nationActionsStackEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationActionsStackEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(nationActionsStackEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 61);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(50), key, 'entry 51');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(51), 'NEXT_PUBLIC_HARIMU_NATION_ACTIONS_NARROW_STACK', 'entry 52 follows the stack flag');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(49), NATION_ACTION_ICONS_FLAG, 'nation action icons stay entry 50');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(39), NATION_ACTIONS_FLAG, 'nation actions stay entry 40');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 61/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 nation actions stack/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/nation-actions-stack.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK/);
  assert.equal(capitals.length, 10);
  assert.deepEqual(byLength.slice(0, 3).map(row => row.capital), ['Stonehearth', 'Forgehaven', 'Mirrorhall']);
  assert.equal(byLength[0].id, 'korund');
});

const bundle = async (define) => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/nation-overview.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

const defineFor = (stack, actions = 'true', icons = 'false') => ({
  'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_MOTTO': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS': JSON.stringify(actions),
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS': JSON.stringify(icons),
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK': stack === undefined ? 'undefined' : JSON.stringify(stack),
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_NARROW_STACK': 'undefined',
});

test('the stack class appears only with both flags; flag off markup is unchanged', async () => {
  const previous = process.env[key];
  delete process.env[key];
  try {
    const offMod = await bundle(defineFor('false'));
    const missingMod = await bundle(defineFor(undefined));
    const onMod = await bundle(defineFor('true', 'true', 'false'));
    const iconsMod = await bundle(defineFor('false', 'true', 'true'));
    const bothMod = await bundle(defineFor('true', 'true', 'true'));
    const actionsOff = await bundle(defineFor('true', 'false', 'true'));
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const view = (mod, props) => renderToStaticMarkup(React.createElement(mod.NationOverview, {
      nation: { id: 'korund', name: 'Korund', capital: 'Stonehearth' }, onExplore() {}, onCivic() {}, onInstitutions() {}, ...props,
    }));
    const off = view(offMod), missing = view(missingMod), on = view(onMod), icons = view(iconsMod), both = view(bothMod);
    const button = html => html.match(/<button type="button" class="world-atlas-primary"[\s\S]*?<\/button>/)?.[0] ?? '';
    assert.equal(off, missing, 'a missing flag matches flag off');
    assert.equal(view(onMod, { actionsStack: false }), off, 'an explicit off prop matches flag off');
    assert.match(off, /<div class="nation-overview-actions">/);
    assert.doesNotMatch(off, /nation-overview-actions-stack|nation-overview-action-icons|world-atlas-primary-label/);
    assert.match(icons, /<div class="nation-overview-actions nation-overview-action-icons">/);
    assert.doesNotMatch(icons, /nation-overview-actions-stack/);
    assert.match(on, /<div class="nation-overview-actions nation-overview-actions-stack">/);
    assert.doesNotMatch(on, /nation-overview-action-icons/);
    assert.match(both, /<div class="nation-overview-actions nation-overview-action-icons nation-overview-actions-stack">/);
    assert.equal(button(on), button(off), 'stacking does not change the button markup');
    assert.equal(button(both), button(icons));
    assert.ok(on.indexOf('world-atlas-primary') < on.indexOf('nation-overview-secondary'), 'Explore stays first');
    assert.match(button(on), /aria-label="Explore Stonehearth: open the city"/);
    assert.match(on, />View institutions<\/button>/);
    const closed = view(actionsOff, { actionsStack: true, actionIcons: true });
    assert.doesNotMatch(closed, /nation-overview-actions|nation-overview-actions-stack|View institutions|world-atlas-primary/);
    assert.match(closed, /<button type="button" class="nation-overview-primary" aria-label="Explore Stonehearth: open the city">Explore Stonehearth<\/button>/);
    const css = await read('app/nation-overview.css');
    const block = css.slice(css.indexOf('/* #392 UI 54'));
    assert.ok(block.startsWith('/* #392 UI 54'));
    assert.match(block, /\{flex:1 1 auto;width:auto;min-width:min-content;max-width:100%;min-height:44px;overflow-wrap:normal;word-break:normal\}/);
    assert.match(block, /\.world-atlas-primary-label\{min-width:min-content;overflow-wrap:normal;word-break:normal\}/);
    assert.match(css, /\.nation-overview-actions\{display:flex;flex-wrap:wrap;gap:8px;min-width:0\}/);
    assert.match(css, /flex:1 1 0;width:auto;min-width:0;max-width:100%;min-height:44px/);
    for (const phrase of wrapBans) assert.equal(block.includes(phrase), false, phrase);
    assert.doesNotMatch(await read('app/page.tsx'), /NATION_ACTIONS_STACK|nationActionsStackEnabled/);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});

test('at 100%, 125% and 150% text, action labels stay inside their buttons', async (t) => {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { return t.skip('playwright is not installed'); }
  let browser;
  try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); }
  catch { return t.skip('headless chromium is not installed'); }
  const previous = process.env[key];
  delete process.env[key];
  try {
    const plain = await bundle(defineFor('true', 'true', 'false'));
    const icons = await bundle(defineFor('true', 'true', 'true'));
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const css = `${(await read('app/globals.css')).replace(/@import[^;]+;/g, '')}${await read('app/game-shell.css')}${await read('app/world-atlas.css')}${await read('app/nation-overview.css')}`;
    const preflight = '*,::before,::after{box-sizing:border-box}button,svg{font:inherit}svg{display:block}';
    const markup = (mod, nation) => renderToStaticMarkup(React.createElement(mod.NationOverview, {
      nation, onExplore() {}, onCivic() {}, onInstitutions() {},
    }));
    const page = await browser.newPage();
    const longest = new Set(byLength.slice(0, 3).map(row => row.capital));
    const notes = [];
    for (const iconsOn of [false, true]) for (const { id, capital } of capitals) {
      const html = markup(iconsOn ? icons : plain, { id, name: id, capital, motto: 'A motto.', stability: 70, currency: 'Coin', government: 'State', economy: 'Trade', religion: 'Faith' });
      for (const width of [1280, 390]) for (const scale of [1, 1.25, 1.5]) {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><style>${preflight}${css}</style></head><body><div class="harimu-game"><aside class="game-inspector"><div class="game-inspector-body">${html}</div></aside></div></body></html>`, { waitUntil: 'load' });
        const measured = await page.evaluate(() => {
          const body = document.querySelector('.game-inspector-body');
          const actions = document.querySelector('.nation-overview-actions');
          const buttons = [...actions.querySelectorAll(':scope > button')];
          const clip = body.getBoundingClientRect();
          const issues = [];
          const rows = buttons.map(button => {
            const label = button.querySelector('.world-atlas-primary-label') || button;
            if (label.scrollWidth > label.clientWidth + 1) issues.push(`label ${label.scrollWidth}>${label.clientWidth} "${label.textContent}"`);
            if (button.getBoundingClientRect().height < 43.5) issues.push(`short ${button.textContent}`);
            const box = button.getBoundingClientRect();
            const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              for (const match of node.textContent.matchAll(/\S+/g)) {
                const range = document.createRange();
                range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
                const rects = [...range.getClientRects()].filter(rect => rect.width > 0);
                if (new Set(rects.map(rect => Math.round(rect.top))).size > 1) issues.push(`split ${match[0]}`);
                for (const rect of rects) {
                  if (rect.left < box.left - 0.5 || rect.right > box.right + 0.5 || rect.right > clip.right + 0.5 || rect.left < clip.left - 0.5) issues.push(`clipped ${match[0]}`);
                }
              }
            }
            return { top: Math.round(box.top), width: box.width, text: button.textContent, label: label.textContent, scrollWidth: label.scrollWidth, clientWidth: label.clientWidth };
          });
          const rowWidth = actions.getBoundingClientRect().width;
          const tops = new Set(rows.map(row => row.top));
          if (tops.size > 1) {
            if (rows[0].top > rows.at(-1).top) issues.push('Explore is not first');
            for (const row of rows) if (row.width < rowWidth - 1) issues.push(`stacked width ${row.width} < ${rowWidth} "${row.text}"`);
          }
          const paint = getComputedStyle(buttons[0]);
          return { issues, rows, rowWidth, stacked: tops.size > 1, minHeight: paint.minHeight, icons: actions.querySelectorAll('svg').length, gold: getComputedStyle(buttons[0]).backgroundColor, secondary: buttons[1] ? getComputedStyle(buttons[1]).backgroundColor : '' };
        });
        const idText = `${width}px @${scale * 100}% ${iconsOn ? 'icons' : 'plain'} ${capital}`;
        assert.deepEqual(measured.issues, [], idText);
        assert.equal(measured.minHeight, '44px', idText);
        assert.equal(measured.gold, 'rgb(208, 173, 84)', idText);
        if (measured.secondary) assert.equal(measured.secondary, 'rgb(26, 70, 80)', idText);
        assert.equal(measured.icons, iconsOn ? 3 : 1, idText);
        if (scale === 1.5 && longest.has(capital)) notes.push(`${idText}: label ${measured.rows.map(row => `${row.scrollWidth}<=${row.clientWidth}`).join(' | ')} ${measured.stacked ? 'stacked' : 'side by side'} row ${Math.round(measured.rowWidth)}px`);
      }
    }
    console.log(notes.join('\n'));
    await page.close();
  } finally {
    await browser.close();
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});
