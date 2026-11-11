/** #392 UI 46: World atlas identity. NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY is HARIMU_UI_PACK entry 43.
 *  Preview on, production off. Flag on: the heading is Harimu, "World atlas" is the kicker, and the tagline
 *  counts the nation list (Ten when that length is 10). A shown motto is the gold italic line, and
 *  "Explore the world" sits above the existing Explore button. A blank motto or an empty list stays hidden.
 *  Flag off keeps the World atlas heading and the paper motto. Atlas off still renders nothing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { worldAtlasExploreKicker, worldAtlasIdentityEnabled, worldAtlasIdentityTagline, WORLD_ATLAS_EXPLORE_KICKER, WORLD_ATLAS_IDENTITY_FLAG, WORLD_ATLAS_IDENTITY_KICKER, WORLD_ATLAS_IDENTITY_TITLE } from '../lib/world-atlas-identity.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = WORLD_ATLAS_IDENTITY_FLAG;
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', motto: "Win the crown's favor - or take the crown.", government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', stability: 72, population: '924k' };
const hoarvale = { id: 'hoarvale', name: 'Hoarvale', shortName: 'Hoarvale', motto: 'The Crown endures; governments answer to you.', government: 'Constitutional monarchy', capital: 'Rimehall', currency: 'Rime (RIM) · inflation band', economy: 'Coordinated market', stability: 81, population: '1.09m' };
const ten = Array.from({ length: 10 }, (_, index) => ({ id: `nation-${index}` }));
const aurelleMotto = /Win the crown(?:'|&#x27;)s favor - or take the crown\./;

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 43, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(worldAtlasIdentityEnabled(), false);
    assert.equal(worldAtlasIdentityEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(worldAtlasIdentityEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(worldAtlasIdentityEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 59);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(42), key, 'entry 43');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 59/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 world atlas identity/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/world-atlas-identity.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY/);
  assert.match(await read('app/world-atlas.tsx'), /identity = worldAtlasIdentityEnabled\(\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /WORLD_ATLAS_IDENTITY|worldAtlasIdentityEnabled/);
});

test('the tagline is the nation list length, and the explore kicker needs the button', () => {
  assert.equal(worldAtlasIdentityTagline(ten), 'One world. Ten nations.');
  assert.equal(worldAtlasIdentityTagline([aurelle]), 'One world. 1 nation.');
  assert.equal(worldAtlasIdentityTagline([aurelle, hoarvale]), 'One world. 2 nations.');
  assert.equal(worldAtlasIdentityTagline(Array.from({ length: 9 }, () => ({}))), 'One world. 9 nations.');
  assert.equal(worldAtlasIdentityTagline(Array.from({ length: 11 }, () => ({}))), 'One world. 11 nations.');
  assert.equal(worldAtlasIdentityTagline([]), null);
  assert.equal(worldAtlasIdentityTagline(null), null);
  assert.equal(worldAtlasIdentityTagline(undefined), null);
  assert.equal(worldAtlasExploreKicker(true), WORLD_ATLAS_EXPLORE_KICKER);
  assert.equal(worldAtlasExploreKicker(false), null);
  assert.equal(WORLD_ATLAS_IDENTITY_TITLE, 'Harimu');
  assert.equal(WORLD_ATLAS_IDENTITY_KICKER, 'World atlas');
});

const bundle = async (identity, explore = 'true', atlas = 'true') => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/world-atlas.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: { 'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS': JSON.stringify(atlas), 'process.env.NEXT_PUBLIC_HARIMU_WORLD_EXPLORE': JSON.stringify(explore), 'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY': JSON.stringify(identity) } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag on stacks the title, derived tagline, gold motto and explore kicker; flag off is the current atlas', async () => {
  const onMod = await bundle('true'), offMod = await bundle('false'), quietAtlas = await bundle('true', 'true', 'false');
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const view = (mod, props) => renderToStaticMarkup(React.createElement(mod.WorldAtlas, { nations: ten, nation: aurelle, onView() {}, ...props }));
  const on = view(onMod), off = view(offMod), other = view(onMod, { nation: hoarvale });
  const stats = html => html.match(/<dl class="world-atlas-stats">[\s\S]*<\/dl>/)[0];
  const headings = html => html.match(/<h2>[\s\S]*?<\/h2>/g);
  assert.deepEqual(headings(on), ['<h2>Harimu</h2>']);
  assert.match(on, /<section class="world-atlas world-atlas-identity" aria-label="World atlas"><div class="world-atlas-identity-head"><h2>Harimu<\/h2><p class="world-atlas-identity-kicker">World atlas<\/p><p class="world-atlas-identity-tagline">One world\. Ten nations\.<\/p><\/div>/);
  assert.doesNotMatch(on, /<h2>World atlas<\/h2>/);
  assert.match(on, new RegExp(`<p class="world-atlas-motto">${aurelleMotto.source}</p>`));
  assert.match(on, /<p class="world-atlas-explore-kicker">Explore the world<\/p><button type="button" class="world-atlas-primary" aria-label="Explore Aurelle: open the nation map">Explore Aurelle<\/button>/);
  assert.match(on, /data-nation-crest="aurelle"/);
  assert.match(other, /<p class="world-atlas-motto">The Crown endures; governments answer to you\.<\/p>/);
  assert.match(other, /Explore Hoarvale/);
  assert.equal(stats(on), stats(off), 'flag on keeps the atlas stats');
  assert.match(off, /<section class="world-atlas" aria-label="World atlas"><h2>World atlas<\/h2>/);
  assert.match(off, new RegExp(`<p class="world-atlas-motto">${aurelleMotto.source}</p>`));
  assert.match(off, /<button type="button" class="world-atlas-primary" aria-label="Explore Aurelle: open the nation map">Explore Aurelle<\/button>/);
  assert.doesNotMatch(off, /world-atlas-identity|world-atlas-explore-kicker|One world|Harimu|Explore the world/);
  const emptyList = view(onMod, { nations: [] });
  assert.match(emptyList, /<h2>Harimu<\/h2><p class="world-atlas-identity-kicker">World atlas<\/p><\/div>/);
  assert.doesNotMatch(emptyList, /world-atlas-identity-tagline|One world/);
  for (const motto of ['', '   ', null]) {
    const quiet = view(onMod, { nation: { ...aurelle, motto } });
    assert.match(quiet, /<p class="world-atlas-name">Aurelle<\/p>/);
    assert.match(quiet, /Explore the world/);
    assert.match(quiet, /Explore Aurelle/);
    assert.doesNotMatch(quiet, /world-atlas-motto/);
  }
  const noButton = view(onMod, { explore: false });
  assert.match(noButton, /<h2>Harimu<\/h2>/);
  assert.match(noButton, /One world\. Ten nations\./);
  assert.doesNotMatch(noButton, /world-atlas-explore-kicker|world-atlas-primary|Explore Aurelle|world-atlas-motto/);
  const noView = view(onMod, { onView: undefined });
  assert.doesNotMatch(noView, /world-atlas-explore-kicker|world-atlas-primary/);
  assert.match(noView, /world-atlas-motto/);
  const one = view(onMod, { nations: [aurelle] });
  assert.match(one, /One world\. 1 nation\./);
  assert.doesNotMatch(one, /Ten nations/);
  assert.equal(renderToStaticMarkup(React.createElement(quietAtlas.WorldAtlas, { nations: ten, nation: aurelle, onView() {} })), '');
  const css = await read('app/world-atlas.css');
  const block = css.slice(css.indexOf('/* #392 UI 46'));
  assert.ok(block.length > 0);
  const motto = block.match(/\.world-atlas-motto\{[^}]*\}/)?.[0] ?? '';
  assert.match(motto, /#f1d58a/);
  assert.match(motto, /Georgia/);
  assert.match(motto, /font-style:italic/);
  assert.match(motto, /font-size:calc\(13px \* var\(--text-scale, 1\)\)/);
  assert.match(motto, /line-height:1\.35/);
  assert.match(motto, /overflow-wrap:break-word/);
  assert.match(motto, /word-break:normal/);
  assert.doesNotMatch(block, /overflow-wrap:\s*anywhere|word-break:\s*break-all/);
  assert.match(css.slice(0, css.indexOf('/* #392 UI 46')), /\.world-atlas-motto\{[^}]*#f3ecd6/);
  assert.match(block, /\.world-atlas-identity h2\{[^}]*font-size:calc\(30px/);
  assert.match(block, /world-atlas-explore-kicker/);
  assert.ok(contrast('#f1d58a', '#071820') >= 4.5, 'gold motto on the atlas ground');
  assert.ok(contrast('#f3ecd6', '#071820') >= 4.5, 'title and tagline on the atlas ground');
});
