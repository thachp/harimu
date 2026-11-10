/** #1285: city-panel host notes for Isling Springs, Shen Springs and Lanu Terraces.
 *  HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED is last in HARIMU_CITY_PACK (preview true, production false).
 *  The note is present only when that flag and the city's festival flag are both on. Either flag off: neither key, and the panel matches the flag-off panel.
 *  No other city gets a note. Dunmorrow and Corvel keep their own notes. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { aurelleNextHearthNightAt } from '../lib/aurelle-hearth-night.ts';
import { citiesForNation, CORVEL_ISLES_REGATTA_NOTE, DUNMORROW_HEARTH_NOTE } from '../lib/cities.ts';
import { confluenceNextCanalFestivalAt } from '../lib/confluence-canal-festival.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { fulmaraNextGrandRegattaAt } from '../lib/fulmara-grand-regatta.ts';
import { hoarvaleNextAuroraNightAt } from '../lib/hoarvale-aurora-night.ts';
import { meridianNextTurbineDayAt } from '../lib/meridian-turbine-day.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const HOST = 'HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED';
const hosts = [
  { nationId: 'hoarvale', cityId: 'isling-springs', capitalId: 'rimehall', siblingId: 'fjeldmark', festivalFlag: 'HARIMU_HOARVALE_AURORA_NIGHT_ENABLED', note: 'Hosts Aurora Night', clock: 'auroraNight', nextAt: hoarvaleNextAuroraNightAt, openGovernment: r => r.setFixtureEnv('HARIMU_HOARVALE_ASSENT_ENABLED', 'true') },
  { nationId: 'meridian', cityId: 'shen-springs', capitalId: 'steamgate', siblingId: 'tsenga-sez', festivalFlag: 'HARIMU_MERIDIAN_TURBINE_DAY_ENABLED', note: 'Hosts Turbine Day', clock: 'turbineDay', nextAt: meridianNextTurbineDayAt, openGovernment: () => {} },
  { nationId: 'confluence', cityId: 'lanu-terraces', capitalId: 'meetwater', siblingId: 'oalin-harbor', festivalFlag: 'HARIMU_CONFLUENCE_CANAL_FESTIVAL_ENABLED', note: 'Hosts the Canal Festival', clock: 'canalFestival', nextAt: confluenceNextCanalFestivalAt, openGovernment: r => r.setFixtureEnv('HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED', 'true') },
];
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const absent = data => {
  assert.equal('festivalHostNote' in data, false);
  assert.equal('festivalHostNextAt' in data, false);
};
const clockNow = r => Math.floor(r.now / 1000) * 1000;

test('the flag is last in HARIMU_CITY_PACK, preview true and production false, and GRAY is unchanged', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[HOST], undefined, 'not its own binding');
  assert.equal(prod.vars[HOST], undefined);
  assert.equal(preview.vars.HARIMU_CITY_PACK[HOST], 'true');
  assert.equal(prod.vars.HARIMU_CITY_PACK[HOST], 'false');
  assert.equal(FLAG_PACKS.HARIMU_CITY_PACK.at(-1), HOST);
  assert.equal(FLAG_PACKS.HARIMU_CITY_PACK.length, 13); // CITY 13. #1285 is last. Sea lanes stays at(-2)
  assert.equal(FLAG_PACKS.HARIMU_CITY_PACK.at(-2), 'HARIMU_SEASON_SEA_LANES_ENABLED');
  assert.equal(Object.keys(preview.vars.HARIMU_CITY_PACK).at(-1), HOST);
  assert.equal(Object.keys(prod.vars.HARIMU_CITY_PACK).at(-1), HOST);
  assert.equal(flagOn({ HARIMU_CITY_PACK: preview.vars.HARIMU_CITY_PACK }, HOST), true);
  assert.equal(flagOn({ HARIMU_CITY_PACK: prod.vars.HARIMU_CITY_PACK }, HOST), false);
  assert.equal(flagOn({ HARIMU_CITY_PACK: preview.vars.HARIMU_CITY_PACK, [HOST]: 'false' }, HOST), false, 'a direct string wins');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.includes(HOST), false, 'the host note is not a GRAY flag');
  assert.equal(preview.vars.HARIMU_GRAY_PACK[HOST], undefined);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 78);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), 'HARIMU_ILMAR_THESSALY_WELLS_ENABLED');
  const route = readFileSync('app/api/city/route.ts', 'utf8');
  assert.ok(route.includes("const regattaHost=(nationId:string,cityId:string,nowSeconds:number)=>nationId==='fulmara'&&cityId==='corvel-isles'&&flagOn(env,CORVEL_ISLES_FLAG)&&flagOn(env,'HARIMU_FULMARA_GRAND_REGATTA_ENABLED')?{grandRegattaNote:CORVEL_ISLES_REGATTA_NOTE,grandRegattaNextAt:fulmaraNextGrandRegattaAt(nowSeconds*1000)}:{};"));
  assert.ok(route.includes("const hearthHost=(nationId:string,cityId:string,nowSeconds:number)=>nationId==='aurelle'&&cityId==='dunmorrow'&&flagOn(env,DUNMORROW_FLAG)&&flagOn(env,'HARIMU_AURELLE_HEARTH_NIGHT_ENABLED')?{hearthNightNote:DUNMORROW_HEARTH_NOTE,hearthNightNextAt:aurelleNextHearthNightAt(nowSeconds*1000)}:{};"));
  assert.match(readFileSync('tests/flag-off-audit-384.test.mjs', 'utf8'), new RegExp(HOST));
  assert.match(readFileSync('tests/wrangler-prod-501b.test.mjs', 'utf8'), new RegExp(HOST));
});

test('both flags on: the three cities return their note and the government clock; either flag off omits both keys; no other city, and Dunmorrow and Corvel are unchanged', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const show = async (user, nationId, cityId) => {
    await r.db.prepare('UPDATE citizens SET nation_id=? WHERE clerk_user_id=?').bind(nationId, user).run();
    const view = await r.call('city', user);
    assert.equal(view.status, 200, JSON.stringify(view.data));
    if (view.data.currentCityId === cityId) return view;
    const travel = await r.call('city', user, { action: 'travel', cityId });
    assert.equal(travel.status, 200, JSON.stringify(travel.data));
    assert.equal(travel.data.currentCityId, cityId, JSON.stringify(travel.data));
    return travel;
  };
  const clear = () => {
    r.setFixtureEnv(HOST, undefined);
    r.setFixtureEnv('HARIMU_CITY_PACK', undefined);
    for (const host of hosts) r.setFixtureEnv(host.festivalFlag, undefined);
  };
  clear();
  const kindle = await r.call('city', 'alice');
  absent(kindle.data);
  for (const host of hosts) assert.equal(JSON.stringify(kindle.data).includes(host.note), false);
  for (const host of hosts) {
    const off = await show('alice', host.nationId, host.cityId);
    absent(off.data);
    assert.equal(JSON.stringify(off.data).includes(host.note), false, `${host.cityId} flag off`);
    const capital = await show('alice', host.nationId, host.capitalId);
    absent(capital.data);
  }

  r.setFixtureEnv(HOST, 'true');
  for (const host of hosts) {
    const festivalOff = await show('alice', host.nationId, host.cityId);
    absent(festivalOff.data);
    const again = await r.call('city', 'alice');
    absent(again.data);
  }

  r.setFixtureEnv(HOST, 'false');
  for (const host of hosts) r.setFixtureEnv(host.festivalFlag, 'true');
  for (const host of hosts) {
    const hostOff = await show('alice', host.nationId, host.cityId);
    absent(hostOff.data);
    assert.equal(JSON.stringify(hostOff.data).includes(host.note), false, `${host.cityId} host flag off`);
  }

  r.setFixtureEnv(HOST, 'true');
  for (const host of hosts) {
    const capitalFirst = await show('alice', host.nationId, host.capitalId);
    absent(capitalFirst.data);
    const shown = await show('alice', host.nationId, host.cityId);
    const nextAt = host.nextAt(clockNow(r));
    assert.equal(shown.data.festivalHostNote, host.note);
    assert.equal(shown.data.festivalHostNextAt, nextAt, 'the travel response uses the government clock');
    const viewed = await r.call('city', 'alice');
    assert.equal(viewed.data.currentCityId, host.cityId);
    assert.equal(viewed.data.festivalHostNote, host.note);
    assert.equal(viewed.data.festivalHostNextAt, nextAt, 'the view response uses the same clock');
    host.openGovernment(r);
    const government = (await r.call('citizen', 'alice')).data.government;
    assert.equal(shown.data.festivalHostNextAt, government[host.clock].nextAt, `${host.cityId} matches the government read`);
    const capital = await show('alice', host.nationId, host.capitalId);
    absent(capital.data);
    const sibling = await show('alice', host.nationId, host.siblingId);
    absent(sibling.data);
    assert.equal(JSON.stringify(sibling.data).includes(host.note), false);
  }

  const hosted = new Set(hosts.map(host => `${host.nationId}:${host.cityId}`));
  for (const nationId of ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara']) {
    const extra = nationId === 'kindle' ? [{ id: 'emberwell' }] : [];
    for (const city of [...citiesForNation(nationId), ...extra]) {
      if (hosted.has(`${nationId}:${city.id}`)) continue;
      const other = await show('alice', nationId, city.id);
      absent(other.data);
      for (const host of hosts) assert.equal(JSON.stringify(other.data).includes(host.note), false, city.id);
    }
  }

  r.setFixtureEnv(HOST, undefined);
  r.setFixtureEnv('HARIMU_CITY_PACK', { [HOST]: 'true' });
  const packed = await show('alice', 'hoarvale', 'isling-springs');
  assert.equal(packed.data.festivalHostNote, 'Hosts Aurora Night', 'the packed city flag is enough');
  r.setFixtureEnv(HOST, 'false');
  const direct = await show('alice', 'hoarvale', 'isling-springs');
  absent(direct.data);
  r.setFixtureEnv('HARIMU_CITY_PACK', undefined);
  r.setFixtureEnv(HOST, 'true');

  r.setFixtureEnv('HARIMU_AURELLE_DUNMORROW_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_AURELLE_HEARTH_NIGHT_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_FULMARA_CORVEL_ISLES_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_FULMARA_GRAND_REGATTA_ENABLED', 'true');
  const dunmorrow = await show('alice', 'aurelle', 'dunmorrow');
  assert.equal(dunmorrow.data.hearthNightNote, DUNMORROW_HEARTH_NOTE);
  assert.equal(dunmorrow.data.hearthNightNextAt, aurelleNextHearthNightAt(clockNow(r)));
  assert.equal(dunmorrow.data.hearthNightNextAt, (await r.call('citizen', 'alice')).data.government.hearthNight.nextAt);
  absent(dunmorrow.data);
  assert.equal('grandRegattaNote' in dunmorrow.data, false);
  const corvel = await show('bob', 'fulmara', 'corvel-isles');
  assert.equal(corvel.data.grandRegattaNote, CORVEL_ISLES_REGATTA_NOTE);
  assert.equal(corvel.data.grandRegattaNextAt, fulmaraNextGrandRegattaAt(clockNow(r)));
  assert.equal(corvel.data.grandRegattaNextAt, (await r.call('citizen', 'bob')).data.government.grandRegatta.nextAt);
  absent(corvel.data);
  assert.equal('hearthNightNote' in corvel.data, false);
});

test('CitySummary shows the host line only when the API sends it, and the flag-off panel matches a panel with no line', async () => {
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
  const destinations = [{ id: 'household', label: 'Household', detail: 'Home' }, { id: 'workplace', label: 'Workplace', detail: 'Work' }];
  const render = props => renderToStaticMarkup(React.createElement(mod.CitySummary, { destinations, onView: () => {}, ...props }));
  for (const host of hosts) {
    const nation = { id: host.nationId, name: host.nationId, capital: host.capitalId, currency: 'c', government: 'g', economy: 'e', religion: 'r' };
    const base = render({ cityName: host.cityId, city: { capital: false }, nation });
    const off = render({ cityName: host.cityId, city: { capital: false }, nation, festivalHostNote: null, festivalHostNextAt: null });
    assert.equal(off, base, `${host.cityId} flag off matches the panel with no host line`);
    for (const note of hosts.map(row => row.note)) assert.equal(base.includes(note), false);
    const nextAt = host.nextAt(1_700_000_000_000);
    const shown = render({ cityName: host.cityId, city: { capital: false }, nation, festivalHostNote: host.note, festivalHostNextAt: nextAt });
    assert.ok(shown.includes(host.note) && shown.includes(new Date(nextAt).toISOString()));
  }
  const aurelle = { id: 'aurelle', name: 'Aurelle', capital: 'Highspire', currency: 'Crown', government: 'g', economy: 'e', religion: 'r' };
  const hearthAt = aurelleNextHearthNightAt(1_700_000_000_000);
  const dunmorrow = render({ cityName: 'Dunmorrow', city: { capital: false }, nation: aurelle, hearthNightNote: DUNMORROW_HEARTH_NOTE, hearthNightNextAt: hearthAt });
  assert.ok(dunmorrow.includes(DUNMORROW_HEARTH_NOTE) && dunmorrow.includes(new Date(hearthAt).toISOString()));
  assert.equal(dunmorrow.includes('Hosts Aurora Night'), false);
  const fulmara = { id: 'fulmara', name: 'Fulmara', capital: 'Arcport', currency: 'Share', government: 'g', economy: 'e', religion: 'r' };
  const regattaAt = fulmaraNextGrandRegattaAt(1_700_000_000_000);
  const corvel = render({ cityName: 'Corvel Isles', city: { capital: false }, nation: fulmara, grandRegattaNote: CORVEL_ISLES_REGATTA_NOTE, grandRegattaNextAt: regattaAt });
  assert.ok(corvel.includes(CORVEL_ISLES_REGATTA_NOTE) && corvel.includes(new Date(regattaAt).toISOString()));
  assert.equal(corvel.includes('Hosts the Canal Festival'), false);
});
