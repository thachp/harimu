/** #392 UI 66: Household panel identity. NEXT_PUBLIC_HARIMU_HOUSEHOLD_IDENTITY is HARIMU_UI_PACK entry 63.
 *  Preview on, production off. Flag on: crest, "Your household" (visitor: "Household", #379), "{residence} · {nation}", and the nation's motto. Flag off keeps today's head. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { cityDestinations } from '../lib/city-destinations.ts';
import { locationLabel } from '../lib/game-viewport.ts';
import { householdIdentityEnabled, householdIdentityMotto, householdIdentitySubtitle, householdIdentityTitle, HOUSEHOLD_IDENTITY_FLAG } from '../lib/household-identity.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = HOUSEHOLD_IDENTITY_FLAG;
const motto = "Win the crown's favor - or take the crown.";
const mottoHtml = /Win the crown(?:'|&#x27;)s favor - or take the crown\./;
const aurelle = { id: 'aurelle', name: 'Aurelle', motto, government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church', population: '924k' };
test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 63, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key]; assert.equal(householdIdentityEnabled(), false); assert.equal(householdIdentityEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(householdIdentityEnabled(value), false);
    process.env[key] = 'true'; assert.equal(householdIdentityEnabled(), true);
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc')), bindings = await read('tests/text-bindings-988.test.mjs');
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key)); assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 65);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(62), key, 'entry 63');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(61), 'NEXT_PUBLIC_HARIMU_CITY_HEADER_HYPHEN_KEEP', 'entry 62 stays the city header hyphen flag');
  assert.match(bindings, /HARIMU_UI_PACK\.length, 65/); assert.match(bindings, /#392 household identity/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key)); assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/household-identity.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_HOUSEHOLD_IDENTITY/);
  assert.match(await read('app/scene-panels-v2.tsx'), /identity = householdIdentityEnabled\(\)/); assert.match(await read('app/panel-v2.tsx'), /const city = Boolean\(mark \|\| tagline \|\| primaryKicker\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /HOUSEHOLD_IDENTITY|householdIdentityEnabled/); assert.match(await read('lib/db.ts'), /Win the crown's favor - or take the crown\./);
});
test('title follows the citizen and visitor rule; subtitle and motto use only real fields', () => {
  assert.equal(householdIdentityTitle(), 'Your household'); assert.equal(householdIdentityTitle(false), locationLabel('home', 'Your household', false));
  assert.equal(householdIdentityTitle(true), 'Household'); assert.equal(householdIdentityTitle(true), locationLabel('home', 'Your household', true));
  assert.equal(householdIdentitySubtitle('Highspire', 'Aurelle'), 'Highspire \u00B7 Aurelle'); assert.equal(householdIdentitySubtitle('  Highspire  ', '  Aurelle  '), 'Highspire \u00B7 Aurelle');
  for (const residence of ['', '   ', null]) assert.equal(householdIdentitySubtitle(residence, 'Aurelle'), 'Aurelle');
  for (const name of ['', '   ', null]) assert.equal(householdIdentitySubtitle('Highspire', name), 'Highspire');
  assert.equal(householdIdentitySubtitle('', ''), ''); assert.equal(householdIdentitySubtitle(undefined, undefined), '');
  assert.equal(householdIdentityMotto(motto), motto); assert.equal(householdIdentityMotto(`  ${motto}  `), motto);
  for (const missing of [null, undefined, '', '  ', 0, 1]) assert.equal(householdIdentityMotto(missing), null);
});
const bundle = async (identity) => {
  const { build } = await import('esbuild');
  const define = { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"true"' };
  if (identity !== undefined) define['process.env.NEXT_PUBLIC_HARIMU_HOUSEHOLD_IDENTITY'] = JSON.stringify(identity);
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`)).toString('base64')}`);
};
test('flag off matches a missing flag and today\'s head; flag on shows crest, title, residence and motto without city classes', async () => {
  const previous = process.env[key]; delete process.env[key];
  try {
    const onMod = await bundle('true'), offMod = await bundle('false'), missingMod = await bundle(undefined);
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const view = (mod, extra = {}) => renderToStaticMarkup(React.createElement(mod.HouseholdSummary, { nation: aurelle, walletMinor: 150, inventory: [{ item: 'food', quantity: 3 }, { item: 'materials', quantity: 1 }], residence: 'Highspire', ...extra }));
    const on = view(onMod), off = view(offMod), stats = html => html.match(/<dl class="panel-v2-stats">[\s\S]*?<\/dl>/)?.[0], family = html => html.match(/<ul class="household-v2-family"[\s\S]*?<\/ul>/)?.[0];
    assert.equal(view(missingMod), off, 'a missing flag matches flag off'); assert.equal(view(onMod, { identity: false }), off, 'the prop turns identity off');
    assert.match(off, /<div class="household-v2"><section class="panel-v2" aria-label="Household"><header class="panel-v2-summary"><div><h2>Household<\/h2><p>Aurelle<\/p><\/div><\/header>/);
    assert.doesNotMatch(off, /household-v2-head|household-v2-motto|nation-crest|panel-v2-city|Your household/);
    assert.match(on, /<section class="panel-v2" aria-label="Your household">/); assert.match(on, /<header class="panel-v2-summary household-v2-head">/);
    assert.match(on, /data-nation-crest="aurelle"/); assert.match(on, /--crest-size:44px/); assert.doesNotMatch(on, /panel-v2-city/);
    assert.match(on, /<h2>Your household<\/h2><p>Highspire · Aurelle<\/p>/); assert.match(on, new RegExp(`<p class="household-v2-motto">${mottoHtml.source}</p>`));
    assert.match(view(offMod, { identity: true }), /Your household/); assert.match(view(onMod, { visitor: true }), /<h2>Household<\/h2><p>Highspire · Aurelle<\/p>/);
    assert.doesNotMatch(view(onMod, { visitor: true }), /Your household/);
    const quiet = view(onMod, { nation: { ...aurelle, motto: '   ' }, residence: '  ' });
    assert.match(quiet, /<h2>Your household<\/h2><p>Aurelle<\/p>/); assert.doesNotMatch(quiet, /household-v2-motto/);
    assert.match(view(onMod, { nation: { ...aurelle, name: '  ' } }), /<h2>Your household<\/h2><p>Highspire<\/p>/);
    assert.match(view(onMod, { nation: { ...aurelle, name: '' }, residence: null }), /<h2>Your household<\/h2><\/div>/);
    const bare = view(onMod, { nation: { ...aurelle, id: 'no-such-nation', motto: '' } });
    assert.match(bare, /<h2>Your household<\/h2>/); assert.doesNotMatch(bare, /nation-crest|household-v2-motto/);
    assert.equal(stats(on), stats(off)); assert.equal(family(on), family(off));
    for (const row of ['<dt>Wallet</dt><dd>1.50 Crown (CRN) · gold-backed</dd>', '<dt>Food</dt><dd>3</dd>', '<dt>Residence</dt><dd>Highspire</dd>', '<dt>Pantry</dt><dd>3 food · 1 materials</dd>']) assert.ok(stats(on).includes(row), row);
    const paint = mod => ['WorldSummary', 'CitySummary', 'WorkSummary', 'MarketSummary', 'GovernmentSummary'].map(name => renderToStaticMarkup(React.createElement(mod[name], name === 'WorldSummary' ? { nation: aurelle, population: '924k', onView() {} } : name === 'CitySummary' ? { cityName: 'Highspire', city: { capital: true, description: 'The royal cliff capital, connected by gilded bridges above a gorge.' }, nation: aurelle, destinations: cityDestinations('aurelle', true), onView() {} } : name === 'WorkSummary' ? { capacity: 8, contributions: 2, onMarket() {} } : name === 'MarketSummary' ? { nation: aurelle, walletMinor: 100, food: 1, board: true, listings: false, onHousehold() {} } : { nation: aurelle, account: true })));
    assert.deepEqual(paint(onMod), paint(offMod));
    const css = await read('app/panel-v2.css'), block = css.slice(css.indexOf('/* #392 UI 66'));
    for (const rule of [/\.household-v2 \.panel-v2-summary\.household-v2-head/, /overflow-wrap:normal/, /word-break:normal/, /hyphens:none/, /font-style:italic/, /#f1d58a/]) assert.match(block, rule);
    assert.doesNotMatch(block, /panel-v2-city/);
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});
test('painted Aurelle household keeps the motto in whole words at 390px, 1280px, and 150% text', async (t) => {
  let chromium; try { ({ chromium } = await import('playwright')); } catch { return t.skip('playwright is not installed'); }
  let browser; try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); } catch { return t.skip('headless chromium is not installed'); }
  try {
    const onMod = await bundle('true');
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(React.createElement(onMod.HouseholdSummary, { nation: aurelle, walletMinor: 150, inventory: [{ item: 'food', quantity: 3 }, { item: 'materials', quantity: 1 }], residence: 'Highspire', identity: true }));
    const css = `${await read('app/game-shell.css')}${await read('app/panel-v2.css')}`;
    for (const spec of [{ name: 'aurelle-household-390.png', width: 390, scale: '' }, { name: 'aurelle-household-1280.png', width: 1280, scale: '' }, { name: 'aurelle-household-390-scale-1.5.png', width: 390, scale: '1.5' }]) {
      const page = await browser.newPage({ viewport: { width: spec.width, height: 900 } });
      await page.setContent(`<!doctype html><html style="${spec.scale ? `--text-scale:${spec.scale}` : ''}"><head><style>*{box-sizing:border-box}svg{display:block}${css}.harimu-game{height:auto;min-height:0;overflow:visible}.game-inspector{position:relative;width:${spec.width}px;height:auto;top:auto;bottom:auto;overflow:visible}.game-inspector-body{overflow:visible}</style></head><body><div class="harimu-game"><aside class="game-inspector"><div class="game-inspector-body">${html}</div></aside></div></body></html>`, { waitUntil: 'load' });
      const painted = await page.evaluate(() => {
        const panel = document.querySelector('.panel-v2'), head = document.querySelector('.household-v2-head'), mottoEl = head.querySelector('.household-v2-motto'), words = [];
        const walker = document.createTreeWalker(head, NodeFilter.SHOW_TEXT); let node;
        while ((node = walker.nextNode())) { const re = /\S+/g; let match; while ((match = re.exec(node.textContent ?? ''))) { const range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length); const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0); words.push({ word: match[0], lines: new Set(rects.map(rect => Math.round(rect.top))).size, right: Math.max(...rects.map(rect => rect.right)) }); } }
        const panelBox = panel.getBoundingClientRect(), mottoStyle = getComputedStyle(mottoEl), titleStyle = getComputedStyle(head.querySelector('h2')), subStyle = getComputedStyle(head.querySelector('div > p'));
        return { title: head.querySelector('h2').textContent, subtitle: head.querySelector('div > p').textContent, motto: mottoEl.textContent, visible: mottoEl.getBoundingClientRect().height > 0 && mottoStyle.display !== 'none' && Number(mottoStyle.opacity) > 0, italic: mottoStyle.fontStyle, wrap: titleStyle.overflowWrap, subWrap: subStyle.overflowWrap, mottoWrap: mottoStyle.overflowWrap, break: titleStyle.wordBreak, hyphens: titleStyle.hyphens, crest: Boolean(head.querySelector('[data-nation-crest="aurelle"]')), city: panel.className.includes('panel-v2-city'), overflow: panel.scrollWidth - panel.clientWidth, panelRight: panelBox.right, headRight: head.getBoundingClientRect().right, words };
      });
      assert.equal(painted.title, 'Your household', spec.name); assert.equal(painted.subtitle, 'Highspire \u00B7 Aurelle', spec.name); assert.equal(painted.motto, motto, spec.name);
      assert.equal(painted.visible, true, spec.name); assert.equal(painted.italic, 'italic', spec.name); assert.equal(painted.crest, true, spec.name); assert.equal(painted.city, false, spec.name);
      for (const field of ['wrap', 'subWrap', 'mottoWrap', 'break']) assert.equal(painted[field], 'normal', `${spec.name} ${field}`);
      assert.equal(painted.hyphens, 'none', spec.name); assert.ok(painted.words.length > 0, spec.name);
      for (const word of painted.words) { assert.equal(word.lines, 1, `${spec.name} ${word.word}`); assert.ok(word.right <= painted.panelRight + 1, `${spec.name} ${word.word}`); }
      assert.ok(painted.headRight <= painted.panelRight + 1, spec.name); assert.ok(painted.overflow <= 1, `${spec.name} overflow ${painted.overflow}`);
      try {
        const dir = process.env.HARIMU_TEST_ARTIFACTS_DIR || join(os.tmpdir(), 'harimu-household-identity-392');
        mkdirSync(dir, { recursive: true });
        await page.locator('.household-v2-head').screenshot({ path: join(dir, spec.name) });
      } catch { /* a missing or unwritable artifact dir must not fail the wrap checks */ }
      await page.close();
    }
  } finally { await browser.close(); }
});
