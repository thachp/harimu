/** #798: spa-home citizens recover Work Capacity on a shorter interval (ARC option A). Flag off matches today. No migration. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { cityForNation, citiesForNation, residentCitiesForNation } from '../lib/cities.ts';

const day = 86400, sooner = Math.floor(day * 23 / 24);
const spaWcNote = 'Spa city: you recover a little extra Work Capacity here.';

test('Emberwell and Shen Springs are Health / tourism spa cities; Isling Springs keeps Spa / tourism and the spa mark; the three-pin list stays three', () => {
  assert.equal(sooner, 82800);
  assert.equal(citiesForNation('kindle').length, 3);
  assert.equal(citiesForNation('meridian').length, 3);
  const ember = cityForNation('kindle', 'emberwell'), shen = cityForNation('meridian', 'shen-springs'), isling = cityForNation('hoarvale', 'isling-springs');
  assert.equal(ember?.role, 'Health / tourism'); assert.equal(ember?.spa, true);
  assert.equal(shen?.role, 'Health / tourism'); assert.equal(shen?.spa, true);
  assert.equal(isling?.role, 'Spa / tourism'); assert.equal(isling?.spa, true);
  assert.ok(residentCitiesForNation('kindle').some(c => c.id === 'emberwell'));
  assert.equal(cityForNation('kindle', 'shen-springs'), undefined);
  assert.equal(spaWcNote, 'Spa city: you recover a little extra Work Capacity here.');
});

async function place(r, user, homeId, currentId = homeId) {
  await r.db.prepare(`INSERT INTO citizen_city_locations(user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET home_city_id=excluded.home_city_id, current_city_id=excluded.current_city_id, updated_at=excluded.updated_at`)
    .bind(user, 'kindle', homeId, currentId, 1).run();
}
const capacityOf = (r, user) => r.db.prepare('SELECT capacity FROM citizens WHERE clerk_user_id=?').bind(user).first();
const clockOf = (r, user) => r.db.prepare('SELECT recovered_at FROM capacity_clocks WHERE clerk_user_id=?').bind(user).first();

test('flag off: a spa home waits the full day; flag on: it fills at the shorter interval once, and a non-spa home does not', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const spa = await r.importModule('lib/spa-recovery.ts');
  assert.equal(spa.spaRecoveryInterval(day), sooner);
  assert.equal(spa.spaWcNote, spaWcNote);
  const sec = Math.floor(r.now / 1000);
  await place(r, 'alice', 'emberwell');
  for (const user of ['alice', 'bob']) {
    await r.db.prepare('UPDATE citizens SET capacity=0 WHERE clerk_user_id=?').bind(user).run();
    await r.db.prepare('INSERT INTO capacity_clocks(clerk_user_id, recovered_at) VALUES (?,?)').bind(user, sec).run();
  }
  r.setNow((sec + sooner) * 1000);
  await r.call('citizen', 'alice', { action: 'nope' });
  assert.equal((await capacityOf(r, 'alice')).capacity, 0, 'flag off');
  assert.equal((await clockOf(r, 'alice')).recovered_at, sec, 'flag off does not move the clock');

  r.setFixtureEnv('HARIMU_SPA_WC_BONUS_ENABLED', 'true');
  await r.call('citizen', 'alice', { action: 'nope' });
  assert.equal((await capacityOf(r, 'alice')).capacity, 24);
  assert.equal((await clockOf(r, 'alice')).recovered_at, sec + sooner);
  await r.call('citizen', 'alice', { action: 'nope' });
  assert.equal((await capacityOf(r, 'alice')).capacity, 24);
  assert.equal((await clockOf(r, 'alice')).recovered_at, sec + sooner, 'a retry does not apply the bonus again');

  await r.call('citizen', 'bob', { action: 'nope' });
  assert.equal((await capacityOf(r, 'bob')).capacity, 0, 'non-spa home is unchanged at the short interval');
  r.setNow((sec + day) * 1000);
  await r.call('citizen', 'bob', { action: 'nope' });
  assert.equal((await capacityOf(r, 'bob')).capacity, 24);
  assert.equal((await clockOf(r, 'bob')).recovered_at, sec + day);

  const away = await (await r.call('citizen', 'alice')).data;
  assert.equal(Date.parse(away.economy.nextRecoveryAt), (sec + sooner + sooner) * 1000, 'the next tick stays on the short interval');
  const city = await r.call('city', 'alice');
  assert.equal(city.data.spaWcNote, spaWcNote);
  assert.equal(city.data.homeCityId, 'emberwell', 'a spa home survives the city read');
  await place(r, 'alice', 'emberwell', 'tarrek-foundry');
  assert.equal((await r.call('city', 'alice')).data.spaWcNote, undefined, 'the line is for the spa home, not a visit');
  r.setFixtureEnv('HARIMU_SPA_WC_BONUS_ENABLED', 'false');
  await place(r, 'alice', 'emberwell');
  assert.equal((await r.call('city', 'alice')).data.spaWcNote, undefined, 'flag off adds no line');
});

test('enrollment can choose Emberwell, and the city panel prints the line only when given', async () => {
  const page = readFileSync('app/page.tsx', 'utf8');
  assert.match(page, /residentCitiesForNation/);
  assert.match(readFileSync('app/game-shell.tsx', 'utf8'), /wcNote/);
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
  const destinations = [{ id: 'household', label: 'Household', detail: 'Home' }];
  const plain = renderToStaticMarkup(React.createElement(mod.CitySummary, { cityName: 'Emberwell', city: { capital: false }, nation, destinations, onView: () => {} }));
  assert.equal(plain.includes(spaWcNote), false);
  const noted = renderToStaticMarkup(React.createElement(mod.CitySummary, { cityName: 'Emberwell', city: { capital: false }, nation, destinations, onView: () => {}, spaWcNote }));
  assert.ok(noted.includes(spaWcNote));
});
