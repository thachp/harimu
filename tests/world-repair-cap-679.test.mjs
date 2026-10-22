/** #679: the stability score repair reads at most scoreRepairConcurrency (4) ticks' inputs at once, oldest tick written first, with the same scores. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const inputsSql = /^\s*SELECT\s*\(SELECT COUNT\(\*\) FROM citizens WHERE nation_id=\?\) AS citizens/;

test('#679 score repair of 15 missing ticks keeps at most 4 ticks (12 nation reads) in flight and rewrites every score', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  assert.equal((await r.call('world')).status, 200);
  for (let i = 0; i < 5; i++) { r.setNow(r.now + 6 * 3600000); assert.equal((await r.call('world')).status, 200); }
  const ticks = Number((await r.db.prepare('SELECT COUNT(*) AS n FROM world_ticks').first()).n);
  assert.ok(ticks >= 15, `${ticks} ticks recorded`);
  const before = (await r.db.prepare('SELECT nation_id,tick,stability,unrest FROM nation_stability_scores ORDER BY tick,nation_id').all()).results;
  await r.db.prepare('DELETE FROM nation_stability_scores').run();
  let inFlight = 0, peak = 0, reads = 0;
  const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => {
    const statement = prepare(sql); if (!inputsSql.test(sql)) return statement;
    const wrap = s => new Proxy(s, { get(target, key) {
      const value = target[key]; if (typeof value !== 'function') return value;
      if (key === 'bind') return (...args) => wrap(value.apply(target, args));
      if (key === 'first') return async (...args) => { inFlight++; reads++; peak = Math.max(peak, inFlight);
        try { await new Promise(resolve => setTimeout(resolve, 20)); return await value.apply(target, args); } finally { inFlight--; } };
      return value.bind(target);
    } });
    return wrap(statement);
  };
  try { assert.equal((await r.call('world')).status, 200); } finally { r.db.prepare = prepare; }
  assert.equal(reads, 45, '15 ticks x 3 nations repaired');
  assert.ok(peak <= 12, `peak ${peak} concurrent score-input reads (cap 4 ticks x 3 nations)`);
  assert.ok(peak > 3, `repair still runs ticks concurrently (peak ${peak})`);
  const after = (await r.db.prepare('SELECT nation_id,tick,stability,unrest FROM nation_stability_scores ORDER BY tick,nation_id').all()).results;
  assert.deepEqual(after.filter(row => before.some(b => b.tick === row.tick)).map(row => JSON.stringify(row)), before.filter(row => after.some(a => a.tick === row.tick)).map(row => JSON.stringify(row)));
  assert.equal(after.length, 45);
});
