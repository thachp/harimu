/** #392 S3: UI v2 panel shape, flag NEXT_PUBLIC_HARIMU_UI_V2_PANEL ("true" in preview, "false" in production). Browser-free pins. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { uiV2PanelEnabled } from '../lib/ui-v2-panel.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('flag: preview on, production off, only the exact string "true" enables it', async () => {
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_PANEL":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_PANEL":\s*"false"/);
  assert.equal(uiV2PanelEnabled('true'), true);
  for (const v of [undefined, '', 'false', 'TRUE', '1']) assert.equal(uiV2PanelEnabled(v), false);
});

// Render the real World/City panel pieces from a build with the flag off and one with it on (the flag is a build-time define, as in the app).
const render = async flag => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': JSON.stringify(flag) } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const { cityDestinations } = await import('../lib/city-destinations.ts');
  const nation = { id: 'aurelle', name: 'Aurelle', government: 'GOV', capital: 'CAP', currency: 'CUR', economy: 'ECO', religion: 'REL' }, noop = () => {};
  const population = React.createElement('dd', { className: 'population-band' }, 'POP'), h = React.createElement;
  const world = renderToStaticMarkup(h(React.Fragment, null, h(mod.WorldSummary, { nation, population, onView: noop }), h(mod.WorldFacts, { nation, population }), h(mod.WorldInstitutionsButton, { onView: noop })));
  const city = renderToStaticMarkup(h(mod.CitySummary, { cityName: 'Highspire', nation, destinations: cityDestinations('aurelle', true), onView: noop }));
  return { world, city };
};
const count = (html, text) => html.split(text).length - 1;
const expectFor = (flag, { world, city }) => {
  const on = flag === 'true';
  assert.equal(world.includes('class="panel-v2"'), on, `World .panel-v2 with the flag ${flag}`);
  assert.equal(city.includes('class="panel-v2"'), on, `City .panel-v2 with the flag ${flag}`);
  for (const fact of ['POP', 'CAP', 'GOV', 'ECO', 'CUR', 'REL']) assert.ok(world.includes(fact), `World keeps ${fact} with the flag ${flag}`); // QA3: nothing lost
  for (const label of ['Economy', 'Religion']) assert.ok(world.includes(`<dt>${label}</dt>`), `${label} keeps its label with the flag ${flag}`);
  assert.equal(world.includes('<dt>Government</dt>'), !on, 'the old full facts list only with the flag off');
  assert.equal(count(world, 'Inspect national institutions'), 1, 'one institutions action');
  assert.equal(world.includes('<button type="button">Inspect national institutions</button>'), !on, 'the old institutions button only with the flag off');
  assert.equal(world.includes('panel-v2-primary'), on);
  if (on) {
    assert.equal(count(city, '>Household<'), 1, 'Household shows once (promoted to the primary action)');
    assert.match(city, /class="panel-v2-primary"><span>Household<\/span>/);
    assert.doesNotMatch(city, /Open Household/);
    for (const label of ['Workplace', 'Chartered food', 'Government']) assert.ok(city.includes(`<strong>${label}</strong>`), label);
  } else assert.equal(city, '');
};

test('render: World and City panels with the flag off and on, same assertions', async () => {
  for (const flag of ['false', 'true']) expectFor(flag, await render(flag));
  assert.throws(() => expectFor('false', { world: '', city: '<section class="panel-v2"></section>' }));
});

test('page.tsx never decides the flag: it renders the pieces without `enabled`, and has no flag of its own', async () => {
  const page = await read('app/page.tsx');
  for (const name of ['WorldSummary', 'WorldFacts', 'WorldInstitutionsButton', 'CitySummary']) {
    const uses = [...page.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(m => m[0]);
    assert.equal(uses.length, 1, `${name} rendered once`);
    assert.doesNotMatch(uses[0], /\benabled\b/, `${name} must read the build flag itself`);
  }
  assert.doesNotMatch(page, /uiV2PanelEnabled|UI_V2_PANEL|panelV2|<PanelV2\b/);
});

test('the component adds no copy of its own (text or string attributes)', async () => {
  const src = await read('app/panel-v2.tsx');
  const jsxText = [...src.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map(m => m[1].trim()).filter(Boolean);
  assert.deepEqual(jsxText, []);
  const attrs = [...src.matchAll(/\s([a-zA-Z][\w-]*)=["']([^"']*)["']/g)].filter(([, name, value]) => !['className', 'type'].includes(name) && !(name === 'aria-hidden' && value === 'true')).map(m => m[0].trim());
  assert.deepEqual(attrs, [], 'string attributes (aria-label, title, ...) must come from props');
  assert.match(src, /aria-label=\{title\}/); assert.match(src, /aria-label=\{rowsLabel\}/);
});


test('every esbuild harness that defines UI_V2_TOPBAR also defines UI_V2_PANEL', async () => {
  const { readdir } = await import('node:fs/promises');
  for (const f of (await readdir(new URL('../scripts/', import.meta.url))).filter(f => f.endsWith('.mjs'))) {
    const src = await read(`scripts/${f}`);
    if (/['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR['"]\s*:/.test(src)) assert.match(src, /['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_PANEL['"]\s*:/, `${f} must define UI_V2_PANEL`);
  }
});
