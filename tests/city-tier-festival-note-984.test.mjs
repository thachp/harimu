/** #984: T2+ festival availability note on the city panel. HARIMU_CITY_TIER_FESTIVAL_NOTE_ENABLED off leaves found-city /api/city and the panel unchanged. Display only — does not gate festival scheduling. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cityTierFestivalNote } from '../lib/city-tier.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const read = file => readFileSync(file, 'utf8');
const cmd = (x, y, requestId) => ({ action: 'kindle-charter', x, y, name: 'Emberford', requestId });

test('T1 vs T2+: festival note differs (Town unlock vs available)', () => {
  assert.equal(cityTierFestivalNote(1), 'Festivals unlock at Town (T2).');
  assert.equal(cityTierFestivalNote(2), 'Festivals are available at this tier.');
  assert.equal(cityTierFestivalNote(3), 'Festivals are available at this tier.');
  assert.equal(cityTierFestivalNote(4), 'Festivals are available at this tier.');
  assert.equal(cityTierFestivalNote(0), 'Festivals unlock at Town (T2).');
  assert.equal(cityTierFestivalNote(9), 'Festivals are available at this tier.');
});

test('flag pinned: preview "true", production "false"', () => {
  assert.match(read('wrangler.jsonc'), /"HARIMU_CITY_TIER_FESTIVAL_NOTE_ENABLED":\s*"true"/);
  assert.match(read('wrangler.prod.jsonc'), /"HARIMU_CITY_TIER_FESTIVAL_NOTE_ENABLED":\s*"false"/);
});

test('flag off: found-city and /api/city leave festivalNote off; flag on adds T1 vs T2+ notes', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setCityFounding(true);
  const offFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-00984a'));
  assert.equal(offFound.status, 200, JSON.stringify(offFound.data));
  assert.equal(offFound.data.city.tier, 1);
  assert.equal('festivalNote' in offFound.data.city, false);

  const offCity = await r.call('city', 'alice');
  assert.equal(offCity.status, 200);
  assert.equal('festivalNote' in offCity.data, false);

  r.setFixtureEnv('HARIMU_CITY_TIER_FESTIVAL_NOTE_ENABLED', 'true');
  const onFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-00984a')); // replay
  assert.equal(onFound.status, 200);
  assert.equal(onFound.data.city.tier, 1);
  assert.equal(onFound.data.city.festivalNote, 'Festivals unlock at Town (T2).');

  // Capitals are not world_cities rows, so /api/city without growth stays on the T1 default note.
  const onCity = await r.call('city', 'alice');
  assert.equal(onCity.status, 200);
  assert.equal(onCity.data.festivalNote, 'Festivals unlock at Town (T2).');

  // Growth on + stored T2 on the founded city: found-city returns the available note (#979 pattern).
  await r.db.prepare(`UPDATE world_cities SET tier=2 WHERE id=?`).bind(onFound.data.city.id).run();
  r.setFixtureEnv('HARIMU_CITY_TIER_GROWTH_ENABLED', 'true');
  const grown = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-00984a'));
  assert.equal(grown.data.city.tier, 2);
  assert.equal(grown.data.city.festivalNote, 'Festivals are available at this tier.');
});

test('CitySummary panel: flag-off shape unchanged; festival note renders when provided', async () => {
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
  assert.equal(base.includes('Festivals unlock'), false);
  assert.equal(base.includes('Festivals are available'), false);
  const t1 = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Forgehaven', city: { capital: true }, nation, destinations, onView: () => {},
    festivalNote: 'Festivals unlock at Town (T2).',
  }));
  assert.ok(t1.includes('Festivals unlock at Town (T2).'));
  const t2 = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Forgehaven', city: { capital: true }, nation, destinations, onView: () => {},
    festivalNote: 'Festivals are available at this tier.',
  }));
  assert.ok(t2.includes('Festivals are available at this tier.'));
  assert.notEqual(t1, t2);
});
