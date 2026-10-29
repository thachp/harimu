/** #1002: city capture-status note on the city panel. HARIMU_CITY_CAPTURE_NOTE_ENABLED off leaves /api/city and found-city unchanged. Display only — does not change siege rules. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cityCaptureNote, HEARTLAND_CAPTURE_NOTE, FRONTIER_CAPTURE_NOTE, capitalCityForNation, outpostCityForNation, citiesForNation } from '../lib/cities.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const read = file => readFileSync(file, 'utf8');
const cmd = (x, y, requestId) => ({ action: 'kindle-charter', x, y, name: 'Emberford', requestId });

test('catalog: capitals and Heartland cities; MVP frontier outposts; unknown omit', () => {
  for (const nation of ['kindle', 'korund', 'aurelle', 'confluence', 'meridian', 'varkand', 'hoarvale', 'ilmar', 'veldwood', 'fulmara']) {
    for (const city of citiesForNation(nation)) {
      assert.equal(cityCaptureNote(nation, city.id), HEARTLAND_CAPTURE_NOTE, `${nation}/${city.id}`);
    }
  }
  assert.equal(cityCaptureNote('kindle', capitalCityForNation('kindle').id), HEARTLAND_CAPTURE_NOTE);
  for (const nation of ['kindle', 'korund', 'aurelle']) {
    const outpost = outpostCityForNation(nation);
    assert.ok(outpost, nation);
    assert.equal(cityCaptureNote(nation, outpost.id), FRONTIER_CAPTURE_NOTE, nation);
  }
  assert.equal(outpostCityForNation('confluence'), undefined);
  assert.equal(cityCaptureNote('kindle', 'not-a-city'), null); // [ASSUMPTION] unknown / founded omit
  assert.equal(HEARTLAND_CAPTURE_NOTE, 'Heartland city: can never be captured.');
  assert.equal(FRONTIER_CAPTURE_NOTE, 'Frontier city: can be besieged and captured in war (two assaults on different days).');
});

test('flag pinned: preview "true", production "false"', () => {
  assert.match(read('wrangler.jsonc'), /"HARIMU_CITY_CAPTURE_NOTE_ENABLED":\s*"true"/);
  assert.match(read('wrangler.prod.jsonc'), /"HARIMU_CITY_CAPTURE_NOTE_ENABLED":\s*"false"/);
});

test('flag off: /api/city and found-city leave captureNote off; flag on adds capital Heartland note', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setCityFounding(true);
  const offFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-01002a'));
  assert.equal(offFound.status, 200, JSON.stringify(offFound.data));
  assert.equal('captureNote' in offFound.data.city, false);

  const offCity = await r.call('city', 'alice');
  assert.equal(offCity.status, 200);
  assert.equal('captureNote' in offCity.data, false);

  r.setFixtureEnv('HARIMU_CITY_CAPTURE_NOTE_ENABLED', 'true');
  // Founded Emberford is not in the catalog — capture note omitted [ASSUMPTION].
  const onFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-01002a'));
  assert.equal(onFound.status, 200);
  assert.equal('captureNote' in onFound.data.city, false);

  // Citizen current city defaults to the capital (Heartland).
  const onCity = await r.call('city', 'alice');
  assert.equal(onCity.status, 200);
  assert.equal(onCity.data.captureNote, HEARTLAND_CAPTURE_NOTE);
});

test('CitySummary panel: flag-off shape unchanged; capture note renders when provided', async () => {
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
  assert.equal(base.includes('Capture'), false);
  assert.equal(base.includes('can never be captured'), false);
  const withHeartland = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Forgehaven', city: { capital: true }, nation, destinations, onView: () => {},
    captureNote: HEARTLAND_CAPTURE_NOTE,
  }));
  assert.ok(withHeartland.includes('can never be captured'));
  const withFrontier = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Ashby Crossing', city: { capital: false }, nation, destinations, onView: () => {},
    captureNote: FRONTIER_CAPTURE_NOTE,
  }));
  assert.ok(withFrontier.includes('can be besieged and captured'));
  assert.notEqual(base, withHeartland);
});
