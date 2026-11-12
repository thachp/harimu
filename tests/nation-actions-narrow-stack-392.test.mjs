/** #392 UI 55: Nation overview actions always stack at 390px.
 *  NEXT_PUBLIC_HARIMU_NATION_ACTIONS_NARROW_STACK is HARIMU_UI_PACK entry 52.
 *  Preview on, production off. The narrow class is on the action row only when this flag and the UI 54 stack flag are both on.
 *  Flag off markup matches the stack row as it is. At 390px the restated rule gives each action a full row. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { NATION_ACTIONS_STACK_FLAG } from '../lib/nation-actions-stack.ts';
import { nationActionsNarrowStackEnabled, NATION_ACTIONS_NARROW_STACK_FLAG } from '../lib/nation-actions-narrow-stack.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = NATION_ACTIONS_NARROW_STACK_FLAG;

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 52, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(nationActionsNarrowStackEnabled(), false);
    assert.equal(nationActionsNarrowStackEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationActionsNarrowStackEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(nationActionsNarrowStackEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 65);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(51), key, 'entry 52');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(52), 'NEXT_PUBLIC_HARIMU_ICON_SIZE_SYNC', 'icon size sync follows entry 52');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(50), NATION_ACTIONS_STACK_FLAG, 'nation actions stack stays entry 51');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 65/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 nation actions narrow stack/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/nation-actions-narrow-stack.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_NARROW_STACK/);
  assert.doesNotMatch(await read('app/page.tsx'), /NATION_ACTIONS_NARROW_STACK|nationActionsNarrowStackEnabled/);
});

const bundle = async (define) => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/nation-overview.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

const defineFor = (narrow, stack = 'true', actions = 'true', icons = 'false') => ({
  'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_MOTTO': '"false"',
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS': JSON.stringify(actions),
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTION_ICONS': JSON.stringify(icons),
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK': stack === undefined ? 'undefined' : JSON.stringify(stack),
  'process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_NARROW_STACK': narrow === undefined ? 'undefined' : JSON.stringify(narrow),
});

test('the narrow class appears only with both flags; flag off markup is unchanged', async () => {
  const previous = process.env[key];
  delete process.env[key];
  try {
    const offMod = await bundle(defineFor('false'));
    const missingMod = await bundle(defineFor(undefined));
    const onMod = await bundle(defineFor('true'));
    const stackOffMod = await bundle(defineFor('true', 'false'));
    const iconsMod = await bundle(defineFor('true', 'true', 'true', 'true'));
    const iconsOffNarrow = await bundle(defineFor('false', 'true', 'true', 'true'));
    const actionsOff = await bundle(defineFor('true', 'true', 'false', 'true'));
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const view = (mod, props) => renderToStaticMarkup(React.createElement(mod.NationOverview, {
      nation: { id: 'aurelle', name: 'Aurelle', capital: 'Highspire' }, onExplore() {}, onCivic() {}, onInstitutions() {}, ...props,
    }));
    const off = view(offMod), missing = view(missingMod), on = view(onMod);
    const button = html => html.match(/<button type="button" class="world-atlas-primary"[\s\S]*?<\/button>/)?.[0] ?? '';
    assert.equal(off, missing, 'a missing flag matches flag off');
    assert.equal(view(onMod, { actionsNarrowStack: false }), off, 'an explicit off prop matches flag off');
    assert.match(off, /<div class="nation-overview-actions nation-overview-actions-stack">/);
    assert.doesNotMatch(off, /nation-overview-actions-narrow-stack/);
    assert.match(on, /<div class="nation-overview-actions nation-overview-actions-stack nation-overview-actions-narrow-stack">/);
    assert.equal(button(on), button(off), 'the narrow flag does not change the button markup');
    assert.ok(on.indexOf('world-atlas-primary') < on.indexOf('nation-overview-secondary'), 'Explore stays first');
    assert.match(on, />Explore Highspire</);
    assert.match(on, />View institutions<\/button>/);
    const stackOff = view(stackOffMod, { actionsNarrowStack: true });
    assert.match(stackOff, /<div class="nation-overview-actions">/);
    assert.doesNotMatch(stackOff, /nation-overview-actions-stack|nation-overview-actions-narrow-stack/);
    const icons = view(iconsMod), iconsQuiet = view(iconsOffNarrow);
    assert.match(icons, /<div class="nation-overview-actions nation-overview-action-icons nation-overview-actions-stack nation-overview-actions-narrow-stack">/);
    assert.match(iconsQuiet, /<div class="nation-overview-actions nation-overview-action-icons nation-overview-actions-stack">/);
    assert.doesNotMatch(iconsQuiet, /nation-overview-actions-narrow-stack/);
    const closed = view(actionsOff, { actionsStack: true, actionsNarrowStack: true });
    assert.doesNotMatch(closed, /nation-overview-actions|nation-overview-actions-narrow-stack|View institutions|world-atlas-primary/);
    const css = await read('app/nation-overview.css');
    const queries = [...css.matchAll(/@media \(max-width:390px\)\{([^}]*)\}/g)].map(match => match[1]);
    const narrow = queries.filter(block => block.includes('nation-overview-actions-narrow-stack'));
    assert.equal(narrow.length, 1);
    assert.match(narrow[0], /\.nation-overview-actions\.nation-overview-actions-stack\.nation-overview-actions-narrow-stack>button\.world-atlas-primary:not\(\.market-item\)/);
    assert.match(narrow[0], /\.nation-overview-actions-stack\.nation-overview-actions-narrow-stack>button\.nation-overview-secondary:not\(\.market-item\)\{flex-basis:100%;width:100%/);
    const outside = css.replace(/@media \(max-width:390px\)\{[^}]*\}/g, '');
    assert.equal(outside.includes('nation-overview-actions-narrow-stack'), false);
    assert.match(css, /\.nation-overview-actions\.nation-overview-actions-stack>button\.world-atlas-primary:not\(\.market-item\)[^}]*\{flex:1 1 auto;width:auto;min-width:min-content;max-width:100%;min-height:44px/);
    assert.match(css, /@media \(max-width:390px\)\{[^}]*\.nation-overview-actions>button\.world-atlas-primary:not\(\.market-item\)[^}]*flex-basis:100%;width:100%/);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
});
