/** #1403: Watchfast and Voren Light city-panel host notes (docs §7.8 Cities).
 *  Reuses HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED and the #1151 / #1207 / #1211 clocks. No new flag, no migration.
 *  Watchfast follows the #1373 Stonehearth helper (one note per city): combined wording and the sooner clock when both flags are on.
 *  The #1401 gate hides both notes at Red Alert. Dates match the government keys at the same now, never 0 or a stand-in. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aurelleNextHearthNightAt } from '../lib/aurelle-hearth-night.ts';
import { CORVEL_ISLES_REGATTA_NOTE, DUNMORROW_HEARTH_NOTE, STONEHEARTH_HOST_NOTE } from '../lib/cities.ts';
import { hoarvaleNextMootOpeningAt } from '../lib/hoarvale-moot-opening.ts';
import { varkandNextLanternWatchAt } from '../lib/varkand-lantern-watch.ts';
import { varkandNextMusterDayAt } from '../lib/varkand-muster-day.ts';
import { varkandNextRotationDayAt } from '../lib/varkand-rotation-day.ts';
import { fulmaraNextGrandRegattaAt } from '../lib/fulmara-grand-regatta.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const HOST = 'HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED';
const MUSTER = 'HARIMU_VARKAND_MUSTER_DAY_ENABLED';
const ROTATION = 'HARIMU_VARKAND_ROTATION_DAY_ENABLED';
const LANTERN = 'HARIMU_VARKAND_LANTERN_WATCH_ENABLED';
const CANCELS = 'HARIMU_VARKAND_RED_ALERT_CANCELS_ENABLED';
const ALERT = 'HARIMU_VARKAND_ALERT_ENABLED';
const COMBINED = 'Hosts Muster Day and Rotation Day';
const MUSTER_NOTE = 'Hosts Muster Day';
const ROTATION_NOTE = 'Hosts Rotation Day';
const LANTERN_NOTE = 'Hosts Lantern Watch';
const clockNow = r => Math.floor(r.now / 1000) * 1000;
const sooner = now => Math.min(varkandNextMusterDayAt(now), varkandNextRotationDayAt(now));
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
  for (const key of [HOST, MUSTER, ROTATION, LANTERN, CANCELS, ALERT, 'HARIMU_CITY_PACK', 'HARIMU_GRAY_PACK']) r.setFixtureEnv(key, undefined);
};

test('both Watchfast flags and Lantern Watch on: combined sooner clock and Voren Light note match the government read; Moorhald has no note', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(MUSTER, 'true');
  r.setFixtureEnv(ROTATION, 'true');
  r.setFixtureEnv(LANTERN, 'true');
  r.setFixtureEnv('HARIMU_VARKAND_DIRECTORATE_ENABLED', 'true');
  const now = clockNow(r);
  const watchfast = await show(r, 'alice', 'varkand', 'watchfast');
  assert.equal(watchfast.data.festivalHostNote, COMBINED);
  realDate(watchfast.data.festivalHostNextAt, sooner(now));
  const government = (await r.call('citizen', 'alice')).data.government;
  assert.equal(watchfast.data.festivalHostNextAt, Math.min(government.musterDay.nextAt, government.rotationDay.nextAt));
  const voren = await show(r, 'alice', 'varkand', 'voren-light');
  assert.equal(voren.data.festivalHostNote, LANTERN_NOTE);
  realDate(voren.data.festivalHostNextAt, varkandNextLanternWatchAt(now));
  assert.equal(voren.data.festivalHostNextAt, government.lanternWatch.nextAt);
  absent((await show(r, 'alice', 'varkand', 'moorhald')).data);
});

test('only one Watchfast festival names that holiday; host-note off or festival flags off omits both keys; packed city flag is enough', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  const off = await show(r, 'alice', 'varkand', 'watchfast');
  absent(off.data);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(MUSTER, 'true');
  const musterOnly = await r.call('city', 'alice');
  assert.equal(musterOnly.data.festivalHostNote, MUSTER_NOTE);
  realDate(musterOnly.data.festivalHostNextAt, varkandNextMusterDayAt(clockNow(r)));
  r.setFixtureEnv(MUSTER, undefined);
  r.setFixtureEnv(ROTATION, 'true');
  const rotationOnly = await r.call('city', 'alice');
  assert.equal(rotationOnly.data.festivalHostNote, ROTATION_NOTE);
  realDate(rotationOnly.data.festivalHostNextAt, varkandNextRotationDayAt(clockNow(r)));
  r.setFixtureEnv(HOST, 'false');
  absent((await r.call('city', 'alice')).data);
  r.setFixtureEnv(HOST, undefined);
  r.setFixtureEnv('HARIMU_CITY_PACK', { [HOST]: 'true' });
  const packed = await r.call('city', 'alice');
  assert.equal(packed.data.festivalHostNote, ROTATION_NOTE, 'the packed city flag is enough');
  realDate(packed.data.festivalHostNextAt, varkandNextRotationDayAt(clockNow(r)));
  const vorenOff = await show(r, 'alice', 'varkand', 'voren-light');
  absent(vorenOff.data);
  r.setFixtureEnv(LANTERN, 'true');
  const voren = await r.call('city', 'alice');
  assert.equal(voren.data.festivalHostNote, LANTERN_NOTE);
  realDate(voren.data.festivalHostNextAt, varkandNextLanternWatchAt(clockNow(r)));
  r.setFixtureEnv(LANTERN, 'false');
  absent((await r.call('city', 'alice')).data);
});

test('#1401 gate: Red Alert hides Watchfast and Voren Light notes; Green/Amber or either flag off is unchanged', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(MUSTER, 'true');
  r.setFixtureEnv(ROTATION, 'true');
  r.setFixtureEnv(LANTERN, 'true');
  r.setFixtureEnv(CANCELS, 'true');
  r.setFixtureEnv(ALERT, 'true');
  await r.db.prepare("INSERT INTO varkand_alert_levels (id, level, set_at) VALUES (1, 'red', 1)").run();
  const now = clockNow(r);
  absent((await show(r, 'alice', 'varkand', 'watchfast')).data);
  absent((await show(r, 'alice', 'varkand', 'voren-light')).data);
  for (const level of ['green', 'amber']) {
    await r.db.prepare('UPDATE varkand_alert_levels SET level=? WHERE id=1').bind(level).run();
    const watchfast = await show(r, 'alice', 'varkand', 'watchfast');
    assert.equal(watchfast.data.festivalHostNote, COMBINED, level);
    realDate(watchfast.data.festivalHostNextAt, sooner(now));
    const voren = await show(r, 'alice', 'varkand', 'voren-light');
    assert.equal(voren.data.festivalHostNote, LANTERN_NOTE, level);
    realDate(voren.data.festivalHostNextAt, varkandNextLanternWatchAt(now));
  }
  await r.db.prepare("UPDATE varkand_alert_levels SET level='red' WHERE id=1").run();
  r.setFixtureEnv(CANCELS, 'false');
  const cancelsOff = await show(r, 'alice', 'varkand', 'watchfast');
  assert.equal(cancelsOff.data.festivalHostNote, COMBINED, 'cancels flag off at red: unchanged');
  realDate(cancelsOff.data.festivalHostNextAt, sooner(now));
  r.setFixtureEnv(CANCELS, 'true');
  r.setFixtureEnv(ALERT, 'false');
  const alertOff = await show(r, 'alice', 'varkand', 'voren-light');
  assert.equal(alertOff.data.festivalHostNote, LANTERN_NOTE, 'alert flag off at red: unchanged');
  realDate(alertOff.data.festivalHostNextAt, varkandNextLanternWatchAt(now));
});

test('Rimehall, Stonehearth, Dunmorrow, and Corvel keep their own notes', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(MUSTER, 'true');
  r.setFixtureEnv(ROTATION, 'true');
  r.setFixtureEnv(LANTERN, 'true');
  r.setFixtureEnv('HARIMU_HOARVALE_MOOT_OPENING_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_KORUND_PLAN_CALENDAR_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_KORUND_CHAIRMAN_BIRTHDAY_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_AURELLE_DUNMORROW_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_AURELLE_HEARTH_NIGHT_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_FULMARA_CORVEL_ISLES_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_FULMARA_GRAND_REGATTA_ENABLED', 'true');
  const rimehall = await show(r, 'alice', 'hoarvale', 'rimehall');
  assert.equal(rimehall.data.festivalHostNote, 'Hosts the Opening of the Moot');
  realDate(rimehall.data.festivalHostNextAt, hoarvaleNextMootOpeningAt(clockNow(r)));
  const stonehearth = await show(r, 'alice', 'korund', 'stonehearth');
  assert.equal(stonehearth.data.festivalHostNote, STONEHEARTH_HOST_NOTE);
  const dunmorrow = await show(r, 'alice', 'aurelle', 'dunmorrow');
  assert.equal(dunmorrow.data.hearthNightNote, DUNMORROW_HEARTH_NOTE);
  realDate(dunmorrow.data.hearthNightNextAt, aurelleNextHearthNightAt(clockNow(r)));
  absent(dunmorrow.data);
  const corvel = await show(r, 'bob', 'fulmara', 'corvel-isles');
  assert.equal(corvel.data.grandRegattaNote, CORVEL_ISLES_REGATTA_NOTE);
  realDate(corvel.data.grandRegattaNextAt, fulmaraNextGrandRegattaAt(clockNow(r)));
  absent(corvel.data);
});

test('CitySummary shows the Watchfast and Voren Light host lines only when the API sends them, and uses the real clock date', async () => {
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
  const varkand = { id: 'varkand', name: 'Varkand', capital: 'Watchfast', currency: 'c', government: 'g', economy: 'e', religion: 'r' };
  const base = render('Watchfast', varkand, { city: { capital: true } });
  assert.equal(render('Watchfast', varkand, { city: { capital: true }, festivalHostNote: null, festivalHostNextAt: null }), base);
  assert.equal(base.includes(COMBINED), false);
  const nextAt = sooner(1_700_000_000_000);
  assert.ok(nextAt > 0);
  const shown = render('Watchfast', varkand, { city: { capital: true }, festivalHostNote: COMBINED, festivalHostNextAt: nextAt });
  assert.ok(shown.includes(COMBINED) && shown.includes(new Date(nextAt).toISOString()));
  const lanternAt = varkandNextLanternWatchAt(1_700_000_000_000);
  const voren = render('Voren Light', varkand, { city: { capital: false }, festivalHostNote: LANTERN_NOTE, festivalHostNextAt: lanternAt });
  assert.ok(voren.includes(LANTERN_NOTE) && voren.includes(new Date(lanternAt).toISOString()));
});
