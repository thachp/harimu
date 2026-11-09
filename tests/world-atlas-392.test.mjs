/** #392: World atlas header and stat rows on ?view=world. NEXT_PUBLIC_HARIMU_WORLD_ATLAS is a HARIMU_UI_PACK key.
 *  Preview on, production off. Flag off renders nothing. A read that is missing is not shown. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { ageHudLine, worldAgeAt } from '../lib/world-age.ts';
import { worldAtlasEnabled, worldAtlasStats } from '../lib/world-atlas.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_WORLD_ATLAS';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const kindle = { population: '1.42m', capital: 'Forgehaven', government: 'Liberal democracy', economy: 'Market capitalism', currency: 'Spark (SPK) · free float', stability: 78 };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(worldAtlasEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(worldAtlasEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 31);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 31/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/world-atlas.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_WORLD_ATLAS/);
});

test('rows use the nation read and the world clock, and a missing read is omitted', () => {
  const nations = [{ id: 'kindle' }, { id: 'korund' }];
  const clock = { epochSeconds: 1_700_000_000, nowSeconds: 1_700_000_000 };
  const age = worldAgeAt(clock.epochSeconds * 1000, clock.nowSeconds * 1000);
  const rows = worldAtlasStats({ nations, nation: kindle, clock });
  assert.deepEqual(rows.map(row => row.label), ['Nations', 'World age', 'Population', 'Capital', 'Government', 'Economy', 'Currency', 'Stability']);
  assert.equal(rows[0].value, '2');
  assert.equal(rows.find(row => row.label === 'World age').value, ageHudLine(age));
  assert.equal(rows.find(row => row.label === 'Population').value, '1.42m');
  assert.equal(rows.find(row => row.label === 'Stability').value, '78 / 100');
  assert.equal(rows.find(row => row.label === 'Currency').value, kindle.currency);
  const bare = worldAtlasStats({ nations: [], nation: { population: '  ', capital: '', stability: Number.NaN }, clock: { epochSeconds: Number.NaN, nowSeconds: 1 } });
  assert.deepEqual(bare, []);
  const noClock = worldAtlasStats({ nations, nation: { capital: 'Forgehaven' }, clock: null });
  assert.deepEqual(noClock.map(row => row.label), ['Nations', 'Capital']);
});

test('styles meet AA and show focus', async () => {
  const css = await read('app/world-atlas.css');
  assert.ok(contrast('#f3ecd6', '#071820') >= 4.5, 'paper on the dark teal ground');
  assert.ok(contrast('#f1d58a', '#071820') >= 4.5, 'gold on the dark teal ground');
  assert.match(css, /background:#071820/);
  assert.match(css, /color:#f3ecd6/);
  assert.match(css, /color:#f1d58a/);
  assert.match(css, /#d0ad54/);
  assert.match(css, /\.world-atlas :focus-visible\{outline:2px solid #f3ecd6/);
});

test('the world panel mounts the atlas without deciding the flag; flag off renders nothing', async () => {
  const page = await read('app/page.tsx');
  assert.match(page, /<WorldAtlas nations=\{worldNations\} nation=\{selected\} clock=\{guestActive \? null : simulation\?\.clock \?\? null\} \/>/);
  assert.match(page, /viewMode==='world' \? worldPanel/);
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/world-atlas.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: { 'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS': JSON.stringify('false') } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const off = renderToStaticMarkup(React.createElement(mod.WorldAtlas, { nations: [{ id: 'kindle' }], nation: kindle, clock: { epochSeconds: 1, nowSeconds: 1 } }));
  assert.equal(off, '');
  const on = renderToStaticMarkup(React.createElement(mod.WorldAtlas, { nations: [{ id: 'kindle' }, { id: 'aurelle' }], nation: kindle, clock: null, enabled: true }));
  assert.match(on, /<h2>World atlas<\/h2>/);
  assert.match(on, /aria-label="World atlas"/);
  assert.match(on, /<dt>Nations<\/dt><dd>2<\/dd>/);
  assert.match(on, /<dt>Population<\/dt><dd>1\.42m<\/dd>/);
  assert.match(on, /<dt>Stability<\/dt><dd>78 \/ 100<\/dd>/);
  assert.doesNotMatch(on, /World age|Epoch|Languages|Active laws|Open disputes|Next festival|The Founding/);
  const clockOn = renderToStaticMarkup(React.createElement(mod.WorldAtlas, { nations: [{ id: 'kindle' }], nation: {}, clock: { epochSeconds: 1_700_000_000, nowSeconds: 1_700_000_000 }, enabled: true }));
  assert.match(clockOn, /World age/);
  assert.match(clockOn, /Age 1, year 1 of 12/);
});
