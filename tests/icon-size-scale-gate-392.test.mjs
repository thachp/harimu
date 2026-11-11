/** #392 UI 60: gate World atlas fact-icon 1em on the icon-scale flag.
 *  NEXT_PUBLIC_HARIMU_ICON_SIZE_SCALE_GATE is HARIMU_UI_PACK entry 57.
 *  QA2 on #1300: WorldAtlasFactIcon passes size 1em whenever ICON_SIZE_SYNC is on, but
 *  font-size: calc(18px * var(--text-scale, 1)) is only applied with .world-atlas-icon-scale
 *  (NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE). Explore marks already use that calc without
 *  the scale class, so this gate leaves them at the UI 56 size. Gate off keeps today's markup.
 *  Gate on, fact marks pass size 1em only when sync and scale are both on. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { iconSizeScaleGateEnabled, ICON_SIZE_SCALE_GATE_FLAG } from '../lib/icon-size-scale-gate.ts';
import { NATION_HEADER_CHIP_CAP_FLAG } from '../lib/nation-header-chip-cap.ts';
import { ICON_SIZE_SYNC_FLAG } from '../lib/icon-size-sync.ts';
import { WORLD_ATLAS_ICON_SCALE_FLAG } from '../lib/world-atlas-icon-scale.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = ICON_SIZE_SCALE_GATE_FLAG;
const syncKey = ICON_SIZE_SYNC_FLAG;
const scaleKey = WORLD_ATLAS_ICON_SCALE_FLAG;
const aurelle = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', motto: "Win the crown's favor - or take the crown.", government: 'Absolute hereditary monarchy', capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', economy: 'Royal charters and fiefs', stability: 72, population: '924k' };
const ten = Array.from({ length: 10 }, (_, index) => ({ id: `nation-${index}` }));
const clock = { epochSeconds: 1_700_000_000, nowSeconds: 1_700_000_000, nextFestival: { at: 1_700_000_000 + 86_400, festivals: [{ name: 'Coronation Day' }] } };
const full = { nations: ten, nation: aurelle, clock, disputes: { wars: { wars: [] } }, onView() {} };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 57, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(iconSizeScaleGateEnabled(), false);
    assert.equal(iconSizeScaleGateEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(iconSizeScaleGateEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(iconSizeScaleGateEnabled(), true);
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
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(56), key, 'entry 57');
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(55), NATION_HEADER_CHIP_CAP_FLAG, 'chip cap stays entry 56');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 59/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 icon size scale gate/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/icon-size-scale-gate.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_ICON_SIZE_SCALE_GATE/);
  assert.match(await read('app/world-atlas.tsx'), /iconSizeScaleGate = iconSizeScaleGateEnabled\(\)/);
  assert.match(await read('app/world-atlas.tsx'), /const markSize = iconSizeSync \? '1em' as const : 18/);
  assert.doesNotMatch(await read('app/page.tsx'), /ICON_SIZE_SCALE_GATE|iconSizeScaleGateEnabled/);
  assert.doesNotMatch(await read('app/nation-overview.tsx'), /ICON_SIZE_SCALE_GATE|iconSizeScaleGate/);
});

const bundle = async () => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/world-atlas.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: {
      'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_WORLD_EXPLORE': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICONS': '"true"',
      'process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS': '"true"',
    } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('gate on: fact marks are 1em only when sync and scale are both on; gate off matches today', async () => {
  const saved = [syncKey, scaleKey, key].map(name => [name, process.env[name]]);
  const set = (sync, scale, gate) => {
    for (const [name, value] of [[syncKey, sync], [scaleKey, scale], [key, gate]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  };
  try {
    const mod = await bundle();
    const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
    const { Window } = await import('happy-dom');
    const paint = props => renderToStaticMarkup(React.createElement(mod.WorldAtlas, { ...full, ...props }));
    const attr = (html, selector) => {
      const window = new Window({ url: 'http://localhost/' });
      window.document.body.innerHTML = html;
      const values = [...window.document.querySelectorAll(selector)].map(node => node.getAttribute('width'));
      window.close();
      return values;
    };
    const fact = html => attr(html, '.world-atlas-stats dt svg');
    const explore = html => attr(html, 'p.world-atlas-explore-kicker svg, button.world-atlas-primary svg');
    const expectAll = (values, size) => { assert.ok(values.length > 0); assert.deepEqual(values, values.map(() => size)); };
    const shown = (sync, scale, gate, props) => { set(sync, scale, gate); return paint(props); };
    const matrix = [
      ['false', 'false', '18', '18'],
      ['false', 'true', '18', '18'],
      ['true', 'false', '18', '1em'],
      ['true', 'true', '1em', '1em'],
    ];
    for (const [sync, scale, factSize, exploreSize] of matrix) {
      const html = shown(sync, scale, 'true');
      expectAll(fact(html), factSize);
      expectAll(explore(html), exploreSize);
      assert.equal(fact(html).length, 10, `${sync}/${scale} fact marks`);
    }
    const today = shown('true', 'false', 'false');
    const missing = shown('true', 'false', undefined);
    assert.equal(today, missing, 'a missing gate matches gate off');
    expectAll(fact(today), '1em');
    expectAll(explore(today), '1em');
    assert.match(today, /world-atlas-icon-size-sync/);
    assert.doesNotMatch(today, /world-atlas-icon-scale/);
    const held = shown('true', 'false', 'true');
    expectAll(fact(held), '18');
    expectAll(explore(held), '1em');
    assert.equal(shown('true', 'false', 'true', { iconSizeScaleGate: false }), today, 'the prop turns the gate off');
    assert.equal(shown('true', 'false', 'false', { iconSizeScaleGate: true }), held, 'the prop turns the gate on');
    assert.equal(shown('false', 'false', 'true', { iconSizeSync: true, iconScale: false }), held, 'sync and scale props reach the fact marks');
    const bothOff = shown('true', 'true', 'false');
    const bothOn = shown('true', 'true', 'true');
    assert.equal(bothOn, bothOff, 'sync and scale on: gate does not change markup, so the painted size stays');
    expectAll(fact(bothOn), '1em');
    assert.match(bothOn, /world-atlas world-atlas-identity world-atlas-icons world-atlas-icon-scale/);
    assert.match(bothOn, /world-atlas-icon-size-sync/);
    for (const value of ['TRUE', '1', ' true', '']) assert.equal(shown('true', 'false', value), today, `gate ${JSON.stringify(value)} stays off`);
    const css = await read('app/world-atlas.css');
    assert.match(css, /\.world-atlas\.world-atlas-icons\.world-atlas-icon-scale\.world-atlas-icon-size-sync \.world-atlas-stats dt svg\{flex:none;font-size:calc\(18px \* var\(--text-scale, 1\)\);width:1em;height:1em\}/);
    assert.match(css, /\.world-atlas\.world-atlas-icons \.world-atlas-stats dt svg\{flex:none;width:18px;height:18px;color:#d0ad54\}/);
  } finally {
    for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
