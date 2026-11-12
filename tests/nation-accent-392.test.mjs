/** #392: crest accent on the side-panel header, the selected globe label and the zoom-path step.
 *  NEXT_PUBLIC_HARIMU_NATION_ACCENT is a HARIMU_UI_PACK key. Preview on, production off.
 *  Colours are the crest accents already in lib/nation-crests.ts. An id with no crest stays on the gold chrome.
 *  Text uses the accent only when it clears AA on the zoom-path chip. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { nationCrests } from '../lib/nation-crests.ts';
import { accentContrast, nationAccentApplies, nationAccentEnabled, nationChromeAccent, ACCENT_CHIP, ACCENT_GOLD_TEXT, ACCENT_HEADER, ACCENT_TEXT_AA, NATION_ACCENT_FLAG } from '../lib/nation-accent.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = NATION_ACCENT_FLAG;

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(nationAccentEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationAccentEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 69);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 69/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/nation-accent.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NATION_ACCENT/);
});

test('every crest accent is reused, text stays AA, and a missing crest stays gold', () => {
  assert.equal(Object.keys(nationCrests).length, 10);
  const ruled = [];
  for (const [id, crest] of Object.entries(nationCrests)) {
    const chrome = nationChromeAccent(id);
    assert.equal(chrome.rule, crest.accent, id);
    assert.ok(accentContrast(chrome.text, ACCENT_CHIP) >= ACCENT_TEXT_AA, `${id} text ${accentContrast(chrome.text, ACCENT_CHIP).toFixed(2)}`);
    assert.ok(accentContrast(chrome.rule, ACCENT_HEADER) >= 3, `${id} rule ${accentContrast(chrome.rule, ACCENT_HEADER).toFixed(2)}`);
    if (accentContrast(crest.accent, ACCENT_CHIP) >= ACCENT_TEXT_AA) assert.equal(chrome.textRole, 'accent', id);
    else { assert.equal(chrome.textRole, 'gold', id); assert.equal(chrome.text, ACCENT_GOLD_TEXT); ruled.push(id); }
  }
  assert.deepEqual(ruled, ['varkand']);
  assert.equal(nationChromeAccent('foreign'), null);
  assert.equal(nationChromeAccent('__proto__'), null);
  for (const view of ['world', 'country', 'nation', 'square']) assert.equal(nationAccentApplies(view), true, view);
  for (const view of ['household', 'workplace', 'market', 'government']) assert.equal(nationAccentApplies(view), false, view);
});

test('styles are scoped to the flag, keep focus rings, and drop the label glow when motion is reduced', async () => {
  const css = (await read('app/nation-accent.css')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /outline/);
  assert.match(css, /\.harimu-game\[data-nation-accent\] \.game-inspector-title\{border-bottom-color:var\(--crest-accent\)\}/);
  assert.match(css, /\.nation-overview-head>\.nation-crest svg>path:first-child\{stroke:var\(--crest-accent\)\}/);
  assert.match(css, /\.game-zoom-path \[aria-current=page\]\{color:var\(--crest-accent-text\)\}/);
  assert.match(css, /\[data-accent-text=gold\] \.game-zoom-path \[aria-current=page\]\{box-shadow:inset 0 -2px 0 var\(--crest-accent\)\}/);
  assert.match(css, /\.viewport-world-label\.viewport-nation-selected\{border-color:var\(--crest-accent\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /html\[data-harimu-reduced-motion\]/);
  assert.match(await read('app/zoom-path.css'), /a:focus-visible\{outline:2px solid var\(--s2-paper\);outline-offset:2px\}/);
  assert.match(await read('app/game-shell.css'), /\.viewport-world-label:focus-visible\{outline:2px solid #80d8ce;outline-offset:3px\}/);
  assert.match(await read('app/game-shell.css'), /\.viewport-world-label\.viewport-nation-selected\{border:3px double #d3aa5b/);
  const shell = await read('app/game-shell.tsx');
  assert.match(shell, /nationAccentEnabled\(\) && nationAccentApplies\(view\) \? nationChromeAccent\(nation\.id\) : null/);
  assert.match(shell, /data-nation-accent=\{chrome \? nation\.id : undefined\}/);
});

const builds = {};
const render = async (env, props) => {
  const id = JSON.stringify(env);
  builds[id] ??= await (await import('../scripts/hud-tooltip-check.mjs')).bundleShell(
    `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { GameShell } from './app/game-shell.tsx';
     globalThis.__renderShell = props => renderToStaticMarkup(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null} />);`,
    env);
  class MessageChannel { constructor() { const port1 = { onmessage: null, close() {} }; this.port1 = port1; this.port2 = { postMessage: data => setTimeout(() => port1.onmessage?.({ data }), 0), close() {} }; } }
  const sandbox = { MessageChannel, console, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox;
  vm.runInNewContext(builds[id], sandbox);
  const { shellProps } = await import('../scripts/hud-tooltip-check.mjs');
  return sandbox.__renderShell({ ...shellProps, localDemo: false, ...props });
};
const nation = id => ({ id, name: id, capital: 'Capital' });
const root = html => html.match(/<main [^>]*>/)?.[0] ?? '';

test('flag on paints the three zoom views; flag off and the other views stay on the gold chrome', async () => {
  const off = root(await render({ [key]: 'false' }, { view: 'country', nation: nation('aurelle') }));
  assert.equal(off.includes('data-nation-accent'), false);
  assert.equal(off.includes('--crest-accent'), false);
  const aurelle = root(await render({ [key]: 'true' }, { view: 'country', nation: nation('aurelle') }));
  assert.match(aurelle, /data-nation-accent="aurelle"/);
  assert.match(aurelle, /data-accent-text="accent"/);
  assert.match(aurelle, /--crest-accent:#d0ad54/);
  assert.match(aurelle, /--crest-accent-text:#d0ad54/);
  const kindle = root(await render({ [key]: 'true' }, { view: 'square', nation: nation('kindle') }));
  assert.match(kindle, /data-nation-accent="kindle"/);
  assert.match(kindle, /--crest-accent:#d9692b/);
  const varkandHtml = await render({ [key]: 'true', NEXT_PUBLIC_HARIMU_ZOOM_PATH: 'true' }, { view: 'world', nation: nation('varkand') });
  const varkand = root(varkandHtml);
  assert.match(varkand, /data-nation-accent="varkand"/);
  assert.match(varkand, /data-accent-text="gold"/);
  assert.match(varkand, /--crest-accent:#d1352b/);
  assert.match(varkand, /--crest-accent-text:#f1d58a/);
  assert.match(varkandHtml, /<span aria-current="page">World<\/span>/);
  for (const view of ['household', 'workplace', 'market', 'government']) {
    const html = root(await render({ [key]: 'true' }, { view, nation: nation('fulmara') }));
    assert.equal(html.includes('data-nation-accent'), false, view);
  }
  const missing = root(await render({ [key]: 'true' }, { view: 'world', nation: nation('foreign') }));
  assert.equal(missing.includes('data-nation-accent'), false);
});
