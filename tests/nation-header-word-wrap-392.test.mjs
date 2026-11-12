/** #392 UI 58: Nation header wraps at word boundaries.
 *  NEXT_PUBLIC_HARIMU_NATION_HEADER_WORD_WRAP is HARIMU_UI_PACK entry 55.
 *  Preview on, production off. The class is added only when this flag and the motto or the header chips are on.
 *  Flag off keeps the header markup. The added CSS sets normal wrapping for the motto and the chips. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { NATION_INSTITUTION_ROWS_FLAG } from '../lib/nation-institution-rows.ts';
import { nationHeaderWordWrapEnabled, NATION_HEADER_WORD_WRAP_FLAG } from '../lib/nation-header-word-wrap.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = NATION_HEADER_WORD_WRAP_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', motto: "Win the crown's favor - or take the crown.", stability: 72, capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', government: 'Absolute hereditary monarchy', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church' };
const wrapBans = [`overflow-wrap: ${'any'}where`, `overflow-wrap:${'any'}where`, `word-break: ${'break'}-all`, `word-break:${'break'}-all`];

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 55, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(nationHeaderWordWrapEnabled(), false);
    assert.equal(nationHeaderWordWrapEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationHeaderWordWrapEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(nationHeaderWordWrapEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 70);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(54), key, 'entry 55');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(53), NATION_INSTITUTION_ROWS_FLAG, 'institution rows stay entry 54');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 70/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 nation header word wrap/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/nation-header-word-wrap.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NATION_HEADER_WORD_WRAP/);
  assert.match(await read('app/nation-overview.tsx'), /headerWordWrap = nationHeaderWordWrapEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /NATION_HEADER_WORD_WRAP|nationHeaderWordWrapEnabled/);
});

const bundle = async (wrap, motto = 'true', header = 'true') => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/nation-overview.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: {
      'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"',
      'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': JSON.stringify(header),
      'process.env.NEXT_PUBLIC_HARIMU_NATION_MOTTO': JSON.stringify(motto),
      'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS': '"false"',
      'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_WORD_WRAP': wrap === undefined ? 'undefined' : JSON.stringify(wrap),
    } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag off markup is unchanged; flag on adds the class only with the motto or the chips', async () => {
  const offMod = await bundle('false'), onMod = await bundle('true'), missing = await bundle(undefined);
  const mottoOnly = await bundle('true', 'true', 'false'), chipsOnly = await bundle('true', 'false', 'true'), neither = await bundle('true', 'false', 'false');
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const view = (mod, props = {}) => renderToStaticMarkup(React.createElement(mod.NationOverview, { nation: aurelle, onExplore() {}, onCivic() {}, ...props }));
  const off = view(offMod), on = view(onMod), unset = view(missing);
  assert.equal(off, unset, 'a missing flag matches flag off');
  assert.equal(view(onMod, { headerWordWrap: false }), off, 'the prop turns the class off');
  assert.equal(view(offMod, { headerWordWrap: false }), off);
  assert.match(off, /<header class="nation-overview-head nation-overview-head-chips nation-overview-head-tagline">/);
  assert.doesNotMatch(off, /nation-overview-header-word-wrap/);
  assert.match(on, /<header class="nation-overview-head nation-overview-head-chips nation-overview-head-tagline nation-overview-header-word-wrap">/);
  assert.match(view(offMod, { headerWordWrap: true }), /nation-overview-header-word-wrap/, 'the prop turns the class on');
  const motto = view(mottoOnly);
  assert.match(motto, /<header class="nation-overview-head nation-overview-head-tagline nation-overview-header-word-wrap">/);
  assert.match(motto, /class="nation-overview-tagline"/);
  assert.doesNotMatch(motto, /panel-v2-header-stats|nation-overview-head-chips/);
  const chips = view(chipsOnly);
  assert.match(chips, /<header class="nation-overview-head nation-overview-head-chips nation-overview-header-word-wrap">/);
  assert.match(chips, /<dl class="panel-v2-header-stats">/);
  assert.doesNotMatch(chips, /nation-overview-tagline|nation-overview-head-tagline/);
  const quiet = view(neither);
  assert.match(quiet, /<header class="nation-overview-head">/);
  assert.match(quiet, /class="nation-overview-motto"/);
  assert.doesNotMatch(quiet, /nation-overview-header-word-wrap|nation-overview-tagline|panel-v2-header-stats/);
  const css = await read('app/nation-overview.css');
  const block = css.slice(css.indexOf('/* #392 UI 58'));
  assert.ok(block.startsWith('/* #392 UI 58'));
  assert.match(block, /\.nation-overview-head-tagline\.nation-overview-header-word-wrap>p\.nation-overview-tagline\{[^}]*overflow-wrap:normal;word-break:normal;hyphens:none\}/);
  assert.match(block, /\.nation-overview-header-word-wrap \.panel-v2-header-stats :is\(dt,dd,small\)\{overflow-wrap:normal;word-break:normal;hyphens:none\}/);
  assert.match(block, /\.panel-v2-header-stats>div\{[^}]*min-width:min-content/);
  assert.match(block, /flex-wrap:wrap/);
  assert.match(block, /12ch/);
  for (const phrase of wrapBans) assert.equal(block.includes(phrase), false, phrase);
  assert.match(css.slice(0, css.indexOf('/* #392 UI 58')), /\.nation-overview p\.nation-overview-tagline\{[^}]*overflow-wrap:break-word;word-break:normal/);
});
