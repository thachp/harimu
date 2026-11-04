/** #1086: foundation-truce refusals (docs §15.4, #1070) are written to war_capture_refusals with reason 'foundation_truce' (migration 0121). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400, DAY1 = Date.UTC(2026, 9, 10, 22, 30);

async function setup(t, backend, foundedAgo) {
  const r = await localRuntime({ backend }); t.after(() => r.close()); r.setNow(DAY1);
  const battle = await r.importModule('lib/army-battle.ts'), siege = await r.importModule('lib/siege-actions.ts');
  const nowS = Math.floor(DAY1 / 1000), run = (sql, ...b) => r.db.prepare(sql).bind(...b).run();
  const all = (sql, ...b) => r.db.prepare(sql).bind(...b).all().then(x => x.results);
  const declared = nowS - 5 * D;
  await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,?,?,?,?,?)', 'w1', 'rq-w1', 'pair-w1', 'korund', 'kindle', 'test', declared, declared + 172800, null, null);
  await run("UPDATE world_squares SET zone='frontier', owner='kindle', feature=NULL WHERE (x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11) OR (x=17 AND y=9)");
  await run("UPDATE world_squares SET feature='city' WHERE x=12 AND y=9");
  await run("INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ('city-f1','kindle','Newtown',1,12,9,'kindle-charter','alice','rq-city-f1',?)", nowS - foundedAgo);
  const transfer = (squares, n = 1) => battle.transferBattleSquares(r.db, { warId: 'w1', battleKey: `b${n}`, requestId: `req-battle-${n}`, attacker: 'korund', defender: 'kindle', now: nowS, squares });
  const assault = (lossCap = true, enabled = true) => siege.resolveCityAssault(r.db, { nation: 'korund', warId: 'w1', cityKind: 'founded', cityId: 'city-f1', requestId: 'req-assault-1' }, nowS, enabled, { lossCap });
  const logged = async () => (await all('SELECT siege_id,battle_key,request_id,reason,squares,attacker_nation,defender_nation,refused_at FROM war_capture_refusals ORDER BY id')).map(x => ({ ...x }));
  return { r, run, transfer, assault, logged, nowS };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`battle refused by the truce logs one foundation_truce row, once per attempt (${backend})`, async t => {
    const c = await setup(t, backend, 3 * D);
    assert.equal((await c.transfer([{ x: 13, y: 9 }, { x: 11, y: 8 }])).reason, 'foundation_truce');
    await c.transfer([{ x: 13, y: 9 }, { x: 11, y: 8 }]); // retry of the same request adds nothing
    assert.deepEqual(await c.logged(), [{ siege_id: null, battle_key: 'b1', request_id: 'req-battle-1', reason: 'foundation_truce', squares: 2, attacker_nation: 'korund', defender_nation: 'kindle', refused_at: c.nowS }]);
  });

  test(`siege assault refused by the truce logs one row (${backend})`, async t => {
    const c = await setup(t, backend, 3 * D);
    assert.equal((await c.assault()).reason, 'foundation_truce');
    await c.assault();
    const rows = await c.logged();
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].siege_id, rows[0].battle_key, rows[0].reason, rows[0].request_id], [null, 'assault:city:city-f1', 'foundation_truce', 'req-assault-1']);
    assert.equal(Number(rows[0].squares), 25); // the whole 5x5 claim block (claimRadius 2) nobody bought
  });

  test(`mixed battle logs only the truce squares and moves the rest (${backend})`, async t => {
    const c = await setup(t, backend, 3 * D);
    assert.deepEqual(await c.transfer([{ x: 13, y: 9 }, { x: 17, y: 9 }]), { ok: true, moved: 1, truce: 1 });
    const rows = await c.logged();
    assert.deepEqual(rows.map(x => [x.reason, x.squares]), [['foundation_truce', 1]]);
  });

  test(`after the truce ends nothing is logged (${backend})`, async t => {
    const c = await setup(t, backend, 10 * D);
    assert.equal((await c.transfer([{ x: 13, y: 9 }])).ok, true);
    assert.notEqual((await c.assault()).reason, 'foundation_truce');
    assert.deepEqual(await c.logged(), []);
  });

  test(`loss-cap flag off: the assault is still refused but nothing is logged (${backend})`, async t => {
    const c = await setup(t, backend, 3 * D);
    assert.equal((await c.assault(false)).reason, 'foundation_truce');
    assert.equal((await c.assault(true, false)).reason, 'disabled');
    assert.deepEqual(await c.logged(), []);
  });

  test(`CHECK accepts foundation_truce and rejects unknown reasons (${backend})`, async t => {
    const c = await setup(t, backend, 3 * D);
    const ins = (id, reason) => c.run('INSERT INTO war_capture_refusals (id,siege_id,battle_key,war_id,request_id,attacker_nation,defender_nation,reason,squares,lost_in_window,weekly_limit,refused_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', id, null, 'bk', 'w1', `req-${id}-0001`, 'korund', 'kindle', reason, 1, 0, 1, c.nowS);
    await ins('a', 'foundation_truce');
    await assert.rejects(ins('b', 'truce'));
    await assert.rejects(ins('c', 'bogus'));
    assert.equal((await c.logged()).length, 1);
  });
}

test('0121 widens an existing 0094 table on SQLite (rebuild) and Postgres, keeping rows', async () => {
  const { readFileSync } = await import('node:fs');
  const pre = "CREATE TABLE city_sieges (id TEXT PRIMARY KEY); CREATE TABLE wars (id TEXT PRIMARY KEY); INSERT INTO wars VALUES ('w1');";
  const row = "INSERT INTO war_capture_refusals (id,battle_key,war_id,request_id,attacker_nation,defender_nation,reason,squares,lost_in_window,weekly_limit,refused_at) VALUES ('{id}','bk','w1','req-{id}-0001','korund','kindle','{reason}',1,0,1,1)";
  const ins = (id, reason) => row.replaceAll('{id}', id).replace('{reason}', reason);
  const { DatabaseSync } = await import('node:sqlite');
  const lite = new DatabaseSync(':memory:');
  lite.exec(pre + readFileSync('drizzle/0094_war_capture_refusals.sql', 'utf8') + ins('old', 'heartland'));
  assert.throws(() => lite.exec(ins('t0', 'foundation_truce')));
  lite.exec(readFileSync('drizzle/0121_truce_capture_refusals.sql', 'utf8'));
  lite.exec(ins('t1', 'foundation_truce'));
  assert.throws(() => lite.exec(ins('bad', 'bogus')));
  assert.throws(() => lite.exec(ins('old', 'heartland').replace("('old'", "('dup'")), /UNIQUE/); // the re-created unique index still blocks a second row per attempt
  assert.deepEqual(lite.prepare('SELECT id,reason FROM war_capture_refusals ORDER BY id').all().map(x => ({ ...x })), [{ id: 'old', reason: 'heartland' }, { id: 't1', reason: 'foundation_truce' }]);
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(pre + readFileSync('db/postgres/0094_war_capture_refusals.sql', 'utf8') + ins('old', 'heartland'));
  await assert.rejects(pg.exec(ins('t0', 'foundation_truce')));
  await pg.exec(readFileSync('db/postgres/0121_truce_capture_refusals.sql', 'utf8'));
  await pg.exec(ins('t1', 'foundation_truce'));
  await assert.rejects(pg.exec(ins('bad', 'bogus')));
  assert.deepEqual((await pg.query('SELECT id,reason FROM war_capture_refusals ORDER BY id')).rows.map(x => ({ ...x })), [{ id: 'old', reason: 'heartland' }, { id: 't1', reason: 'foundation_truce' }]);
  await pg.close();
});
