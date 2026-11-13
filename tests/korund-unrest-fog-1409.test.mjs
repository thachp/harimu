/** #1409: a signed-in Korund viewer of GET /api/world/unrest sees cells only on Korund squares and their 8-neighbours. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = 'HARIMU_KORUND_MAP_FOG_ENABLED';
const PUBLIC_UNREST = 'public, max-age=60';
const key = (x, y) => `${x},${y}`;
const ins = 'INSERT INTO nation_stability_scores (nation_id,tick,scheduled_at,computed_at,stability,unrest,inputs_json,breakdown_json) VALUES (?,?,?,?,?,?,?,?)';

for (const backend of ['sqlite', 'postgres']) test(`Korund unrest fog (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setMapOverlays(true);
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
  await r.db.prepare(ins).bind('kindle', 1, 1, 1, 50, 45, '{}', '{}').run();
  await r.db.prepare(ins).bind('aurelle', 1, 1, 1, 40, 64, '{}', '{}').run();
  await r.db.prepare(ins).bind('korund', 1, 1, 1, 23, 77, '{}', '{}').run();
  r.setFixtureEnv(FLAG, 'true');

  const squaresFull = await r.call('world/squares', 'bob');
  const owned = new Set(squaresFull.data.squares.filter(s => s.owner === 'korund').map(s => key(s.x, s.y)));
  const visible = square => owned.has(key(square.x, square.y)) || [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => (dx || dy) && owned.has(key(square.x + dx, square.y + dy))));
  const at = (x, y) => squaresFull.data.squares.find(s => s.x === x && s.y === y);
  const visibleOwners = new Set(squaresFull.data.squares.filter(visible).map(s => s.owner).filter(Boolean));

  const full = await r.call('world/unrest', 'bob');
  const fog = await r.call('world/unrest', 'alice');
  const anon = await r.call('world/unrest');
  assert.equal(full.status, 200);
  assert.equal(full.cache, 'private, no-store', 'flag on: a non-Korund response is not publicly cacheable');
  assert.equal(anon.cache, 'private, no-store', 'flag on: a signed-out response is not publicly cacheable');
  assert.deepEqual(anon.data, full.data, 'signed-out still receives the full unrest body');
  assert.equal(fog.cache, 'private, no-store');
  assert.ok(full.data.cells.some(([x, y]) => !visible(at(x, y))), 'the full map includes a cell outside the fog');
  assert.ok(fog.data.cells.every(([x, y]) => visible(at(x, y))), 'every remaining cell is on a Korund square or a neighbour');
  assert.ok(fog.data.cells.length < full.data.cells.length);
  assert.ok(fog.data.nations.every(n => visibleOwners.has(n.nationId)), 'nation scores are only for owners of remaining squares');
  assert.ok(full.data.nations.some(n => !visibleOwners.has(n.nationId)), "a distant nation's score is omitted from the fogged list");
  assert.deepEqual(fog.data.unpublished, visibleOwners.has('korund') ? ['korund'] : []);
  const body = JSON.stringify(fog.data);
  assert.ok(!body.includes('77') && !body.includes('Riot') && !body.includes('"23'), `no Korund score or band: ${body.slice(0, 200)}`);

  r.setFixtureEnv(FLAG, 'false');
  const off = await r.call('world/unrest', 'alice');
  assert.equal(off.cache, PUBLIC_UNREST, 'flag off: the unrest read stays public');
  assert.deepEqual(off.data, full.data);
});
