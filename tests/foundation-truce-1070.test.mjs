/** #1070: foundation truce (docs §15.4): a founded city's claim block cannot change hands by war for 10 real days after founded_at. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400, DAY1 = Date.UTC(2026, 9, 10, 22, 30), T = 10 * D;

async function setup(t, backend, foundedAgo) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close()); r.setNow(DAY1);
  const battle = await r.importModule('lib/army-battle.ts'), siege = await r.importModule('lib/siege-actions.ts'), truce = await r.importModule('lib/foundation-truce.ts');
  const nowS = Math.floor(DAY1 / 1000), run = (sql, ...b) => r.db.prepare(sql).bind(...b).run(), one = (sql, ...b) => r.db.prepare(sql).bind(...b).first();
  const declared = nowS - 5 * D;
  await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,?,?,?,?,?)', 'w1', 'rq-w1', 'pair-w1', 'korund', 'kindle', 'test', declared, declared + 172800, null, null);
  await run("UPDATE world_squares SET zone='frontier', owner='kindle', feature=NULL WHERE x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11");
  await run("UPDATE world_squares SET feature='city' WHERE x=12 AND y=9");
  await run("INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ('city-f1','kindle','Newtown',1,12,9,'kindle-charter','alice','rq-city-f1',?)", nowS - foundedAgo);
  let n = 0;
  const transfer = squares => battle.transferBattleSquares(r.db, { warId: 'w1', battleKey: `b${++n}`, requestId: `req-battle-${n}`, attacker: 'korund', defender: 'kindle', now: nowS, squares });
  const assault = (enabled = true) => siege.resolveCityAssault(r.db, { nation: 'korund', warId: 'w1', cityKind: 'founded', cityId: 'city-f1', requestId: `req-assault-${++n}` }, nowS, enabled);
  const owner = async (x, y) => (await one('SELECT owner FROM world_squares WHERE x=? AND y=?', x, y)).owner;
  return { r, truce, run, one, transfer, assault, owner, nowS };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`battle on a square of a city founded 3 days ago transfers nothing, with the truce reason (${backend})`, async t => {
    const c = await setup(t, backend, 3 * D);
    const res = await c.transfer([{ x: 13, y: 9 }]);
    assert.equal(res.ok, false); assert.equal(res.reason, 'foundation_truce'); assert.equal(res.cityId, 'city-f1');
    assert.equal(res.error, 'Newtown is newly founded. No assaults on it for 10 real days.');
    assert.equal(res.endsAt, c.nowS - 3 * D + T);
    assert.equal(await c.owner(13, 9), 'kindle');
    assert.equal((await c.one('SELECT COUNT(*) AS n FROM war_frontier_transfers')).n, 0);
  });

  test(`the same battle at day 11 transfers normally (${backend})`, async t => {
    const c = await setup(t, backend, 11 * D);
    assert.deepEqual(await c.transfer([{ x: 13, y: 9 }]), { ok: true, moved: 1 });
    assert.equal(await c.owner(13, 9), 'korund');
  });

  test(`siege assault on a founded city is refused during the truce (${backend})`, async t => {
    const c = await setup(t, backend, 3 * D);
    const res = await c.assault();
    assert.equal(res.ok, false); assert.deepEqual([res.status, res.reason], [409, 'foundation_truce']); assert.equal(res.endsAt, c.nowS - 3 * D + T);
    assert.equal((await c.one('SELECT COUNT(*) AS n FROM city_sieges')).n, 0);
    assert.equal((await c.one('SELECT COUNT(*) AS n FROM siege_assaults')).n, 0);
  });
}

test('boundary: the truce ends at exactly founded_at + 10 days; 1 s before it still holds (battle)', async t => {
  const end = await setup(t, undefined, T);
  assert.deepEqual(await end.transfer([{ x: 13, y: 9 }]), { ok: true, moved: 1 });
  const before = await setup(t, undefined, T - 1);
  const res = await before.transfer([{ x: 13, y: 9 }]);
  assert.equal(res.reason, 'foundation_truce'); assert.equal(res.endsAt, before.nowS + 1);
  assert.equal(await before.owner(13, 9), 'kindle');
});

test('boundary: siege assault allowed at exactly founded_at + 10 days, refused 1 s before', async t => {
  const end = await setup(t, undefined, T);
  const ok = await end.assault(); assert.equal(ok.ok, true, JSON.stringify(ok));
  const before = await setup(t, undefined, T - 1);
  assert.equal((await before.assault()).reason, 'foundation_truce');
});

test('claim block edge: radius-2 squares are covered, radius-3 squares are not (partial transfer)', async t => {
  const c = await setup(t, undefined, 3 * D);
  await c.run("UPDATE world_squares SET zone='frontier', owner='kindle' WHERE x=15 AND y=9");
  const res = await c.transfer([{ x: 14, y: 11 }, { x: 15, y: 9 }]);
  assert.deepEqual(res, { ok: true, moved: 1, truce: 1 });
  assert.equal(await c.owner(14, 11), 'kindle'); assert.equal(await c.owner(15, 9), 'korund');
});

test('capital and outpost squares are unchanged by this rule (no founded_at)', async t => {
  const c = await setup(t, undefined, 3 * D);
  const m = await c.r.importModule('lib/map-zones.ts'), k = m.mvpNations.find(x => x.id === 'kindle');
  assert.deepEqual(await c.truce.truceCitiesFor(c.r.db, [k.capital, k.outpost], c.nowS), []);
  const o = k.outpost, before = await c.owner(o.x, o.y);
  const res = await c.transfer([{ x: o.x, y: o.y }]);
  assert.equal(before, 'kindle'); assert.deepEqual(res, { ok: true, moved: 1 });
  assert.equal(await c.owner(o.x, o.y), 'korund');
});

test('war flag off: the assault is refused as disabled before any truce logic', async t => {
  const c = await setup(t, undefined, 3 * D);
  assert.equal((await c.assault(false)).reason, 'disabled');
});

test('pure helper: integer seconds, ends at founded_at + 864000', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const m = await r.importModule('lib/foundation-truce.ts');
  assert.equal(m.FOUNDATION_TRUCE_SECONDS, 864000);
  assert.equal(m.inFoundationTruce(100, 100 + 864000 - 1), true);
  assert.equal(m.inFoundationTruce(100, 100 + 864000), false);
});
