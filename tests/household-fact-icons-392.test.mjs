/** #392 UI 67: Household fact-row icons. NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_ICONS is HARIMU_UI_PACK entry 64.
 *  Preview on, production off. Flag on: Wallet, Food, Residence and Pantry get a decorative gold icon. Flag off keeps today's facts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { cityDestinations } from '../lib/city-destinations.ts';
import { householdFactIcon, householdFactIconsEnabled, HOUSEHOLD_FACT_ICONS, HOUSEHOLD_FACT_ICONS_FLAG } from '../lib/household-fact-icons.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = HOUSEHOLD_FACT_ICONS_FLAG;
const motto = "Win the crown's favor - or take the crown.";
const aurelle = { id: 'aurelle', name: 'Aurelle', motto, government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church', population: '924k' };
const stock = { nation: aurelle, walletMinor: 150, inventory: [{ item: 'food', quantity: 3 }, { item: 'materials', quantity: 1 }], residence: 'Highspire' };
const factText = ['<dt>Wallet</dt><dd>1.50 Crown (CRN) · gold-backed</dd>', '<dt>Food</dt><dd>3</dd>', '<dt>Residence</dt><dd>Highspire</dd>', '<dt>Pantry</dt><dd>3 food · 1 materials</dd>'];
test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 64, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key]; assert.equal(householdFactIconsEnabled(), false); assert.equal(householdFactIconsEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(householdFactIconsEnabled(value), false);
    process.env[key] = 'true'; assert.equal(householdFactIconsEnabled(), true);
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key)); assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 71);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(63), key, 'entry 64');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(62), 'NEXT_PUBLIC_HARIMU_HOUSEHOLD_IDENTITY', 'entry 63 stays household identity');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 71/); assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 household fact icons/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key)); assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/household-fact-icons.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_ICONS/);
  assert.match(await read('app/scene-panels-v2.tsx'), /factIcons = householdFactIconsEnabled\(\)/); assert.match(await read('app/panel-v2.tsx'), /const city = Boolean\(mark \|\| tagline \|\| primaryKicker\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /HOUSEHOLD_FACT_ICONS|householdFactIconsEnabled/);
});
test('the four fact labels map to icon names and any other label maps to null', () => {
  assert.deepEqual(Object.keys(HOUSEHOLD_FACT_ICONS), ['Wallet', 'Food', 'Residence', 'Pantry']);
  assert.deepEqual(['Wallet', 'Food', 'Residence', 'Pantry'].map(householdFactIcon), ['Coins', 'Bread', 'House', 'Cube']);
  for (const label of ['Faith', 'Wallet ', 'wallet', 'Materials', 'Imports', '']) assert.equal(householdFactIcon(label), null, label);
});
const bundle = async (icons) => {
  const { build } = await import('esbuild');
  const define = { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"true"' };
  if (icons !== undefined) define['process.env.NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_ICONS'] = JSON.stringify(icons);
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`)).toString('base64')}`);
};
const bare = html => html.replace(/<span class="panel-v2-icon" aria-hidden="true"><svg[\s\S]*?<\/svg><\/span>/g, '').replaceAll(' panel-v2-facts', '');
test('flag off matches a missing flag and today\'s facts; flag on adds only the four decorative icons', async () => {
  const previous = process.env[key]; delete process.env[key];
  try {
    const onMod = await bundle('true'), offMod = await bundle('false'), missingMod = await bundle(undefined);
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const { Coins, Bread, House, Cube } = await import('@phosphor-icons/react');
    const marks = { Wallet: Coins, Food: Bread, Residence: House, Pantry: Cube };
    const view = (mod, extra = {}) => renderToStaticMarkup(React.createElement(mod.HouseholdSummary, { ...stock, identity: false, ...extra }));
    const on = view(onMod), off = view(offMod);
    assert.equal(view(missingMod), off, 'a missing flag matches flag off'); assert.equal(view(onMod, { factIcons: false }), off, 'the prop turns icons off');
    assert.equal(view(offMod, { factIcons: true }), on, 'the prop turns icons on'); assert.equal(bare(on), off, 'flag on adds only the icons and panel-v2-facts');
    assert.equal(bare(view(onMod, { identity: true })), view(offMod, { identity: true }), 'identity markup is unchanged aside from the fact icons');
    assert.match(off, /<div class="household-v2"><section class="panel-v2" aria-label="Household"><header class="panel-v2-summary"><div><h2>Household<\/h2><p>Aurelle<\/p><\/div><\/header>/);
    assert.match(off, /<dl class="panel-v2-stats">/); assert.doesNotMatch(off, /panel-v2-facts|panel-v2-icon|panel-v2-city|<svg/);
    assert.match(on, /<section class="panel-v2" aria-label="Household">/); assert.match(on, /<dl class="panel-v2-stats panel-v2-facts">/); assert.doesNotMatch(on, /panel-v2-city/);
    for (const row of factText) assert.ok(off.includes(row) && bare(on).includes(row), row);
    assert.equal(view(onMod, { enabled: false, factIcons: true }), '');
    const hidden = view(onMod, { inventory: undefined }), pantryOff = view(onMod, { pantry: false });
    assert.doesNotMatch(hidden, /Food<\/dt>|Pantry<\/dt>/); assert.match(hidden, /Wallet<\/dt>/); assert.match(hidden, /Residence<\/dt>/);
    assert.match(pantryOff, /Food<\/dt><dd>3<\/dd>/); assert.doesNotMatch(pantryOff, /Pantry<\/dt>/);
    const { Window } = await import('happy-dom');
    const window = new Window({ url: 'http://localhost/' }); window.document.body.innerHTML = on;
    const facts = [...window.document.querySelectorAll('.panel-v2-facts > div')];
    assert.deepEqual(facts.map(row => row.querySelector('dt').textContent), ['Wallet', 'Food', 'Residence', 'Pantry']);
    assert.deepEqual(facts.map(row => row.querySelector('dd').textContent), ['1.50 Crown (CRN) · gold-backed', '3', 'Highspire', '3 food · 1 materials']);
    for (const row of facts) {
      const dt = row.querySelector('dt'), svg = dt.querySelector('svg'), label = dt.textContent;
      const expected = renderToStaticMarkup(React.createElement(marks[label], { size: '1em' }));
      const paths = html => [...html.matchAll(/\sd="([^"]*)"/g)].map(match => match[1]);
      assert.equal(dt.querySelector('.panel-v2-icon')?.getAttribute('aria-hidden'), 'true', label);
      assert.equal(svg?.getAttribute('width'), '1em', label); assert.deepEqual(paths(svg.outerHTML), paths(expected), label);
    }
    window.document.body.innerHTML = hidden;
    assert.deepEqual([...window.document.querySelectorAll('.panel-v2-facts > div')].map(row => row.querySelector('dt').textContent), ['Wallet', 'Residence']);
    window.document.body.innerHTML = pantryOff;
    assert.deepEqual([...window.document.querySelectorAll('.panel-v2-facts > div')].map(row => row.querySelector('dt').textContent), ['Wallet', 'Food', 'Residence']);
    window.close();
    const paint = mod => ['WorldSummary', 'CitySummary', 'WorkSummary', 'MarketSummary', 'GovernmentSummary'].map(name => renderToStaticMarkup(React.createElement(mod[name], name === 'WorldSummary' ? { nation: aurelle, population: '924k', onView() {} } : name === 'CitySummary' ? { cityName: 'Highspire', city: { capital: true, description: 'The royal cliff capital, connected by gilded bridges above a gorge.' }, nation: aurelle, destinations: cityDestinations('aurelle', true), onView() {} } : name === 'WorkSummary' ? { capacity: 8, contributions: 2, onMarket() {} } : name === 'MarketSummary' ? { nation: aurelle, walletMinor: 100, food: 1, board: true, listings: false, onHousehold() {} } : { nation: aurelle, account: true })));
    assert.deepEqual(paint(onMod), paint(offMod));
    const css = await read('app/panel-v2.css'), block = css.slice(css.indexOf('/* #392 UI 67'));
    assert.ok(block.startsWith('/* #392 UI 67'));
    for (const rule of [/font-size:calc\(18px \* var\(--text-scale, 1\)\)/, /overflow-wrap:normal/, /word-break:normal/, /hyphens:none/]) assert.match(block, rule);
    assert.doesNotMatch(block, /panel-v2-city/);
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});
test('painted Aurelle household facts keep whole words at 390px, 1280px, and 150% text', async (t) => {
  let chromium; try { ({ chromium } = await import('playwright')); } catch { return t.skip('playwright is not installed'); }
  let browser; try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); } catch { return t.skip('headless chromium is not installed'); }
  try {
    const onMod = await bundle('true');
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(React.createElement(onMod.HouseholdSummary, { ...stock, identity: true, factIcons: true }));
    const css = `${await read('app/game-shell.css')}${await read('app/panel-v2.css')}`;
    for (const spec of [{ name: 'aurelle-household-facts-390.png', width: 390, scale: '' }, { name: 'aurelle-household-facts-1280.png', width: 1280, scale: '' }, { name: 'aurelle-household-facts-390-scale-1.5.png', width: 390, scale: '1.5' }]) {
      const page = await browser.newPage({ viewport: { width: spec.width, height: 900 } });
      await page.setContent(`<!doctype html><html style="${spec.scale ? `--text-scale:${spec.scale}` : ''}"><head><style>*{box-sizing:border-box}svg{display:block}${css}.harimu-game{height:auto;min-height:0;overflow:visible}.game-inspector{position:relative;width:${spec.width}px;height:auto;top:auto;bottom:auto;overflow:visible}.game-inspector-body{overflow:visible}</style></head><body><div class="harimu-game"><aside class="game-inspector"><div class="game-inspector-body">${html}</div></aside></div></body></html>`, { waitUntil: 'load' });
      const painted = await page.evaluate(scale => {
        const panel = document.querySelector('.panel-v2'), head = panel.querySelector('header'), facts = [...panel.querySelectorAll('.panel-v2-facts > div')], words = [];
        const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT); let node;
        while ((node = walker.nextNode())) { const re = /\S+/g; let match; while ((match = re.exec(node.textContent ?? ''))) { const range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length); const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0); if (rects.length) words.push({ word: match[0], lines: new Set(rects.map(rect => Math.round(rect.top))).size, right: Math.max(...rects.map(rect => rect.right)) }); } }
        const panelBox = panel.getBoundingClientRect();
        const icons = facts.map(row => { const svg = row.querySelector('svg'), box = svg.getBoundingClientRect(), style = getComputedStyle(svg); return { label: row.querySelector('dt').textContent, value: row.querySelector('dd').textContent, hidden: svg.getAttribute('aria-hidden') || svg.closest('[aria-hidden]')?.getAttribute('aria-hidden'), color: style.color, font: parseFloat(style.fontSize), width: box.width, height: box.height, opacity: Number(style.opacity), display: style.display }; });
        return { title: head.querySelector('h2').textContent, subtitle: head.querySelector('div > p').textContent, motto: head.querySelector('.household-v2-motto')?.textContent, crest: Boolean(head.querySelector('[data-nation-crest="aurelle"]')), city: panel.className.includes('panel-v2-city'), facts: panel.classList.contains('panel-v2-facts') || Boolean(panel.querySelector('.panel-v2-facts')), section: panel.className, overflow: panel.scrollWidth - panel.clientWidth, panelRight: panelBox.right, icons, words };
      }, Number(spec.scale || 1));
      assert.equal(painted.title, 'Your household', spec.name); assert.equal(painted.subtitle, 'Highspire \u00B7 Aurelle', spec.name); assert.equal(painted.motto, motto, spec.name);
      assert.equal(painted.crest, true, spec.name); assert.equal(painted.city, false, spec.name); assert.equal(painted.facts, true, spec.name); assert.equal(painted.section, 'panel-v2', spec.name);
      assert.deepEqual(painted.icons.map(icon => icon.label), ['Wallet', 'Food', 'Residence', 'Pantry'], spec.name);
      assert.deepEqual(painted.icons.map(icon => icon.value), ['1.50 Crown (CRN) · gold-backed', '3', 'Highspire', '3 food · 1 materials'], spec.name);
      for (const icon of painted.icons) {
        assert.equal(icon.hidden, 'true', `${spec.name} ${icon.label}`); assert.equal(icon.color, 'rgb(226, 195, 107)', `${spec.name} ${icon.label}`);
        assert.equal(icon.display, 'block', `${spec.name} ${icon.label}`); assert.ok(icon.opacity > 0 && icon.height > 0 && icon.width > 0, `${spec.name} ${icon.label}`);
        assert.ok(Math.abs(icon.font - 18 * Number(spec.scale || 1)) < 0.6, `${spec.name} ${icon.label} ${icon.font}`);
      }
      assert.ok(painted.words.length > 0, spec.name); assert.ok(painted.overflow <= 1, `${spec.name} overflow ${painted.overflow}`);
      for (const word of painted.words) { assert.equal(word.lines, 1, `${spec.name} ${word.word}`); assert.ok(word.right <= painted.panelRight + 1, `${spec.name} ${word.word}`); }
      try {
        const dir = process.env.HARIMU_TEST_ARTIFACTS_DIR || join(os.tmpdir(), 'harimu-household-fact-icons-392');
        mkdirSync(dir, { recursive: true });
        await page.locator('.panel-v2').screenshot({ path: join(dir, spec.name) });
      } catch { /* a missing or unwritable artifact dir must not fail the wrap checks */ }
      await page.close();
    }
  } finally { await browser.close(); }
});
