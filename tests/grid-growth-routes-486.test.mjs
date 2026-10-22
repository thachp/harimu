/** #486 slice 2 (QA1 on #724): with migration 0066's 288 extra rows in world_squares, the current 24x18 build still buys and founds (no map_unavailable). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

for (const backend of ['sqlite', 'postgres']) test(`buy a square and found a city against a database holding the 288 growth rows (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  const z = await r.importModule('lib/map-zones.ts');
  await r.call('world/registry', 'alice'); // boots the schema and the 24x18 seed
  for (const sql of z.gridGrowthSql()) await r.db.prepare(sql).run();
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM world_squares').first()).n), 720);
  r.setSquarePurchase(true); r.setCityFounding(true);
  await r.db.prepare("INSERT INTO citizen_tessera_exchanges(request_id,clerk_user_id,nation_id,spark_minor,tessera_minor,occurred_at) VALUES (?,?,'kindle',?,?,0)").bind(randomUUID(), 'alice', 20000, 5000).run();
  const buy = await r.call('world/registry', 'alice', { action: 'buy-square', x: 9, y: 8, requestId: randomUUID() });
  assert.equal(buy.status, 200, JSON.stringify(buy.data));
  const found = await r.call('world/found-city', 'alice', { action: 'kindle-charter', x: 21, y: 13, name: 'Emberford', requestId: 'found-486001' });
  assert.equal(found.status, 200, JSON.stringify(found.data)); assert.equal(found.data.claimed, 25);
  const read = await z.readWorldSquares(r.db); assert.equal(read.source, 'table'); assert.equal(read.squares.length, z.mapWidth * z.mapHeight);
});

test('onGrid rejects non-integer coordinates', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { onGrid } = await r.importModule('lib/map-zones.ts');
  assert.deepEqual(onGrid([{ x: 1.5, y: 2 }, { x: '3', y: '2.5' }, { x: 'a', y: 0 }, { x: NaN, y: 0 }, { x: 2, y: 2 }]), [{ x: 2, y: 2 }]);
});
