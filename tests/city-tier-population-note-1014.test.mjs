/** #1014: tier population band on the city panel. HARIMU_CITY_TIER_POPULATION_NOTE_ENABLED off leaves found-city /api/city and the panel unchanged. Display only — does not change growth. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { cityTierPopulationNote } from '../lib/city-tier.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const read = file => readFileSync(file, 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const cmd = (x, y, requestId) => ({ action: 'kindle-charter', x, y, name: 'Emberford', requestId });

test('T1–T4 population bands match the Cities tier table', () => {
  assert.equal(cityTierPopulationNote(1), 'Up to 500 (humans and AI).');
  assert.equal(cityTierPopulationNote(2), '500 to 2,000 (humans and AI).');
  assert.equal(cityTierPopulationNote(3), '2,000 to 8,000 (humans and AI).');
  assert.equal(cityTierPopulationNote(4), '8,000 or more (humans and AI).');
  assert.equal(cityTierPopulationNote(0), 'Up to 500 (humans and AI).');
  assert.equal(cityTierPopulationNote(9), '8,000 or more (humans and AI).');
});

test('flag pinned: folded into HARIMU_CITY_PACK, preview "true", production "false"', () => {
  const preview = strip(read('wrangler.jsonc')), prod = strip(read('wrangler.prod.jsonc'));
  assert.equal(preview.vars.HARIMU_CITY_PACK.HARIMU_CITY_TIER_POPULATION_NOTE_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_CITY_PACK.HARIMU_CITY_TIER_POPULATION_NOTE_ENABLED, 'false');
  assert.equal('HARIMU_CITY_TIER_POPULATION_NOTE_ENABLED' in preview.vars, false);
  assert.equal('HARIMU_CITY_TIER_POPULATION_NOTE_ENABLED' in prod.vars, false);
  assert.ok(FLAG_PACKS.HARIMU_CITY_PACK.includes('HARIMU_CITY_TIER_POPULATION_NOTE_ENABLED'));
});

test('flag off: found-city and /api/city leave populationNote off; flag on adds the band for the reported tier', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setCityFounding(true);
  const offFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-01014a'));
  assert.equal(offFound.status, 200, JSON.stringify(offFound.data));
  assert.equal(offFound.data.city.tier, 1);
  assert.equal('populationNote' in offFound.data.city, false);
  const offCity = await r.call('city', 'alice');
  assert.equal(offCity.status, 200);
  assert.equal('populationNote' in offCity.data, false);

  r.setFixtureEnv('HARIMU_CITY_TIER_POPULATION_NOTE_ENABLED', 'true');
  const onFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-01014a'));
  assert.equal(onFound.status, 200);
  assert.equal(onFound.data.city.populationNote, 'Up to 500 (humans and AI).');
  const onCity = await r.call('city', 'alice');
  assert.equal(onCity.status, 200);
  assert.equal(onCity.data.populationNote, 'Up to 500 (humans and AI).');

  await r.db.prepare('UPDATE world_cities SET tier=4 WHERE id=?').bind(onFound.data.city.id).run();
  r.setFixtureEnv('HARIMU_CITY_TIER_GROWTH_ENABLED', 'true');
  const grown = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-01014a'));
  assert.equal(grown.data.city.tier, 4);
  assert.equal(grown.data.city.populationNote, '8,000 or more (humans and AI).');
  r.setFixtureEnv('HARIMU_CITY_TIER_POPULATION_NOTE_ENABLED', 'false');
  const offAgain = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-01014a'));
  assert.equal('populationNote' in offAgain.data.city, false);
});

test('CitySummary panel: flag-off shape unchanged; population band renders when provided', async () => {
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
  assert.equal(base.includes('Up to 500'), false);
  const shown = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Forgehaven', city: { capital: true }, nation, destinations, onView: () => {},
    populationNote: 'Up to 500 (humans and AI).',
  }));
  assert.ok(shown.includes('Population'));
  assert.ok(shown.includes('Up to 500 (humans and AI).'));
});
