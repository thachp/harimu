/** #392 S7: City hotspots as icon pills with a leader dot and no bottom strip, flag NEXT_PUBLIC_HARIMU_UI_V2_CITY ("true" in preview, "false" in production).
 *  The real GameShell rendered with the flag compiled off and on (same assertions), the real pill dressing in happy-dom, and flag / harness pins. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { cityStripHidden, uiV2CityEnabled } from '../lib/ui-v2-city.ts';
const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('flag pinned: "true" in preview, "false" in production; only the exact string "true" enables it', async () => {
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_CITY":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_CITY":\s*"false"/);
  assert.equal(uiV2CityEnabled('true'), true); for (const v of ['false', 'TRUE', '1', '', undefined]) assert.equal(uiV2CityEnabled(v), false);
});

test('the strip goes only on the City view, and only while the S3 panel rows carry the destinations', () => {
  assert.equal(cityStripHidden('square', true, true), true);
  for (const [view, city, panel] of [['square', false, true], ['square', true, false], ['world', true, true], ['household', true, true], ['country', true, true]]) assert.equal(cityStripHidden(view, city, panel), false, `${view} ${city} ${panel}`);
});

const destinations = [{ id: 'household', label: 'Household', detail: 'Belongings and recovery' }, { id: 'workplace', label: 'Workplace', detail: 'Contributions and earnings' }, { id: 'government', label: 'Government', detail: 'Policy and petitions' }];
const render = async (flag, view = 'square') => {
  const { build } = await import('esbuild');
  const out = await build({ stdin: { contents: "export { GameShell } from './app/game-shell.tsx';", resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, loader: { '.css': 'empty' }, logLevel: 'silent', plugins: [{ name: 'css-modules', setup(b) { b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'm', namespace: 'cssm' })); b.onLoad({ filter: /.*/, namespace: 'cssm' }, () => ({ contents: 'export default new Proxy({}, { get: (_, k) => String(k) })' })); } }], define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': JSON.stringify(flag), 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"' } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven', currency: 'Spark' };
  return renderToStaticMarkup(React.createElement(mod.GameShell, { view, nation, citizenNation: nation, nations: [nation], capacity: 18, localDemo: true, worldClock: { gameDay: 12, latestTick: 140 }, onNavigate: () => {}, onSelectNation: () => {}, accountControls: null,
    contextTitle: 'City destinations', contextItems: destinations, panel: React.createElement('p', null, 'PANEL') }));
};
for (const flag of ['false', 'true']) test(`GameShell with the flag ${flag}: strip, scene and panel (same assertions)`, async () => {
  const on = flag === 'true', city = await render(flag), world = await render(flag, 'world');
  assert.equal(city.includes('class="game-context-strip'), !on, `City strip with the flag ${flag}`);
  assert.equal(/class="harimu-game[^"]*game-city-v2/.test(city), on, 'the shell class that gives the strip space to the scene');
  for (const d of destinations) assert.equal(city.includes(d.detail), !on, `${d.label} card ("${d.detail}") only in the strip; the panel rows carry it with the flag on`);
  assert.ok(city.includes('PANEL'), 'the panel still renders');
  assert.ok(city.includes('class="game-viewport') || city.includes('game-stage'), 'the scene still renders');
  assert.ok(world.includes('class="game-context-strip'), 'other views keep their strip');
  assert.ok(!/game-city-v2/.test(world));
});

test('dressCityPill: decorative icon and dot, text and name unchanged', async () => {
  const { Window } = await import('happy-dom'); const w = new Window(); globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/city-pill.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', logLevel: 'silent' });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const { dressCityPill } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const { act } = (await import('react')).default;
  for (const [location, label] of [['home', 'Your household'], ['workplace', 'Forgehaven work yard'], ['market', 'Forgehaven market'], ['government', 'Assembly hall'], ['square', 'Forgehaven square']]) {
    const b = document.createElement('button'); b.className = 'viewport-world-label'; b.textContent = label; b.setAttribute('aria-label', `Select ${label}`); document.body.appendChild(b);
    let done; await act(async () => { done = dressCityPill(b, location); });
    assert.ok(b.classList.contains('viewport-city-pill')); assert.equal(b.dataset.location, location);
    const icon = b.querySelector('.viewport-city-pill-icon'), dot = b.querySelector('.viewport-city-pill-dot');
    assert.equal(icon.getAttribute('aria-hidden'), 'true'); assert.ok(icon.querySelector('svg'), `${location} icon`); assert.equal(dot.getAttribute('aria-hidden'), 'true');
    assert.equal(b.textContent, label, 'visible text unchanged'); assert.equal(b.getAttribute('aria-label'), `Select ${label}`, 'name unchanged');
    await act(async () => { done(); await new Promise(r => setTimeout(r, 0)); });
  }
});

test('the viewport reads the flag itself; page.tsx does not; every harness that defines UI_V2_NATION defines UI_V2_CITY; the check runs in hud-layout-check', async () => {
  const vp = await read('app/game-viewport.tsx');
  assert.match(vp, /cityPills = uiV2CityEnabled\(\)/);
  assert.match(vp, /mode === 'city' && cityPills && 'location' in anchor\.selection && anchor\.selection\.location\) pillCleanups\.push\(dressCityPill/);
  assert.doesNotMatch(await read('app/page.tsx'), /UI_V2_CITY|uiV2CityEnabled|cityStripHidden|cityPills/);
  for (const f of (await readdir(new URL('../scripts/', import.meta.url))).filter(f => f.endsWith('.mjs'))) {
    const src = await read(`scripts/${f}`);
    if (/['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_NATION['"]\s*:/.test(src)) assert.match(src, /['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_CITY['"]\s*:/, `${f} must define UI_V2_CITY`);
  }
  assert.match(await read('scripts/hud-layout-check.mjs'), /await checkUiV2City\(/);
});

test('S7 CSS is scoped to the pill classes and the flagged shell class, and sits before the S2 block', async () => {
  const css = await read('app/game-shell.css'), start = css.indexOf('/* #392 S7:'), end = css.indexOf('/* #392 S2:');
  assert.ok(start > 0 && start < end);
  const block = css.slice(css.indexOf('*/', start) + 2, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media\([^)]*\)\{/g, '');
  const sels = [...block.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(Boolean);
  assert.ok(sels.length >= 6);
  for (const sel of sels) for (const part of sel.split(',')) assert.match(part.trim(), /^(\.viewport-world-label\.viewport-city-pill|\.viewport-city-pill-(icon|dot)|\.harimu-game\.game-city-v2)\b/, `unscoped S7 selector: ${part}`);
});
