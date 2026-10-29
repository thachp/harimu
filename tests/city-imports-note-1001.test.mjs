/** #1001: port / trade-zone imports note on the city panel market. HARIMU_CITY_IMPORTS_NOTE_ENABLED off leaves /api/city and found-city unchanged. Display only — does not add goods or prices. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { citiesForNation, cityForNation, cityHasImports, cityImportsFields, cityImportsNote, outpostCityForNation } from '../lib/cities.ts';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';

const read = file => readFileSync(file, 'utf8');
const PORT = 'Port market: foreign imports arrive here.';
const TRADE = 'Trade zone: foreign imports arrive here.';
const nations = ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara'];
const cmd = (x, y, requestId) => ({ action: 'kindle-charter', x, y, name: 'Emberford', requestId });
const absent = body => assert.equal('importsNote' in body, false);

test('catalog: every port and trade zone has a note; inland, capital, shipyard, frontier and unknown do not', () => {
  const seen = [];
  for (const nationId of nations) {
    for (const city of citiesForNation(nationId)) {
      const want = /trade zone/i.test(city.role) && !/port/i.test(city.role) ? TRADE : /port/i.test(city.role) ? PORT : null;
      assert.equal(cityHasImports(city), want !== null, `${city.name} (${city.role})`);
      assert.equal(cityImportsNote(city), want, city.name);
      const fields = cityImportsFields(nationId, city.id);
      if (want) { assert.deepEqual(fields, { importsNote: want }); seen.push(city.id); }
      else assert.equal(fields, null, city.id);
    }
    const outpost = outpostCityForNation(nationId);
    if (!outpost) continue;
    assert.equal(outpost.role, 'frontier');
    assert.equal(cityHasImports(outpost), false, outpost.name);
    assert.equal(cityImportsFields(nationId, outpost.id), null);
  }
  assert.deepEqual(seen.sort(), ['oalin-harbor', 'tsenga-sez', 'voren-light']);
  const shipyard = cityForNation('fulmara', 'vendezzo');
  assert.equal(shipyard.role, 'Shipyard');
  assert.equal(cityHasImports(shipyard), false);
  const arcport = cityForNation('fulmara', 'arcport');
  assert.equal(arcport.role, 'capital');
  assert.equal(cityHasImports(arcport), false); // the name is not a Port role
  const vale = outpostCityForNation('aurelle');
  assert.equal(vale.name, 'Vale Bridge');
  assert.match(vale.description, /trade/i);
  assert.equal(cityHasImports(vale), false); // frontier role, not Trade zone
  assert.equal(cityImportsFields('kindle', 'not-a-city'), null);
  assert.equal(cityImportsFields('kindle', 'city-kindle-21-13'), null); // player-founded id
  assert.equal(cityHasImports({ role: 'Port / fisheries' }), true);
  assert.equal(cityHasImports({ role: 'Trade zone' }), true);
  assert.equal(cityImportsNote({ role: 'Trade zone' }), TRADE);
  assert.equal(cityImportsNote({ role: 'Port / signals' }), PORT);
});

test('flag pinned: folded into HARIMU_CITY_PACK, preview "true", production "false"', () => {
  const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
  const preview = strip(read('wrangler.jsonc')), prod = strip(read('wrangler.prod.jsonc'));
  assert.equal(preview.vars.HARIMU_CITY_PACK.HARIMU_CITY_IMPORTS_NOTE_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_CITY_PACK.HARIMU_CITY_IMPORTS_NOTE_ENABLED, 'false');
  assert.equal('HARIMU_CITY_IMPORTS_NOTE_ENABLED' in preview.vars, false);
  assert.equal('HARIMU_CITY_IMPORTS_NOTE_ENABLED' in prod.vars, false);
  assert.equal(FLAG_PACKS.HARIMU_CITY_PACK.length, 11); // #1007 governor + #1014 population band + #798 spa WC bonus + #1028 capture history
  assert.ok(FLAG_PACKS.HARIMU_CITY_PACK.includes('HARIMU_CITY_IMPORTS_NOTE_ENABLED'));
});

test('flag off: /api/city and found-city leave importsNote off; flag on notes only port and trade-zone cities', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setCityFounding(true);
  const offFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-01001a'));
  assert.equal(offFound.status, 200, JSON.stringify(offFound.data));
  absent(offFound.data.city);
  absent((await r.call('city', 'alice')).data);

  r.setFixtureEnv('HARIMU_CITY_IMPORTS_NOTE_ENABLED', 'true');
  const onFound = await r.call('world/found-city', 'alice', cmd(21, 13, 'found-01001a'));
  assert.equal(onFound.status, 200);
  absent(onFound.data.city); // Emberford is not catalogued

  const capital = await r.call('city', 'alice');
  assert.equal(capital.data.currentCityId, 'forgehaven');
  absent(capital.data);
  const inland = await r.call('city', 'alice', { action: 'travel', cityId: 'tarrek-foundry' });
  assert.equal(inland.status, 200, JSON.stringify(inland.data));
  absent(inland.data);
  absent((await r.call('city', 'alice', { action: 'travel', cityId: 'kolt-savanna' })).data);

  await r.db.prepare("UPDATE citizens SET nation_id='fulmara' WHERE clerk_user_id='alice'").run();
  const yard = await r.call('city', 'alice', { action: 'travel', cityId: 'vendezzo' });
  assert.equal(yard.data.currentCityId, 'vendezzo');
  absent(yard.data);
  absent((await r.call('city', 'alice', { action: 'travel', cityId: 'arcport' })).data);

  await r.db.prepare("UPDATE citizens SET nation_id='confluence' WHERE clerk_user_id='alice'").run();
  absent((await r.call('city', 'alice')).data); // Meetwater capital
  const harbor = await r.call('city', 'alice', { action: 'travel', cityId: 'oalin-harbor' });
  assert.equal(harbor.data.importsNote, PORT);
  assert.equal((await r.call('city', 'alice')).data.importsNote, PORT);
  absent((await r.call('city', 'alice', { action: 'travel', cityId: 'lanu-terraces' })).data);

  r.setFixtureEnv('HARIMU_CITY_SPECIALTY_NOTE_ENABLED', 'true'); // #996 stays; this note is separate
  await r.db.prepare("UPDATE citizens SET nation_id='confluence' WHERE clerk_user_id='alice'").run();
  const both = await r.call('city', 'alice', { action: 'travel', cityId: 'oalin-harbor' });
  assert.equal(both.data.importsNote, PORT);
  assert.match(both.data.specialtyNote, /port or trade zone adds imports/i);

  await r.db.prepare("UPDATE citizens SET nation_id='meridian' WHERE clerk_user_id='alice'").run();
  const sez = await r.call('city', 'alice', { action: 'travel', cityId: 'tsenga-sez' });
  assert.equal(sez.data.importsNote, TRADE);
  absent((await r.call('city', 'alice', { action: 'travel', cityId: 'holv-gorge' })).data);

  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  const light = await r.call('city', 'alice', { action: 'travel', cityId: 'voren-light' });
  assert.equal(light.data.importsNote, PORT);
  r.setFixtureEnv('HARIMU_CITY_IMPORTS_NOTE_ENABLED', 'false');
  const offPort = await r.call('city', 'alice');
  assert.equal(offPort.data.currentCityId, 'voren-light');
  absent(offPort.data);
  r.setFixtureEnv('HARIMU_CITY_IMPORTS_NOTE_ENABLED', 'true');
  absent((await r.call('city', 'alice', { action: 'travel', cityId: 'moorhald' })).data);
});

test('MarketSummary: flag-off shape unchanged; the note renders only when provided', async () => {
  const { build } = await import('esbuild');
  const out = await build({
    stdin: { contents: "export { MarketSummary } from './app/scene-panels-v2.tsx';", resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external',
    alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    loader: { '.css': 'empty' }, logLevel: 'silent',
    plugins: [{ name: 'css-modules', setup(b) { b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'm', namespace: 'cssm' })); b.onLoad({ filter: /.*/, namespace: 'cssm' }, () => ({ contents: 'export default new Proxy({}, { get: (_, k) => String(k) })' })); } }],
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"' },
  });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const nation = { id: 'confluence', name: 'Confluence', currency: 'Mark' };
  const baseProps = { nation, walletMinor: 2500, food: null, board: false, listings: false, onHousehold: () => {} };
  const base = renderToStaticMarkup(React.createElement(mod.MarketSummary, baseProps));
  assert.ok(base.includes('<h2>Market</h2>'));
  assert.ok(base.includes('Goods and citizen listings'));
  assert.equal(base.includes('foreign imports arrive'), false);
  assert.equal(base.includes('>Imports<'), false);
  const cleared = renderToStaticMarkup(React.createElement(mod.MarketSummary, { ...baseProps, importsNote: null }));
  assert.equal(cleared, base);
  const port = renderToStaticMarkup(React.createElement(mod.MarketSummary, { ...baseProps, importsNote: PORT }));
  assert.ok(port.includes('<dt>Imports</dt><dd>Port market: foreign imports arrive here.</dd>'));
  const trade = renderToStaticMarkup(React.createElement(mod.MarketSummary, { ...baseProps, nation: { id: 'meridian', name: 'Meridian', currency: 'Gear' }, importsNote: TRADE }));
  assert.ok(trade.includes('<dt>Imports</dt><dd>Trade zone: foreign imports arrive here.</dd>'));
  assert.notEqual(port, trade);
  const hidden = renderToStaticMarkup(React.createElement(mod.MarketSummary, { ...baseProps, importsNote: PORT, enabled: false }));
  assert.equal(hidden, '');
});
