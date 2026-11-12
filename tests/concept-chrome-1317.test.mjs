/** #1317: quiet header and calendar popover. NEXT_PUBLIC_HARIMU_CONCEPT_CHROME is HARIMU_UI_PACK entry 66. Preview on, production off. Flag off matches a missing flag and today's chrome. Desktop checks are 1280 and 150% text. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { conceptChromeEnabled, CONCEPT_CHROME_FLAG } from '../lib/concept-chrome.ts';
import { nextFestivalAt } from '../lib/game-season.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = CONCEPT_CHROME_FLAG;
const root = fileURLToPath(new URL('..', import.meta.url));
const nowSeconds = Math.floor(Date.now() / 1000), epoch = nowSeconds - 353 * 7200;
const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' };
const closesAt = Math.floor(Date.now() / 1000) + 5 * 86400 + 23 * 3600;
const shellProps = { view: 'square', nation, citizenNation: nation, nations: [nation], currentCityName: 'Forgehaven', capacity: 24, currencyCode: 'SPK', walletMinor: 9240, inventory: { food: 0, materials: 4, knowledge: 4 }, localDemo: false, panel: 'City square tile',
  worldClock: { gameDay: 354, latestTick: 308, epochSeconds: epoch, nowSeconds }, worldAges: true, faithFestivalHud: true, holidayName: 'Bread Day',
  countdown: { nationId: 'kindle', election: { opensAt: null, closesAt }, wars: null },
  nextDeadline: { label: 'Work', endsAt: new Date(Date.now() + 3_600_000).toISOString() },
  shiftSummary: { title: 'Shift in progress', endsAt: Math.floor(Date.now() / 1000) + 3600, expiredText: 'Shift complete · collect at Work.' } };
const onFlags = ['NEXT_PUBLIC_HARIMU_UI_V2_RAIL', 'NEXT_PUBLIC_HARIMU_RESOURCE_BAR', 'NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR', 'NEXT_PUBLIC_HARIMU_UI_V2_CITY', 'NEXT_PUBLIC_HARIMU_UI_V2_PANEL', 'NEXT_PUBLIC_HARIMU_TOPBAR_COUNTDOWN', 'NEXT_PUBLIC_HARIMU_SEASON_CLOCK', 'NEXT_PUBLIC_HARIMU_FESTIVAL_CALENDAR', 'NEXT_PUBLIC_HARIMU_CLOCK_ZOOM'];
const bundles = {};
const bundle = async concept => {
  if (bundles[concept]) return bundles[concept];
  const define = { 'process.env.NODE_ENV': '"production"', ...Object.fromEntries(onFlags.map(name => [`process.env.${name}`, '"true"'])) };
  if (concept !== undefined) define[`process.env.${key}`] = JSON.stringify(concept);
  const result = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { renderToStaticMarkup } from 'react-dom/server'; import { GameShell } from './app/game-shell.tsx';
    const controls = <><button type="button" className="game-glossary" aria-label="Open morning brief">Brief</button><button type="button">Account</button></>;
    const shell = props => <GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} onOpenWallet={() => {}} accountControls={controls} />;
    globalThis.__html = props => renderToStaticMarkup(shell(props));
    globalThis.__mount = props => { const el = document.getElementById('root'); (globalThis.__root ??= createRoot(el)).render(shell(props)); };` },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022', logLevel: 'silent', define, banner: { js: 'var process = globalThis.process || { env: {} };' }, alias: { '@': root.replace(/\/$/, '') }, loader: { '.css': 'empty' },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^(\.\/game-viewport|@clerk\/nextjs)$/ }, a => ({ path: a.path, namespace: 'stub' }));
      b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'css-module', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: a.path === 'css-module' ? 'export default new Proxy({}, { get: (_, k) => String(k) })' : a.path === '@clerk/nextjs' ? 'export const useClerk=()=>({})' : 'export default function V(){return null}', loader: 'jsx' }));
    } }] });
  return bundles[concept] = result.outputFiles[0].text;
};
const htmlOf = async concept => {
  const script = await bundle(concept);
  class MessageChannel { constructor() { const port1 = { onmessage: null, close() {} }; this.port1 = port1; this.port2 = { postMessage: data => setTimeout(() => port1.onmessage?.({ data }), 0), close() {} }; } }
  const sandbox = { MessageChannel, console, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams, process };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox; vm.runInNewContext(script, sandbox); return sandbox.__html(shellProps);
};
const header = html => html.slice(html.indexOf('<header'), html.indexOf('</header>'));
test('flag is on only for the exact string "true", pack entry 66, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key]; assert.equal(conceptChromeEnabled(), false); assert.equal(conceptChromeEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(conceptChromeEnabled(value), false);
    process.env[key] = 'true'; assert.equal(conceptChromeEnabled(), true);
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key)); assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 71);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(65), key, 'entry 66');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(64), 'NEXT_PUBLIC_HARIMU_HOUSEHOLD_FACT_VALUE_ALIGN', 'entry 65 stays household fact value align');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 71/);
  assert.match(await read('lib/concept-chrome.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CONCEPT_CHROME/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key)); assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  const css = await read('app/concept-chrome.css');
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|\})([^{}]+)\{/g)].map(m => m[1].trim()).filter(Boolean);
  for (const sel of rules) for (const part of sel.split(',')) assert.match(part.trim(), /^\.game-concept-chrome\b/, part);
  for (const rule of [/overflow-wrap:normal/, /word-break:normal/, /hyphens:none/]) assert.match(css, rule);
  assert.doesNotMatch(`${css}\n${await read('app/game-shell.tsx')}\n${await read('lib/concept-chrome.ts')}`, /anywhere-wrap|break-all|Ember|Concept preview|neighborhood council/);
  for (const file of ['app/scene-panels-v2.tsx', 'app/panel-v2.tsx', 'lib/household-identity.ts', 'lib/household-fact-icons.ts', 'lib/household-fact-value-align.ts']) assert.doesNotMatch(await read(file), /CONCEPT_CHROME|concept-chrome|conceptChrome/);
});
test('flag off matches a missing flag and today; flag on keeps facts out of the header until the popover', async () => {
  const off = await htmlOf('false'), missing = await htmlOf(undefined), on = await htmlOf('true');
  assert.equal(missing, off, 'a missing flag matches flag off');
  assert.doesNotMatch(off, /game-concept-chrome|concept-clock/);
  assert.match(header(off), /class="game-clock/); assert.match(header(off), /Day 354 · 12×/); assert.match(header(off), /TICK 308 · ON VISITS/);
  assert.equal(header(off).includes('game-location-dock'), false);
  const head = header(on);
  assert.match(on, /game-concept-chrome/); assert.match(on, /class="concept-clock-trigger"/); assert.match(on, /Day 354 · 12×/);
  assert.doesNotMatch(on, /id="concept-clock-panel"/); assert.doesNotMatch(head, /TICK 308|Next festival|Next faith festival|Public holiday|Election in|game-clock/);
  for (const label of ['Open Household', 'Open Work', 'Open Market', 'Open Civic']) assert.match(head, new RegExp(label));
  assert.match(head, /92\.40/); assert.match(head, />SPK</); assert.match(head, />Brief</); assert.match(head, /id="game-notification-slot"/); assert.match(head, />Account</);
  assert.match(head, /aria-label="Game glossary, official documentation \(opens new tab\)"/);
  assert.equal(on.includes('City square tile'), true); assert.equal(off.includes('City square tile'), true);
});
const shots = () => { try { const dir = process.env.HARIMU_TEST_ARTIFACTS_DIR || join(os.tmpdir(), 'harimu-1317-concept-chrome'); mkdirSync(dir, { recursive: true }); return dir; } catch { return null; } };
test('popover opens and closes at 1280 and 150% text, and the map stays clear', async (t) => {
  let chromium; try { ({ chromium } = await import('playwright')); } catch { return t.skip('playwright is not installed'); }
  let browser; try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); } catch { return t.skip('headless chromium is not installed'); }
  const script = await bundle('true'), css = (await Promise.all(['app/game-shell.css', 'app/clock-zoom.css', 'app/concept-chrome.css', 'app/resource-bar.css', 'app/zoom-path.css', 'app/nation-accent.css'].map(read))).join('\n');
  const festival = nextFestivalAt('kindle', epoch * 1000, nowSeconds * 1000);
  const dir = shots();
  try {
    for (const spec of [{ name: '1280', scale: '' }, { name: '1280-150', scale: '1.5' }]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.setContent(`<!doctype html><html style="${spec.scale ? `--text-scale:${spec.scale}` : ''}"><head><style>*{box-sizing:border-box}body{margin:0}svg{display:block}${css}</style></head><body><div id="root"></div></body></html>`, { waitUntil: 'load' });
      await page.addScriptTag({ content: script });
      await page.evaluate(props => window.__mount(props), shellProps);
      await page.waitForSelector('.concept-clock-trigger');
      await page.evaluate(() => { const slot = document.getElementById('game-notification-slot'); slot.innerHTML = '<button class="game-notifications" type="button" aria-label="Open civic inbox"></button>'; });
      const place = await page.evaluate(() => {
        const trigger = document.querySelector('.concept-clock-trigger').getBoundingClientRect(), head = document.querySelector('.game-hud').getBoundingClientRect(), resources = document.querySelector('.game-resources').getBoundingClientRect(), stage = document.querySelector('.game-stage').getBoundingClientRect();
        const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const hud = document.querySelector('.game-hud'), hudBox = hud.getBoundingClientRect(), shown = node => { const range = document.createRange(); range.selectNodeContents(node); const ink = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0); return node.scrollWidth <= node.clientWidth + 1 && ink.length > 0 && ink.every(rect => rect.left >= hudBox.left - 1 && rect.right <= hudBox.right + 1 && rect.top >= hudBox.top - 1 && rect.bottom <= hudBox.bottom + 1); };
        const bits = [...document.querySelectorAll('.game-resource-bar > .game-hud-help > summary strong, .game-resource-bar > .game-hud-help > summary > span, .game-resource-bar > .game-wallet-button strong, .game-resource-bar > .game-wallet-button > span, header .game-dock button span')], labels = bits.map(node => node.textContent.trim()), chipFit = bits.length >= 10 && bits.every(shown) && [...document.querySelectorAll('header .game-account > button, header a.game-glossary, header .game-settings-button')].every(el => { const rect = el.getBoundingClientRect(); return rect.width >= 16 && rect.height >= 16 && rect.left >= hudBox.left - 1 && rect.right <= hudBox.right + 1; }) && ['WC','SPK','Food','Mat.','Know.'].every(label => labels.includes(label));
        return { below: trigger.top >= head.bottom - 1, inMap: trigger.left >= stage.left - 1 && trigger.bottom <= stage.bottom + 1 && trigger.left < stage.left + 220, resources: !hit(trigger, resources), headerFit: hud.scrollWidth <= hud.clientWidth + 1, chipFit, labels, compact: !document.querySelector('.concept-clock-trigger').textContent.includes('TICK'), tabs: [...document.querySelectorAll('header .game-dock button span')].map(node => node.textContent) };
      });
      assert.equal(place.below, true, spec.name); assert.equal(place.inMap, true, spec.name); assert.equal(place.resources, true, spec.name); assert.equal(place.headerFit, true, spec.name); assert.equal(place.chipFit, true, spec.name); assert.equal(place.compact, true, spec.name);
      assert.deepEqual(place.tabs, ['Household', 'Work', 'Market', 'Civic']);
      if (dir) await page.screenshot({ path: join(dir, `concept-chrome-${spec.name}-closed.png`) });
      await page.click('.concept-clock-trigger');
      await page.waitForSelector('.concept-clock-panel');
      await page.waitForFunction(() => document.body.innerText.includes('Election in'));
      const open = await page.evaluate(() => {
        const panel = document.querySelector('.concept-clock-panel'), head = document.querySelector('header'), style = getComputedStyle(panel);
        const shift = document.querySelector('.game-shift-chip');
        const point = panel.getBoundingClientRect();
        const top = document.elementFromPoint(point.left + 24, point.top + 24);
        return { text: panel.innerText, header: head.innerText, bg: style.backgroundColor, opacity: style.opacity, z: style.zIndex, through: top && !panel.contains(top) && top !== panel, shiftZ: shift ? getComputedStyle(shift).zIndex : '0' };
      });
      assert.match(open.text, /Day 354 · 12×/); assert.match(open.text, /TICK 308 · ON VISITS/); assert.match(open.text, /Public holiday/);
      assert.match(open.text, new RegExp(festival.name)); assert.match(open.text, /Next faith festival:/); assert.match(open.text, /Age \d+, year \d+ of 12/); assert.match(open.text, /Work/); assert.match(open.text, /Election in /);
      assert.doesNotMatch(open.header, /TICK 308|Next festival|Election in/);
      assert.equal(open.bg, 'rgb(7, 24, 32)'); assert.equal(open.opacity, '1'); assert.ok(Number(open.z) > Number(open.shiftZ)); assert.equal(open.through, false);
      assert.doesNotMatch(open.text, /Ember|Concept preview|08:30/);
      if (dir) await page.screenshot({ path: join(dir, `concept-chrome-${spec.name}-open.png`) });
      for (const how of ['Escape', 'outside', 'button']) {
        if (how !== 'Escape') { await page.click('.concept-clock-trigger'); await page.waitForSelector('.concept-clock-panel'); }
        if (how === 'Escape') await page.keyboard.press('Escape'); else if (how === 'outside') await page.click('.game-hud strong'); else await page.click('.concept-clock-panel > button');
        await page.waitForSelector('.concept-clock-panel', { state: 'detached' });
      }
      await page.close();
    }
  } finally { await browser.close(); }
});
