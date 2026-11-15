/** #1413: Highspire and Mirrorhall city-panel host notes (docs §7.5 / §7.6 Cities).
 *  Reuses HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED and the #1191 / #1137 clocks. No new flag, no migration.
 *  A note is present only when both flags are on. Dates match the government keys at the same now, never 0 or a stand-in. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aurelleNextCoronationDayAt } from '../lib/aurelle-coronation-day.ts';
import { aurelleNextHearthNightAt } from '../lib/aurelle-hearth-night.ts';
import { DUNMORROW_HEARTH_NOTE } from '../lib/cities.ts';
import { hoarvaleNextMootOpeningAt } from '../lib/hoarvale-moot-opening.ts';
import { ilmarNextFeastOfFirstLightAt } from '../lib/ilmar-feast-of-first-light.ts';
import { varkandNextLanternWatchAt } from '../lib/varkand-lantern-watch.ts';
import { varkandNextMusterDayAt } from '../lib/varkand-muster-day.ts';
import { varkandNextRotationDayAt } from '../lib/varkand-rotation-day.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const HOST = 'HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED';
const CORONATION = 'HARIMU_AURELLE_CORONATION_DAY_ENABLED';
const FEAST = 'HARIMU_ILMAR_FEAST_OF_FIRST_LIGHT_ENABLED';
const CORONATION_NOTE = 'Hosts Coronation Day';
const FEAST_NOTE = 'Hosts the Feast of First Light';
const WATCHFAST_NOTE = 'Hosts Muster Day and Rotation Day';
const clockNow = r => Math.floor(r.now / 1000) * 1000;
const absent = data => {
  assert.equal('festivalHostNote' in data, false);
  assert.equal('festivalHostNextAt' in data, false);
};
const realDate = (actual, expected) => {
  assert.equal(typeof actual, 'number');
  assert.ok(Number.isFinite(actual) && actual > 0, 'nextAt is a real clock, never 0 or a stand-in');
  assert.equal(actual, expected);
};
const show = async (r, user, nationId, cityId) => {
  await r.db.prepare('UPDATE citizens SET nation_id=? WHERE clerk_user_id=?').bind(nationId, user).run();
  const view = await r.call('city', user);
  assert.equal(view.status, 200, JSON.stringify(view.data));
  if (view.data.currentCityId === cityId) return view;
  const travel = await r.call('city', user, { action: 'travel', cityId });
  assert.equal(travel.status, 200, JSON.stringify(travel.data));
  assert.equal(travel.data.currentCityId, cityId, JSON.stringify(travel.data));
  return travel;
};
const clear = r => {
  for (const key of [HOST, CORONATION, FEAST, 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED', 'HARIMU_CITY_PACK', 'HARIMU_GRAY_PACK']) r.setFixtureEnv(key, undefined);
};

test('both flags on: Highspire and Mirrorhall match the government clocks; siblings have no note', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(CORONATION, 'true');
  r.setFixtureEnv(FEAST, 'true');
  const now = clockNow(r);
  const highspire = await show(r, 'alice', 'aurelle', 'highspire');
  assert.equal(highspire.data.festivalHostNote, CORONATION_NOTE);
  realDate(highspire.data.festivalHostNextAt, aurelleNextCoronationDayAt(now));
  const aurelleGov = (await r.call('citizen', 'alice')).data.government;
  assert.equal(highspire.data.festivalHostNextAt, aurelleGov.coronationDay.nextAt);
  assert.equal(aurelleGov.coronationDay.cycleDays, 30);
  for (const cityId of ['windrest', 'highmere']) {
    const sibling = await show(r, 'alice', 'aurelle', cityId);
    absent(sibling.data);
    assert.equal(JSON.stringify(sibling.data).includes(CORONATION_NOTE), false, cityId);
  }
  const viewed = await show(r, 'alice', 'aurelle', 'highspire');
  assert.equal(viewed.data.currentCityId, 'highspire');
  assert.equal(viewed.data.festivalHostNote, CORONATION_NOTE);
  realDate(viewed.data.festivalHostNextAt, aurelleNextCoronationDayAt(now));
  const mirrorhall = await show(r, 'alice', 'ilmar', 'mirrorhall');
  assert.equal(mirrorhall.data.festivalHostNote, FEAST_NOTE);
  realDate(mirrorhall.data.festivalHostNextAt, ilmarNextFeastOfFirstLightAt(now));
  const ilmarGov = (await r.call('citizen', 'alice')).data.government;
  assert.equal(mirrorhall.data.festivalHostNextAt, ilmarGov.feastOfFirstLight.nextAt);
  assert.equal(ilmarGov.feastOfFirstLight.cycleDays, 15);
  // #1437: Lume Mesa may have its own pilgrimage note when that flag is on; it must not inherit the Feast note.
  r.setFixtureEnv('HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED', 'false');
  for (const cityId of ['lume-mesa', 'glassen']) {
    const sibling = await show(r, 'alice', 'ilmar', cityId);
    absent(sibling.data);
    assert.equal(JSON.stringify(sibling.data).includes(FEAST_NOTE), false, cityId);
  }
});

test('host-note off or the festival flag off omits both keys; the packed city flag is enough', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  const off = await show(r, 'alice', 'aurelle', 'highspire');
  absent(off.data);
  assert.equal(JSON.stringify(off.data).includes(CORONATION_NOTE), false);
  r.setFixtureEnv(HOST, 'true');
  absent((await r.call('city', 'alice')).data);
  r.setFixtureEnv(CORONATION, 'true');
  const shown = await r.call('city', 'alice');
  assert.equal(shown.data.festivalHostNote, CORONATION_NOTE);
  realDate(shown.data.festivalHostNextAt, aurelleNextCoronationDayAt(clockNow(r)));
  r.setFixtureEnv(HOST, 'false');
  absent((await r.call('city', 'alice')).data);
  r.setFixtureEnv(HOST, undefined);
  r.setFixtureEnv('HARIMU_CITY_PACK', { [HOST]: 'true' });
  const packed = await r.call('city', 'alice');
  assert.equal(packed.data.festivalHostNote, CORONATION_NOTE, 'the packed city flag is enough');
  realDate(packed.data.festivalHostNextAt, aurelleNextCoronationDayAt(clockNow(r)));
  r.setFixtureEnv(HOST, 'false');
  absent((await r.call('city', 'alice')).data);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(CORONATION, undefined);
  const mirrorOff = await show(r, 'alice', 'ilmar', 'mirrorhall');
  absent(mirrorOff.data);
  r.setFixtureEnv(FEAST, 'true');
  const feast = await r.call('city', 'alice');
  assert.equal(feast.data.festivalHostNote, FEAST_NOTE);
  realDate(feast.data.festivalHostNextAt, ilmarNextFeastOfFirstLightAt(clockNow(r)));
  r.setFixtureEnv(FEAST, 'false');
  absent((await r.call('city', 'alice')).data);
});

test('Dunmorrow keeps Hearth Night keys; Watchfast, Voren Light, and Rimehall keep their own notes', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(CORONATION, 'true');
  r.setFixtureEnv(FEAST, 'true');
  r.setFixtureEnv('HARIMU_AURELLE_DUNMORROW_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_AURELLE_HEARTH_NIGHT_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_VARKAND_MUSTER_DAY_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_VARKAND_ROTATION_DAY_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_VARKAND_LANTERN_WATCH_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_VARKAND_DIRECTORATE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_HOARVALE_MOOT_OPENING_ENABLED', 'true');
  const now = clockNow(r);
  const dunmorrow = await show(r, 'alice', 'aurelle', 'dunmorrow');
  assert.equal(dunmorrow.data.hearthNightNote, DUNMORROW_HEARTH_NOTE);
  realDate(dunmorrow.data.hearthNightNextAt, aurelleNextHearthNightAt(now));
  absent(dunmorrow.data);
  assert.equal(JSON.stringify(dunmorrow.data).includes(CORONATION_NOTE), false);
  const highspire = await show(r, 'alice', 'aurelle', 'highspire');
  assert.equal(highspire.data.festivalHostNote, CORONATION_NOTE);
  realDate(highspire.data.festivalHostNextAt, aurelleNextCoronationDayAt(now));
  assert.equal('hearthNightNote' in highspire.data, false);
  const watchfast = await show(r, 'alice', 'varkand', 'watchfast');
  assert.equal(watchfast.data.festivalHostNote, WATCHFAST_NOTE);
  realDate(watchfast.data.festivalHostNextAt, Math.min(varkandNextMusterDayAt(now), varkandNextRotationDayAt(now)));
  const voren = await show(r, 'alice', 'varkand', 'voren-light');
  assert.equal(voren.data.festivalHostNote, 'Hosts Lantern Watch');
  realDate(voren.data.festivalHostNextAt, varkandNextLanternWatchAt(now));
  const rimehall = await show(r, 'alice', 'hoarvale', 'rimehall');
  assert.equal(rimehall.data.festivalHostNote, 'Hosts the Opening of the Moot');
  realDate(rimehall.data.festivalHostNextAt, hoarvaleNextMootOpeningAt(now));
  const mirrorhall = await show(r, 'alice', 'ilmar', 'mirrorhall');
  assert.equal(mirrorhall.data.festivalHostNote, FEAST_NOTE);
  realDate(mirrorhall.data.festivalHostNextAt, ilmarNextFeastOfFirstLightAt(now));
});

test('CitySummary shows the Highspire and Mirrorhall host lines only when the API sends them, and uses the real clock date', async () => {
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
  const render = (cityName, nation, props) => renderToStaticMarkup(React.createElement(mod.CitySummary, { destinations, onView: () => {}, cityName, nation, ...props }));
  const aurelle = { id: 'aurelle', name: 'Aurelle', capital: 'Highspire', currency: 'c', government: 'g', economy: 'e', religion: 'r' };
  const base = render('Highspire', aurelle, { city: { capital: true } });
  assert.equal(render('Highspire', aurelle, { city: { capital: true }, festivalHostNote: null, festivalHostNextAt: null }), base);
  assert.equal(base.includes(CORONATION_NOTE), false);
  const nextAt = aurelleNextCoronationDayAt(1_700_000_000_000);
  assert.ok(nextAt > 0);
  const shown = render('Highspire', aurelle, { city: { capital: true }, festivalHostNote: CORONATION_NOTE, festivalHostNextAt: nextAt });
  assert.ok(shown.includes(CORONATION_NOTE) && shown.includes(new Date(nextAt).toISOString()));
  const ilmar = { id: 'ilmar', name: 'Ilmar Sanctum', capital: 'Mirrorhall', currency: 'c', government: 'g', economy: 'e', religion: 'r' };
  const feastAt = ilmarNextFeastOfFirstLightAt(1_700_000_000_000);
  const feast = render('Mirrorhall', ilmar, { city: { capital: true }, festivalHostNote: FEAST_NOTE, festivalHostNextAt: feastAt });
  assert.ok(feast.includes(FEAST_NOTE) && feast.includes(new Date(feastAt).toISOString()));
});
