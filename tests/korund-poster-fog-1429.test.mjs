/** #1429: a signed-in Korund viewer of GET /api/world/registry?x=&y= does not receive a poster on a square outside Korund and its 8-neighbours. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const FOG = 'HARIMU_KORUND_MAP_FOG_ENABLED';
const POSTERS = 'HARIMU_SQUARE_POSTERS_ENABLED';
const key = (x, y) => `${x},${y}`;
const read = (r, user, x, y) => r.call('world/registry', user, undefined, 'https://fixture.invalid', `?x=${x}&y=${y}`);

async function spy(r, fn) {
  const prepare = r.db.prepare.bind(r.db), seen = { sql: [] };
  r.db.prepare = q => { seen.sql.push(q); return prepare(q); };
  try { seen.result = await fn(); } finally { r.db.prepare = prepare; }
  return seen;
}

const seedPoster = (r, { x, y, user, nation, frame, slogan, requestId }) =>
  r.db.prepare('INSERT INTO square_posters(x,y,clerk_user_id,nation_id,frame_id,slogan_id,request_id,placed_at) VALUES (?,?,?,?,?,?,?,1)')
    .bind(x, y, user, nation, frame, slogan, requestId).run();

for (const backend of ['sqlite', 'postgres']) test(`Korund poster read fog (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setFixtureEnv(POSTERS, 'true');
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();

  const squaresFull = await r.call('world/squares', 'bob');
  const owned = new Set(squaresFull.data.squares.filter(s => s.owner === 'korund').map(s => key(s.x, s.y)));
  const visible = square => owned.has(key(square.x, square.y)) || [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => (dx || dy) && owned.has(key(square.x + dx, square.y + dy))));
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const minDistToOwned = p => Math.min(...[...owned].map(k => { const [x, y] = k.split(',').map(Number); return cheb(p, { x, y }); }));
  const inside = squaresFull.data.squares.find(s => owned.has(key(s.x, s.y)));
  const neighbour = squaresFull.data.squares.find(s => visible(s) && !owned.has(key(s.x, s.y)));
  const far = squaresFull.data.squares.find(s => !visible(s) && minDistToOwned(s) >= 2);
  assert.ok(inside && neighbour && far, 'the map has a Korund square, a non-Korund neighbour, and a square at least two steps away');

  await seedPoster(r, { x: inside.x, y: inside.y, user: 'alice', nation: 'korund', frame: 'korund-frame-mosaic', slogan: 'korund-slogan-01', requestId: 'poster-fog-in' });
  await seedPoster(r, { x: neighbour.x, y: neighbour.y, user: 'alice', nation: 'korund', frame: 'korund-frame-mosaic', slogan: 'korund-slogan-01', requestId: 'poster-fog-near' });
  await seedPoster(r, { x: far.x, y: far.y, user: 'bob', nation: 'kindle', frame: 'kindle-frame-billboard', slogan: 'kindle-slogan-01', requestId: 'poster-fog-far' });
  r.setFixtureEnv(FOG, 'true');

  const farFull = await read(r, 'bob', far.x, far.y);
  assert.equal(farFull.status, 200);
  assert.equal(farFull.data.poster?.text, 'Strike your own spark.', 'a Kindle viewer still receives the distant poster');
  const farFog = await spy(r, () => read(r, 'alice', far.x, far.y));
  assert.equal(farFog.result.status, 200);
  assert.equal(farFog.result.data.poster, null, 'a Korund viewer does not receive a poster outside the fog');
  assert.equal(farFog.sql.some(q => /square_posters/i.test(q)), false, 'a hidden square does not query square_posters');

  const nearFog = await read(r, 'alice', neighbour.x, neighbour.y);
  assert.equal(nearFog.data.poster?.text, 'One hammer, one heart.', 'a Korund viewer still receives a poster on a non-Korund neighbour square');
  const inFog = await read(r, 'alice', inside.x, inside.y);
  assert.equal(inFog.data.poster?.text, 'One hammer, one heart.', 'a Korund viewer still receives a poster on a Korund square');
  const bare = await r.call('world/registry', 'alice');
  assert.equal('poster' in bare.data, false, 'a listing with no x,y is unchanged');

  r.setFixtureEnv(FOG, 'false');
  const off = await spy(r, () => read(r, 'alice', far.x, far.y));
  assert.equal(off.result.status, 200);
  assert.deepEqual(off.result.data.poster, farFull.data.poster, 'flag off: a Korund viewer receives the distant poster');
  assert.equal(off.sql.some(q => /world_squares/i.test(q)), false, 'flag off: no world-squares read');
});
