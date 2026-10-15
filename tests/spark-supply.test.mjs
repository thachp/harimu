/** #431: Kindle Spark money supply and Price Index PoC behind HARIMU_SPARK_SUPPLY_ENABLED. Caps, Charter Limit, seeded Reserve Board rule, derived Price Index, flag off is a no-op. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { localRuntime } from './helpers/local-runtime.mjs';
import { charterMonthCap, charterYearCap, gameMonth, gameYearOfMonth, issuanceAmount, issuanceBpOk, priceIndex, reserveBoardPick, sparkConfig } from '../lib/spark-supply-rules.ts';

const MONTH = sparkConfig.gameMonthSeconds, WEEK = sparkConfig.gameWeekSeconds;

test('pure rules: the docs caps (3% normal, 10% emergency, Charter 15% a month and 30% a year), months, floor rounding', () => {
  assert.deepEqual([sparkConfig.normalCapBp, sparkConfig.emergencyCapBp, sparkConfig.charterMonthBp, sparkConfig.charterYearBp], [300, 1000, 1500, 3000]);
  assert.equal(MONTH, 30 * 7200, 'placeholder: a game month is 30 game days and a game day is 7200 real seconds (12x time)');
  assert.equal(issuanceBpOk('normal', 0), true); assert.equal(issuanceBpOk('normal', 300), true);
  for (const bad of [301, -1, 1.5, '100', null, NaN]) assert.equal(issuanceBpOk('normal', bad), false, String(bad));
  assert.equal(issuanceBpOk('emergency', 1000), true); assert.equal(issuanceBpOk('emergency', 1001), false); assert.equal(issuanceBpOk('emergency', 0), false);
  assert.equal(issuanceBpOk('bogus', 100), false);
  assert.equal(issuanceAmount(1000001, 300), 30000, 'rounded down, never past the cap'); assert.equal(issuanceAmount(99, 100), 0);
  assert.equal(charterMonthCap(10000), 1500); assert.equal(charterYearCap(10000), 3000);
  assert.equal(gameMonth(0, 0), 1); assert.equal(gameMonth(MONTH - 1, 0), 1); assert.equal(gameMonth(MONTH, 0), 2); assert.equal(gameYearOfMonth(12), 1); assert.equal(gameYearOfMonth(13), 2);
  for (let month = 1; month <= 300; month++) { const bp = reserveBoardPick(month); assert.ok(Number.isInteger(bp) && bp >= 0 && bp <= 300, `month ${month}`); assert.equal(bp, reserveBoardPick(month)); }
  assert.ok(new Set([...Array(60).keys()].map(i => reserveBoardPick(i + 1))).size > 10, 'the seeded rule varies');
});

test('Price Index: flat at 100 for a steady economy, drifts toward supply/output with a lag, and slumps push prices up', () => {
  const steady = Array.from({ length: 10 }, () => ({ supply: 1000, output: 5 }));
  assert.equal(priceIndex(steady, 1000), 100); assert.equal(priceIndex([], 1000), 100); assert.equal(priceIndex(steady, 0), 100);
  const printed = Array.from({ length: 10 }, () => ({ supply: 1100, output: 5 }));
  const one = priceIndex(printed.slice(0, 1), 1000), three = priceIndex(printed.slice(0, 3), 1000), ten = priceIndex(printed, 1000);
  assert.ok(one > 100 && one < 110, `lags: ${one}`); assert.ok(one < three && three < ten && ten < 110, `${one} ${three} ${ten}`);
  assert.equal(one, 103.3, 'one game week closes a third of the gap (3 week lag)');
  const slump = [...Array.from({ length: 8 }, () => ({ supply: 1000, output: 10 })), { supply: 1000, output: 0 }, { supply: 1000, output: 0 }];
  assert.ok(priceIndex(slump, 1000) > 100, 'less real output with the same money pushes the index up');
  assert.equal(priceIndex(steady, 1000), priceIndex(steady, 1000));
});

test('the flag defaults to "false", migration 0043 only adds a table, and no route or page can issue Spark', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_SPARK_SUPPLY_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
  for (const file of ['../drizzle/0043_spark_issuances.sql', '../db/postgres/0043_spark_issuances.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i, file); assert.match(sql, /CREATE TABLE IF NOT EXISTS spark_issuances/);
  }
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)]))).flat();
  for (const file of await walk(new URL('../app/', import.meta.url))) if (/\.(ts|tsx)$/.test(file.pathname)) assert.doesNotMatch(await readFile(file, 'utf8'), /issueSpark|runSparkCron|spark_issuances/, file.pathname);
  const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');
  assert.match(entry, /async scheduled\(/); assert.match(entry, /runSparkCron\(/);
  const sim = await readFile(new URL('../lib/world-simulation.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(sim, /runSparkCron|issueSpark/, 'the request-driven world tick never issues Spark');
});

async function setup(t, { flag = true } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  if (flag) r.setFixtureEnv('HARIMU_SPARK_SUPPLY_ENABLED', 'true');
  await r.call('world', null);
  const s = await r.importModule('lib/spark-supply.ts');
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  const rows = async () => (await r.db.prepare('SELECT * FROM spark_issuances ORDER BY game_month, supply_after_minor, issued_at, id').all()).results.map(x => ({ ...x }));
  const issue = (route, basisPoints, now, over = {}) => s.issueSpark(r.db, { requestId: randomUUID(), route, basisPoints, ...over }, now, { enabled: flag });
  return { r, s, epoch, rows, issue };
}
/** Put a known 1,000,000 minor Spark in the Kindle treasury so every figure below is exact. */
const fund = async r => { await r.db.prepare("INSERT INTO economy_funds (id, initial_minor) VALUES ('kindle-treasury', 1000000) ON CONFLICT(id) DO UPDATE SET initial_minor = 1000000").run(); };

test('flag off: nothing is issued, read or shown, and the world payload is unchanged', async t => {
  const { r, s, epoch, rows, issue } = await setup(t, { flag: false });
  const res = await issue('normal', 100, epoch + 1); assert.equal(res.ok, false); assert.equal(res.reason, 'disabled');
  assert.deepEqual(await s.runSparkCron(r.db, epoch + MONTH * 3, { enabled: false }), { status: 'disabled' });
  assert.deepEqual(await rows(), []);
  assert.equal('reserve' in (await r.call('world', null)).data.simulation, false);
  assert.equal('reserve' in (await r.call('citizen', 'alice')).data.simulation, false);
  await r.db.prepare("INSERT INTO spark_issuances VALUES ('spark-seed','spark-seed',1,'seed',0,1000,0,1000,'Reserve Board',1,NULL)").run();
  assert.equal('reserve' in (await r.call('world', null)).data.simulation, false, 'an old row cannot show up either');
});

test('the Reserve Board seeds the supply once from Kindle wallets plus the treasury and issues up to 3% once per game month', async t => {
  const { r, s, epoch, rows, issue } = await setup(t); await fund(r);
  const before = await s.readReserveBoard(r.db, epoch + 10);
  assert.ok(before.moneySupplyMinor >= 1000000); assert.equal(before.priceIndex, 100); assert.equal(before.lastIssuance, null);
  assert.deepEqual(await rows(), [], 'a read never writes');
  const first = await issue('normal', 300, epoch + 100); assert.equal(first.ok, true);
  const seed = (await rows())[0]; assert.equal(seed.id, 'spark-seed'); assert.equal(seed.route, 'seed'); assert.equal(seed.amount_minor, before.moneySupplyMinor);
  assert.equal(first.issuance.amountMinor, Math.floor(before.moneySupplyMinor * 0.03)); assert.equal(first.issuance.supplyAfterMinor, before.moneySupplyMinor + first.issuance.amountMinor);
  const again = await issue('normal', 100, epoch + 200); assert.equal(again.ok, false); assert.equal(again.status, 409); assert.equal(again.reason, 'already_issued_this_month');
  const next = await issue('normal', 300, epoch + MONTH + 5); assert.equal(next.ok, true); assert.equal(next.issuance.gameMonth, 2);
  assert.equal(next.issuance.supplyBeforeMinor, first.issuance.supplyAfterMinor, 'the next month compounds on the new supply');
  assert.equal((await rows()).length, 3);
  const board = await s.readReserveBoard(r.db, epoch + MONTH + 10);
  assert.equal(board.moneySupplyMinor, next.issuance.supplyAfterMinor); assert.equal(board.lastIssuance.amountMinor, next.issuance.amountMinor); assert.equal(board.lastIssuance.gameMonth, 2);
});

test('over the route cap, bad ids and bad routes are rejected and write nothing', async t => {
  const { r, epoch, rows, issue } = await setup(t); await fund(r);
  for (const bad of [301, 1000, -1, 1.5]) { const res = await issue('normal', bad, epoch + 1); assert.equal(res.ok, false); assert.equal(res.status, 400, String(bad)); assert.equal(res.reason, 'over_cap'); }
  assert.equal((await issue('emergency', 1001, epoch + 1)).reason, 'over_cap'); assert.equal((await issue('emergency', 0, epoch + 1)).reason, 'over_cap');
  assert.equal((await issue('bogus', 100, epoch + 1)).reason, 'bad_route');
  assert.equal((await issue('normal', 100, epoch + 1, { requestId: 'short' })).reason, 'bad_request');
  assert.equal((await issue('normal', 100, epoch + 1, { issuedBy: '' })).reason, 'bad_request');
  assert.deepEqual(await rows(), []);
  await assert.rejects(r.db.prepare("INSERT INTO spark_issuances VALUES ('x','x-xxxxxxxx',1,'normal',301,1,1,2,'b',1,'spark-seed')").run(), 'the table itself refuses a normal issuance over 3%');
});

test('Charter Limit: no mix of routes passes 15% in a game month or 30% in a game year; over it nothing is written', async t => {
  const { r, s, epoch, rows, issue } = await setup(t); await fund(r);
  const start = (await s.readReserveBoard(r.db, epoch + 1)).moneySupplyMinor;
  assert.equal((await issue('normal', 300, epoch + 10)).ok, true);                 // 3% (month 1)
  const e1 = await issue('emergency', 1000, epoch + 20); assert.equal(e1.ok, true);   // +10% of the new supply
  const over = await issue('emergency', 1000, epoch + 30);                            // would pass 15% of the month-start supply
  assert.equal(over.ok, false); assert.equal(over.status, 409); assert.equal(over.reason, 'charter_limit');
  const month1 = (await rows()).filter(x => x.route !== 'seed' && x.game_month === 1).reduce((a, x) => a + x.amount_minor, 0);
  assert.ok(month1 <= Math.floor(start * 0.15), `${month1} <= 15% of ${start}`);
  assert.equal((await issue('emergency', 100, epoch + 31)).ok, true, 'a small one still fits inside the limit');
  // Year: spend 10% in three more months (month 2, 3) until the 30% year ceiling stops it.
  let year = (await rows()).filter(x => x.route !== 'seed').reduce((a, x) => a + x.amount_minor, 0), refused = null;
  for (let month = 2; month <= 12 && !refused; month++) { const res = await issue('emergency', 1000, epoch + (month - 1) * MONTH + 5); if (res.ok) year += res.issuance.amountMinor; else refused = res; }
  assert.ok(refused, 'the year ceiling eventually refuses'); assert.equal(refused.reason, 'charter_limit');
  assert.ok(year <= Math.floor(start * 0.30), `${year} <= 30% of ${start}`);
  const rowsNow = await rows(), count = rowsNow.length;
  assert.equal((await issue('emergency', 1000, epoch + 11 * MONTH + 9)).ok, false); assert.equal((await rows()).length, count);
  // The next game year starts fresh against its own opening supply.
  assert.equal((await issue('emergency', 1000, epoch + 12 * MONTH + 5)).ok, true);
});

test('racing issuances cannot pass the Charter Limit together', async t => {
  const { r, epoch, rows, issue } = await setup(t); await fund(r);
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => issue('emergency', 1000, epoch + 50 + i)));
  const ok = results.filter(x => x.ok).length;
  assert.ok(ok >= 1 && ok <= 2, `10% fits once or twice under 15% but never five times: ${ok}`);
  const total = (await rows()).filter(x => x.route !== 'seed').reduce((a, x) => a + x.amount_minor, 0), seed = (await rows())[0].amount_minor;
  assert.ok(total <= Math.floor(seed * 0.15), `${total} <= 15% of ${seed}`);
});

test('idempotent receipts: one request id replays, a different issuance on it is request_reused (even concurrently)', async t => {
  const { epoch, rows, issue } = await setup(t, {}).then(async x => { await fund(x.r); return x; });
  const requestId = randomUUID(), at = epoch + 100;
  const first = await issue('normal', 200, at, { requestId }); assert.equal(first.ok, true);
  const replay = await issue('normal', 200, at + 5, { requestId }); assert.equal(replay.ok, true); assert.equal(replay.replay, true);
  assert.equal((await rows()).length, 2);
  assert.equal((await issue('normal', 100, at + 6, { requestId })).reason, 'request_reused');
  const racing = randomUUID(), results = await Promise.all([issue('emergency', 100, at + MONTH, { requestId: racing }), issue('emergency', 200, at + MONTH, { requestId: racing })]);
  assert.equal(results.filter(x => x.ok).length, 1, JSON.stringify(results)); assert.equal(results.find(x => !x.ok).reason, 'request_reused');
  assert.equal((await rows()).filter(x => x.request_id === racing).length, 1);
});

test('the scheduled Reserve Board issues its seeded 0-3% once per game month, never twice, and only when the flag is on', async t => {
  const { r, s, epoch, rows } = await setup(t); await fund(r);
  const first = await s.runSparkCron(r.db, epoch + 500, { enabled: true });
  assert.equal(first.status, 'issued'); assert.equal(first.issuance.basisPoints, reserveBoardPick(1)); assert.equal(first.issuance.route, 'normal'); assert.equal(first.issuance.issuedBy, 'Reserve Board');
  assert.deepEqual(await s.runSparkCron(r.db, epoch + 900, { enabled: true }), { status: 'idle' }, 'same game month');
  await Promise.all([s.runSparkCron(r.db, epoch + MONTH + 1, { enabled: true }), s.runSparkCron(r.db, epoch + MONTH + 2, { enabled: true })]);
  const normal = (await rows()).filter(x => x.route === 'normal'); assert.deepEqual(normal.map(x => x.game_month), [1, 2]);
  for (const month of [3, 4, 5, 6]) await s.runSparkCron(r.db, epoch + (month - 1) * MONTH + 1, { enabled: true });
  for (const row of (await rows()).filter(x => x.route === 'normal')) assert.ok(row.basis_points <= 300 && row.amount_minor <= Math.floor(row.supply_before_minor * 0.03));
});

test('the Price Index follows the supply with a lag and is shown through the world payload and the Reserve Board line (#460 copy)', async t => {
  const { r, s, epoch, issue } = await setup(t); await fund(r);
  assert.equal((await issue('emergency', 1000, epoch + 10)).ok, true);
  const soon = await s.readReserveBoard(r.db, epoch + 10 + WEEK), later = await s.readReserveBoard(r.db, epoch + 10 + 10 * WEEK);
  assert.ok(soon.priceIndex > 100 && later.priceIndex > soon.priceIndex && later.priceIndex <= 110.5, `${soon.priceIndex} ${later.priceIndex}`);
  const world = (await r.call('world', null)).data.simulation;
  assert.equal(typeof world.reserve.moneySupplyMinor, 'number'); assert.equal(typeof world.reserve.priceIndex, 'number');
  assert.equal(world.reserve.lastIssuance.route, 'emergency');
  const view = await r.importModule('lib/reserve-board-view.ts'), copy = await r.importModule('lib/reserve-board-copy.ts');
  const lines = view.reserveBoardRows({ moneySupplyMinor: 1234567, lastIssuance: { gameMonth: 2, route: 'normal', amountMinor: 3000, issuedAt: 1 }, priceIndex: 101.25 });
  assert.deepEqual(lines.rows, ['Money supply: 12345.67 SPK', 'Last issuance: +30.00 SPK', 'Price Index: 101.3']);
  assert.equal(lines.header, copy.reserveBoardLine.header); assert.equal(lines.caption, copy.reserveBoardLine.caption.text);
  assert.equal(view.reserveBoardRows({ moneySupplyMinor: 5, lastIssuance: null, priceIndex: 100 }).rows[1], 'Last issuance: none');
  for (const row of lines.rows) assert.ok(row.length <= copy.RESERVE_LINE_MAX);
});
