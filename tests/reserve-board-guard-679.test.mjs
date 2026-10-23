/** #679 (QA1 on #837): readReserveBoard starts its latest-row and all-rows reads alongside the seed read, so either can predate a write the seed read saw.
 *  The guard re-reads in serial order when the early latest row is missing, or when the early rows lack it. Each case here fails if its branch is removed. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { sparkConfig } from '../lib/spark-supply-rules.ts';

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
