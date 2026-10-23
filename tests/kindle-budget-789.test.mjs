/** #789: Kindle national budget (docs §12.12): read model sums the real ledger in integer minor units; route flag off = 404 with no database read; Kindle only. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
async function taxed(r, id, user, gross, tax, settledAt) {
  await r.db.prepare("INSERT INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at,claimed_at) VALUES (?,?,'harvest','Harvest','food',1,?,?,?)").bind(id, user, settledAt, settledAt, settledAt).run();
  await r.db.prepare('INSERT INTO shift_settlements (shift_id,clerk_user_id,wage_minor,item,quantity,settled_at) VALUES (?,?,?,?,1,?)').bind(id, user, gross, 'food', settledAt).run();
  await r.db.prepare('INSERT INTO shift_income_tax (shift_id,clerk_user_id,gross_minor,tax_minor,rate_percent,settled_at) VALUES (?,?,?,?,15,?)').bind(id, user, gross, tax, settledAt).run();
}

for (const backend of ['sqlite', 'postgres']) {
  test(`readKindleBudget (${backend}): treasury = fund + all tax; today = this game day's tax only; integers; every category "no spending yet"`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const b = await r.importModule('lib/kindle-budget.ts');
    await r.call('citizen', 'alice');
    const now = 1_800_000_000, dayStart = Math.floor(now / 7200) * 7200, iso = s => new Date(s * 1000).toISOString();
    assert.equal(b.gameDayStartIso(now), iso(dayStart));
    const empty = await b.readKindleBudget(r.db, now, 15);
    assert.deepEqual([empty.treasuryMinor, empty.todayTaxMinor], [0, 0]);
    await taxed(r, 'b789-old', 'alice', 1000, 150, iso(dayStart - 1));
    await taxed(r, 'b789-a', 'alice', 2000, 300, iso(dayStart));
    await taxed(r, 'b789-b', 'alice', 333, 49, iso(dayStart + 3600));
    const got = await b.readKindleBudget(r.db, now, 15);
    assert.deepEqual({ ...got, categories: undefined }, { treasuryMinor: 499, todayTaxMinor: 349, gameDayStartsAt: iso(dayStart), ratePercent: 15, rateSource: 'set by the AI Assembly', categories: undefined });
    assert.ok(Number.isSafeInteger(got.treasuryMinor) && Number.isSafeInteger(got.todayTaxMinor));
    assert.deepEqual(got.categories.map(c => c.name), ['Defense', 'Infrastructure', 'Welfare', 'Culture, propaganda and faith', 'Administration', 'Reserves']);
    assert.ok(got.categories.every(c => c.spentMinor === null), 'no made-up spending');
  });

  test(`GET /api/kindle/budget (${backend}): flag off 404 with no database read; on: 401 signed out, 403 outside Kindle, read-only 200 for Kindle`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
    await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
    await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
    for (const flag of [undefined, 'false']) {
      r.setFixtureEnv('HARIMU_KINDLE_BUDGET_VIEW_ENABLED', flag);
      const off = await spy(r, async () => [await r.call('kindle/budget', 'alice'), await r.call('kindle/budget', null)]);
      assert.deepEqual(off.result.map(x => x.status), [404, 404]); assert.deepEqual(off.sql, [], 'flag off opens no database');
    }
    r.setFixtureEnv('HARIMU_KINDLE_BUDGET_VIEW_ENABLED', 'true');
    assert.equal((await r.call('kindle/budget', null)).status, 401);
    assert.equal((await r.call('kindle/budget', 'bob')).status, 403);
    await taxed(r, 'b789-r', 'alice', 1000, 150, new Date(Date.now() - 86_400_000).toISOString());
    const on = await spy(r, () => r.call('kindle/budget', 'alice'));
    assert.equal(on.result.status, 200); assert.ok(on.sql.length > 0 && on.sql.every(q => /^\s*SELECT/i.test(q)), 'read-only');
    assert.equal(on.result.data.budget.treasuryMinor, 150);
  });
}
