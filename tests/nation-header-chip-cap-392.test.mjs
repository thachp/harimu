/** #392 UI 59: Nation header chips stay inside the panel.
 *  NEXT_PUBLIC_HARIMU_NATION_HEADER_CHIP_CAP is HARIMU_UI_PACK entry 56.
 *  Preview on, production off. The class is added only when this flag, the word-wrap flag, and the header chips are on.
 *  Flag off keeps the header markup. The added rule caps each chip at min(100%, min-content). Words still wrap on spaces. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { NATION_HEADER_WORD_WRAP_FLAG } from '../lib/nation-header-word-wrap.ts';
import { nationHeaderChipCapEnabled, NATION_HEADER_CHIP_CAP_FLAG } from '../lib/nation-header-chip-cap.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = NATION_HEADER_CHIP_CAP_FLAG;
const meridian = { id: 'meridian', name: 'Meridian', motto: 'Order today, prosperity tomorrow.', stability: 86, capital: 'Steamgate', currency: 'Gauge (GAU) · crawling peg', government: 'Party-state', economy: 'State capitalism with SEZs', religion: 'State-supervised associations' };
const headerClass = html => html.match(/<header class="([^"]*)">/)[1];

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 56, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(nationHeaderChipCapEnabled(), false);
    assert.equal(nationHeaderChipCapEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationHeaderChipCapEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(nationHeaderChipCapEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 60);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(55), key, 'entry 56');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(54), NATION_HEADER_WORD_WRAP_FLAG, 'word wrap stays entry 55');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 60/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 nation header chip cap/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/nation-header-chip-cap.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NATION_HEADER_CHIP_CAP/);
  assert.match(await read('app/nation-overview.tsx'), /headerChipCap = nationHeaderChipCapEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /NATION_HEADER_CHIP_CAP|nationHeaderChipCapEnabled/);
});

const bundle = async (wrap, cap, motto = 'true', header = 'true') => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/nation-overview.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: {
      'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"',
      'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': JSON.stringify(header),
      'process.env.NEXT_PUBLIC_HARIMU_NATION_MOTTO': JSON.stringify(motto),
      'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS': '"false"',
      'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_WORD_WRAP': wrap === undefined ? 'undefined' : JSON.stringify(wrap),
      'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_CHIP_CAP': cap === undefined ? 'undefined' : JSON.stringify(cap),
    } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag off markup matches today; flag on adds the class and the capped min-width only with word wrap and chips', async () => {
  const offMod = await bundle('true', 'false'), onMod = await bundle('true', 'true'), missing = await bundle('true', undefined);
  const wrapOff = await bundle('false', 'true'), wrapMissing = await bundle(undefined, 'true');
  const mottoOnly = await bundle('true', 'true', 'true', 'false'), chipsOnly = await bundle('true', 'true', 'false', 'true'), neither = await bundle('true', 'true', 'false', 'false');
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const view = (mod, props = {}) => renderToStaticMarkup(React.createElement(mod.NationOverview, { nation: meridian, onExplore() {}, onCivic() {}, ...props }));
  const off = view(offMod), on = view(onMod), unset = view(missing);
  assert.equal(off, unset, 'a missing flag matches flag off');
  assert.equal(view(onMod, { headerChipCap: false }), off, 'the prop turns the class off');
  assert.equal(view(offMod, { headerChipCap: false }), off);
  assert.equal(headerClass(off), 'nation-overview-head nation-overview-head-chips nation-overview-head-tagline nation-overview-header-word-wrap');
  assert.doesNotMatch(off, /nation-overview-header-chip-cap/);
  assert.equal(headerClass(on), 'nation-overview-head nation-overview-head-chips nation-overview-head-tagline nation-overview-header-word-wrap nation-overview-header-chip-cap');
  assert.equal(headerClass(view(offMod, { headerChipCap: true })), headerClass(on), 'the prop turns the class on');
  const chipRow = html => html.match(/<dl class="panel-v2-header-stats">[\s\S]*?<\/dl>/)[0];
  assert.equal(chipRow(on), chipRow(off), 'chip elements stay the same; the header class carries the cap');
  assert.doesNotMatch(chipRow(on), /style=/);
  const quietWrap = view(wrapOff), quietMissing = view(wrapMissing);
  assert.equal(quietWrap, quietMissing, 'word wrap off ignores the chip-cap flag');
  assert.equal(headerClass(quietWrap), 'nation-overview-head nation-overview-head-chips nation-overview-head-tagline');
  assert.doesNotMatch(quietWrap, /nation-overview-header-word-wrap|nation-overview-header-chip-cap/);
  assert.equal(headerClass(view(wrapOff, { headerWordWrap: true, headerChipCap: true })), headerClass(on));
  assert.equal(headerClass(view(mottoOnly)), 'nation-overview-head nation-overview-head-tagline nation-overview-header-word-wrap');
  assert.doesNotMatch(view(mottoOnly), /nation-overview-header-chip-cap|panel-v2-header-stats/);
  assert.equal(headerClass(view(chipsOnly)), 'nation-overview-head nation-overview-head-chips nation-overview-header-word-wrap nation-overview-header-chip-cap');
  assert.equal(headerClass(view(neither)), 'nation-overview-head');
  const css = await read('app/nation-overview.css');
  const prior = css.slice(css.indexOf('/* #392 UI 58'), css.indexOf('/* #392 UI 59'));
  const block = css.slice(css.indexOf('/* #392 UI 59'));
  assert.ok(block.startsWith('/* #392 UI 59'));
  assert.match(prior, /\.nation-overview-head\.nation-overview-header-word-wrap \.panel-v2-header-stats>div\{flex:1 1 auto;min-width:min-content;max-width:100%\}/);
  assert.match(prior, /\.panel-v2-header-stats :is\(dt,dd,small\)\{overflow-wrap:normal;word-break:normal;hyphens:none\}/);
  assert.match(block, /\.nation-overview-head\.nation-overview-header-word-wrap\.nation-overview-header-chip-cap \.panel-v2-header-stats>div\{min-width:min\(100%,min-content\);min-width:calc-size\(min-content,min\(100%,size\)\)\}/);
});
