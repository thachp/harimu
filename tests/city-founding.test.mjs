/** #124: found a T1 city on Wildlands (radius-2 claim, min distance 6), via the real route on SQLite or Postgres
 *  (HARIMU_TEST_STORAGE=postgres runs the same suite on PGlite for parity). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

let seq = 0;
const cmd = (x, y, extra = {}) => ({ action: 'kindle-charter', x, y, name: 'Emberford', requestId: `found-${String(++seq).padStart(6, '0')}`, ...extra });
const block = async (r, x, y) => (await r.db.prepare('SELECT owner,zone,feature FROM world_squares WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ? ORDER BY y,x').bind(x - 2, x + 2, y - 2, y + 2).all()).results;
const cities = async r => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM world_cities').first()).n);
const owned = async r => Number((await r.db.prepare("SELECT COUNT(*) AS n FROM world_squares WHERE owner IS NOT NULL").first()).n);

async function runtime(t) { const r = await localRuntime(); t.after(() => r.close()); r.setCityFounding(true); return r; }

test('happy path: founds a T1 city and claims the radius-2 block atomically; replay is idempotent', async t => {
  const r = await runtime(t); const before = await owned(r);
  const c = cmd(21, 13);
  const res = await r.call('world/found-city', 'alice', c);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data.city, { id: 'city-kindle-21-13', nationId: 'kindle', name: 'Emberford', tier: 1, x: 21, y: 13 });
  assert.equal(res.data.claimed, 25); assert.equal(res.cache, 'private, no-store');
  const sq = await block(r, 21, 13);
  assert.equal(sq.length, 25); assert.ok(sq.every(s => s.owner === 'kindle' && s.zone === 'frontier'));
  assert.equal(sq.filter(s => s.feature === 'city').length, 1);
  const row = await r.db.prepare('SELECT nation_id,tier,center_x,center_y,authority,founded_by FROM world_cities').first();
  assert.deepEqual({ ...row, tier: Number(row.tier), center_x: Number(row.center_x), center_y: Number(row.center_y) },
    { nation_id: 'kindle', tier: 1, center_x: 21, center_y: 13, authority: 'kindle-charter', founded_by: 'alice' });
  assert.equal(await owned(r), before + 25);
  const again = await r.call('world/found-city', 'alice', c);
  assert.equal(again.status, 200); assert.equal(again.data.replay, true); assert.equal(await cities(r), 1);
  assert.equal((await r.call('world/found-city', 'bob', { ...c, x: 2 })).data.reason, 'request_reused');
  // The public map read reflects the claim.
  const z = await r.importModule('lib/map-zones.ts'); const { squares, source } = await z.readWorldSquares(r.db);
  assert.equal(source, 'table'); assert.equal(squares.find(s => s.x === 21 && s.y === 13).feature, 'city');
});

test('each rejection gives a clear reason and claims nothing', async t => {
  const r = await runtime(t);
  assert.equal((await r.call('world/found-city', 'alice', cmd(21, 13))).status, 200);
  const before = await owned(r);
  const cases = [
    [cmd(12, 6), 'centre_commons', /Commons cannot be settled/],
    [cmd(5, 5), 'centre_heartland', /Heartland/],
    [cmd(8, 4), 'centre_frontier', /Frontier/],
    [cmd(9, 10), 'too_close', /border outpost at 8, 7.*at least 6 squares/],
    [cmd(18, 15), 'too_close', /city at 21, 13/],
    [cmd(0, 13), 'block_off_map', /off the map edge/],
    [cmd(30, 1), 'out_of_bounds', /off the map/],
  ];
  for (const [c, reason, message] of cases) {
    const res = await r.call('world/found-city', 'alice', c);
    assert.equal(res.data.reason, reason, `${c.x},${c.y}: ${JSON.stringify(res.data)}`); assert.match(res.data.error, message);
    assert.ok(res.status === 409 || res.status === 400);
  }
  // A claimed square inside an otherwise eligible block: whole founding rejected, no partial claim.
  await r.db.prepare("UPDATE world_squares SET owner='korund' WHERE x=3 AND y=14").run();
  const partial = await r.call('world/found-city', 'alice', cmd(2, 13));
  assert.equal(partial.data.reason, 'block_claimed');
  assert.equal((await block(r, 2, 13)).filter(s => s.owner).length, 1, 'only the pre-claimed square is owned');
  assert.equal(await cities(r), 1); assert.equal(await owned(r), before + 1);
});

test('authority stubs: flag gate, own nation authority, validation and same-origin', async t => {
  const r = await runtime(t);
  assert.equal((await r.call('world/found-city', 'alice', cmd(21, 13, { action: 'korund-chairman-order' }))).data.reason, 'wrong_authority');
  assert.equal((await r.call('world/found-city', 'nobody', cmd(21, 13))).data.reason, 'no_authority');
  assert.equal((await r.call('world/found-city', 'alice', cmd(21, 13, { name: '1' }))).status, 400);
  assert.equal((await r.call('world/found-city', 'alice', cmd(21, 13, { x: 1.5 }))).status, 400);
  assert.equal((await r.call('world/found-city', 'alice', cmd(21, 13, { requestId: 'x' }))).status, 400);
  assert.equal((await r.call('world/found-city', 'alice', cmd(21, 13), 'https://foreign.invalid')).status, 403);
  assert.equal((await r.call('world/found-city', null, cmd(21, 13))).status, 401);
  r.setCityFounding(false);
  assert.equal((await r.call('world/found-city', 'alice', cmd(21, 13))).data.reason, 'disabled');
  assert.equal(await cities(r), 0);
  r.setCityFounding(true);
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  const korund = await r.call('world/found-city', 'bob', cmd(2, 13, { action: 'korund-chairman-order', name: 'Stahlgrad' }));
  assert.equal(korund.status, 200, JSON.stringify(korund.data)); assert.equal(korund.data.city.nationId, 'korund');
});

test('pure site check: Commons inside the block, and seed capitals keep the distance rule', async t => {
  const r = await runtime(t);
  const m = await r.importModule('lib/city-founding.ts'); const z = await r.importModule('lib/map-zones.ts');
  assert.equal(m.seedCapitalsSpaced(), true);
  const squares = z.seedWorldSquares().map(s => s.x === 4 && s.y === 13 ? { ...s, zone: 'commons' } : s);
  assert.equal(m.checkFoundingSite(squares, 2, 13).reason, 'block_commons');
  assert.equal(m.checkFoundingSite(z.seedWorldSquares(), 2, 13), null);
  assert.deepEqual(Object.values(m.foundingAuthorities).map(a => a.action), ['kindle-charter', 'korund-chairman-order', 'aurelle-royal-charter']);
});
