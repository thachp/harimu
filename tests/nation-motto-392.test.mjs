/** #392 UI 45: Nation overview motto placement. NEXT_PUBLIC_HARIMU_NATION_MOTTO is HARIMU_UI_PACK entry 42.
 *  Preview on, production off. Flag on: the nation record's motto is the gold tagline to the right of the title.
 *  A missing or blank motto is hidden. Flag off keeps the motto under the name in the title column. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { nationMottoEnabled, NATION_MOTTO_FLAG } from '../lib/nation-motto.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = NATION_MOTTO_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', motto: "Win the crown's favor - or take the crown.", stability: 72, capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', government: 'Absolute hereditary monarchy', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church' };
const korund = { id: 'korund', name: 'Korund', motto: 'Nobody falls through the stone.', stability: 68, capital: 'Stonehearth', currency: 'Labor Note (LN) + ration coupons', government: 'Full communism; leader for life', economy: 'Central planning', religion: 'State atheism' };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 42, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(nationMottoEnabled(), false);
    assert.equal(nationMottoEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationMottoEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(nationMottoEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 44);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(41), key, 'entry 42');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 44/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 nation motto/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/nation-motto.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NATION_MOTTO/);
  assert.match(await read('app/nation-overview.tsx'), /nationMottoEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /NATION_MOTTO|nationMottoEnabled/);
  assert.doesNotMatch(await read('app/panel-v2.css'), /nation-overview-tagline/);
  assert.doesNotMatch(await read('app/world-atlas.css'), /nation-overview-tagline/);
});

const bundle = async (motto, header = 'true') => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/nation-overview.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': JSON.stringify(header), 'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_MOTTO': JSON.stringify(motto) } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag on places the real motto to the right of the title and hides a missing one; flag off keeps it under the name', async () => {
  const offMod = await bundle('false'), onMod = await bundle('true'), onBare = await bundle('true', 'false');
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const view = (mod, nation) => renderToStaticMarkup(React.createElement(mod.NationOverview, { nation, onExplore() {}, onCivic() {} }));
  const on = view(onMod, aurelle), off = view(offMod, aurelle), korundOn = view(onMod, korund), bare = view(onBare, aurelle);
  const aurelleMotto = /Win the crown(?:'|&#x27;)s favor - or take the crown\./;
  const title = html => html.match(/<header[^>]*>[\s\S]*?<\/header>/)?.[0] ?? '';
  assert.match(title(on), new RegExp(`<div><h2>Aurelle</h2><p class="nation-overview-kicker">Nation overview</p></div><p class="nation-overview-tagline">${aurelleMotto.source}</p>`));
  assert.match(on, /class="nation-overview-head nation-overview-head-chips nation-overview-head-tagline"/);
  assert.match(on, /nation-overview-tagline">[^<]*<\/p><dl class="panel-v2-header-stats">/);
  assert.doesNotMatch(on, /nation-overview-motto/);
  assert.match(title(korundOn), /<div><h2>Korund<\/h2><p class="nation-overview-kicker">Nation overview<\/p><\/div><p class="nation-overview-tagline">Nobody falls through the stone\.<\/p>/);
  assert.match(title(off), new RegExp(`<div><h2>Aurelle</h2><p class="nation-overview-kicker">Nation overview</p><p class="nation-overview-motto">${aurelleMotto.source}</p></div>`));
  assert.doesNotMatch(off, /nation-overview-tagline|nation-overview-head-tagline/);
  assert.match(off, /<header class="nation-overview-head nation-overview-head-chips">/);
  assert.match(title(bare), new RegExp(`<p class="nation-overview-tagline">${aurelleMotto.source}</p>`));
  assert.doesNotMatch(bare, /panel-v2-header-stats|nation-overview-motto/);
  for (const missing of ['', '   ', null]) {
    const quiet = view(onMod, { ...aurelle, motto: missing });
    assert.match(quiet, /<h2>Aurelle<\/h2>/);
    assert.match(quiet, /Nation overview/);
    assert.doesNotMatch(quiet, /nation-overview-tagline|nation-overview-motto|nation-overview-head-tagline/);
    assert.match(quiet, /<header class="nation-overview-head nation-overview-head-chips">/);
  }
  const quietOff = view(offMod, { ...aurelle, motto: '  ' });
  assert.doesNotMatch(quietOff, /nation-overview-tagline|nation-overview-motto/);
  const css = await read('app/nation-overview.css');
  const block = css.slice(css.indexOf('/* #392 UI 45'));
  assert.ok(block.length > 0);
  const rule = block.match(/\.nation-overview-tagline\{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /overflow-wrap:break-word/);
  assert.match(rule, /word-break:normal/);
  assert.match(rule, /#f1d58a/);
  assert.match(rule, /font-style:italic/);
  assert.match(rule, /Georgia/);
  assert.match(rule, /line-height:1\.35/);
  assert.doesNotMatch(block, /overflow-wrap:\s*anywhere|word-break:\s*break-all/);
  assert.match(css, /\.nation-overview-motto\{[^}]*#f3ecd6/, 'flag-off motto color stays in the title column rule');
  assert.doesNotMatch(css.slice(0, css.indexOf('/* #392 UI 45')), /nation-overview-tagline/);
});
