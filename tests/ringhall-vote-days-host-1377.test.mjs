/** #1377: Ringhall city-panel host note for Vote Days.
 *  Reuses HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED and the #1122 Vote Day clock. No new flag, no migration.
 *  A note is present only when both flags are on. The date is voteDayCalendar.nextAt, never 0 or a stand-in. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aurelleNextHearthNightAt } from '../lib/aurelle-hearth-night.ts';
import { CORVEL_ISLES_REGATTA_NOTE, DUNMORROW_HEARTH_NOTE, STONEHEARTH_HOST_NOTE } from '../lib/cities.ts';
import { hoarvaleNextAuroraNightAt } from '../lib/hoarvale-aurora-night.ts';
import { kindleCycleStartAt } from '../lib/election-calendars.ts';
import { kindleElectionClock } from '../lib/kindle-election.ts';
import { fulmaraNextGrandRegattaAt } from '../lib/fulmara-grand-regatta.ts';
import { veldwoodNextVoteDayAt } from '../lib/veldwood-vote-day.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const HOST = 'HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED';
const CLOCK = 'HARIMU_VELDWOOD_VOTE_DAY_ENABLED';
const NOTE = 'Hosts Vote Days';
const KINDLE_CYCLE = 'HARIMU_KINDLE_CYCLE_START_AT';
const START = 1_792_368_000;
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
  r.setFixtureEnv(HOST, undefined);
  r.setFixtureEnv('HARIMU_CITY_PACK', undefined);
  r.setFixtureEnv(CLOCK, undefined);
  r.setFixtureEnv('HARIMU_GRAY_PACK', undefined);
};

test('both flags on: Ringhall returns Hosts Vote Days and the government clock; siblings have no note', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(CLOCK, 'true');
  const now = clockNow(r);
  const nextAt = veldwoodNextVoteDayAt(now);
  const shown = await show(r, 'alice', 'veldwood', 'ringhall');
  assert.equal(shown.data.festivalHostNote, NOTE);
  realDate(shown.data.festivalHostNextAt, nextAt);
  const viewed = await r.call('city', 'alice');
  assert.equal(viewed.data.currentCityId, 'ringhall');
  assert.equal(viewed.data.festivalHostNote, NOTE);
  realDate(viewed.data.festivalHostNextAt, nextAt);
  const government = (await r.call('citizen', 'alice')).data.government;
  assert.equal(shown.data.festivalHostNextAt, government.voteDayCalendar.nextAt);
  assert.equal(government.voteDayCalendar.nextAt, nextAt);
  assert.equal(government.voteDayCalendar.cycleDays, 15);
  for (const cityId of ['ashglade', 'fernhollow']) {
    const sibling = await show(r, 'alice', 'veldwood', cityId);
    absent(sibling.data);
    assert.equal(JSON.stringify(sibling.data).includes(NOTE), false, cityId);
  }
  const kindle = await show(r, 'alice', 'kindle', 'forgehaven');
  absent(kindle.data);
});

test('host-note off or Vote Day off omits both keys; the packed city flag is enough', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  const off = await show(r, 'alice', 'veldwood', 'ringhall');
  absent(off.data);
  assert.equal(JSON.stringify(off.data).includes(NOTE), false);

  r.setFixtureEnv(HOST, 'true');
  const clockOff = await r.call('city', 'alice');
  absent(clockOff.data);

  r.setFixtureEnv(CLOCK, 'true');
  const shown = await r.call('city', 'alice');
  assert.equal(shown.data.festivalHostNote, NOTE);
  realDate(shown.data.festivalHostNextAt, veldwoodNextVoteDayAt(clockNow(r)));

  r.setFixtureEnv(HOST, 'false');
  const hostOff = await r.call('city', 'alice');
  absent(hostOff.data);
  assert.equal(JSON.stringify(hostOff.data).includes(NOTE), false);

  r.setFixtureEnv(HOST, undefined);
  r.setFixtureEnv('HARIMU_CITY_PACK', { [HOST]: 'true' });
  const packed = await r.call('city', 'alice');
  assert.equal(packed.data.festivalHostNote, NOTE, 'the packed city flag is enough');
  realDate(packed.data.festivalHostNextAt, veldwoodNextVoteDayAt(clockNow(r)));
  r.setFixtureEnv(HOST, 'false');
  const direct = await r.call('city', 'alice');
  absent(direct.data);
});

test('Dunmorrow, Corvel, the #1285 catalog, Forgehaven, and Stonehearth keep their own notes', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(CLOCK, 'true');
  r.setFixtureEnv('HARIMU_HOARVALE_AURORA_NIGHT_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_AURELLE_DUNMORROW_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_AURELLE_HEARTH_NIGHT_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_FULMARA_CORVEL_ISLES_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_FULMARA_GRAND_REGATTA_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_KINDLE_ELECTION_CLOCK_ENABLED', 'true');
  r.setFixtureEnv(KINDLE_CYCLE, String(START));
  r.setFixtureEnv('HARIMU_KORUND_PLAN_CALENDAR_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_KORUND_CHAIRMAN_BIRTHDAY_ENABLED', 'true');
  const isling = await show(r, 'alice', 'hoarvale', 'isling-springs');
  assert.equal(isling.data.festivalHostNote, 'Hosts Aurora Night');
  realDate(isling.data.festivalHostNextAt, hoarvaleNextAuroraNightAt(clockNow(r)));
  assert.equal(JSON.stringify(isling.data).includes(NOTE), false);
  const dunmorrow = await show(r, 'alice', 'aurelle', 'dunmorrow');
  assert.equal(dunmorrow.data.hearthNightNote, DUNMORROW_HEARTH_NOTE);
  realDate(dunmorrow.data.hearthNightNextAt, aurelleNextHearthNightAt(clockNow(r)));
  absent(dunmorrow.data);
  const corvel = await show(r, 'bob', 'fulmara', 'corvel-isles');
  assert.equal(corvel.data.grandRegattaNote, CORVEL_ISLES_REGATTA_NOTE);
  realDate(corvel.data.grandRegattaNextAt, fulmaraNextGrandRegattaAt(clockNow(r)));
  absent(corvel.data);
  assert.equal(kindleCycleStartAt({ [KINDLE_CYCLE]: String(START) }), START);
  const forgehaven = await show(r, 'alice', 'kindle', 'forgehaven');
  assert.equal(forgehaven.data.festivalHostNote, 'Hosts Ballot Night');
  realDate(forgehaven.data.festivalHostNextAt, kindleElectionClock(START, clockNow(r)).nextBallotNightAt);
  const stonehearth = await show(r, 'alice', 'korund', 'stonehearth');
  assert.equal(stonehearth.data.festivalHostNote, STONEHEARTH_HOST_NOTE);
  assert.equal(JSON.stringify(stonehearth.data).includes(NOTE), false);
  const ringhall = await show(r, 'alice', 'veldwood', 'ringhall');
  assert.equal(ringhall.data.festivalHostNote, NOTE);
  realDate(ringhall.data.festivalHostNextAt, veldwoodNextVoteDayAt(clockNow(r)));
});

test('CitySummary shows Hosts Vote Days only when the API sends it, and uses the real clock date', async () => {
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
  const nation = { id: 'veldwood', name: 'Veldwood', capital: 'Ringhall', currency: 'c', government: 'g', economy: 'e', religion: 'r' };
  const base = render({ cityName: 'Ringhall', city: { capital: true }, nation });
  const off = render({ cityName: 'Ringhall', city: { capital: true }, nation, festivalHostNote: null, festivalHostNextAt: null });
  assert.equal(off, base, 'flag off matches the panel with no host line');
  assert.equal(base.includes(NOTE), false);
  const nextAt = veldwoodNextVoteDayAt(1_700_000_000_000);
  assert.ok(nextAt > 0);
  const shown = render({ cityName: 'Ringhall', city: { capital: true }, nation, festivalHostNote: NOTE, festivalHostNextAt: nextAt });
  assert.ok(shown.includes(NOTE) && shown.includes(new Date(nextAt).toISOString()));
});
