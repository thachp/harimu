/** #392 UI 39: crest-only World nation strip. NEXT_PUBLIC_HARIMU_WORLD_CREST_STRIP is HARIMU_UI_PACK entry 37.
 *  Preview on, production off. Flag off keeps the capital · Stability line. Flag on shows the crest and the short name. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { accentContrast, ACCENT_TEXT_AA } from '../lib/nation-accent.ts';
import { nationCrest } from '../lib/nation-crests.ts';
import { worldCrestStripEnabled, WORLD_CREST_STRIP_FLAG } from '../lib/ui-v2-world.ts';
import { bundleShell, shellProps } from '../scripts/hud-tooltip-check.mjs';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = WORLD_CREST_STRIP_FLAG;
const items = [
  { id: 'aurelle', label: 'Aurelle', detail: 'Highspire · Stability 72', badge: 'Needs citizens', selected: true },
  { id: 'kindle', label: 'Kindle', detail: 'Forgehaven · Stability 78' },
  { id: 'foreign', label: 'Foreign', detail: 'Nowhere · Stability 1' },
];
const builds = {};
const render = async (flag, view) => {
  builds[flag] ??= await bundleShell(`import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { GameShell } from './app/game-shell.tsx';
    globalThis.__renderShell = props => renderToStaticMarkup(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null} />);`, { NEXT_PUBLIC_HARIMU_WORLD_CREST_STRIP: flag });
  class MessageChannel { constructor() { const port1 = { onmessage: null, close() {} }; this.port1 = port1; this.port2 = { postMessage: data => setTimeout(() => port1.onmessage?.({ data }), 0), close() {} }; } }
  const sandbox = { MessageChannel, console, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox;
  vm.runInNewContext(builds[flag], sandbox);
  return sandbox.__renderShell({ ...shellProps, view, contextItems: items, contextTitle: 'Nations' });
};
const section = html => html.match(/<section class="game-context-strip[^"]*"[\s\S]*?<\/section>/)[0];
const button = (html, label) => [...section(html).matchAll(/<button type="button"[\s\S]*?<\/button>/g)].map(m => m[0]).find(b => b.includes(`>${label}`));

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 37, preview on and production off', async () => {
  assert.equal(worldCrestStripEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(worldCrestStripEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 63);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(36), key, 'entry 37');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 63/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 crest strip/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/ui-v2-world.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_WORLD_CREST_STRIP/);
  assert.equal(nationCrest('aurelle')?.motif, 'A winged crown');
  assert.equal(nationCrest('foreign'), null);
});

test('flag on hides the detail line and flag off keeps it', async () => {
  const off = await render('false', 'world'), on = await render('true', 'world'), city = await render('true', 'square');
  const offStrip = section(off), onStrip = section(on);
  assert.equal(offStrip.includes('game-crest-strip'), false);
  assert.equal(onStrip.includes('game-crest-strip'), true);
  for (const item of items) {
    const before = button(off, item.label), after = button(on, item.label);
    assert.ok(before.includes(`>${item.detail}<`), `${item.label}: flag off keeps the detail line`);
    assert.equal(after.includes(item.detail), false, `${item.label}: flag on hides the detail line`);
    assert.ok(after.includes(`>${item.label}`), `${item.label}: the name stays`);
  }
  const aurelle = button(on, 'Aurelle');
  assert.match(aurelle, /data-nation-crest="aurelle"/);
  assert.match(aurelle, /<span class="world-strip-crest" aria-hidden="true">/);
  assert.match(aurelle, /<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(aurelle, /aria-label=/);
  assert.match(aurelle, /aria-pressed="true"/);
  assert.match(aurelle, /Needs citizens/);
  const missing = button(on, 'Foreign');
  assert.doesNotMatch(missing, /data-nation-crest|nation-symbol/, 'a nation with no crest keeps the current strip, with no stand-in art');
  assert.match(button(city, 'Aurelle'), />Highspire · Stability 72</);
  assert.equal(section(city).includes('game-crest-strip'), false, 'the city strip is unchanged');
});

test('crest strip keeps AA name contrast, the selected accent, a focus ring and a 44px target', async () => {
  const css = await read('app/game-shell.css');
  const block = css.slice(css.indexOf('/* #392 UI 39'));
  assert.ok(block.length > 40);
  assert.match(block, /\.game-crest-strip \.game-context-items>button\{[^}]*min-height:44px/);
  assert.match(block, /\.game-crest-strip \.game-context-items>button\{[^}]*min-width:44px/);
  assert.match(block, /\.game-crest-strip \.game-context-items>button:focus-visible\{outline:2px solid #80d8ce;outline-offset:-3px\}/);
  assert.match(block, /\.game-crest-strip \.game-context-items>button\[aria-pressed=true\]\{background:#24515a;box-shadow:inset 0 3px #8bd2c5\}/);
  assert.match(block, /\.game-crest-strip \.game-context-items>button>strong\{[^}]*color:#dce7e8\}/);
  for (const bg of ['#102934', '#1b3b46', '#24515a']) assert.ok(accentContrast('#dce7e8', bg) >= ACCENT_TEXT_AA, `#dce7e8 on ${bg}`);
  assert.ok(accentContrast('#80d8ce', '#102934') >= 3, 'focus ring on the chip');
  assert.ok(accentContrast('#8bd2c5', '#24515a') >= 3, 'selected accent on the chip');
  assert.match(block, /@media\(max-width:760px\)\{\.game-crest-strip \.game-context-items\{[^}]*overflow:visible/);
  assert.match(block, /\.game-crest-strip \.game-context-items>button\{[^}]*flex:1 1 0/);
  assert.match(block, /@media\(min-width:761px\)\{\s*\.game-crest-strip\{grid-template-columns:max-content minmax\(0,1fr\)\}/);
  assert.match(block, /\.game-crest-strip>\.game-context-heading>span\{white-space:nowrap\}/);
  assert.match(await read('app/nation-crest.tsx'), /<NationCrest id=\{id\} size=\{36\} force \/>/);
  const shell = await read('app/game-shell.tsx');
  assert.match(shell, /worldChips \? <NationCrest id=\{item\.id\} size=\{30\} force \/> : <NationSymbol id=\{item\.id\} \/>/);
  assert.equal((shell.match(/uiV2WorldEnabled\(\)/g) || []).length, 1);
});
