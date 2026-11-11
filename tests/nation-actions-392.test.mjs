/** #392 UI 42: Nation overview action row. NEXT_PUBLIC_HARIMU_NATION_ACTIONS is HARIMU_UI_PACK entry 40.
 *  Preview on, production off. Flag on: Explore {capital} uses the shared gold primary, and View institutions
 *  only when the caller passes the institutions destination. Flag off keeps the outlined Explore button. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { capitalCityForNation } from '../lib/cities.ts';
import { nationActionsEnabled, NATION_ACTIONS_FLAG } from '../lib/nation-actions.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = NATION_ACTIONS_FLAG;

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 40, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(nationActionsEnabled(), false);
    assert.equal(nationActionsEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationActionsEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(nationActionsEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 55);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(39), key, 'entry 40');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 55/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 nation actions/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/nation-actions.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NATION_ACTIONS/);
  assert.match(await read('app/explore-primary.tsx'), /className="world-atlas-primary"/);
  assert.match(await read('app/world-atlas.tsx'), /<ExplorePrimaryButton /);
  assert.match(await read('app/nation-overview.tsx'), /<ExplorePrimaryButton /);
  assert.doesNotMatch(await read('app/world-atlas.tsx'), /world-atlas-primary/);
  assert.doesNotMatch(await read('app/nation-overview.tsx'), /world-atlas-primary/);
  assert.doesNotMatch(await read('app/nation-overview.css'), /background:#d0ad54/);
  assert.match(await read('app/page.tsx'), /onInstitutions=\{\(\) => changeView\('nation'\)\}/);
  assert.match(await read('app/scene-panels-v2.tsx'), /label: 'Inspect national institutions', onSelect: \(\) => onView\('nation'\)/);
  assert.doesNotMatch(await read('app/page.tsx'), /NATION_ACTIONS|nationActionsEnabled/);
});

const bundle = async (actions) => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/nation-overview.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS': JSON.stringify(actions), 'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS': 'undefined', 'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK': 'undefined' } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag on uses the shared primary and the real capital; the secondary exists only with its destination; flag off is the old button', async () => {
  const offMod = await bundle('false'), onMod = await bundle('true');
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const view = (mod, nation, institutions) => renderToStaticMarkup(React.createElement(mod.NationOverview, {
    nation, onExplore() {}, onCivic() {}, ...(institutions ? { onInstitutions() {} } : {}),
  }));
  for (const id of ['aurelle', 'korund']) {
    const capital = capitalCityForNation(id)?.name;
    assert.ok(capital, id);
    const nation = { id, name: id, capital };
    const on = view(onMod, nation, true), alone = view(onMod, nation, false), off = view(offMod, nation, true);
    const primary = on.match(/<button type="button" class="world-atlas-primary"[\s\S]*?<\/button>/)?.[0] ?? '';
    assert.match(primary, new RegExp(`aria-label="Explore ${capital}: open the city"`));
    assert.match(primary, new RegExp(`>Explore ${capital}<`));
    assert.match(primary, /aria-hidden="true"/);
    assert.match(on, /class="nation-overview-actions"/);
    assert.match(on, /<button type="button" class="nation-overview-secondary">View institutions<\/button>/);
    assert.equal(alone.includes('View institutions'), false, `${id} has no institutions destination`);
    assert.match(alone, /class="world-atlas-primary"/);
    assert.match(off, new RegExp(`<button type="button" class="nation-overview-primary" aria-label="Explore ${capital}: open the city">Explore ${capital}</button>`));
    assert.doesNotMatch(off, /world-atlas-primary|nation-overview-actions|nation-overview-secondary|View institutions/);
  }
  const css = await read('app/nation-overview.css'), gold = await read('app/world-atlas.css');
  assert.match(gold, /button\.world-atlas-primary:not\(\.market-item\)\{[^}]*background:#d0ad54;color:#071820/);
  assert.match(gold, /button\.world-atlas-primary:not\(\.market-item\):hover:not\(:disabled\)\{[^}]*background:#f1d58a/);
  assert.match(gold, /button\.world-atlas-primary:focus-visible\{outline:2px solid #f3ecd6;outline-offset:2px\}/);
  assert.match(css, /\.nation-overview-actions>button\.world-atlas-primary:not\(\.market-item\)[\s\S]*min-height:44px/);
  assert.match(css, /\.nation-overview button\.nation-overview-secondary:not\(\.market-item\)\{[^}]*min-height:44px/);
  assert.match(css, /@media \(max-width:390px\)\{[^}]*nation-overview-actions>button\.world-atlas-primary:not\(\.market-item\)[^}]*width:100%/);
  assert.match(css, /@media \(max-width:390px\)\{[^}]*nation-overview-secondary:not\(\.market-item\)\{flex-basis:100%;width:100%\}/);
});
