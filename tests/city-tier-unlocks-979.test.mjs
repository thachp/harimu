/** #979: city tier unlocks on the city panel. Pure doc-table lookup; HARIMU_CITY_TIER_UNLOCKS_ENABLED off leaves found-city /api/city and the panel unchanged. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cityTierUnlocks, cityTierUnlockFields } from '../lib/city-tier.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const read = file => readFileSync(file, 'utf8');
const cmd = (x, y, requestId) => ({ action: 'kindle-charter', x, y, name: 'Emberford', requestId });

test('each tier maps to the docs Cities table (name, district slots, unlocks)', () => {
  assert.deepEqual(cityTierUnlocks(1), { name: 'Village', districtSlots: 2, unlocks: ['Basic jobs', 'a market stall', 'a small square'] });
  assert.deepEqual(cityTierUnlocks(2), { name: 'Town', districtSlots: 4, unlocks: ['Full market', 'festivals', 'a local governor'] });
  assert.deepEqual(cityTierUnlocks(3), { name: 'City', districtSlots: 6, unlocks: ['Specialist buildings', 'a port or industry complex'] });
  assert.deepEqual(cityTierUnlocks(4), { name: 'Metropolis', districtSlots: 8, unlocks: ['Capital-class landmarks', 'national institutions'] });
  assert.deepEqual(cityTierUnlockFields(2), { tierName: 'Town', districtSlots: 4, unlocks: ['Full market', 'festivals', 'a local governor'] });
  assert.equal(cityTierUnlocks(0).name, 'Village');
  assert.equal(cityTierUnlocks(9).name, 'Metropolis');
});

test('flag pinned: preview "true", production "false"', () => {
  assert.match(read('wrangler.jsonc'), /"HARIMU_CITY_TIER_UNLOCKS_ENABLED":\s*"true"/);
  assert.match(read('wrangler.prod.jsonc'), /"HARIMU_CITY_TIER_UNLOCKS_ENABLED":\s*"false"/);
});

test('flag off: found-city and /api/city leave unlock fields off; flag on adds them', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setCityFounding(true);
  const offFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-00979a'));
  assert.equal(offFound.status, 200, JSON.stringify(offFound.data));
  assert.equal(offFound.data.city.tier, 1);
  assert.equal('tierName' in offFound.data.city, false);
  assert.equal('districtSlots' in offFound.data.city, false);
  assert.equal('unlocks' in offFound.data.city, false);

  const offCity = await r.call('city', 'alice');
  assert.equal(offCity.status, 200);
  assert.equal('tierName' in offCity.data, false);
  assert.equal('districtSlots' in offCity.data, false);
  assert.equal('unlocks' in offCity.data, false);

  r.setFixtureEnv('HARIMU_CITY_TIER_UNLOCKS_ENABLED', 'true');
  const onFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-00979a')); // replay
  assert.equal(onFound.status, 200);
  assert.equal(onFound.data.city.tier, 1);
  assert.equal(onFound.data.city.tierName, 'Village');
  assert.equal(onFound.data.city.districtSlots, 2);
  assert.deepEqual(onFound.data.city.unlocks, ['Basic jobs', 'a market stall', 'a small square']);

  const onCity = await r.call('city', 'alice');
  assert.equal(onCity.status, 200);
  assert.equal(onCity.data.tierName, 'Village');
  assert.equal(onCity.data.districtSlots, 2);
  assert.deepEqual(onCity.data.unlocks, ['Basic jobs', 'a market stall', 'a small square']);

  // Growth on + stored T3: unlocks follow the stored tier.
  await r.db.prepare(`UPDATE world_cities SET tier=3 WHERE id=?`).bind(onFound.data.city.id).run();
  r.setFixtureEnv('HARIMU_CITY_TIER_GROWTH_ENABLED', 'true');
  const grown = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-00979a'));
  assert.equal(grown.data.city.tier, 3);
  assert.equal(grown.data.city.tierName, 'City');
  assert.equal(grown.data.city.districtSlots, 6);
  assert.deepEqual(grown.data.city.unlocks, ['Specialist buildings', 'a port or industry complex']);
});

test('CitySummary panel: flag-off shape unchanged; unlocks render when provided', async () => {
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
  assert.equal(base.includes('Village'), false);
  assert.equal(base.includes('districts') || base.includes('Districts'), false);
  const withTier = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Forgehaven', city: { capital: true }, nation, destinations, onView: () => {},
    tierUnlocks: { tierName: 'Town', districtSlots: 4, unlocks: ['Full market', 'festivals', 'a local governor'] },
  }));
  assert.ok(withTier.includes('Town'));
  assert.ok(withTier.includes('4'));
  assert.ok(withTier.includes('Full market'));
});
