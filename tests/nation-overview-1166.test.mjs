/** #1166: Nation overview on ?view=country. NEXT_PUBLIC_HARIMU_NATION_OVERVIEW is a HARIMU_UI_PACK key.
 *  Preview on, production off. Flag off keeps the country panel and the small map. Missing reads stay hidden. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { nationCrest } from '../lib/nation-crests.ts';
import { capitalCityForNation } from '../lib/cities.ts';
import { nationOverviewEnabled, nationOverviewFields } from '../lib/nation-overview.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_NATION_OVERVIEW';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const seeds = src => {
  const body = src.slice(src.indexOf('const nationSeeds = ['), src.indexOf('] as const;', src.indexOf('const nationSeeds = [')));
  return body.split('\n').filter(line => line.trim().startsWith('[')).map(line => {
    const parts = []; let m; const token = /'([^']*)'|"([^"]*)"|(-?\d+)/g;
    while ((m = token.exec(line))) parts.push(m[1] ?? m[2] ?? Number(m[3]));
    return { id: parts[0], name: parts[1], government: parts[3], economy: parts[4], currency: parts[5], religion: parts[6], capital: parts[7], stability: parts[10], motto: parts[13] };
  });
};

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(nationOverviewEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationOverviewEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 56);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 56/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/nation-overview.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NATION_OVERVIEW/);
});

test('all ten nation seeds fill the overview, and a missing read is hidden', async () => {
  const nations = seeds(await read('lib/db.ts'));
  assert.equal(nations.length, 10);
  for (const nation of nations) {
    assert.ok(nationCrest(nation.id), nation.id);
    assert.equal(capitalCityForNation(nation.id)?.name, nation.capital, nation.id);
    const fields = nationOverviewFields(nation, { nationId: nation.id, roles: [{ name: 'Assembly' }, { name: '  ' }] });
    assert.equal(fields.name, nation.name);
    assert.equal(fields.motto, nation.motto);
    assert.equal(fields.stability, nation.stability);
    assert.equal(fields.capital, nation.capital);
    assert.equal(fields.currency, nation.currency);
    assert.equal(fields.government, nation.government);
    assert.equal(fields.economy, nation.economy);
    assert.equal(fields.faith, nation.religion);
    assert.equal(fields.explore, `Explore ${nation.capital}`);
    assert.deepEqual(fields.institutions, [{ id: 'Assembly', name: 'Assembly', view: 'government' }]);
    const hidden = nationOverviewFields({ id: nation.id }, { nationId: 'other', roles: [{ name: 'Assembly' }] });
    assert.equal(hidden.motto, null); assert.equal(hidden.stability, null); assert.equal(hidden.explore, null);
    assert.deepEqual(hidden.institutions, [], 'another nation\'s government read is not this nation\'s institutions');
  }
});

test('styles meet AA, show focus, and the map frame is full-bleed only with the marker class', async () => {
  const css = await read('app/nation-overview.css'), map = await read('app/country-scene.module.css');
  assert.ok(contrast('#f3ecd6', '#071820') >= 4.5, 'paper on the dark teal ground');
  assert.ok(contrast('#f1d58a', '#071820') >= 4.5, 'gold on the dark teal ground');
  assert.ok(contrast('#f3ecd6', '#0d2530') >= 4.5, 'paper on the chip');
  assert.match(css, /\.nation-overview button:focus-visible\{outline:2px solid #f3ecd6/);
  assert.match(map, /:has\(:global\(\.nation-map-bleed\)\)/);
  assert.match(map, /\.capitalMarker\{/);
  assert.match(map, /\.bleed button:focus-visible\{outline:2px solid #f3ecd6/);
  assert.match(map, /background:#071820/);
  assert.match(map, /#d0ad54/);
});

test('the page gates the panel and the map; flag off keeps the old country copy', async () => {
  const page = await read('app/page.tsx'), scene = await read('app/country-scene.tsx');
  assert.match(page, /nationOverviewEnabled\(\)/);
  assert.match(page, /bleed=\{overviewOn\}/);
  assert.match(page, /onCivic=\{\(\) => changeView\('government'\)\}/);
  assert.match(page, /Open City/);
  assert.match(page, /three cities from the official lore/);
  assert.match(scene, /bleed = false/);
  assert.match(scene, /nation-map-bleed/);
  assert.match(scene, /bleed && city\.capital \? <span className=\{styles\.capitalMarker\}/);
  assert.match(await read('tests/civic-copy-619.test.mjs'), /\.\/nation-overview/);
  assert.match(await read('tests/civic-square-access.test.mjs'), /\.\/nation-overview/);
  assert.match(await read('tests/timer-surface-integration.test.mjs'), /\.\/nation-overview/);
  assert.match(await read('tests/aurelle-succession-ui-613.test.mjs'), /\.\/nation-overview/);
});

test('the panel renders crest alt text, real rows, civic links and the capital CTA, and hides gaps', async () => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/nation-overview.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': JSON.stringify('false') } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  let civic = 0, opened = 0;
  const nation = { id: 'aurelle', name: 'Aurelle', motto: "Win the crown's favor - or take the crown.", stability: 72, capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', government: 'Absolute hereditary monarchy', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church' };
  const html = renderToStaticMarkup(React.createElement(mod.NationOverview, { nation, government: { nationId: 'aurelle', roles: [{ name: 'Sovereign' }] }, onExplore: () => { opened += 1; }, onCivic: () => { civic += 1; } }));
  assert.match(html, /aria-label="Aurelle crest: a winged crown"/);
  assert.match(html, /<h2>Aurelle<\/h2>/);
  assert.match(html, /Nation overview/);
  assert.match(html, /Win the crown&#x27;s favor/);
  assert.match(html, /<dt>Stability<\/dt><dd>72 \/ 100<\/dd>/);
  assert.match(html, /<dt>Capital<\/dt><dd>Highspire<\/dd>/);
  assert.match(html, /<dt>Faith<\/dt><dd>Kinward Rite state church<\/dd>/);
  assert.match(html, />Sovereign</);
  assert.match(html, /aria-label="Explore Highspire: open the city"/);
  assert.match(html, />Explore Highspire</);
  const bare = renderToStaticMarkup(React.createElement(mod.NationOverview, { nation: { id: 'fulmara' }, onExplore() {}, onCivic() {} }));
  assert.match(bare, /Nation overview/);
  assert.doesNotMatch(bare, /<h2>|<dt>|Explore |Institutions/);
  assert.equal(civic, 0); assert.equal(opened, 0);
});
