/** #1437: Lume Mesa city-panel note (docs §7.6 Cities). ARC ruled the wording is
 *  "Destination of the Great Pilgrimage", not a "Hosts …" claim.
 *  Reuses HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED and the #1196 clock. No new flag, no migration.
 *  A note is present only when both flags are on. Dates match the government key at the same now, never 0 or a stand-in. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { LUME_MESA_PILGRIMAGE_NOTE } from '../lib/cities.ts';
import { ilmarNextFeastOfFirstLightAt } from '../lib/ilmar-feast-of-first-light.ts';
import { ilmarNextGreatPilgrimageAt } from '../lib/ilmar-great-pilgrimage.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const HOST = 'HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED';
const PILGRIMAGE = 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED';
const FEAST = 'HARIMU_ILMAR_FEAST_OF_FIRST_LIGHT_ENABLED';
const WELLS = 'HARIMU_ILMAR_THESSALY_WELLS_ENABLED';
const NOTE = 'Destination of the Great Pilgrimage';
const FEAST_NOTE = 'Hosts the Feast of First Light';
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
  for (const key of [HOST, PILGRIMAGE, FEAST, WELLS, 'HARIMU_CITY_PACK', 'HARIMU_GRAY_PACK']) r.setFixtureEnv(key, undefined);
};

test('#1437: the ARC-ruled destination wording lives in one constant, and the render path does not prefix Hosts', () => {
  assert.equal(LUME_MESA_PILGRIMAGE_NOTE, NOTE);
  assert.equal(NOTE.startsWith('Hosts '), false);
  const cities = readFileSync('lib/cities.ts', 'utf8');
  assert.match(cities, /export const LUME_MESA_PILGRIMAGE_NOTE = 'Destination of the Great Pilgrimage';/);
  const route = readFileSync('app/api/city/route.ts', 'utf8');
  assert.match(route, /cityId:'lume-mesa'/);
  assert.match(route, /note:LUME_MESA_PILGRIMAGE_NOTE/);
  assert.equal(route.includes("note:'Destination of the Great Pilgrimage'"), false, 'the wording is not inlined in the catalog row');
  assert.equal(route.includes("note:'Hosts the Great Pilgrimage'"), false);
  const panel = readFileSync('app/scene-panels-v2.tsx', 'utf8');
  assert.match(panel, /label: festivalHostNote/);
  assert.equal(/festivalHostNote\s*\+\s*['"]Hosts |['"]Hosts ['"]\s*\+\s*festivalHostNote/.test(panel), false);
});

test('both flags on: Lume Mesa matches the government Great Pilgrimage clock; Feast does not leak; other Ilmar cities have no destination note', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(PILGRIMAGE, 'true');
  r.setFixtureEnv(FEAST, 'true');
  r.setFixtureEnv(WELLS, 'true');
  const now = clockNow(r);
  const lume = await show(r, 'alice', 'ilmar', 'lume-mesa');
  assert.equal(lume.data.festivalHostNote, NOTE);
  realDate(lume.data.festivalHostNextAt, ilmarNextGreatPilgrimageAt(now));
  const government = (await r.call('citizen', 'alice')).data.government;
  assert.equal(lume.data.festivalHostNextAt, government.greatPilgrimage.nextAt);
  assert.equal(JSON.stringify(lume.data).includes(FEAST_NOTE), false, 'Lume Mesa does not inherit the Feast note');
  const viewed = await r.call('city', 'alice');
  assert.equal(viewed.data.currentCityId, 'lume-mesa');
  assert.equal(viewed.data.festivalHostNote, NOTE);
  realDate(viewed.data.festivalHostNextAt, ilmarNextGreatPilgrimageAt(now));
  const mirrorhall = await show(r, 'alice', 'ilmar', 'mirrorhall');
  assert.equal(mirrorhall.data.festivalHostNote, FEAST_NOTE);
  realDate(mirrorhall.data.festivalHostNextAt, ilmarNextFeastOfFirstLightAt(now));
  assert.equal(JSON.stringify(mirrorhall.data).includes(NOTE), false, 'Mirrorhall does not gain the destination note');
  for (const cityId of ['glassen', 'thessaly-wells']) {
    const other = await show(r, 'alice', 'ilmar', cityId);
    absent(other.data);
    assert.equal(JSON.stringify(other.data).includes(NOTE), false, cityId);
    assert.equal(JSON.stringify(other.data).includes(FEAST_NOTE), false, cityId);
  }
});

test('host-note off or the pilgrimage flag off omits both keys; the packed city flag is enough', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  clear(r);
  const off = await show(r, 'alice', 'ilmar', 'lume-mesa');
  absent(off.data);
  assert.equal(JSON.stringify(off.data).includes(NOTE), false);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(PILGRIMAGE, 'true');
  // Host on, pilgrimage still needs to be on for the note; turn pilgrimage off first.
  r.setFixtureEnv(PILGRIMAGE, 'false');
  absent((await r.call('city', 'alice')).data);
  r.setFixtureEnv(PILGRIMAGE, 'true');
  const shown = await r.call('city', 'alice');
  assert.equal(shown.data.festivalHostNote, NOTE);
  realDate(shown.data.festivalHostNextAt, ilmarNextGreatPilgrimageAt(clockNow(r)));
  r.setFixtureEnv(HOST, 'false');
  r.setFixtureEnv(PILGRIMAGE, 'true');
  absent((await r.call('city', 'alice')).data);
  r.setFixtureEnv(HOST, undefined);
  r.setFixtureEnv('HARIMU_CITY_PACK', { [HOST]: 'true' });
  const packed = await r.call('city', 'alice');
  assert.equal(packed.data.festivalHostNote, NOTE, 'the packed city flag is enough');
  realDate(packed.data.festivalHostNextAt, ilmarNextGreatPilgrimageAt(clockNow(r)));
  r.setFixtureEnv(HOST, 'false');
  absent((await r.call('city', 'alice')).data);
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv(PILGRIMAGE, undefined);
  absent((await r.call('city', 'alice')).data);
  r.setFixtureEnv(PILGRIMAGE, 'false');
  absent((await r.call('city', 'alice')).data);
  r.setFixtureEnv(FEAST, 'true');
  const feastOnly = await r.call('city', 'alice');
  absent(feastOnly.data);
  assert.equal(JSON.stringify(feastOnly.data).includes(FEAST_NOTE), false, 'Feast on and pilgrimage off still leaves Lume Mesa without a note');
});

test('CitySummary shows the destination line as-is, without a Hosts prefix, only when the API sends it', async () => {
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
  const render = props => renderToStaticMarkup(React.createElement(mod.CitySummary, { destinations, onView: () => {}, cityName: 'Lume Mesa', nation: { id: 'ilmar', name: 'Ilmar Sanctum', capital: 'Mirrorhall', currency: 'c', government: 'g', economy: 'e', religion: 'r' }, city: { capital: false }, ...props }));
  const base = render({});
  assert.equal(render({ festivalHostNote: null, festivalHostNextAt: null }), base);
  assert.equal(base.includes(NOTE), false);
  const nextAt = ilmarNextGreatPilgrimageAt(1_700_000_000_000);
  assert.ok(nextAt > 0);
  const shown = render({ festivalHostNote: NOTE, festivalHostNextAt: nextAt });
  assert.ok(shown.includes(NOTE) && shown.includes(new Date(nextAt).toISOString()));
  assert.equal(shown.includes('Hosts the Great Pilgrimage'), false);
  assert.equal(shown.includes(`Hosts ${NOTE}`), false);
});
