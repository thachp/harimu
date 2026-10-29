/** #1007: city governor row on the city panel (docs §15.2). HARIMU_CITY_GOVERNOR_NOTE_ENABLED off leaves /api/city and found-city unchanged. Display only. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cityGovernorFields, KINDLE_GOVERNOR_NOTE, APPOINTED_GOVERNOR_NOTE, NO_GOVERNOR_NOTE } from '../lib/cities.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const read = file => readFileSync(file, 'utf8');
const cmd = (x, y, requestId) => ({ action: 'kindle-charter', x, y, name: 'Emberford', requestId });

test('T1 vs T2+, Kindle vs another nation', () => {
  assert.deepEqual(cityGovernorFields('kindle', 1), { governorNote: NO_GOVERNOR_NOTE, governorAi: false });
  assert.deepEqual(cityGovernorFields('korund', 1), { governorNote: NO_GOVERNOR_NOTE, governorAi: false });
  assert.deepEqual(cityGovernorFields('kindle', 2), { governorNote: KINDLE_GOVERNOR_NOTE, governorAi: true });
  assert.deepEqual(cityGovernorFields('kindle', 4), { governorNote: KINDLE_GOVERNOR_NOTE, governorAi: true });
  assert.deepEqual(cityGovernorFields('korund', 2), { governorNote: APPOINTED_GOVERNOR_NOTE, governorAi: true });
  assert.deepEqual(cityGovernorFields('aurelle', 3), { governorNote: APPOINTED_GOVERNOR_NOTE, governorAi: true });
});

test('flag: preview "true", production "false"; folded into HARIMU_CITY_PACK', () => {
  assert.match(read('wrangler.jsonc'), /"HARIMU_CITY_GOVERNOR_NOTE_ENABLED":\s*"true"/);
  assert.match(read('wrangler.prod.jsonc'), /"HARIMU_CITY_GOVERNOR_NOTE_ENABLED":\s*"false"/);
  assert.match(read('lib/flag-pack.mjs'), /HARIMU_CITY_GOVERNOR_NOTE_ENABLED/);
  assert.equal(/"HARIMU_CITY_GOVERNOR_NOTE_ENABLED"\s*:/.test(read('wrangler.jsonc').split('HARIMU_CITY_PACK')[0]), false, 'not a standalone preview var');
});

test('flag off: no governor fields; flag on: T1 Kindle city shows the not-yet note', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setCityFounding(true);
  const offFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-01007a'));
  assert.equal(offFound.status, 200, JSON.stringify(offFound.data));
  assert.equal('governorNote' in offFound.data.city, false);
  const offCity = await r.call('city', 'alice');
  assert.equal(offCity.status, 200);
  assert.equal('governorNote' in offCity.data, false);

  r.setFixtureEnv('HARIMU_CITY_GOVERNOR_NOTE_ENABLED', 'true');
  const onFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-01007a'));
  assert.equal(onFound.status, 200);
  assert.equal(onFound.data.city.governorNote, NO_GOVERNOR_NOTE);
  assert.equal(onFound.data.city.governorAi, false);
  const onCity = await r.call('city', 'alice');
  assert.equal(onCity.status, 200);
  assert.equal(onCity.data.governorNote, NO_GOVERNOR_NOTE);
});

test('CitySummary panel: flag-off shape unchanged; governor row renders with AI badge when provided', async () => {
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
  assert.equal(base.includes('Governor'), false);
  assert.equal(base.includes('ai-badge'), false);
  const withNote = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Forgehaven', city: { capital: true }, nation, destinations, onView: () => {},
    governorNote: 'AI Mayor, elected by citizens', governorAi: true,
  }));
  assert.ok(withNote.includes('Governor'));
  assert.ok(withNote.includes('AI Mayor, elected by citizens'));
  assert.ok(withNote.includes('ai-badge'));
  assert.notEqual(base, withNote);
});
