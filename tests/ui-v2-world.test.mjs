/** #392 S5: World crest chips, flag NEXT_PUBLIC_HARIMU_UI_V2_WORLD ("true" in preview, "false" in production). Pins plus a render of the real GameShell, built
 *  with the flag off and on (build-time define, as in the app), with the same assertions. The browser layout check is scripts/ui-v2-world-check.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { uiV2WorldEnabled } from '../lib/ui-v2-world.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('flag: preview on, production off, only the exact string "true" enables it', async () => {
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_WORLD":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_WORLD":\s*"false"/);
  assert.equal(uiV2WorldEnabled('true'), true);
  for (const v of [undefined, '', 'false', 'TRUE', '1']) assert.equal(uiV2WorldEnabled(v), false);
});

export const strip = [
  { id: 'kindle', label: 'Kindle Republic', detail: 'Capital Forgehaven', badge: 'Growing', selected: true },
  { id: 'aurelle', label: 'Aurelle', detail: 'Capital Highspire', badge: 'Needs citizens' },
  { id: 'varkand', label: 'Varkand', detail: 'Capital Ironwatch', badge: 'Coming soon' },
];
const builds = {};
const render = async (flag, view) => {
  const { bundleShell, shellProps } = await import('../scripts/hud-tooltip-check.mjs');
  builds[flag] ??= await bundleShell(`import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { GameShell } from './app/game-shell.tsx';
    globalThis.__renderShell = props => renderToStaticMarkup(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null} />);`, { NEXT_PUBLIC_HARIMU_UI_V2_WORLD: flag });
  // A fresh context with a timer-based MessageChannel: the browser build of react-dom/server would otherwise keep a port open and the test process alive.
  class MessageChannel { constructor() { const port1 = { onmessage: null, close() {} }; this.port1 = port1; this.port2 = { postMessage: data => setTimeout(() => port1.onmessage?.({ data }), 0), close() {} }; } }
  const sandbox = { MessageChannel, console, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox;
  vm.runInNewContext(builds[flag], sandbox);
  return sandbox.__renderShell({ ...shellProps, view, contextItems: strip, contextTitle: 'Nations' });
};
const section = html => html.match(/<section class="game-context-strip[^"]*"[\s\S]*?<\/section>/)[0];
const expectFor = (flag, view, html) => {
  const on = flag === 'true' && view === 'world', s = section(html);
  assert.equal(s.includes('game-world-v2'), on, `${view}: chip class with the flag ${flag}`);
  const buttons = [...s.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1]);
  assert.equal(buttons.length, 3);
  for (const [i, b] of buttons.entries()) {
    assert.ok(b.includes(strip[i].label) && b.includes(strip[i].detail) && b.includes(strip[i].badge), `${view}: nothing lost from ${strip[i].id} with the flag ${flag}`);
    assert.equal(b.includes(`data-nation-crest="${strip[i].id}"`), on, `${view}: crest for ${strip[i].id} only with the chips on`);
  }
  assert.equal((s.match(/aria-pressed="true"/g) || []).length, 1, 'the selected nation stays pressed');
};

test('render: GameShell with the flag off and on, same assertions (World gets chips; City is untouched)', async () => {
  for (const flag of ['false', 'true']) for (const view of ['world', 'square']) expectFor(flag, view, await render(flag, view));
  assert.throws(() => expectFor('false', 'world', '<section class="game-context-strip game-world-v2"></section>'));
});

test('game-shell reads the flag itself, once, and S5 CSS is scoped and sits before the S2 block', async () => {
  const shell = await read('app/game-shell.tsx'), css = await read('app/game-shell.css');
  assert.equal((shell.match(/uiV2WorldEnabled\(\)/g) || []).length, 1);
  const start = css.indexOf('/* #392 S5 World crest chips'), end = css.indexOf('/* #392 S', start + 1); // the S5 block ends at the next stage's block (S7, then S2)
  assert.ok(start > 0 && start < end);
  const block = css.slice(css.indexOf('*/', start) + 2, end).replace(/@media\([^)]*\)\{/g, '');
  for (const sel of [...block.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(Boolean)) for (const part of sel.split(',')) assert.match(part, /^\.game-world-v2 /, `unscoped S5 selector: ${part}`);
});

test('every esbuild harness that defines UI_V2_PANEL also defines UI_V2_WORLD', async () => {
  for (const f of (await readdir(new URL('../scripts/', import.meta.url))).filter(f => f.endsWith('.mjs'))) {
    const src = await read(`scripts/${f}`);
    if (/['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_PANEL['"]\s*:/.test(src)) assert.match(src, /['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_WORLD['"]\s*:/, `${f} must define UI_V2_WORLD`);
  }
});
