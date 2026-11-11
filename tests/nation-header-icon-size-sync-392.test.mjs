/** #392 UI 63: Nation header chip marks follow text size.
 *  NEXT_PUBLIC_HARIMU_NATION_HEADER_ICON_SIZE_SYNC is HARIMU_UI_PACK entry 60.
 *  Preview on, production off. Flag off keeps width 16 and the header class list. Flag on, those chip svgs use 1em and the header carries the sync class.
 *  Only those chip marks change. The crest, institutions, actions, City panel and World atlas stay as they are. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { nationHeaderIconSizeSyncEnabled, NATION_HEADER_ICON_SIZE_SYNC_FLAG } from '../lib/nation-header-icon-size-sync.ts';
import { CITY_HEADER_WORD_WRAP_FLAG } from '../lib/city-header-word-wrap.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = NATION_HEADER_ICON_SIZE_SYNC_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', motto: "Win the crown's favor - or take the crown.", stability: 72, capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', government: 'Absolute hereditary monarchy', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church' };
const government = { nationId: 'aurelle', roles: [{ name: 'Sovereign' }] };
const chipRow = html => html.match(/<dl class="panel-v2-header-stats">[\s\S]*?<\/dl>/)?.[0] ?? '';
const widths = html => [...html.matchAll(/<svg\b[^>]*>/g)].map(tag => tag[0].match(/\bwidth="([^"]*)"/)?.[1]);
const headerClass = html => html.match(/<header class="([^"]*)">/)[1];

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 60, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(nationHeaderIconSizeSyncEnabled(), false);
    assert.equal(nationHeaderIconSizeSyncEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationHeaderIconSizeSyncEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(nationHeaderIconSizeSyncEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 62);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(59), key, 'entry 60');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(58), CITY_HEADER_WORD_WRAP_FLAG, 'city header word wrap stays entry 59');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 62/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 nation header icon size sync/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/nation-header-icon-size-sync.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NATION_HEADER_ICON_SIZE_SYNC/);
  assert.match(await read('app/nation-overview.tsx'), /headerIconSizeSync = nationHeaderIconSizeSyncEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /NATION_HEADER_ICON_SIZE_SYNC|nationHeaderIconSizeSyncEnabled/);
  const css = await read('app/nation-overview.css');
  const block = css.slice(css.indexOf('/* #392 UI 63'));
  assert.ok(block.startsWith('/* #392 UI 63'));
  assert.equal(css.slice(0, css.indexOf('/* #392 UI 63')).includes('nation-overview-header-icon-size-sync'), false);
  assert.match(block, /\.game-inspector-body \.nation-overview-head\.nation-overview-header-icon-size-sync \.panel-v2-icon svg\{flex:none;font-size:calc\(16px \* var\(--text-scale, 1\)\);width:1em;height:1em\}/);
  assert.doesNotMatch(block, /nation-crest|nation-overview-actions|nation-overview-institution|panel-v2-city|world-atlas/);
  const untouched = `${await read('app/panel-v2.css')}\n${await read('app/panel-v2.tsx')}\n${await read('app/world-atlas.css')}\n${await read('app/world-atlas.tsx')}\n${await read('app/scene-panels-v2.tsx')}`;
  assert.doesNotMatch(untouched, /nation-overview-header-icon-size-sync|NATION_HEADER_ICON_SIZE_SYNC|nationHeaderIconSizeSync/);
});

const bundle = async (sync, header = 'true') => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/nation-overview.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: {
      'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"',
      'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': JSON.stringify(header),
      'process.env.NEXT_PUBLIC_HARIMU_NATION_MOTTO': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK': '"false"',
      'process.env.NEXT_PUBLIC_HARIMU_NATION_INSTITUTION_ROWS': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_WORD_WRAP': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_CHIP_CAP': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_ICON_SIZE_SYNC': '"false"',
      'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_ICON_SIZE_SYNC': sync === undefined ? 'undefined' : JSON.stringify(sync),
    } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag off renders size 16 with no class; flag on renders 1em with the class, and only on chip marks', async () => {
  const offMod = await bundle('false'), onMod = await bundle('true'), missing = await bundle(undefined), quiet = await bundle('true', 'false');
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const view = (mod, props = {}) => renderToStaticMarkup(React.createElement(mod.NationOverview, { nation: aurelle, government, onExplore() {}, onCivic() {}, onInstitutions() {}, ...props }));
  const off = view(offMod), on = view(onMod), unset = view(missing);
  assert.equal(off, unset, 'a missing flag matches flag off');
  assert.equal(view(onMod, { headerIconSizeSync: false }), off, 'an explicit off prop matches flag off');
  assert.equal(view(offMod, { headerIconSizeSync: true }), on, 'an explicit on prop matches flag on');
  assert.equal(headerClass(off), 'nation-overview-head nation-overview-head-chips nation-overview-head-tagline nation-overview-header-word-wrap nation-overview-header-chip-cap');
  assert.doesNotMatch(off, /nation-overview-header-icon-size-sync|width="1em"/);
  assert.equal(headerClass(on), `${headerClass(off)} nation-overview-header-icon-size-sync`);
  assert.deepEqual(widths(chipRow(off)), ['16', '16', '16']);
  assert.deepEqual(widths(chipRow(on)), ['1em', '1em', '1em']);
  const fold = html => html.replace(' nation-overview-header-icon-size-sync', '').replaceAll('width="1em" height="1em"', 'width="16" height="16"');
  assert.equal(fold(on), fold(off), 'flag on changes only the sync class and the chip mark size');
  const hidden = view(quiet);
  assert.equal(headerClass(hidden), 'nation-overview-head nation-overview-head-tagline nation-overview-header-word-wrap');
  assert.doesNotMatch(hidden, /nation-overview-header-icon-size-sync|panel-v2-header-stats|width="1em"/);
  assert.match(off, /<svg[^>]*width="18"/, 'action and institution marks stay 18');
  assert.equal(widths(off).filter(w => w === '18').join(), widths(on).filter(w => w === '18').join());
  assert.doesNotMatch(off + on, /<svg[^>]*class="nation-crest|width="56"/);
});

test('painted chip marks are 16px at 100% text and 24px at 150%, and the crest is unchanged', async (t) => {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { return t.skip('playwright is not installed'); }
  let browser;
  try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); }
  catch { return t.skip('headless chromium is not installed'); }
  try {
    const onMod = await bundle('true'), offMod = await bundle('false');
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const html = mod => renderToStaticMarkup(React.createElement(mod.NationOverview, { nation: aurelle, government, onExplore() {}, onCivic() {}, onInstitutions() {} }));
    const css = `${await read('app/game-shell.css')}${await read('app/panel-v2.css')}${await read('app/nation-overview.css')}`;
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const measure = async (mod, scale) => {
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><style>svg{display:block}${css}.game-inspector{position:relative;width:390px;height:auto;top:auto;bottom:auto}</style></head><body><div class="harimu-game"><aside class="game-inspector"><div class="game-inspector-body">${html(mod)}</div></aside></div></body></html>`, { waitUntil: 'load' });
      return page.evaluate(() => {
        const box = node => { const r = node.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
        const mark = document.querySelector('.panel-v2-icon');
        return {
          marks: [...document.querySelectorAll('.nation-overview-head .panel-v2-icon svg')].map(box),
          crest: box(document.querySelector('.nation-crest')),
          color: mark ? getComputedStyle(mark).color : '',
        };
      });
    };
    const at100 = await measure(onMod, 1), held = await measure(offMod, 1);
    assert.deepEqual(at100, held, '100% text paints the same sizes and color');
    assert.ok(at100.marks.length === 3 && at100.marks.every(box => box.w === 16 && box.h === 16));
    const at150 = await measure(onMod, 1.5), held150 = await measure(offMod, 1.5);
    assert.ok(at150.marks.every(box => box.w === 24 && box.h === 24));
    assert.ok(held150.marks.every(box => box.w === 16 && box.h === 16));
    assert.deepEqual(at150.crest, held150.crest);
    assert.equal(at150.color, at100.color);
    try {
      const [{ mkdirSync }, { tmpdir }, { join }] = await Promise.all([import('node:fs'), import('node:os'), import('node:path')]);
      const dir = process.env.HARIMU_TEST_ARTIFACTS_DIR || join(tmpdir(), 'harimu-nation-header-icon-size-sync-392');
      mkdirSync(dir, { recursive: true });
      await page.locator('.nation-overview-head').screenshot({ path: join(dir, 'aurelle-nation-header-390-scale-1.5.png') });
    } catch { /* a missing or unwritable artifact dir must not fail the size checks */ }
    await page.close();
  } finally {
    await browser.close();
  }
});
