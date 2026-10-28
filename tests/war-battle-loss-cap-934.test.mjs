/** #934: battle square transfers use the same weekly-cap guard as siege (#912). #910 does not capture; this exercises `transferBattleSquares` directly. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400, DAY1 = Date.UTC(2026, 9, 10, 22, 30);

async function setup(t, backend) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close()); r.setNow(DAY1);
  const battle = await r.importModule('lib/army-battle.ts'), cap = await r.importModule('lib/war-loss-cap.ts');
  const nowS = () => Math.floor(r.now / 1000), run = (sql, ...b) => r.db.prepare(sql).bind(...b).run(), one = (sql, ...b) => r.db.prepare(sql).bind(...b).first();
  const declared = nowS() - 5 * D;
  await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,?,?,?,?,?)', 'w1', 'rq-w1', 'pair-w1', 'korund', 'kindle', 'test', declared, declared + 172800, null, null);
  return { r, battle, cap, run, one, nowS };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`battle transfer: under the weekly cap the frontier square moves; over the cap it refuses and logs (${backend})`, async t => {
    const c = await setup(t, backend);
    // Give Kindle exactly 10 frontier squares (weekly limit 1).
    await c.run("UPDATE world_squares SET owner=NULL WHERE zone='frontier'");
    const sq = (await c.r.db.prepare("SELECT x,y FROM world_squares WHERE zone='frontier' ORDER BY y,x LIMIT 10").all()).results;
    assert.ok(sq.length >= 10);
    for (const s of sq) await c.run("UPDATE world_squares SET owner='kindle' WHERE x=? AND y=?", s.x, s.y);

    const ok = await c.battle.transferBattleSquares(c.r.db, { warId: 'w1', battleKey: 'b1', requestId: 'req-battle-1', attacker: 'korund', defender: 'kindle', now: c.nowS(), squares: [{ x: sq[0].x, y: sq[0].y }] });
    assert.deepEqual(ok, { ok: true, moved: 1 });
    assert.equal((await c.one('SELECT owner FROM world_squares WHERE x=? AND y=?', sq[0].x, sq[0].y)).owner, 'korund');

    const refused = await c.battle.transferBattleSquares(c.r.db, { warId: 'w1', battleKey: 'b2', requestId: 'req-battle-2', attacker: 'korund', defender: 'kindle', now: c.nowS(), squares: [{ x: sq[1].x, y: sq[1].y }] });
    assert.equal(refused.ok, false); assert.equal(refused.reason, 'weekly_loss_cap');
    assert.equal((await c.one('SELECT owner FROM world_squares WHERE x=? AND y=?', sq[1].x, sq[1].y)).owner, 'kindle');
    assert.equal((await c.one("SELECT COUNT(*) AS n FROM war_capture_refusals WHERE battle_key='b2' AND reason='weekly_cap'")).n, 1);
    // replay same request: still one refusal row
    await c.battle.transferBattleSquares(c.r.db, { warId: 'w1', battleKey: 'b2', requestId: 'req-battle-2', attacker: 'korund', defender: 'kindle', now: c.nowS(), squares: [{ x: sq[1].x, y: sq[1].y }] });
    assert.equal((await c.one("SELECT COUNT(*) AS n FROM war_capture_refusals WHERE battle_key='b2'")).n, 1);
  });

  test(`battle transfer: Heartland never moves (${backend})`, async t => {
    const c = await setup(t, backend);
    await c.run("UPDATE world_squares SET zone='heartland', owner='kindle' WHERE x=12 AND y=9");
    const res = await c.battle.transferBattleSquares(c.r.db, { warId: 'w1', battleKey: 'b-hl', requestId: 'req-battle-hl', attacker: 'korund', defender: 'kindle', now: c.nowS(), squares: [{ x: 12, y: 9 }] });
    assert.deepEqual(res, { ok: false, reason: 'nothing' });
    assert.equal((await c.one('SELECT owner FROM world_squares WHERE x=12 AND y=9')).owner, 'kindle');
    assert.equal((await c.one("SELECT COUNT(*) AS n FROM war_capture_refusals WHERE battle_key='b-hl' AND reason='heartland'")).n, 1);
  });
}

test('#910 battles still never rewrite squares themselves; the #934 hook is transferBattleSquares', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../lib/army-battle.ts', import.meta.url), 'utf8');
  assert.match(src, /export \{ transferBattleSquares \} from '\.\/war-loss-cap'/);
  assert.doesNotMatch(src, /UPDATE world_squares|DELETE FROM world_squares/);
});
