/** #1006: city civic-unit note on the city panel. HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED off leaves /api/city and found-city unchanged. Display only — no elections or seats. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cityCivicUnitNote, CITY_CIVIC_UNIT_BY_NATION } from '../lib/cities.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const read = file => readFileSync(file, 'utf8');
const cmd = (x, y, requestId) => ({ action: 'kindle-charter', x, y, name: 'Emberford', requestId });

test('catalog: all ten nations — eight named units; Aurelle/Meridian omit', () => {
  const expected = {
    kindle: 'voting district',
    ilmar: 'voting district',
    confluence: 'voting district',
    hoarvale: 'voting district',
    veldwood: 'Grove',
    varkand: 'garrison district',
    fulmara: 'port ward',
    korund: 'plan unit',
    aurelle: null, // [ASSUMPTION] no civic unit in existing lore
    meridian: null, // [ASSUMPTION] no civic unit in existing lore
  };
  for (const [nation, note] of Object.entries(expected)) {
    assert.equal(cityCivicUnitNote(nation), note, nation);
  }
  assert.equal(Object.keys(CITY_CIVIC_UNIT_BY_NATION).length, 8);
  assert.equal(cityCivicUnitNote('not-a-nation'), null);
});

test('flag pinned: preview "true", production "false"; folded into HARIMU_CITY_PACK', () => {
  assert.match(read('wrangler.jsonc'), /"HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED":\s*"true"/);
  assert.match(read('wrangler.prod.jsonc'), /"HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED":\s*"false"/);
  assert.match(read('lib/flag-pack.mjs'), /HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED/);
  assert.equal(/"HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED"\s*:/.test(read('wrangler.jsonc').split('HARIMU_CITY_PACK')[0]), false, 'not a standalone preview var');
});

test('flag off: /api/city and found-city leave civicUnitNote off; flag on adds Kindle voting district', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setCityFounding(true);
  const offFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-01006a'));
  assert.equal(offFound.status, 200, JSON.stringify(offFound.data));
  assert.equal('civicUnitNote' in offFound.data.city, false);

  const offCity = await r.call('city', 'alice');
  assert.equal(offCity.status, 200);
  assert.equal('civicUnitNote' in offCity.data, false);

  r.setFixtureEnv('HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED', 'true');
  // Founded Emberford still gets the nation civic unit (keyed by nation, not catalog).
  const onFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-01006a'));
  assert.equal(onFound.status, 200);
  assert.equal(onFound.data.city.civicUnitNote, 'voting district');

  const onCity = await r.call('city', 'alice');
  assert.equal(onCity.status, 200);
  assert.equal(onCity.data.civicUnitNote, 'voting district');
});

test('CitySummary panel: flag-off shape unchanged; civic unit renders when provided', async () => {
  const { build } = await import('esbuild');
  const out = await build({
    stdin: { contents: "export { CitySummary } from './app/scene-panels-v2.tsx';", resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external',
    alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    loader: { '.css': 'empty' }, logLevel: 'silent',
    plugins: [{ name: 'css-modules', setup(b) { b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'm', namespace: 'cssm' })); b.onLoad({ filter: /.*/, namespace: 'cssm' }, () => ({ contents: 'export default new Proxy({}, { get: (_, k) => String(k) })' })); } }],
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '"false"' },
  });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven', currency: 'Spark', government: 'Republic', economy: 'e', religion: 'r' };
  const destinations = [{ id: 'household', label: 'Household', detail: 'Home' }, { id: 'workplace', label: 'Workplace', detail: 'Work' }];
  const base = renderToStaticMarkup(React.createElement(mod.CitySummary, { cityName: 'Forgehaven', city: { capital: true }, nation, destinations, onView: () => {} }));
  assert.ok(base.includes('Forgehaven'));
  assert.equal(base.includes('Civic unit'), false);
  assert.equal(base.includes('voting district'), false);
  const withNote = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Forgehaven', city: { capital: true }, nation, destinations, onView: () => {},
    civicUnitNote: 'voting district',
  }));
  assert.ok(withNote.includes('Civic unit'));
  assert.ok(withNote.includes('voting district'));
  assert.notEqual(base, withNote);
});
