/** #996: city specialty note on the city panel. HARIMU_CITY_SPECIALTY_NOTE_ENABLED off leaves /api/city and found-city unchanged. Display only — does not gate jobs. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { citySpecialtyFields, cityForNation, capitalCityForNation } from '../lib/cities.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const read = file => readFileSync(file, 'utf8');
const cmd = (x, y, requestId) => ({ action: 'kindle-charter', x, y, name: 'Emberford', requestId });

test('catalog: capital, industry and port/trade notes', () => {
  const capital = citySpecialtyFields('kindle', capitalCityForNation('kindle').id);
  assert.deepEqual(capital, {
    specialtyRole: 'Capital',
    specialtyNote: 'Jobs and national institutions are based here.',
  });
  const industry = citySpecialtyFields('kindle', cityForNation('kindle', 'tarrek-foundry').id);
  assert.equal(industry.specialtyRole, 'Industry');
  assert.equal(industry.specialtyNote, "Jobs here match this city's specialty.");
  const port = citySpecialtyFields('confluence', cityForNation('confluence', 'oalin-harbor').id);
  assert.equal(port.specialtyRole, 'Port / fisheries');
  assert.match(port.specialtyNote, /port or trade zone adds imports/i);
  const trade = citySpecialtyFields('meridian', cityForNation('meridian', 'tsenga-sez').id);
  assert.equal(trade.specialtyRole, 'Trade zone');
  assert.match(trade.specialtyNote, /port or trade zone adds imports/i);
  assert.equal(citySpecialtyFields('kindle', 'not-a-city'), null); // [ASSUMPTION] unknown / founded omit
});

test('flag pinned: preview "true", production "false"', () => {
  assert.match(read('wrangler.jsonc'), /"HARIMU_CITY_SPECIALTY_NOTE_ENABLED":\s*"true"/);
  assert.match(read('wrangler.prod.jsonc'), /"HARIMU_CITY_SPECIALTY_NOTE_ENABLED":\s*"false"/);
});

test('flag off: /api/city and found-city leave specialty off; flag on adds capital specialty', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setCityFounding(true);
  const offFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-00996a'));
  assert.equal(offFound.status, 200, JSON.stringify(offFound.data));
  assert.equal('specialtyRole' in offFound.data.city, false);
  assert.equal('specialtyNote' in offFound.data.city, false);

  const offCity = await r.call('city', 'alice');
  assert.equal(offCity.status, 200);
  assert.equal('specialtyRole' in offCity.data, false);
  assert.equal('specialtyNote' in offCity.data, false);

  r.setFixtureEnv('HARIMU_CITY_SPECIALTY_NOTE_ENABLED', 'true');
  // Founded Emberford is not in the catalog — specialty omitted [ASSUMPTION].
  const onFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-00996a'));
  assert.equal(onFound.status, 200);
  assert.equal('specialtyRole' in onFound.data.city, false);

  // Citizen current city defaults to the capital (catalogued).
  const onCity = await r.call('city', 'alice');
  assert.equal(onCity.status, 200);
  assert.equal(onCity.data.specialtyRole, 'Capital');
  assert.equal(onCity.data.specialtyNote, 'Jobs and national institutions are based here.');
});

test('CitySummary panel: flag-off shape unchanged; specialty renders when provided', async () => {
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
  assert.equal(base.includes('Specialty'), false);
  assert.equal(base.includes('Jobs here match'), false);
  const withSpecialty = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Tarrek Foundry', city: { capital: false }, nation, destinations, onView: () => {},
    specialtyRole: 'Industry', specialtyNote: "Jobs here match this city's specialty.",
  }));
  assert.ok(withSpecialty.includes('Industry'));
  assert.ok(withSpecialty.includes('Industry. Jobs here match this city&#x27;s specialty.') || withSpecialty.includes("Jobs here match this city's specialty."));
  assert.notEqual(base, withSpecialty);
});
