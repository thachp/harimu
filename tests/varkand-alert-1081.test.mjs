/** #1081: Varkand's Alert Level stored by the Directorate (docs Varkand, Freedoms; Cities, Home city), flag HARIMU_VARKAND_ALERT_ENABLED in HARIMU_GRAY_PACK.
 *  The permit check (#992) and the Varkand nation read on GET /api/world (the #1082 banner) read the same stored row. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { citiesForNation } from '../lib/cities.ts';
import { expandFlagPacks } from '../lib/flag-pack.mjs';

const read = f => readFileSync(f, 'utf8');
const token = 'fixture-admin-token-1081';
const voren = citiesForNation('varkand').find(c => !c.capital).id;

async function world(t, { flag = true } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true'); r.setFixtureEnv('HARIMU_INTERNAL_PERMIT_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_VARKAND_ALERT_ENABLED', flag ? 'true' : 'false'); r.setFixtureEnv('HARIMU_VARKAND_ALERT', undefined);
  r.setFixtureEnv('HARIMU_ADMIN_TOKEN', token);
  const lib = await r.importModule('lib/varkand-alert.ts'), route = await r.importModule('app/api/admin/varkand-alert/route.ts');
  const admin = (body, auth = `Bearer ${token}`) => route.POST(new Request('https://fixture.invalid/api/admin/varkand-alert', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  await r.call('citizen', 'alice');
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('vik','varkand','vik',18,0,'Good standing',?,?)").bind(at, at).run();
  const move = () => r.call('city-home', 'vik', { cityId: voren, requestId: randomUUID() });
  const nationLevel = async () => (await r.call('world', 'alice')).data.nations.find(n => n.id === 'varkand')?.alertLevel;
  return { r, lib, route, admin, move, nationLevel };
}

test('flag registered in HARIMU_GRAY_PACK: preview "true", production "false"', async () => {
  const strip = s => JSON.parse(s.replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(expandFlagPacks(strip(read('wrangler.jsonc')).vars).HARIMU_VARKAND_ALERT_ENABLED, 'true');
  assert.equal(expandFlagPacks(strip(read('wrangler.prod.jsonc')).vars).HARIMU_VARKAND_ALERT_ENABLED, 'false');
});

test('migration 0120 in drizzle/ and db/postgres/ creates varkand_alert_levels', () => {
  for (const f of ['drizzle/0120_varkand_alert_levels.sql', 'db/postgres/0120_varkand_alert_levels.sql']) assert.match(read(f), /CREATE TABLE IF NOT EXISTS varkand_alert_levels[\s\S]*'green','amber','red'/);
});

test('default Green: empty table and missing table both read green', async t => {
  const { r, lib, nationLevel } = await world(t);
  assert.deepEqual(await lib.readVarkandAlert(r.db), { level: 'green', setAt: null });
  assert.equal(await nationLevel(), 'green');
  const missing = { prepare: () => ({ first: () => Promise.reject(new Error('no such table: varkand_alert_levels')) }) };
  assert.deepEqual(await lib.readVarkandAlert(missing), { level: 'green', setAt: null }, 'a missing table reads Green');
});

test('admin route: flag off or short token 404, wrong bearer 401, bad level 400', async t => {
  const { r, admin } = await world(t);
  assert.equal((await admin({ level: 'amber' }, 'Bearer wrong-token-wrong-token')).status, 401);
  assert.equal((await admin({ level: 'orange' })).status, 400);
  r.setFixtureEnv('HARIMU_ADMIN_TOKEN', 'short'); assert.equal((await admin({ level: 'amber' }, 'Bearer short')).status, 404);
  r.setFixtureEnv('HARIMU_ADMIN_TOKEN', token); r.setFixtureEnv('HARIMU_VARKAND_ALERT_ENABLED', 'false');
  assert.equal((await admin({ level: 'amber' })).status, 404);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM varkand_alert_levels').first()).n), 0);
});

test('Amber then Red require a permit; back to Green does not; banner read and permit check see the same level; news recorded', async t => {
  const { r, admin, move, nationLevel } = await world(t);
  const green = await move(); assert.equal(green.status, 403); assert.equal(green.data.reason, 'not_open_yet', 'Green: no permit gate');
  const up = await admin({ level: 'amber' }); assert.equal(up.status, 200);
  const body = await up.json(); assert.equal(body.changed, true); assert.equal(body.headline, 'The Directorate raises the Alert Level to Amber.');
  assert.equal(await nationLevel(), 'amber');
  assert.equal((await move()).data.reason, 'permit_required');
  await admin({ level: 'red' }); assert.equal(await nationLevel(), 'red');
  assert.equal((await move()).data.reason, 'permit_required');
  const down = await (await admin({ level: 'green' })).json(); assert.equal(down.headline, 'The Directorate lowers the Alert Level to Green.');
  assert.equal(await nationLevel(), 'green');
  assert.equal((await move()).data.reason, 'not_open_yet');
  const news = (await r.db.prepare("SELECT headline FROM world_events WHERE kind='directorate-alert' ORDER BY sort_order DESC, id").all()).results.map(e => e.headline);
  assert.equal(news.length, 3); assert.ok(news.includes('The Directorate raises the Alert Level to Amber.'));
  assert.equal((await (await admin({ level: 'green' })).json()).changed, false, 'same level: no new row or news');
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM varkand_alert_levels').first()).n), 3);
});

test('flag off: stored Amber is ignored, no alertLevel on the nation read, move behaves as today', async t => {
  const { r, lib, move, nationLevel } = await world(t, { flag: false });
  await lib.setVarkandAlert(r.db, 'amber', 1_900_000_000);
  assert.equal(await nationLevel(), undefined);
  assert.equal((await move()).data.reason, 'not_open_yet');
});

test('single source: home route and world route both read readVarkandAlert', () => {
  for (const f of ['app/api/city/home/route.ts', 'app/api/world/route.ts']) assert.match(read(f), /readVarkandAlert\(/, f);
});
