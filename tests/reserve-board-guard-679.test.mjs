/** #679 (QA1 on #837): readReserveBoard starts its latest-row and all-rows reads alongside the seed read, so either can predate a write the seed read saw.
 *  The guard re-reads in serial order when the early latest row is missing, or when the early rows lack it. Each case here fails if its branch is removed. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { priceIndex, sparkConfig } from '../lib/spark-supply-rules.ts';

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const LATEST = /NOT EXISTS \(SELECT 1 FROM spark_issuances n WHERE n\.prev_id = t\.id\)/, ALL = /FROM spark_issuances ORDER BY issued_at, supply_after_minor, id/;

/** A db whose FIRST latest-row and FIRST all-rows reads answer as if they ran before the emergency issuance (or before any row, `beforeSeed`). */
function staleEarly(real, { beforeSeed }) {
  let latestSeen = false, allSeen = false;
  return new Proxy(real, { get(target, key) {
    if (key !== 'prepare') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    return sql => {
      const statement = target.prepare(sql);
      return new Proxy(statement, { get(s, k) {
        const v = s[k]; if (typeof v !== 'function') return v;
        if (k === 'first' && LATEST.test(sql) && !latestSeen) return async (...a) => { latestSeen = true; const row = await v.apply(s, a); return beforeSeed ? null : row; };
        if (k === 'all' && ALL.test(sql) && !allSeen) return async (...a) => { allSeen = true; const out = await v.apply(s, a); return { ...out, results: beforeSeed ? [] : out.results.filter(x => x.id === 'spark-seed') }; };
        return v.bind(s);
      } });
    };
  } });
}

for (const beforeSeed of [true, false]) {
  test(`#679 ${backend}: early reads ${beforeSeed ? 'from before the seed (no latest row)' : 'whose rows lack the latest row'} are re-read in order`, async t => {
    const r = await localRuntime(); t.after(() => r.close());
    r.setFixtureEnv('HARIMU_SPARK_SUPPLY_ENABLED', 'true');
    await r.call('world', null);
    const s = await r.importModule('lib/spark-supply.ts');
    const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
    await r.db.prepare("INSERT INTO spark_issuances VALUES ('spark-seed','spark-seed',1,'seed',0,1000000,0,1000000,'Reserve Board',?,NULL)").bind(epoch + 1).run();
    await r.db.prepare("INSERT INTO spark_issuances VALUES ('e1','e1-guard-679',1,'emergency',1000,100000,1000000,1100000,'Reserve Board',?,'spark-seed')").bind(epoch + 10).run();
    const now = epoch + 10 + 10 * sparkConfig.gameWeekSeconds;
    const fresh = await s.readReserveBoard(r.db, now);
    assert.equal(fresh.moneySupplyMinor, 1100000); assert.ok(fresh.priceIndex > 100, `the issuance moves the index: ${fresh.priceIndex}`);
    const board = await s.readReserveBoard(staleEarly(r.db, { beforeSeed }), now);
    assert.deepEqual(board, fresh, 'the stale early reads are not used');
  });
}

test(`#679 slice 4 ${backend}: a seeded readReserveBoard waits for one sequential round trip (two before the settled-shifts read moved up, #679 slice 4)`, async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_SPARK_SUPPLY_ENABLED', 'true');
  await r.call('world', null);
  const s = await r.importModule('lib/spark-supply.ts');
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  await r.db.prepare("INSERT INTO spark_issuances VALUES ('spark-seed','spark-seed',1,'seed',0,1000000,0,1000000,'Reserve Board',?,NULL)").bind(epoch + 1).run();
  const now = epoch + 3 * sparkConfig.gameWeekSeconds, serial = await s.readReserveBoard(r.db, now);
  const D = 60, real = r.db;
  const slow = new Proxy(real, { get(target, key) {
    if (key !== 'prepare') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    const wrap = st => new Proxy(st, { get(x, k) { const v = x[k]; if (typeof v !== 'function') return v;
      if (k === 'bind') return (...a) => wrap(v.apply(x, a));
      if (['first', 'all', 'run', 'raw'].includes(k)) return async (...a) => { await new Promise(res => setTimeout(res, D)); return v.apply(x, a); };
      return v.bind(x); } });
    return sql => wrap(target.prepare(sql));
  } });
  const started = performance.now(), board = await s.readReserveBoard(slow, now), trips = (performance.now() - started) / D;
  assert.deepEqual(board, serial);
  assert.ok(trips < 1.9, `~${trips.toFixed(1)} round trips`);
});

test(`#679 slice 4 ${backend}: settled shifts spread unevenly across the window give the independently computed Price Index (QA3 on #931)`, async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_SPARK_SUPPLY_ENABLED', 'true');
  await r.call('world', null);
  const s = await r.importModule('lib/spark-supply.ts');
  const W = sparkConfig.gameWeekSeconds, P = sparkConfig.priceWindowWeeks;
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  await r.db.prepare("INSERT INTO spark_issuances VALUES ('spark-seed','spark-seed',1,'seed',0,1000000,0,1000000,'Reserve Board',?,NULL)").bind(epoch + 1).run();
  await r.db.prepare("INSERT INTO spark_issuances VALUES ('e1','e1-slice4-679',1,'emergency',1000,100000,1000000,1100000,'Reserve Board',?,'spark-seed')").bind(epoch + 15 * W + 7).run();
  const nowWeek = P + 3, now = epoch + (nowWeek + 1) * W - 5, firstWeek = nowWeek - P + 1; // now is 5 s before a week boundary
  // Week offsets from the epoch, plus seconds into the week: one before the window, one fetched by the read bound but before the window's first week, the rest uneven.
  const shifts = [[firstWeek - 1, 50], [firstWeek - 1, W - 2], [firstWeek, 10], [firstWeek, 20], [firstWeek, 100], [firstWeek + 6, 30], [nowWeek - 1, 5], [nowWeek - 1, 9], [nowWeek, W - 30]];
  const order = (await r.db.prepare('SELECT id FROM work_orders LIMIT 1').first()).id, joined = new Date((epoch - W) * 1000).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('s4-citizen','kindle','s4-citizen',18,0,'Good standing',?,?)").bind(joined, joined).run();
  let n = 0;
  for (const [week, offset] of shifts) { const id = `s4-${n++}`, at = new Date((epoch + week * W + offset) * 1000).toISOString();
    await r.db.batch([r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, 's4-citizen', order, 'Fixture shift', 'fixture', 4, at, at, at),
      r.db.prepare('INSERT INTO shift_settlements (shift_id, clerk_user_id, wage_minor, item, quantity, settled_at) VALUES (?,?,?,?,?,?)').bind(id, 's4-citizen', 800, 'food', 0, at)]); }
  const weeks = [];
  for (let week = firstWeek; week <= nowWeek; week++) weeks.push({ supply: epoch + (week + 1) * W > epoch + 15 * W + 7 ? 1100000 : 1000000, output: shifts.filter(([w]) => w === week).length });
  const expected = priceIndex(weeks, 1000000);
  assert.notEqual(expected, priceIndex(weeks.map(w => ({ ...w, output: 0 })), 1000000), 'the shifts move the index');
  const board = await s.readReserveBoard(r.db, now);
  assert.equal(board.moneySupplyMinor, 1100000);
  assert.equal(board.priceIndex, expected);
});
