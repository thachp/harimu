/** #1350 (docs §12.12 budget categories; §12.8 Savings Shield "credited ... from the national treasury's welfare line"): the Kindle budget card's
 *  Welfare category shows the paid Dormant Savings Shield credits (cumulative, integer minor units); skipped rows are not spending; zero stays
 *  "no spending yet"; the other five categories stay null; treasury = fund + taxes - Welfare. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
const shield = (r, key, user, credit, status, reason, returnedAt) => r.db.prepare(`INSERT INTO savings_shield_credits
  (absence_key, clerk_user_id, absence_started_at, returned_at, balance_minor, index_start_tenths, index_end_tenths, credit_minor, status, reason)
  VALUES (?, ?, ?, ?, 10000, 1000, 1100, ?, ?, ?)`).bind(key, user, returnedAt - 40 * 86400, returnedAt, credit, status, reason).run();
const spent = budget => Object.fromEntries(budget.categories.map(c => [c.name, c.spentMinor]));
const others = ['Defense', 'Infrastructure', 'Culture, propaganda and faith', 'Administration', 'Reserves'];

for (const backend of ['sqlite', 'postgres']) {
  test(`readKindleBudget (${backend}): Welfare = paid Savings Shield credits (all time); skips excluded; zero is null; others null; treasury nets it`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const b = await r.importModule('lib/kindle-budget.ts');
    await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
    await r.db.prepare("UPDATE economy_funds SET initial_minor = 100000 WHERE id = 'kindle-treasury'").run();
    const now = 1_800_000_000;
    const empty = await b.readKindleBudget(r.db, now, 15);
    assert.equal(spent(empty).Welfare, null, 'nothing paid: no spending yet'); assert.equal(empty.treasuryMinor, 100000);
    for (const [key, reason] of [['s1', 'no_index_rise'], ['s2', 'no_balance'], ['s3', 'treasury_short']]) await shield(r, key, 'alice', 0, 'skipped', reason, now - 100);
    assert.equal(spent(await b.readKindleBudget(r.db, now, 15)).Welfare, null, 'skipped rows are not spending');
    await shield(r, 'p-old', 'alice', 1200, 'paid', 'paid', now - 30 * 86400); // a payout long before this game day still counts
    await shield(r, 'p-new', 'bob', 499, 'paid', 'paid', now - 60);
    const got = await b.readKindleBudget(r.db, now, 15);
    assert.equal(spent(got).Welfare, 1699); assert.ok(Number.isSafeInteger(spent(got).Welfare));
    for (const name of others) assert.equal(spent(got)[name], null, `${name}: no spending yet`);
    assert.deepEqual(got.categories.map(c => c.name), ['Defense', 'Infrastructure', 'Welfare', 'Culture, propaganda and faith', 'Administration', 'Reserves']);
    assert.equal(got.treasuryMinor, 100000 - 1699, 'treasury = fund + taxes - Welfare spent');
    assert.equal(got.todayTaxMinor, 0);
  });

  test(`GET /api/kindle/budget (${backend}): flag off 404 before any database statement; on: Welfare from the ledger, SELECT only`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await r.call('citizen', 'alice');
    await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
    await r.db.prepare("UPDATE economy_funds SET initial_minor = 5000 WHERE id = 'kindle-treasury'").run();
    await shield(r, 'p-route', 'alice', 750, 'paid', 'paid', Math.floor(Date.now() / 1000) - 3600);
    for (const flag of [undefined, 'false']) {
      r.setFixtureEnv('HARIMU_KINDLE_BUDGET_VIEW_ENABLED', flag);
      const off = await spy(r, async () => [await r.call('kindle/budget', 'alice'), await r.call('kindle/budget', null)]);
      assert.deepEqual(off.result.map(x => x.status), [404, 404]); assert.deepEqual(off.sql, [], 'flag off opens no database');
    }
    r.setFixtureEnv('HARIMU_KINDLE_BUDGET_VIEW_ENABLED', 'true');
    const on = await spy(r, () => r.call('kindle/budget', 'alice'));
    assert.equal(on.result.status, 200); assert.ok(on.sql.every(q => /^\s*SELECT/i.test(q)), 'read-only');
    assert.equal(spent(on.result.data.budget).Welfare, 750); assert.equal(on.result.data.budget.treasuryMinor, 4250);
    for (const name of others) assert.equal(spent(on.result.data.budget)[name], null);
  });
}

test('KindleBudgetView renders Welfare spending as SPK and the other categories as "no spending yet"', async () => {
  const [{ readFile }, { createRequire }, React, { renderToStaticMarkup }, ts] = await Promise.all([import('node:fs/promises'), import('node:module'), import('react'), import('react-dom/server'), import('typescript')]);
  const require = createRequire(import.meta.url);
  const compiled = ts.default.transpileModule(await readFile(new URL('../app/kindle-budget-card.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.default.JsxEmit.ReactJSX, module: ts.default.ModuleKind.CommonJS } }).outputText;
  const exports = {}; new Function('exports', 'require', compiled)(exports, id => require(id));
  const categories = ['Defense', 'Infrastructure', 'Welfare', 'Culture, propaganda and faith', 'Administration', 'Reserves'].map(name => ({ name, spentMinor: name === 'Welfare' ? 1699 : null }));
  const html = renderToStaticMarkup(React.default.createElement(exports.KindleBudgetView, { budget: { treasuryMinor: 98301, todayTaxMinor: 0, ratePercent: 15, rateSource: 'set by the AI Assembly', gameDayStartsAt: '2027-01-15T08:00:00.000Z', categories } }));
  assert.ok(html.includes('<li>Welfare: 16.99 SPK</li>'));
  assert.equal(html.match(/: no spending yet<\/li>/g).length, 5);
});
