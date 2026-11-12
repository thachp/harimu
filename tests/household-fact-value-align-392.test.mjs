/** #392 UI 68: Household fact values align to the trailing edge. NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_VALUE_ALIGN is HARIMU_UI_PACK entry 65.
 *  Preview on, production off. With fact icons on, Wallet, Food, Residence and Pantry values are text-align right. Flag off keeps today's left alignment. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { cityDestinations } from '../lib/city-destinations.ts';
import { householdFactValueAlignEnabled, HOUSEHOLD_FACT_VALUE_ALIGN_FLAG } from '../lib/household-fact-value-align.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = HOUSEHOLD_FACT_VALUE_ALIGN_FLAG;
const motto = "Win the crown's favor - or take the crown.";
const aurelle = { id: 'aurelle', name: 'Aurelle', motto, government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church', population: '924k' };
const stock = { nation: aurelle, walletMinor: 150, inventory: [{ item: 'food', quantity: 3 }, { item: 'materials', quantity: 1 }], residence: 'Highspire' };
const factText = ['<dt>Wallet</dt><dd>1.50 Crown (CRN) · gold-backed</dd>', '<dt>Food</dt><dd>3</dd>', '<dt>Residence</dt><dd>Highspire</dd>', '<dt>Pantry</dt><dd>3 food · 1 materials</dd>'];
const dropAlign = html => html.replaceAll(' household-v2-fact-value-align', '');
test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 65, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key]; assert.equal(householdFactValueAlignEnabled(), false); assert.equal(householdFactValueAlignEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(householdFactValueAlignEnabled(value), false);
    process.env[key] = 'true'; assert.equal(householdFactValueAlignEnabled(), true);
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key)); assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 70);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(64), key, 'entry 65');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(63), 'NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_ICONS', 'entry 64 stays household fact icons');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(62), 'NEXT_PUBLIC_HARIMU_HOUSEHOLD_IDENTITY', 'entry 63 stays household identity');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 70/); assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 household fact value align/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key)); assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/household-fact-value-align.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_VALUE_ALIGN/);
  assert.match(await read('app/scene-panels-v2.tsx'), /factValueAlign = householdFactValueAlignEnabled\(\)/); assert.match(await read('app/panel-v2.tsx'), /const city = Boolean\(mark \|\| tagline \|\| primaryKicker\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /HOUSEHOLD_FACT_VALUE_ALIGN|householdFactValueAlignEnabled/);
});
const bundle = async (align, icons) => {
  const { build } = await import('esbuild');
  const define = { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"true"' };
  if (align !== undefined) define['process.env.NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_VALUE_ALIGN'] = JSON.stringify(align);
  if (icons !== undefined) define['process.env.NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_ICONS'] = JSON.stringify(icons);
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`)).toString('base64')}`);
};
const aligns = async (html, css) => {
  const { Window } = await import('happy-dom');
  const window = new Window({ url: 'http://localhost/' });
  window.document.head.innerHTML = `<style>${css}</style>`;
  window.document.body.innerHTML = `<div class="harimu-game"><aside class="game-inspector"><div class="game-inspector-body">${html}</div></aside></div>`;
  const values = [...window.document.querySelectorAll('.panel-v2-stats dd')].map(dd => window.getComputedStyle(dd).textAlign);
  window.close();
  return values;
};
test('flag off matches a missing flag and today\'s left-aligned facts; the prop turns alignment on or off', async () => {
  const previous = process.env[key]; delete process.env[key];
  try {
    const onMod = await bundle('true', 'true'), offMod = await bundle('false', 'true'), missingMod = await bundle(undefined, 'true'), alignOnly = await bundle('true', 'false'), today = await bundle('false', 'false');
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const { Coins, Bread, House, Cube } = await import('@phosphor-icons/react');
    const marks = { Wallet: Coins, Food: Bread, Residence: House, Pantry: Cube };
    const view = (mod, extra = {}) => renderToStaticMarkup(React.createElement(mod.HouseholdSummary, { ...stock, identity: false, ...extra }));
    const on = view(onMod), off = view(offMod), css = `${await read('app/game-shell.css')}${await read('app/panel-v2.css')}`;
    assert.equal(view(missingMod), off, 'a missing flag matches flag off'); assert.equal(view(onMod, { factValueAlign: false }), off, 'the prop turns alignment off');
    assert.equal(view(offMod, { factValueAlign: true }), on, 'the prop turns alignment on'); assert.equal(dropAlign(on), off, 'flag on adds only the alignment class');
    assert.equal(dropAlign(view(onMod, { identity: true })), view(offMod, { identity: true }), 'identity markup is unchanged aside from the alignment class');
    assert.doesNotMatch(off, /household-v2-fact-value-align|panel-v2-city/); assert.match(off, /<dl class="panel-v2-stats panel-v2-facts">/);
    assert.match(on, /<div class="household-v2 household-v2-fact-value-align"><section class="panel-v2" aria-label="Household">/);
    assert.match(on, /<dl class="panel-v2-stats panel-v2-facts">/); assert.doesNotMatch(on, /panel-v2-city/); assert.equal([...on.matchAll(/<section class="([^"]+)"/g)].map(match => match[1]).at(0), 'panel-v2');
    const bare = html => html.replace(/<span class="panel-v2-icon" aria-hidden="true"><svg[\s\S]*?<\/svg><\/span>/g, '');
    for (const row of factText) assert.ok(bare(off).includes(row) && bare(on).includes(row), row);
    assert.deepEqual(await aligns(off, css), ['left', 'left', 'left', 'left']); assert.deepEqual(await aligns(on, css), ['right', 'right', 'right', 'right']);
    const hidden = view(onMod, { inventory: undefined }), pantryOff = view(onMod, { pantry: false });
    assert.doesNotMatch(hidden, /Food<\/dt>|Pantry<\/dt>/); assert.match(hidden, /Wallet<\/dt>/); assert.match(hidden, /Residence<\/dt>/);
    assert.match(pantryOff, /Food<\/dt><dd>3<\/dd>/); assert.doesNotMatch(pantryOff, /Pantry<\/dt>/);
    const { Window } = await import('happy-dom');
    const window = new Window({ url: 'http://localhost/' }); window.document.body.innerHTML = on;
    const facts = [...window.document.querySelectorAll('.panel-v2-facts > div')];
    assert.deepEqual(facts.map(row => row.querySelector('dt').textContent), ['Wallet', 'Food', 'Residence', 'Pantry']);
    assert.deepEqual(facts.map(row => row.querySelector('dd').textContent), ['1.50 Crown (CRN) · gold-backed', '3', 'Highspire', '3 food · 1 materials']);
    for (const row of facts) {
      const dt = row.querySelector('dt'), svg = dt.querySelector('svg'), label = dt.textContent, expected = renderToStaticMarkup(React.createElement(marks[label], { size: '1em' }));
      const paths = html => [...html.matchAll(/\sd="([^"]*)"/g)].map(match => match[1]);
      assert.equal(dt.querySelector('.panel-v2-icon')?.getAttribute('aria-hidden'), 'true', label); assert.deepEqual(paths(svg.outerHTML), paths(expected), label);
    }
    window.close();
    const wrappedOn = view(alignOnly), wrappedOff = view(today), stats = html => html.match(/<dl class="panel-v2-stats">[\s\S]*?<\/dl>/)[0];
    assert.doesNotMatch(wrappedOn, /panel-v2-facts/); assert.equal(stats(wrappedOn), stats(wrappedOff), 'icons off keeps today\'s wrapping stats');
    assert.equal(view(alignOnly, { factIcons: false, factValueAlign: false }), wrappedOff); assert.deepEqual(await aligns(wrappedOn, css), await aligns(wrappedOff, css));
    assert.ok((await aligns(wrappedOn, css)).every(value => value === 'left'));
    const paint = mod => ['WorldSummary', 'CitySummary', 'WorkSummary', 'MarketSummary', 'GovernmentSummary'].map(name => renderToStaticMarkup(React.createElement(mod[name], name === 'WorldSummary' ? { nation: aurelle, population: '924k', onView() {} } : name === 'CitySummary' ? { cityName: 'Highspire', city: { capital: true, description: 'The royal cliff capital, connected by gilded bridges above a gorge.' }, nation: aurelle, destinations: cityDestinations('aurelle', true), onView() {} } : name === 'WorkSummary' ? { capacity: 8, contributions: 2, onMarket() {} } : name === 'MarketSummary' ? { nation: aurelle, walletMinor: 100, food: 1, board: true, listings: false, onHousehold() {} } : { nation: aurelle, account: true })));
    assert.deepEqual(paint(onMod), paint(offMod)); assert.deepEqual(paint(alignOnly), paint(today));
    const block = css.slice(css.indexOf('/* #392 UI 68'));
    assert.ok(block.startsWith('/* #392 UI 68')); assert.match(block, /\.household-v2\.household-v2-fact-value-align \.panel-v2-facts dd\{[^}]*text-align:right/);
    for (const rule of [/overflow-wrap:normal/, /word-break:normal/, /hyphens:none/]) assert.match(block, rule);
    assert.match(css, /\.panel-v2 \.panel-v2-facts dd\{min-width:0;overflow-wrap:break-word;word-break:normal;hyphens:manual;white-space:normal\}/);
    assert.doesNotMatch(block, /panel-v2-city/); assert.equal(css.split('household-v2-fact-value-align').length, 2);
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});
test('painted Aurelle household values stay trailing and whole at 390px, 1280px, 150% text, and a 384px inspector', async (t) => {
  let chromium; try { ({ chromium } = await import('playwright')); } catch { return t.skip('playwright is not installed'); }
  let browser; try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); } catch { return t.skip('headless chromium is not installed'); }
  try {
    const onMod = await bundle('true', 'true');
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(React.createElement(onMod.HouseholdSummary, { ...stock, identity: true, factIcons: true, factValueAlign: true }));
    const css = `${await read('app/game-shell.css')}${await read('app/panel-v2.css')}`;
    for (const spec of [{ name: 'aurelle-household-values-390.png', width: 390, scale: '' }, { name: 'aurelle-household-values-1280.png', width: 1280, scale: '' }, { name: 'aurelle-household-values-390-scale-1.5.png', width: 390, scale: '1.5' }, { name: 'aurelle-household-values-384.png', width: 384, scale: '' }]) {
      const page = await browser.newPage({ viewport: { width: spec.width, height: 900 } });
      await page.setContent(`<!doctype html><html style="${spec.scale ? `--text-scale:${spec.scale}` : ''}"><head><style>*{box-sizing:border-box}svg{display:block}${css}.harimu-game{height:auto;min-height:0;overflow:visible}.game-inspector{position:relative;width:${spec.width}px;height:auto;top:auto;bottom:auto;overflow:visible}.game-inspector-body{overflow:visible}</style></head><body><div class="harimu-game"><aside class="game-inspector"><div class="game-inspector-body">${html}</div></aside></div></body></html>`, { waitUntil: 'load' });
      const painted = await page.evaluate(() => {
        const panel = document.querySelector('.panel-v2'), head = panel.querySelector('header'), facts = [...panel.querySelectorAll('.panel-v2-facts > div')], words = [];
        const linesOf = el => { const range = document.createRange(); range.selectNodeContents(el); return [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0); };
        const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT); let node;
        while ((node = walker.nextNode())) { const re = /\S+/g; let match; while ((match = re.exec(node.textContent ?? ''))) { const range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length); const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0); if (rects.length) words.push({ word: match[0], lines: new Set(rects.map(rect => Math.round(rect.top))).size, right: Math.max(...rects.map(rect => rect.right)) }); } }
        const panelBox = panel.getBoundingClientRect();
        const rows = facts.map(row => { const dd = row.querySelector('dd'), svg = row.querySelector('svg'), style = getComputedStyle(dd), box = svg.getBoundingClientRect(), rowBox = row.getBoundingClientRect(), lines = linesOf(dd); return { label: row.querySelector('dt').textContent, value: dd.textContent, align: style.textAlign, wrap: style.overflowWrap, break: style.wordBreak, hyphens: style.hyphens, rowRight: rowBox.right, lineRights: lines.map(rect => rect.right), lineCount: lines.length, hidden: svg.getAttribute('aria-hidden') || svg.closest('[aria-hidden]')?.getAttribute('aria-hidden'), color: getComputedStyle(svg).color, width: box.width, height: box.height, opacity: Number(getComputedStyle(svg).opacity) }; });
        return { title: head.querySelector('h2').textContent, subtitle: head.querySelector('div > p').textContent, motto: head.querySelector('.household-v2-motto')?.textContent, crest: Boolean(head.querySelector('[data-nation-crest="aurelle"]')), city: panel.className.includes('panel-v2-city'), alignClass: document.querySelector('.household-v2').classList.contains('household-v2-fact-value-align'), section: panel.className, overflow: panel.scrollWidth - panel.clientWidth, panelRight: panelBox.right, rows, words };
      });
      assert.equal(painted.title, 'Your household', spec.name); assert.equal(painted.subtitle, 'Highspire \u00B7 Aurelle', spec.name); assert.equal(painted.motto, motto, spec.name);
      assert.equal(painted.crest, true, spec.name); assert.equal(painted.city, false, spec.name); assert.equal(painted.alignClass, true, spec.name); assert.equal(painted.section, 'panel-v2', spec.name);
      assert.deepEqual(painted.rows.map(row => row.label), ['Wallet', 'Food', 'Residence', 'Pantry'], spec.name);
      assert.deepEqual(painted.rows.map(row => row.value), ['1.50 Crown (CRN) · gold-backed', '3', 'Highspire', '3 food · 1 materials'], spec.name);
      assert.ok(painted.overflow <= 1, `${spec.name} overflow ${painted.overflow}`); assert.ok(painted.words.length > 0, spec.name);
      for (const word of painted.words) { assert.equal(word.lines, 1, `${spec.name} ${word.word}`); assert.ok(word.right <= painted.panelRight + 1, `${spec.name} ${word.word}`); }
      for (const row of painted.rows) {
        assert.equal(row.align, 'right', `${spec.name} ${row.label}`); assert.equal(row.wrap, 'normal', `${spec.name} ${row.label}`); assert.equal(row.break, 'normal', `${spec.name} ${row.label}`); assert.equal(row.hyphens, 'none', `${spec.name} ${row.label}`);
        assert.equal(row.hidden, 'true', `${spec.name} ${row.label}`); assert.equal(row.color, 'rgb(226, 195, 107)', `${spec.name} ${row.label}`); assert.ok(row.opacity > 0 && row.height > 0 && row.width > 0, `${spec.name} ${row.label}`);
        for (const right of row.lineRights) assert.ok(Math.abs(right - row.rowRight) <= 1, `${spec.name} ${row.label} ${right} vs ${row.rowRight}`);
        if (row.label === 'Food' || row.label === 'Residence') assert.equal(row.lineCount, 1, `${spec.name} ${row.label}`);
        if (row.label === 'Wallet' && spec.scale === '1.5') assert.ok(row.lineCount > 1, `${spec.name} wallet lines ${row.lineCount}`);
      }
      try {
        const dir = process.env.HARIMU_TEST_ARTIFACTS_DIR || join(os.tmpdir(), 'harimu-household-fact-value-align-392');
        mkdirSync(dir, { recursive: true });
        await page.locator('.panel-v2').screenshot({ path: join(dir, spec.name) });
      } catch { /* a missing or unwritable artifact dir must not fail the wrap checks */ }
      await page.close();
    }
  } finally { await browser.close(); }
});
