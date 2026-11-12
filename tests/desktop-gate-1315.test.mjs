/** #1315 desktop gate. NEXT_PUBLIC_HARIMU_DESKTOP_GATE is HARIMU_UI_PACK entry 68.
 *  Preview "true", production "false". Below 1024px the two approved sentences are the layout. At 1024px and up the desktop UI stays. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { desktopGateEnabled, DESKTOP_GATE_FLAG } from '../lib/desktop-gate.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = DESKTOP_GATE_FLAG;
const root = fileURLToPath(new URL('..', import.meta.url));
const COPY = ['Harimu is built for desktop.', 'Use a wider window.'];
const gateNode = `<div class="desktop-gate" role="status"><p>${COPY[0]}</p><p>${COPY[1]}</p></div>`;
const props = { view: 'square', nation: { id: 'kindle', name: 'Kindle Republic' }, nations: [], capacity: 18, localDemo: false, panel: 'City square tile' };
const bundles = {};
const bundle = async (flag) => {
  const id = flag === undefined ? 'missing' : flag;
  if (bundles[id]) return bundles[id];
  const define = { 'process.env.NODE_ENV': '"production"' };
  if (flag !== undefined) define[`process.env.${key}`] = JSON.stringify(flag);
  const result = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { renderToStaticMarkup } from 'react-dom/server'; import { GameShell } from './app/game-shell.tsx';
    const shell = props => <GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} onOpenWallet={() => {}} />;
    globalThis.__html = props => renderToStaticMarkup(shell(props));
    globalThis.__mount = props => { const el = document.getElementById('root'); (globalThis.__root ??= createRoot(el)).render(shell(props)); };` },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022', logLevel: 'silent', define, banner: { js: 'var process = globalThis.process || { env: {} };' }, alias: { '@': root.replace(/\/$/, '') }, loader: { '.css': 'empty' },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^(\.\/game-viewport|@clerk\/nextjs)$/ }, a => ({ path: a.path, namespace: 'stub' }));
      b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'css-module', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: a.path === 'css-module' ? 'export default new Proxy({}, { get: (_, k) => String(k) })' : a.path === '@clerk/nextjs' ? 'export const useClerk=()=>({})' : 'export default function V(){return null}', loader: 'jsx' }));
    } }] });
  return bundles[id] = result.outputFiles[0].text;
};
const htmlOf = async (flag) => {
  const script = await bundle(flag);
  class MessageChannel { constructor() { const port1 = { onmessage: null, close() {} }; this.port1 = port1; this.port2 = { postMessage: data => setTimeout(() => port1.onmessage?.({ data }), 0), close() {} }; } }
  const sandbox = { MessageChannel, console, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams, process: { env: {} } };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox; vm.runInNewContext(script, sandbox); return sandbox.__html(props);
};
test('flag is on only for the exact string "true", pack entry 68, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key]; assert.equal(desktopGateEnabled(), false); assert.equal(desktopGateEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true', 'true ']) assert.equal(desktopGateEnabled(value), false, String(value));
    process.env[key] = 'true'; assert.equal(desktopGateEnabled(), true);
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 71); assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(67), key, 'entry 68');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(66), 'NEXT_PUBLIC_HARIMU_NEIGHBORHOOD', 'entry 67 stays neighborhood');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(65), 'NEXT_PUBLIC_HARIMU_CONCEPT_CHROME', 'entry 66 stays concept chrome');
  for (const file of ['tests/text-bindings-988.test.mjs', 'tests/flag-off-audit-384.test.mjs', 'tests/wrangler-prod-501b.test.mjs']) assert.match(await read(file), new RegExp(key));
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 71/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#1315 desktop gate is in the pack/);
  assert.match(await read('lib/desktop-gate.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_DESKTOP_GATE/);
  assert.match(await read('app/game-shell.tsx'), /from '@\/lib\/desktop-gate'/);
  const css = await read('app/desktop-gate.css');
  assert.match(css, /\.game-desktop-gate\{[\s\S]*@media \(max-width: 1023px\)/);
  assert.doesNotMatch(css, /anywhere|break-all/);
  for (const rule of [/overflow-wrap:\s*normal/, /word-break:\s*normal/, /hyphens:\s*none/]) assert.match(css, rule);
  assert.match(await read('app/game-shell.css'), /@media\(max-width:390px\)/);
  assert.match(await read('app/panel-v2.css'), /@media \(max-width:390px\)/);
  assert.match(await read('app/nation-overview.css'), /@media \(max-width:390px\)/);
  const off = await htmlOf('false'), missing = await htmlOf(undefined), on = await htmlOf('true');
  assert.equal(missing, off, 'a missing flag matches flag off');
  assert.doesNotMatch(off, /desktop-gate|game-desktop-gate|built for desktop|Use a wider window/);
  assert.equal(on.replace(' game-desktop-gate', '').replace(gateNode, ''), off);
  assert.match(on, /game-desktop-gate/); for (const sentence of COPY) assert.match(on, new RegExp(sentence.replace(/[.]/g, '\\.')));
});
const shots = () => { try { const dir = process.env.HARIMU_TEST_ARTIFACTS_DIR || join(os.tmpdir(), 'harimu-1315-desktop-gate'); mkdirSync(dir, { recursive: true }); return dir; } catch { return null; } };
const look = page => page.evaluate(() => {
  const gate = document.querySelector('.desktop-gate'), hud = document.querySelector('.game-hud'), root = document.querySelector('.harimu-game');
  const show = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const ps = gate ? [...gate.querySelectorAll('p')] : [];
  const ink = ps.flatMap(node => [...node.getClientRects()]);
  const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  return {
    gate: show(gate), hud: show(hud), text: document.body.innerText.replace(/\s+/g, ' ').trim(), hitGate: !!hit?.closest?.('.desktop-gate'),
    klass: root.classList.contains('game-desktop-gate'), layout: getComputedStyle(root).display, sentences: ps.map(node => node.textContent),
    fit: ink.length > 0 && ink.every(rect => rect.width > 0 && rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1),
    paint: ps[0] ? { color: getComputedStyle(ps[0]).color, next: getComputedStyle(ps[1]).color, bg: getComputedStyle(gate).backgroundColor, wrap: getComputedStyle(ps[0]).overflowWrap, word: getComputedStyle(ps[0]).wordBreak, hyphens: getComputedStyle(ps[0]).hyphens } : null,
  };
});
test('flag on hides the message at 1024 and up, and below 1024 the two sentences replace the layout', async (t) => {
  let chromium; try { ({ chromium } = await import('playwright')); } catch { return t.skip('playwright is not installed'); }
  let browser; try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); } catch { return t.skip('headless chromium is not installed'); }
  const css = (await Promise.all(['app/game-shell.css', 'app/desktop-gate.css'].map(read))).join('\n');
  const dir = shots();
  const open = async (flag, width, scale) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(`<!doctype html><html style="${scale ? `--text-scale:${scale}` : ''}"><head><style>*{box-sizing:border-box}body{margin:0}${css}</style></head><body><div id="root"></div></body></html>`, { waitUntil: 'load' });
    await page.addScriptTag({ content: await bundle(flag) });
    await page.evaluate(p => window.__mount(p), props);
    await page.waitForSelector('.harimu-game');
    return page;
  };
  try {
    const wide = await open('true', 1280, '');
    const desk = await look(wide);
    assert.equal(desk.gate, false); assert.equal(desk.hud, true); assert.equal(desk.klass, true); assert.equal(desk.text.includes('HARIMU'), true); assert.equal(desk.text.includes('built for desktop'), false);
    if (dir) await wide.screenshot({ path: join(dir, 'desktop-gate-1315-1280-on.png') });
    await wide.setViewportSize({ width: 1023, height: 900 });
    await wide.waitForFunction(() => getComputedStyle(document.querySelector('.desktop-gate')).display !== 'none');
    const resized = await look(wide);
    assert.equal(resized.gate, true); assert.equal(resized.hud, false); assert.equal(resized.hitGate, true); assert.deepEqual(resized.sentences, COPY); assert.equal(resized.text, COPY.join(' '));
    await wide.setViewportSize({ width: 1024, height: 900 });
    await wide.waitForFunction(() => getComputedStyle(document.querySelector('.desktop-gate')).display === 'none');
    const floor = await look(wide);
    assert.equal(floor.gate, false); assert.equal(floor.hud, true); assert.equal(floor.text.includes('built for desktop'), false);
    await wide.setViewportSize({ width: 1280, height: 900 });
    await wide.close();
    for (const spec of [
      { name: '1280-150-on', flag: 'true', width: 1280, scale: '1.5', gate: false },
      { name: '1024-on', flag: 'true', width: 1024, scale: '', gate: false },
      { name: '1023-on', flag: 'true', width: 1023, scale: '', gate: true },
      { name: '390-on', flag: 'true', width: 390, scale: '', gate: true },
      { name: '390-off', flag: 'false', width: 390, scale: '', gate: false },
      { name: '1023-off', flag: 'false', width: 1023, scale: '', gate: false },
      { name: '390-missing', flag: undefined, width: 390, scale: '', gate: false },
    ]) {
      const page = await open(spec.flag, spec.width, spec.scale);
      const view = await look(page);
      assert.equal(view.gate, spec.gate, spec.name); assert.equal(view.hud, !spec.gate, spec.name); assert.equal(view.klass, spec.flag === 'true', spec.name);
      assert.equal(view.text.includes('built for desktop'), spec.gate, spec.name);
      if (spec.gate) {
        assert.equal(view.hitGate, true, spec.name); assert.deepEqual(view.sentences, COPY, spec.name); assert.equal(view.text, COPY.join(' '), spec.name); assert.equal(view.fit, true, spec.name);
        assert.equal(view.paint.bg, 'rgb(11, 28, 36)', spec.name); assert.equal(view.paint.color, 'rgb(229, 240, 241)', spec.name); assert.equal(view.paint.next, 'rgb(220, 231, 232)', spec.name);
        assert.equal(view.paint.wrap, 'normal', spec.name); assert.equal(view.paint.word, 'normal', spec.name); assert.equal(view.paint.hyphens, 'none', spec.name);
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => !!document.activeElement?.closest?.('.game-hud, .game-dock, .game-inspector, .game-stage, .game-context-strip')), false, spec.name);
      } else {
        assert.equal(view.text.includes('HARIMU'), true, spec.name);
        if (spec.width <= 760) assert.equal(view.layout, 'grid', spec.name);
      }
      if (dir && spec.name !== '1023-off' && spec.name !== '390-missing') await page.screenshot({ path: join(dir, `desktop-gate-1315-${spec.name}.png`) });
      if (spec.name === '390-on') {
        await page.evaluate(() => document.documentElement.style.setProperty('--text-scale', '1.5'));
        const scaled = await look(page);
        assert.equal(scaled.gate, true); assert.equal(scaled.hud, false); assert.equal(scaled.fit, true); assert.equal(scaled.text, COPY.join(' ')); assert.deepEqual(scaled.sentences, COPY);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});
