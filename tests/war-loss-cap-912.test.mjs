/** #912: war hard cap (docs 15.3): a nation loses at most 10% of its frontier squares per real week; Heartland never moves. Flag HARIMU_WAR_LOSS_CAP_ENABLED; flag off the siege capture is unchanged. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400, DAY1 = Date.UTC(2026, 9, 10, 22, 30);
async function setup(t, backend, lossCap) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close()); r.setNow(DAY1);
  const siege = await r.importModule('lib/siege-actions.ts'), cap = await r.importModule('lib/war-loss-cap.ts'), zones = await r.importModule('lib/map-zones.ts');
  // migration 0094: lib/db.ts creates war_capture_refusals with the other schemas
  const nowS = () => Math.floor(r.now / 1000), run = (sql, ...b) => r.db.prepare(sql).bind(...b).run(), one = (sql, ...b) => r.db.prepare(sql).bind(...b).first();
  const declared = nowS() - 5 * D;
  await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,?,?,?,?,?)', 'w1', 'rq-w1', 'pair-w1', 'korund', 'kindle', 'test', declared, declared + 172800, null, null);
  let n = 0;
  const assault = (over = {}, at) => { if (at !== undefined) r.setNow(at); return siege.resolveCityAssault(r.db, { nation: 'korund', warId: 'w1', cityKind: 'outpost', cityId: 'kindle', requestId: `req-assault-${++n}`, ...over }, nowS(), true, lossCap ? { lossCap: true } : {}); };
  const outpost = zones.mvpNations.find(x => x.id === 'kindle').outpost;
  const owner = async (x, y) => (await one('SELECT owner FROM world_squares WHERE x=? AND y=?', x, y)).owner;
  return { r, cap, run, one, assault, outpost, owner, nowS };
}
/** Kindle holds exactly `held` frontier squares now (its outpost included) and lost `lost` more to Korund `ago` seconds before now. */
async function frontier(c, held, lost, ago) {
  const rows = (await c.r.db.prepare("SELECT x,y FROM world_squares WHERE zone='frontier' AND NOT (x=? AND y=?) ORDER BY y,x").bind(c.outpost.x, c.outpost.y).all()).results;
  await c.run("UPDATE world_squares SET owner=NULL WHERE zone='frontier' AND owner='kindle' AND NOT (x=? AND y=?)", c.outpost.x, c.outpost.y);
  for (const s of rows.slice(0, held - 1)) await c.run("UPDATE world_squares SET owner='kindle' WHERE x=? AND y=?", s.x, s.y);
  if (!lost) return;
  const at = c.nowS() - ago;
  await c.run("INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at,captured_at) VALUES ('past','w1','city:past','founded',0,0,'korund','kindle',?,?)", at, at);
  await c.run("INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) VALUES ('cap-past','past','w1','rq-past','korund','kindle',?,0,?)", lost, at);
  for (const s of rows.slice(held - 1, held - 1 + lost)) {
    await c.run("UPDATE world_squares SET owner='korund' WHERE x=? AND y=?", s.x, s.y);
    await c.run("INSERT INTO city_capture_squares (capture_id,x,y,from_nation,to_nation) VALUES ('cap-past',?,?,'kindle','korund')", s.x, s.y);
  }
}
const refusals = c => c.r.db.prepare('SELECT reason,squares,lost_in_window,weekly_limit FROM war_capture_refusals ORDER BY refused_at,id').all().then(x => x.results.map(r => ({ ...r })));

test('the limit is 10% of frontier squares held at the window start, rounded down, minimum 1; Heartland is dropped', async t => {
  const c = await setup(t, 'sqlite', true);
  assert.deepEqual([20, 19, 5, 0].map(c.cap.weeklyLossLimit), [2, 1, 1, 1]);
  const sq = zone => ({ x: 1, y: 1, zone, from: 'kindle', to: 'korund' });
  assert.deepEqual(c.cap.decideCapture([sq('frontier')], 1, 20).ok, true);
  assert.deepEqual(c.cap.decideCapture([sq('frontier')], 2, 20), { ok: false, reason: 'weekly_cap', transfer: [sq('frontier')], heartland: [], lost: 2, limit: 2 });
  assert.deepEqual(c.cap.decideCapture([sq('heartland'), sq('frontier')], 0, 20).heartland, [sq('heartland')]);
});

test('the window is a rolling 168 hours: 7d−1min and 7d−1s count, exactly 7d and 7d+1min do not', async t => {
  const c0 = await setup(t, 'sqlite', true);
  assert.equal(c0.cap.WAR_LOSS_WINDOW_MS, 168 * 3600 * 1000); assert.equal(c0.cap.warLossCap.windowSeconds, 7 * D);
  for (const [ago, counts] of [[7 * D - 60, true], [7 * D - 1, true], [7 * D, false], [7 * D + 60, false]]) {
    const c = await setup(t, 'sqlite', true); await frontier(c, 19, 1, ago);
    assert.equal((await c.cap.frontierLedger(c.r.db, 'kindle', c.nowS())).lost, counts ? 1 : 0, `a loss ${ago}s ago ${counts ? 'counts' : 'does not count'}`);
  }
});

for (const backend of ['sqlite', 'postgres']) {
  test(`20 frontier squares: the 2nd loss in a week lands, the 3rd is refused and logged, and works again after the window rolls (${backend})`, async t => {
    const c = await setup(t, backend, true); await frontier(c, 19, 1, 2 * D);
    { const a = await c.assault(); assert.equal(a.ok, true, JSON.stringify(a)); } const second = await c.assault({}, DAY1 + D * 1000);
    assert.deepEqual(second.captured, { moved: 1, keptPrivate: 0 }, 'one prior loss + this one = 2 of 2');
    assert.equal(await c.owner(c.outpost.x, c.outpost.y), 'korund');

    const d = await setup(t, backend, true); await frontier(d, 18, 2, 2 * D);
    assert.equal((await d.assault()).ok, true); const third = await d.assault({}, DAY1 + D * 1000);
    assert.deepEqual([third.ok, third.status, third.reason], [false, 409, 'weekly_loss_cap'], third.error);
    assert.equal(await d.owner(d.outpost.x, d.outpost.y), 'kindle', 'refused: the square stays with the defender');
    assert.equal((await d.one("SELECT captured_at FROM city_sieges WHERE city_key='outpost:kindle'")).captured_at, null, 'the city stays contested');
    assert.deepEqual(await refusals(d), [{ reason: 'weekly_cap', squares: 1, lost_in_window: 2, weekly_limit: 2 }], 'the refusal is in the war log');
    const later = await d.assault({}, DAY1 + 6 * D * 1000);
    assert.deepEqual(later.captured, { moved: 1, keptPrivate: 0 }, 'after the past losses leave the 7-day window the capture lands');
    assert.equal(await d.owner(d.outpost.x, d.outpost.y), 'korund');
  });

  test(`Heartland squares inside a captured city block never move and are logged; flag off is unchanged (${backend})`, async t => {
    for (const on of [true, false]) {
      const c = await setup(t, backend, on);
      await c.run("UPDATE world_squares SET zone='frontier', owner='kindle', feature=NULL WHERE x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11");
      await c.run("UPDATE world_squares SET feature='city' WHERE x=12 AND y=9"); await c.run("UPDATE world_squares SET zone='heartland' WHERE x=14 AND y=11");
      await c.run("INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES ('city-f1','kindle','Newtown',1,12,9,'kindle-charter','alice','rq-city-f1',1)");
      await c.run("UPDATE world_squares SET owner=NULL WHERE x BETWEEN 10 AND 14 AND y BETWEEN 7 AND 11 AND NOT ((x=12 AND y=9) OR (x=14 AND y=11))"); // one frontier square and one Heartland square in the block
      const cmd = { cityKind: 'founded', cityId: 'city-f1' };
      { const a = await c.assault(cmd); assert.equal(a.ok, true, JSON.stringify(a)); } const done = await c.assault(cmd, DAY1 + D * 1000);
      assert.deepEqual(done.captured, { moved: on ? 1 : 2, keptPrivate: 0 }, JSON.stringify(done));
      assert.equal(await c.owner(14, 11), on ? 'kindle' : 'korund', on ? 'Heartland is immune' : 'flag off: unchanged siege behaviour');
      assert.deepEqual(await refusals(c), on ? [{ reason: 'heartland', squares: 1, lost_in_window: 0, weekly_limit: 1 }] : []);
    }
  });
}

test('flag off: wrangler preview on, production off; migration 0094 matches the schema; the war route passes the flag', async () => {
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  assert.match(await read('../wrangler.jsonc'), /"HARIMU_WAR_LOSS_CAP_ENABLED": "true"/); assert.match(await read('../wrangler.prod.jsonc'), /"HARIMU_WAR_LOSS_CAP_ENABLED": "false"/);
  for (const f of ['../drizzle/0094_war_capture_refusals.sql', '../db/postgres/0094_war_capture_refusals.sql']) assert.match(await read(f), /CREATE TABLE IF NOT EXISTS war_capture_refusals[\s\S]*reason IN \('weekly_cap','heartland'\)/);
  assert.match(await read('../app/api/war/route.ts'), /lossCap: bindings\.HARIMU_WAR_LOSS_CAP_ENABLED === 'true'/);
  assert.match(await read('../lib/war-actions.ts'), /input\.lossCap === true \? \{ lossCap: true \} : \{\}/);
});
