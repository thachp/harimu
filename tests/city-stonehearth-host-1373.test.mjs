/** #1373: Stonehearth city-panel host note for Plan Day and the Chairman's Birthday.
 *  Reuses HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED and the #1116 / #1147 clocks. No new flag, no migration.
 *  A note is present only when the host-note flag and at least one of those festival flags are on.
 *  Combined note: date is the sooner of the two real government clocks, never 0 or a stand-in. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STONEHEARTH_BIRTHDAY_NOTE, STONEHEARTH_HOST_NOTE, STONEHEARTH_PLAN_NOTE } from '../lib/cities.ts';
import { korundNextChairmanBirthdayAt } from '../lib/korund-chairman-birthday.ts';
import { korundNextPlanDayAt } from '../lib/korund-plan-calendar.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const HOST = 'HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED';
const PLAN = 'HARIMU_KORUND_PLAN_CALENDAR_ENABLED';
const BIRTHDAY = 'HARIMU_KORUND_CHAIRMAN_BIRTHDAY_ENABLED';
const clockNow = r => Math.floor(r.now / 1000) * 1000;
const sooner = now => Math.min(korundNextPlanDayAt(now), korundNextChairmanBirthdayAt(now));
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
  r.setFixtureEnv(HOST, undefined);
  r.setFixtureEnv('HARIMU_CITY_PACK', undefined);
  r.setFixtureEnv(PLAN, undefined);
  r.setFixtureEnv(BIRTHDAY, undefined);
};

test('host-note flag and both festival flags on: Stonehearth names both holidays and uses the sooner real clock; siblings have no note', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(PLAN, 'true');
  r.setFixtureEnv(BIRTHDAY, 'true');
  const now = clockNow(r);
  const nextAt = sooner(now);
  const shown = await show(r, 'alice', 'korund', 'stonehearth');
  assert.equal(shown.data.festivalHostNote, STONEHEARTH_HOST_NOTE);
  realDate(shown.data.festivalHostNextAt, nextAt);
  const viewed = await r.call('city', 'alice');
  assert.equal(viewed.data.currentCityId, 'stonehearth');
  assert.equal(viewed.data.festivalHostNote, STONEHEARTH_HOST_NOTE);
  realDate(viewed.data.festivalHostNextAt, nextAt);
  const government = (await r.call('citizen', 'alice')).data.government;
  assert.equal(shown.data.festivalHostNextAt, government.planCalendar.nextPlanDayAt < government.chairmanBirthday.nextAt
    ? government.planCalendar.nextPlanDayAt
    : government.chairmanBirthday.nextAt);
  assert.equal(shown.data.festivalHostNextAt, Math.min(government.planCalendar.nextPlanDayAt, government.chairmanBirthday.nextAt));
  for (const cityId of ['strova-mines', 'gren-plateau']) {
    const sibling = await show(r, 'alice', 'korund', cityId);
    absent(sibling.data);
    assert.equal(JSON.stringify(sibling.data).includes('Hosts Plan Day'), false, cityId);
  }
  const kindle = await show(r, 'alice', 'kindle', 'forgehaven');
  absent(kindle.data);
});

test('only one festival flag on names only that holiday; host-note off or both festivals off omits both keys', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  const off = await show(r, 'alice', 'korund', 'stonehearth');
  absent(off.data);
  assert.equal(JSON.stringify(off.data).includes('Hosts Plan Day'), false);

  r.setFixtureEnv(HOST, 'true');
  const festivalsOff = await r.call('city', 'alice');
  absent(festivalsOff.data);

  r.setFixtureEnv(PLAN, 'true');
  r.setFixtureEnv(BIRTHDAY, 'false');
  const planOnly = await r.call('city', 'alice');
  assert.equal(planOnly.data.festivalHostNote, STONEHEARTH_PLAN_NOTE);
  realDate(planOnly.data.festivalHostNextAt, korundNextPlanDayAt(clockNow(r)));
  const planGov = (await r.call('citizen', 'alice')).data.government;
  assert.equal(planOnly.data.festivalHostNextAt, planGov.planCalendar.nextPlanDayAt);
  assert.equal('chairmanBirthday' in planGov, false);

  r.setFixtureEnv(PLAN, 'false');
  r.setFixtureEnv(BIRTHDAY, 'true');
  const birthdayOnly = await r.call('city', 'alice');
  assert.equal(birthdayOnly.data.festivalHostNote, STONEHEARTH_BIRTHDAY_NOTE);
  realDate(birthdayOnly.data.festivalHostNextAt, korundNextChairmanBirthdayAt(clockNow(r)));
  const birthGov = (await r.call('citizen', 'alice')).data.government;
  assert.equal(birthdayOnly.data.festivalHostNextAt, birthGov.chairmanBirthday.nextAt);
  assert.equal('planCalendar' in birthGov, false);

  r.setFixtureEnv(HOST, 'false');
  r.setFixtureEnv(PLAN, 'true');
  r.setFixtureEnv(BIRTHDAY, 'true');
  const hostOff = await r.call('city', 'alice');
  absent(hostOff.data);
  assert.equal(JSON.stringify(hostOff.data).includes('Hosts Plan Day'), false);
});

test('CitySummary shows the Stonehearth host line only when the API sends it, and uses the real clock date', async () => {
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
  const nation = { id: 'korund', name: 'Korund', capital: 'Stonehearth', currency: 'c', government: 'g', economy: 'e', religion: 'r' };
  const base = render({ cityName: 'Stonehearth', city: { capital: true }, nation });
  const off = render({ cityName: 'Stonehearth', city: { capital: true }, nation, festivalHostNote: null, festivalHostNextAt: null });
  assert.equal(off, base, 'flag off matches the panel with no host line');
  assert.equal(base.includes('Hosts Plan Day'), false);
  const now = 1_700_000_000_000;
  const nextAt = sooner(now);
  assert.ok(nextAt > 0);
  const shown = render({ cityName: 'Stonehearth', city: { capital: true }, nation, festivalHostNote: STONEHEARTH_HOST_NOTE, festivalHostNextAt: nextAt });
  // React escapes the apostrophe in "Chairman's", so match the visible host line and the real clock date.
  assert.ok(shown.includes('Hosts Plan Day and the Chairman') && shown.includes(new Date(nextAt).toISOString()));
  const planOnly = render({ cityName: 'Stonehearth', city: { capital: true }, nation, festivalHostNote: STONEHEARTH_PLAN_NOTE, festivalHostNextAt: korundNextPlanDayAt(now) });
  assert.ok(planOnly.includes(STONEHEARTH_PLAN_NOTE) && planOnly.includes(new Date(korundNextPlanDayAt(now)).toISOString()));
  assert.equal(planOnly.includes('Chairman'), false);
});
