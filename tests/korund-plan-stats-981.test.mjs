/** #981 Korund State Media plan stats from the weekly food quota, behind HARIMU_KORUND_PLAN_STATS_ENABLED.
 *  Derived on read: no table, no migration. Flag off: the news edition is unchanged. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { korundWeeklyQuotaFood } from '../lib/korund-coupons.ts';
import { korundPlanStatLine, korundPlanWeekSeconds, korundPlanWindow, planFulfilmentPercent } from '../lib/korund-plan-stats.ts';

const W = 50400;
const digits = text => [...text.matchAll(/\d+/g)].map(match => Number(match[0]));

test('percent math: half-up rounding, zero output, and no percent for a zero or negative target', () => {
  assert.equal(korundPlanWeekSeconds, W);
  assert.equal(planFulfilmentPercent(0, 40), 0);
  assert.equal(planFulfilmentPercent(40, 40), 100);
  assert.equal(planFulfilmentPercent(45, 40), 113, '112.5 rounds half up, not toward 112');
  assert.equal(planFulfilmentPercent(35, 40), 88, '87.5 rounds half up, not down');
  assert.equal(planFulfilmentPercent(1, 8), 13);
  assert.equal(planFulfilmentPercent(52, 40), 130);
  assert.equal(planFulfilmentPercent(10, 0), null);
  assert.equal(planFulfilmentPercent(0, 0), null);
  assert.equal(planFulfilmentPercent(10, -5), null);
  assert.equal(planFulfilmentPercent(-1, 40), null);
  assert.equal(planFulfilmentPercent(1.5, 40), null, 'a non-integer output is not a stored food total');
  assert.equal(korundPlanStatLine(45, 0), null);
  assert.equal(korundPlanStatLine(45, 40), 'Food output 113% of plan!');
  assert.equal(korundPlanStatLine(35, 40), 'Food brigades press on: 88% of plan');
  assert.equal(korundPlanStatLine(0, 40), 'Food brigades press on: 0% of plan');
  assert.equal(korundPlanStatLine(40, korundWeeklyQuotaFood), 'Food output 100% of plan!');
  assert.deepEqual(digits(korundPlanStatLine(45, 40)), [113]);
  assert.deepEqual(digits(korundPlanStatLine(35, 40)), [88]);
  assert.deepEqual(digits(korundPlanStatLine(0, 40)), [0]);
});

test('the open week is half-open and matches the quota week length', () => {
  const epoch = 1_700_000_000;
  assert.deepEqual(korundPlanWindow(epoch, epoch), { week: 1, start: epoch, end: epoch + W });
  assert.equal(korundPlanWindow(epoch, epoch + W - 1).week, 1);
  assert.deepEqual(korundPlanWindow(epoch, epoch + W), { week: 2, start: epoch + W, end: epoch + 2 * W });
  assert.equal(korundPlanWindow(Number.NaN, 7200).start, 7200, 'missing epoch uses the tick-aligned fallback');
});

async function setup(t, on) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  r.setFixtureEnv('HARIMU_KORUND_PLAN_STATS_ENABLED', on ? 'true' : undefined);
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  return { r, epoch };
}
async function settle(r, user, at, shifts) {
  for (let i = 0; i < shifts; i++) {
    const id = randomUUID(), iso = new Date((at + i) * 1000).toISOString();
    await r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, user, 'aurelle-food-estate', 'Korund fixture', '4 state food', 4, iso, iso, iso).run();
    await r.db.prepare('INSERT INTO korund_settlements(shift_id,clerk_user_id,wage_minor,food_output,settled_at) VALUES (?,?,800,4,?)').bind(id, user, at + i).run();
  }
}
const news = (r, user = 'alice') => r.call('news', user);
async function sqlDuring(r, fn) {
  const seen = [], prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { seen.push(sql.replace(/\s+/g, ' ').trim()); return prepare(sql); };
  try { await fn(); } finally { r.db.prepare = prepare; }
  return seen;
}
const isPlanQuery = sql => /AS plan_food FROM korund_settlements/.test(sql);
const isWrite = sql => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);

test('flag on: the State Media line equals this week\'s stored food quota, not another week or the lifetime total', async t => {
  const { r, epoch } = await setup(t, true);
  r.setNow((epoch + 1000) * 1000);
  assert.equal((await news(r)).data.planStat.line, 'Food brigades press on: 0% of plan');
  await settle(r, 'alice', epoch + 100, 2); await settle(r, 'bob', epoch + 200, 9); // unit 44 of 40
  const edition = (await news(r)).data;
  const ledger = Number((await r.db.prepare('SELECT COALESCE(SUM(food_output),0) AS n FROM korund_settlements WHERE settled_at>=? AND settled_at<?').bind(epoch, epoch + W).first()).n);
  const percent = Math.round(ledger * 100 / korundWeeklyQuotaFood);
  assert.equal(ledger, 44); assert.equal(percent, 110);
  assert.deepEqual(edition.planStat, { resource: 'food', output: ledger, target: korundWeeklyQuotaFood, percent, line: `Food output ${percent}% of plan!` });
  assert.deepEqual(digits(edition.planStat.line), [percent]);
  assert.equal((await news(r, 'bob')).data.planStat.line, edition.planStat.line, 'the whole unit shares one line');
  r.setNow((epoch + W + 50) * 1000);
  const next = (await news(r)).data;
  assert.equal(next.statistics.food, 44, 'lifetime food is unchanged');
  assert.equal(next.planStat.output, 0); assert.equal(next.planStat.line, 'Food brigades press on: 0% of plan', 'an empty open week does not reuse last week');
  await settle(r, 'alice', epoch + W, 1); await settle(r, 'bob', epoch + 2 * W, 3); // week 2 gets the boundary shift only
  const boundary = (await news(r)).data.planStat;
  assert.equal(boundary.output, 4); assert.equal(boundary.percent, 10); assert.equal(boundary.line, 'Food brigades press on: 10% of plan');
  const sql = await sqlDuring(r, async () => { for (let i = 0; i < 2; i++) await news(r); });
  assert.ok(sql.some(isPlanQuery)); assert.deepEqual(sql.filter(isWrite), []);
});

test('flag off: no plan stat and no quota read, and the article list matches the flag-on edition', async t => {
  const on = await setup(t, true);
  await settle(on.r, 'alice', on.epoch + 100, 2); await settle(on.r, 'bob', on.epoch + 200, 9);
  on.r.setNow((on.epoch + 1000) * 1000);
  const enabled = await news(on.r);
  assert.match(enabled.data.planStat.line, /^Food output 110% of plan!$/);
  const off = await setup(t, false);
  await settle(off.r, 'alice', off.epoch + 100, 2); await settle(off.r, 'bob', off.epoch + 200, 9);
  off.r.setNow((off.epoch + 1000) * 1000);
  const unset = await news(off.r);
  assert.equal('planStat' in unset.data, false);
  assert.equal((await sqlDuring(off.r, () => news(off.r))).filter(isPlanQuery).length, 0);
  off.r.setFixtureEnv('HARIMU_KORUND_PLAN_STATS_ENABLED', 'false');
  const explicit = await news(off.r);
  assert.deepEqual(explicit.data.items, unset.data.items);
  assert.equal('planStat' in explicit.data, false);
  assert.deepEqual(enabled.data.items.map(item => item.id), unset.data.items.map(item => item.id), 'the stat is a widget, not an extra article');
  off.r.setFixtureEnv('HARIMU_KORUND_PLAN_STATS_ENABLED', 'true');
  await off.r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  const kindle = await news(off.r);
  assert.equal(kindle.data.nationId, 'kindle'); assert.equal('planStat' in kindle.data, false);
  assert.equal((await sqlDuring(off.r, () => news(off.r))).filter(isPlanQuery).length, 0);
});

test('the edition shows the server line only, with no hard-coded percent', async () => {
  const panel = await readFile(new URL('../app/national-news.tsx', import.meta.url), 'utf8');
  assert.match(panel, /\{news\.planStat && <p className="news-plan-stat"/);
  assert.match(panel, /\{news\.planStat\.line\}/);
  assert.doesNotMatch(panel, /% of plan|planStat\.percent|planStat\.output/);
  assert.match(await readFile(new URL('../lib/korund.ts', import.meta.url), 'utf8'), /export const gameWeekSeconds = 50400/);
});
