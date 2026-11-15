/** #1417: a signed-in Korund viewer of GET /api/army/positions sees units only on Korund squares and their 8-neighbours. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = 'HARIMU_KORUND_MAP_FOG_ENABLED';
const ARMY = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_MAP_ENABLED: 'true' };
const key = (x, y) => `${x},${y}`;

async function spy(r, fn) {
  const prepare = r.db.prepare.bind(r.db), seen = { sql: [] };
  r.db.prepare = q => { seen.sql.push(q); return prepare(q); };
  try { seen.result = await fn(); } finally { r.db.prepare = prepare; }
  return seen;
}

for (const backend of ['sqlite', 'postgres']) test(`Korund army positions fog (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  for (const [k, v] of Object.entries(ARMY)) r.setFixtureEnv(k, v);
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(FLAG, 'true');

  const squaresFull = await r.call('world/squares', 'bob');
  const owned = new Set(squaresFull.data.squares.filter(s => s.owner === 'korund').map(s => key(s.x, s.y)));
  const visible = square => owned.has(key(square.x, square.y)) || [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => (dx || dy) && owned.has(key(square.x + dx, square.y + dy))));

  const full = await r.call('army/positions', 'bob');
  const fog = await r.call('army/positions', 'alice');
  const anon = await r.call('army/positions');
  assert.equal(full.status, 200);
  assert.equal(full.cache, 'private, no-store');
  assert.equal(fog.cache, 'private, no-store');
  assert.equal(anon.cache, 'private, no-store');
  assert.deepEqual(anon.data, full.data, 'signed-out still receives the full units list');
  assert.ok(full.data.units.some(u => !visible(u)), 'the full map includes a unit outside the fog');
  assert.ok(fog.data.units.length > 0, 'the fogged list is not empty');
  assert.ok(fog.data.units.every(u => visible(u)), 'every remaining unit sits on a Korund square or a neighbour');
  assert.ok(fog.data.units.length < full.data.units.length);
  const korundHome = full.data.units.find(u => u.nationId === 'korund');
  const kindleHome = full.data.units.find(u => u.nationId === 'kindle');
  assert.ok(korundHome && visible(korundHome), "Korund's home unit is inside the fog");
  assert.ok(kindleHome && !visible(kindleHome), "Kindle's capital sits outside the fog");
  assert.equal(fog.data.units.some(u => u.nationId === 'korund'), true, "Korund's own unit remains");
  assert.equal(fog.data.units.some(u => u.nationId === 'kindle'), false, "Kindle's distant unit is omitted");
  assert.deepEqual(fog.data.units.filter(u => u.nationId === 'korund').map(u => key(u.x, u.y)), [key(korundHome.x, korundHome.y)]);

  r.setFixtureEnv(FLAG, 'false');
  const off = await spy(r, () => r.call('army/positions', 'alice'));
  assert.equal(off.result.status, 200);
  assert.equal(off.result.cache, 'private, no-store');
  assert.deepEqual(off.result.data, full.data, 'flag off: the positions body is unchanged');
  assert.equal(off.sql.length, 1, 'flag off: still a single wars-table read');
  assert.equal(off.sql.some(q => /world_squares/i.test(q)), false, 'flag off: no world-squares read');
});
