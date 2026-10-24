/** #933: partial siege capture up to the remaining weekly frontier-loss cap (ARC on #921/#912). Flag HARIMU_WAR_LOSS_CAP_ENABLED. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400, DAY1 = Date.UTC(2026, 9, 10, 22, 30);

test('order: bordering attacker first, then lowest id (y, then x)', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { orderCaptureSquares, bordersAttacker, decideCapture } = await r.importModule('lib/war-loss-cap.ts');
  const sq = (x, y) => ({ x, y, zone: 'frontier', from: 'kindle', to: 'korund' });
  const keys = new Set(['5,5']); // attacker holds (5,5); borders (4,5),(5,4),(6,5),...
  assert.equal(bordersAttacker(sq(4, 5), keys), true);
  assert.equal(bordersAttacker(sq(10, 10), keys), false);
  assert.deepEqual(orderCaptureSquares([sq(10, 10), sq(4, 5), sq(6, 5), sq(3, 3)], keys).map(s => `${s.x},${s.y}`), ['4,5', '6,5', '3,3', '10,10']);
  const d = decideCapture([sq(1, 1), sq(2, 1), sq(3, 1)], 0, 20, new Set(['0,1']));
  assert.deepEqual(d.transfer.map(s => s.x), [1, 2]); assert.equal(d.flipped, false);
});

async function setup(t, backend) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close()); r.setNow(DAY1);
  const siege = await r.importModule('lib/siege-actions.ts');
  // Apply migration 0099 shape for fresh runtime schemas (siegeSchemas already match); ensure index exists.
  await r.db.prepare('CREATE INDEX IF NOT EXISTS idx_city_captures_siege ON city_captures(siege_id)').run().catch(() => {});
  const nowS = () => Math.floor(r.now / 1000), run = (sql, ...b) => r.db.prepare(sql).bind(...b).run(), one = (sql, ...b) => r.db.prepare(sql).bind(...b).first();
  const declared = nowS() - 5 * D;
  await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,?,?,?,?,?)', 'w1', 'rq-w1', 'pair-w1', 'korund', 'kindle', 'test', declared, declared + 172800, null, null);
  let n = 0;
  const assault = (over = {}, at) => { if (at !== undefined) r.setNow(at); return siege.resolveCityAssault(r.db, { nation: 'korund', warId: 'w1', cityKind: 'founded', cityId: 'city-f1', requestId: `req-assault-${++n}`, ...over }, nowS(), true, { lossCap: true }); };
  return { r, run, one, assault, nowS };
}

/** Founded city block with `frontierCount` capturable frontier squares; Kindle holds exactly `held` frontier so the weekly limit is floor(held*10%). */
async function city(c, { frontierCount = 5, held = 20 } = {}) {
  await c.run("UPDATE world_squares SET zone='frontier', owner=NULL, feature=NULL WHERE x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11");
  await c.run("UPDATE world_squares SET feature='city' WHERE x=12 AND y=9");
  const spots = (await c.r.db.prepare("SELECT x,y FROM world_squares WHERE x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11 ORDER BY y,x").all()).results;
  for (const s of spots.slice(0, frontierCount)) await c.run("UPDATE world_squares SET owner='kindle' WHERE x=? AND y=?", s.x, s.y);
  // Place an attacker square bordering the first planned square so order is deterministic
  await c.run("UPDATE world_squares SET owner='korund', zone='frontier' WHERE x=? AND y=?", spots[0].x - 1, spots[0].y);
  await c.run("INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ('city-f1','kindle','Newtown',1,12,9,'kindle-charter','alice','rq-city-f1',1)");
  await c.run("UPDATE world_squares SET owner=NULL WHERE owner='kindle' AND NOT (x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11)");
  const need = Math.max(0, held - frontierCount);
  const pad = (await c.r.db.prepare("SELECT x,y FROM world_squares WHERE owner IS NULL AND NOT (x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11) ORDER BY y,x").all()).results;
  for (const s of pad.slice(0, need)) await c.run("UPDATE world_squares SET owner='kindle', zone='frontier' WHERE x=? AND y=?", s.x, s.y);
  const n = Number((await c.one("SELECT COUNT(*) AS n FROM world_squares WHERE owner='kindle' AND zone='frontier'")).n);
  assert.ok(n >= held, `need ${held} frontier for Kindle, have ${n}`);
  return spots.slice(0, frontierCount);
}

for (const backend of ['sqlite', 'postgres']) {
  test(`25-ish city vs limit 2: first capture moves 2 border squares, city stays contested; after the window rolls it takes more and flips on the last (${backend})`, async t => {
    const c = await setup(t, backend);
    const spots = await city(c, { frontierCount: 5, held: 25 }); // limit 2; stays ≥2 after losing 2
    assert.equal((await c.assault()).ok, true);
    const first = await c.assault({}, DAY1 + D * 1000);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.captured.moved, 2);
    assert.equal(first.captured.partial, true);
    assert.equal((await c.one("SELECT captured_at FROM city_sieges WHERE city_key='city:city-f1'")).captured_at, null, 'city stays contested');
    assert.equal((await c.one("SELECT nation_id FROM world_cities WHERE id='city-f1'")).nation_id, 'kindle');
    const moved = (await c.r.db.prepare("SELECT x,y FROM city_capture_squares ORDER BY y,x").all()).results;
    assert.equal(moved.length, 2);
    // Next day same window: remaining 0 → refuse
    const refused = await c.assault({}, DAY1 + 2 * D * 1000);
    assert.deepEqual([refused.ok, refused.reason], [false, 'weekly_loss_cap']);
    // After window rolls, take 2 more (held still ≥20 so limit stays 2)
    const second = await c.assault({}, DAY1 + 8 * D * 1000);
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.captured.moved, 2);
    assert.equal(second.captured.partial, true);
    // Last square
    const last = await c.assault({}, DAY1 + 15 * D * 1000);
    assert.equal(last.ok, true, JSON.stringify(last));
    assert.equal(last.captured.moved, 1);
    assert.equal(last.captured.partial, false);
    assert.ok((await c.one("SELECT captured_at FROM city_sieges WHERE city_key='city:city-f1'")).captured_at);
    assert.equal((await c.one("SELECT nation_id FROM world_cities WHERE id='city-f1'")).nation_id, 'korund');
    assert.equal((await c.one('SELECT COUNT(*) AS n FROM city_capture_squares')).n, 5);
  });

  test(`capture UPDATE refuses Heartland even if planCapture were bypassed (${backend})`, async t => {
    const c = await setup(t, backend);
    await city(c, { frontierCount: 1, held: 20 });
    await c.run("UPDATE world_squares SET zone='heartland', owner='kindle' WHERE x=14 AND y=11");
    // Force a transfer list that includes Heartland by writing through captureSiegeForTest after two assaults
    assert.equal((await c.assault()).ok, true);
    const done = await c.assault({}, DAY1 + D * 1000);
    assert.ok(done.ok);
    assert.equal((await c.one('SELECT owner FROM world_squares WHERE x=14 AND y=11')).owner, 'kindle');
  });
}

test('migration 0099, flag wiring, Heartland on UPDATE', async () => {
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  assert.match(await read('../drizzle/0099_partial_city_captures.sql'), /city_captures_933|RENAME TO city_captures/);
  assert.match(await read('../db/postgres/0099_partial_city_captures.sql'), /DROP CONSTRAINT IF EXISTS city_captures_siege_id_key/);
  assert.match(await read('../lib/siege-actions.ts'), /zone<>'heartland'/);
  assert.match(await read('../lib/war-loss-cap.ts'), /orderCaptureSquares|#933/);
});
