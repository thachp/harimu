/** #392: World atlas Explore card. NEXT_PUBLIC_HARIMU_WORLD_EXPLORE is HARIMU_UI_PACK entry 36.
 *  Preview on, production off. Flag off leaves the atlas and the World summary primary unchanged. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { exploreNationLabels } from '../lib/ui-v2-nation.ts';
import { worldAtlasCard, worldExploreEnabled, WORLD_EXPLORE_FLAG } from '../lib/world-atlas.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = WORLD_EXPLORE_FLAG;
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', motto: "Win the crown's favor - or take the crown.", government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown', economy: 'Royal charters and fiefs', religion: 'Kinward Rite', stability: 72, population: '924k' };
const count = (html, text) => html.split(text).length - 1;

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 36, preview on and production off', async () => {
  assert.equal(worldExploreEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(worldExploreEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 63);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(35), key, 'entry 36');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 63/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/world-atlas.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_WORLD_EXPLORE/);
  assert.match(await read('app/page.tsx'), /<WorldAtlas [^>]*onView=\{changeView\} \/>/);
  assert.match(await read('app/world-atlas.tsx'), /onView\('country'\)/);
});

test('the card uses the crest, the nation motto, and Content Explore copy', () => {
  const card = worldAtlasCard(aurelle);
  assert.equal(card.id, 'aurelle');
  assert.equal(card.name, 'Aurelle');
  assert.equal(card.motto, aurelle.motto);
  assert.deepEqual(card.explore, exploreNationLabels('Aurelle'));
  assert.equal(worldAtlasCard({ ...aurelle, motto: '  ' }).motto, null);
  assert.equal(worldAtlasCard({ ...aurelle, motto: null }).motto, null);
  assert.equal(worldAtlasCard({ id: 'aurelle', motto: 'Only a motto' }).explore, null);
  assert.equal(worldAtlasCard(null), null);
  assert.equal(worldAtlasCard({ population: '1' }), null);
});

const bundle = async (file, env) => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL(`../${file}`, import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: Object.fromEntries(Object.entries(env).map(([name, value]) => [`process.env.${name}`, JSON.stringify(value)])) });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag on shows crest, motto and one gold Explore; flag off is the atlas without them', async () => {
  const offMod = await bundle('app/world-atlas.tsx', { NEXT_PUBLIC_HARIMU_WORLD_EXPLORE: 'false', NEXT_PUBLIC_HARIMU_WORLD_ATLAS: 'false' });
  const onMod = await bundle('app/world-atlas.tsx', { NEXT_PUBLIC_HARIMU_WORLD_EXPLORE: 'true', NEXT_PUBLIC_HARIMU_WORLD_ATLAS: 'false' });
  const panelsOff = await bundle('app/scene-panels-v2.tsx', { NEXT_PUBLIC_HARIMU_WORLD_EXPLORE: 'false', NEXT_PUBLIC_HARIMU_UI_V2_PANEL: 'true' });
  const panelsOn = await bundle('app/scene-panels-v2.tsx', { NEXT_PUBLIC_HARIMU_WORLD_EXPLORE: 'true', NEXT_PUBLIC_HARIMU_UI_V2_PANEL: 'true' });
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement, nations = [{ id: 'aurelle' }, { id: 'kindle' }];
  const atlas = (mod, nation = aurelle) => renderToStaticMarkup(h(mod.WorldAtlas, { nations, nation, clock: null, onView: () => {}, enabled: true }));
  const summary = mod => renderToStaticMarkup(h(mod.WorldSummary, { nation: aurelle, population: h('dd', null, 'POP'), onView: () => {} }));
  const off = atlas(offMod), on = atlas(onMod);
  const stats = html => html.match(/<dl class="world-atlas-stats">[\s\S]*<\/dl>/)[0];
  assert.match(off, /<h2>World atlas<\/h2>/);
  assert.match(off, /<dt>Nations<\/dt><dd>2<\/dd>/);
  assert.match(off, /<dt>Stability<\/dt><dd>72 \/ 100<\/dd>/);
  assert.equal(off, `<section class="world-atlas" aria-label="World atlas"><h2>World atlas</h2>${stats(off)}</section>`);
  assert.doesNotMatch(off, /data-nation-crest|world-atlas-motto|world-atlas-primary|Explore Aurelle|Win the crown/);
  assert.equal(stats(on), stats(off), 'flag on keeps the atlas stats');
  assert.match(on, /data-nation-crest="aurelle"/);
  assert.match(on, /role="img" aria-label="Aurelle crest: a winged crown"/);
  assert.match(on, /<p class="world-atlas-motto">Win the crown(?:'|&#x27;)s favor - or take the crown\.<\/p>/);
  assert.match(on, /<button type="button" class="world-atlas-primary" aria-label="Explore Aurelle: open the nation map">Explore Aurelle<\/button>/);
  const quiet = atlas(onMod, { ...aurelle, motto: '' });
  assert.match(quiet, /data-nation-crest="aurelle"/);
  assert.match(quiet, /Explore Aurelle/);
  assert.doesNotMatch(quiet, /world-atlas-motto/);
  const bare = atlas(onMod, null);
  assert.doesNotMatch(bare, /data-nation-crest|world-atlas-motto|world-atlas-primary|Explore /);
  assert.match(bare, /<dt>Nations<\/dt><dd>2<\/dd>/);
  const summaryOff = summary(panelsOff), summaryOn = summary(panelsOn);
  assert.match(summaryOff, /class="panel-v2-primary"/);
  assert.doesNotMatch(summaryOff, /panel-v2-secondary/);
  assert.equal(summaryOn, summaryOff.replaceAll('panel-v2-primary', 'panel-v2-secondary'));
  assert.match(summaryOn, /Inspect national institutions/);
  const both = on + summaryOn;
  assert.equal(count(both, 'world-atlas-primary'), 1, 'one gold Explore button');
  assert.equal(count(both, 'panel-v2-primary'), 0, 'the institutions action is no longer primary');
  assert.equal(count(both, 'panel-v2-secondary'), 1);
});

test('styles meet AA, show a focus ring, and wrap inside the panel', async () => {
  const css = await read('app/world-atlas.css');
  const onGold = contrast('#071820', '#d0ad54'), onHover = contrast('#071820', '#f1d58a');
  assert.ok(contrast('#f3ecd6', '#071820') >= 4.5, 'motto and name on the dark teal ground');
  assert.ok(onGold >= 4.5, `dark teal on the filled atlas gold is ${onGold.toFixed(2)}:1`);
  assert.ok(onHover >= 4.5, `dark teal on the brighter hover gold is ${onHover.toFixed(2)}:1`);
  assert.ok(contrast('#e1f2ef', '#1a4650') >= 4.5, 'demoted institutions label');
  assert.match(css, /button\.world-atlas-primary:not\(\.market-item\)\{[^}]*background:#d0ad54;color:#071820/);
  assert.match(css, /button\.world-atlas-primary:not\(\.market-item\):hover:not\(:disabled\)\{[^}]*background:#f1d58a/);
  assert.match(css, /button\.world-atlas-primary:focus-visible\{outline:2px solid #f3ecd6;outline-offset:2px\}/);
  assert.match(css, /\.world-atlas :focus-visible\{outline:2px solid #f3ecd6/);
  assert.match(css, /\.world-atlas-name\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.world-atlas-motto\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /button\.world-atlas-primary:not\(\.market-item\)\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.world-atlas\{[^}]*min-width:0/);
  assert.match(await read('app/panel-v2.css'), /\.panel-v2-secondary:focus-visible\{outline:2px solid #d6b45c/);
  assert.match(await read('app/panel-v2.css'), /button\.panel-v2-secondary:not\(\.market-item\)\{[^}]*color:#e1f2ef/);
  assert.doesNotMatch((await read('app/panel-v2.css')).match(/button\.panel-v2-secondary:not\(\.market-item\)\{[^}]*\}/)[0], /#f1d58a|#d6b45c|#d0ad54/);
});
