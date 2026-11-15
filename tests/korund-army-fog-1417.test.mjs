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
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const minDistToOwned = p => Math.min(...[...owned].map(k => { const [x, y] = k.split(',').map(Number); return cheb(p, { x, y }); }));

  // QA1 on #1419: park Aurelle on a non-Korund square adjacent to Korund so the 8-neighbour ring is pinned.
  const M = await r.importModule('lib/army-map.ts');
  const now = Math.floor(r.now / 1000);
  const terrainAt = p => squaresFull.data.squares.find(s => s.x === p.x && s.y === p.y)?.terrain;
  const march = M.unitMarch('aurelle', [{ attacker_nation: 'aurelle', defender_nation: 'korund', mobilization_ends_at: 0, declared_at: 0 }], 1);
  assert.ok(march, "Aurelle's march toward Korund is available");
  let elapsed = 0, neighbour = null;
  for (const step of march.route) {
    elapsed += M.moveSeconds(terrainAt(step));
    if (visible(step) && !owned.has(key(step.x, step.y))) { neighbour = { ...step, elapsed }; break; }
  }
  assert.ok(neighbour, "Aurelle's march crosses a non-Korund neighbour of a Korund-owned square");
  await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('w1417n','r-1417-n','aurelle:korund','aurelle','korund','','AI',?,?)").bind(now - neighbour.elapsed - 172800, now - neighbour.elapsed).run();

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
  const aurelle = full.data.units.find(u => u.nationId === 'aurelle');
  assert.ok(korundHome && visible(korundHome), "Korund's home unit is inside the fog");
  assert.ok(aurelle && visible(aurelle) && !owned.has(key(aurelle.x, aurelle.y)), 'Aurelle sits on a non-Korund square adjacent to Korund');
  assert.equal(key(aurelle.x, aurelle.y), key(neighbour.x, neighbour.y));
  assert.equal(fog.data.units.some(u => u.nationId === 'aurelle'), true, 'a Korund viewer sees the unit on the neighbour square');
  assert.ok(kindleHome && !visible(kindleHome) && minDistToOwned(kindleHome) >= 2, "Kindle's unit is at least two squares from every Korund-owned square");
  assert.equal(fog.data.units.some(u => u.nationId === 'kindle'), false, 'a unit two squares away stays hidden');
  assert.equal(fog.data.units.some(u => u.nationId === 'korund'), true, "Korund's own unit remains");
  assert.deepEqual(fog.data.units.filter(u => u.nationId === 'korund').map(u => key(u.x, u.y)), [key(korundHome.x, korundHome.y)]);

  r.setFixtureEnv(FLAG, 'false');
  const off = await spy(r, () => r.call('army/positions', 'alice'));
  assert.equal(off.result.status, 200);
  assert.equal(off.result.cache, 'private, no-store');
  assert.deepEqual(off.result.data, full.data, 'flag off: the positions body is unchanged');
  assert.equal(off.sql.length, 1, 'flag off: still a single wars-table read');
  assert.equal(off.sql.some(q => /world_squares/i.test(q)), false, 'flag off: no world-squares read');
});
