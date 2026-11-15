/** #1425: a signed-in Korund viewer of GET /api/army/battles sees only battles whose defender capital is on a Korund square or its 8-neighbours. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = 'HARIMU_KORUND_MAP_FOG_ENABLED';
const ON = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_MAP_ENABLED: 'true', HARIMU_ARMY_SUPPLY_ENABLED: 'true', HARIMU_ARMY_BATTLES_ENABLED: 'true' };
const key = (x, y) => `${x},${y}`;

async function spy(r, fn) {
  const prepare = r.db.prepare.bind(r.db), seen = { sql: [] };
  r.db.prepare = q => { seen.sql.push(q); return prepare(q); };
  try { seen.result = await fn(); } finally { r.db.prepare = prepare; }
  return seen;
}

for (const backend of ['sqlite', 'postgres']) test(`Korund army battles fog (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  for (const [k, v] of Object.entries(ON)) r.setFixtureEnv(k, v);
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
  const now = Math.floor(r.now / 1000), mob = now - 30 * 86400;
  // Kindle vs Korund fights at Korund's capital (inside the fog). Aurelle vs Kindle fights at Kindle's capital (outside).
  await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('w1425a','r-1425-a','kindle:korund','kindle','korund','','AI',?,?)").bind(mob - 172800, mob).run();
  await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('w1425b','r-1425-b','aurelle:kindle','aurelle','kindle','','AI',?,?)").bind(mob - 172800, mob).run();
  r.setFixtureEnv(FLAG, 'true');

  const M = await r.importModule('lib/army-map.ts');
  const squaresFull = await r.call('world/squares', 'bob');
  const owned = new Set(squaresFull.data.squares.filter(s => s.owner === 'korund').map(s => key(s.x, s.y)));
  const visible = square => owned.has(key(square.x, square.y)) || [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => (dx || dy) && owned.has(key(square.x + dx, square.y + dy))));
  const capital = id => M.nationCapital(id);

  const full = await r.call('army/battles', 'bob');
  const fog = await r.call('army/battles', 'alice');
  const anon = await r.call('army/battles');
  assert.equal(full.status, 200);
  assert.equal(full.cache, 'private, no-store');
  assert.equal(fog.cache, 'private, no-store');
  assert.equal(anon.cache, 'private, no-store');
  assert.deepEqual(anon.data, full.data, 'signed-out still receives the full battles list');
  const defenders = list => list.data.battles.map(b => b.defenderNationId).sort();
  assert.deepEqual(defenders(full), ['kindle', 'korund']);
  assert.ok(visible(capital('korund')), "Korund's capital is inside the fog");
  assert.ok(!visible(capital('kindle')), "Kindle's capital sits outside the fog");
  assert.ok(fog.data.battles.length > 0, 'the fogged list is not empty');
  assert.deepEqual(defenders(fog), ['korund'], 'only the battle at Korund\'s capital remains');
  assert.ok(fog.data.battles.every(b => visible(capital(b.defenderNationId))), 'every remaining battle sits on a Korund square or a neighbour');
  assert.ok(full.data.battles.some(b => !visible(capital(b.defenderNationId))), 'the full list includes a battle outside the fog');

  r.setFixtureEnv(FLAG, 'false');
  const off = await spy(r, () => r.call('army/battles', 'alice'));
  assert.equal(off.result.status, 200);
  assert.equal(off.result.cache, 'private, no-store');
  assert.deepEqual(off.result.data, full.data, 'flag off: the battles body is unchanged');
  assert.equal(off.sql.some(q => /world_squares/i.test(q)), false, 'flag off: no world-squares read');
});
