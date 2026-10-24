/** #912 (ARC on #921): Heartland squares never change hands in a siege capture, with or without HARIMU_WAR_LOSS_CAP_ENABLED (docs 15.3 "Heartland is immune"). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400, DAY1 = Date.UTC(2026, 9, 10, 22, 30);
test('planCapture never moves a Heartland square', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { planCapture } = await r.importModule('lib/siege.ts');
  const sq = (x, zone) => ({ x, y: 0, zone, owner: 'kindle', feature: null });
  const plan = planCapture([sq(1, 'frontier'), sq(2, 'heartland')], new Set(), 'korund', 'kindle');
  assert.deepEqual(plan.transfer, [{ x: 1, y: 0, from: 'kindle', to: 'korund' }]); assert.deepEqual(plan.keptPrivate, []);
});

for (const backend of ['sqlite', 'postgres']) test(`a captured city block leaves its Heartland squares with the defender (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close()); r.setNow(DAY1);
  const siege = await r.importModule('lib/siege-actions.ts'), nowS = () => Math.floor(r.now / 1000), run = (sql, ...b) => r.db.prepare(sql).bind(...b).run();
  const declared = nowS() - 5 * D;
  await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,?,?,?,?,?)', 'w1', 'rq-w1', 'pair-w1', 'korund', 'kindle', 'test', declared, declared + 172800, null, null);
  await run("UPDATE world_squares SET zone='frontier', owner='kindle', feature=NULL WHERE x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11");
  await run("UPDATE world_squares SET feature='city' WHERE x=12 AND y=9"); await run("UPDATE world_squares SET zone='heartland' WHERE (x=14 AND y=11) OR (x=10 AND y=7)");
  await run("INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ('city-f1','kindle','Newtown',1,12,9,'kindle-charter','alice','rq-city-f1',1)");
  const assault = (n, at) => { if (at) r.setNow(at); return siege.resolveCityAssault(r.db, { nation: 'korund', warId: 'w1', cityKind: 'founded', cityId: 'city-f1', requestId: `req-assault-${n}` }, nowS(), true); };
  assert.equal((await assault(1)).ok, true);
  const done = await assault(2, DAY1 + D * 1000);
  assert.deepEqual(done.captured, { moved: 23, keptPrivate: 0 }, JSON.stringify(done));
  const own = async (x, y) => (await r.db.prepare('SELECT owner FROM world_squares WHERE x=? AND y=?').bind(x, y).first()).owner;
  assert.deepEqual([await own(14, 11), await own(10, 7), await own(12, 9)], ['kindle', 'kindle', 'korund']);
  assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM city_capture_squares q JOIN world_squares w ON w.x=q.x AND w.y=q.y WHERE w.zone='heartland'").first()).n, 0);
});
