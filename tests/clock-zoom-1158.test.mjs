/** #1158 (#392 S4): restyle the world clock chip and World / Nation / City / Household zoom controls.
 *  NEXT_PUBLIC_HARIMU_CLOCK_ZOOM is a HARIMU_UI_PACK key, "true" in preview and "false" in production.
 *  Flag off keeps today's markup. Flag on is a dark teal panel with the S1 crest edge and S2 chip tokens. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { crestEdge } from '../lib/nation-crests.ts';
import { clockZoomEnabled, isClockZoomLevel } from '../lib/clock-zoom.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_CLOCK_ZOOM';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(clockZoomEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(clockZoomEnabled(value), false);
  assert.equal(isClockZoomLevel('household'), true);
  assert.equal(isClockZoomLevel('workplace'), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 58);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 58/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_CLOCK_ZOOM/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_CLOCK_ZOOM/);
  assert.match(await read('lib/clock-zoom.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CLOCK_ZOOM/);
  const shell = await read('app/game-shell.tsx');
  assert.equal((shell.match(/clockZoomEnabled\(\)/g) || []).length, 1);
});

test('styles reuse the S2 chip and S1 crest, meet AA, show focus, and stay scoped', async () => {
  const css = await read('app/clock-zoom.css'), shellCss = await read('app/game-shell.css');
  const s2 = shellCss.slice(shellCss.indexOf('/* #392 S2:'));
  const token = name => css.match(new RegExp(`${name}:(#[0-9a-f]{6})`))[1];
  const [ground, chip, paper, gold, edge] = ['--s2-ground', '--s2-chip', '--s2-paper', '--s2-gold', '--crest-edge'].map(token);
  assert.equal(ground, '#071820'); assert.match(s2, new RegExp(ground));
  assert.equal(chip, '#0d2530'); assert.match(s2, new RegExp(chip));
  assert.equal(gold, '#f1d58a'); assert.match(s2, /#f1d58a|#ead08a/);
  assert.equal(paper, '#f3ecd6'); assert.match(shellCss, new RegExp(paper));
  assert.equal(edge, crestEdge);
  assert.match(shellCss, /clip-path:polygon\(50% 3%,93% 15%,93% 52%,84% 79%,50% 97%,16% 79%,7% 52%,7% 15%\)/);
  assert.match(css, /clip-path:polygon\(50% 3%,93% 15%,93% 52%,84% 79%,50% 97%,16% 79%,7% 52%,7% 15%\)/);
  assert.ok(contrast(paper, chip) >= 4.5, 'clock and zoom text on the chip');
  assert.ok(contrast(gold, ground) >= 4.5, 'current zoom label on the panel');
  assert.ok(contrast(edge, ground) >= 3, 'gold crest edge against the panel');
  assert.ok(contrast(paper, ground) >= 3, 'focus outline against the panel');
  assert.match(css, /\.game-zoom-rail button\.game-zoom-level:focus-visible/);
  assert.match(css, /\.game-dock button\.game-zoom-level:focus-visible/);
  assert.match(css, /summary:focus-visible\{outline:2px solid var\(--s2-paper\)/);
  assert.doesNotMatch(css, /outline:\s*none|@keyframes|\banimation\s*:|\btransition\s*:/);
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|\})([^{}]+)\{/g)].map(m => m[1].trim()).filter(s => s && !s.startsWith('.game-clock-zoom{'));
  for (const sel of rules) for (const part of sel.split(',')) assert.match(part.trim(), /^\.game-clock-zoom\b/, part);
});

const builds = {};
const render = async (rail, zoom, view) => {
  const id = `${rail}:${zoom}`;
  const { bundleShell, shellProps } = await import('../scripts/hud-tooltip-check.mjs');
  builds[id] ??= await bundleShell(`import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { GameShell } from './app/game-shell.tsx';
    globalThis.__renderShell = props => renderToStaticMarkup(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null} />);`,
  { NEXT_PUBLIC_HARIMU_UI_V2_RAIL: rail, NEXT_PUBLIC_HARIMU_CLOCK_ZOOM: zoom });
  class MessageChannel { constructor() { const port1 = { onmessage: null, close() {} }; this.port1 = port1; this.port2 = { postMessage: data => setTimeout(() => port1.onmessage?.({ data }), 0), close() {} }; } }
  const sandbox = { MessageChannel, console, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox;
  vm.runInNewContext(builds[id], sandbox);
  return sandbox.__renderShell({ ...shellProps, view });
};
const calm = html => html.replace(/ game-clock-zoom/g, '').replace(/ game-clock-chip/g, '').replace(/ class="game-zoom-level"/g, '');
const named = (attrs, inner) => {
  const label = attrs.match(/aria-label="([^"]*)"/)?.[1];
  const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return label || text;
};

test('flag on restyles the clock and the four zoom controls; flag off and the actions stay the same', async () => {
  for (const rail of ['false', 'true']) for (const view of ['square', 'household']) {
    const off = await render(rail, 'false', view), on = await render(rail, 'true', view);
    assert.equal(calm(on), calm(off), `${view} rail ${rail}: only the restyle classes change`);
    assert.equal(off.includes('game-clock-zoom'), false);
    assert.match(on, /class="[^"]*game-clock-zoom/);
    assert.match(on, /class="game-clock game-clock-chip"/);
    const clock = [...on.matchAll(/<summary([^>]*)>([\s\S]*?)<\/summary>/g)].find(m => m[2].includes('game-clock-chip'));
    assert.ok(clock, 'clock summary');
    assert.doesNotMatch(clock[1], /aria-label=""/);
    assert.match(named(clock[1], clock[2]), /Day 12/);
    const zoom = [...on.matchAll(/<button([^>]*class="game-zoom-level"[^>]*)>([\s\S]*?)<\/button>/g)];
    const names = zoom.map(m => named(m[1], m[2]));
    for (const name of names) assert.ok(name.length > 0, 'zoom control has an accessible name');
    if (rail === 'true') {
      assert.deepEqual([...on.match(/<nav class="game-zoom-rail"[\s\S]*?<\/nav>/)[0].matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1]), ['World', 'Nation', 'City']);
      assert.ok(names.includes('Open Household'), names.join(','));
      assert.equal(names.some(n => /Open Work|Open Market|Open Civic/.test(n)), false);
    } else {
      assert.deepEqual(names.filter(n => /World|Country|City|Household/.test(n)).sort(), ['Open City', 'Open Country', 'Open Household', 'Open World']);
    }
  }
});
