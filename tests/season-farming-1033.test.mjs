/** #1033: docs §17.1 seasons change farming shift output. Flag HARIMU_SEASON_FARMING_ENABLED, packed in HARIMU_GRAY_PACK.
 *  Flag off: the same units and the same result line. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { flagOn } from '../lib/flag-pack.mjs';
import { gameSeasonAt, seasonLengthMs } from '../lib/game-season.ts';
import { farmingShiftYield, isFarmingShift, seasonAt, seasonEffectLine, seasonFarmingEnabled, seasonYieldPercents, seasonYieldUnits, storedFoodUnits } from '../lib/season-yield.ts';

const require = createRequire(import.meta.url);
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const SEASON = 7.5 * 86400;
const setSeason = (r, index) => r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind(Math.floor(r.now / 1000) - index * SEASON).run();

test('each season multiplier floors, and 1 unit is the floor', () => {
  assert.deepEqual(seasonYieldPercents, { spring: 100, summer: 110, autumn: 120, winter: 70 });
  assert.deepEqual(['spring', 'summer', 'autumn', 'winter'].map(s => seasonYieldUnits(10, s)), [10, 11, 12, 7]);
  assert.equal(seasonYieldUnits(4, 'autumn'), Math.max(1, Math.floor(4 * 120 / 100)));
  assert.equal(seasonYieldUnits(4, 'winter'), 2);
  assert.equal(seasonYieldUnits(1, 'winter'), 1);
  assert.equal(seasonEffectLine('winter'), 'Winter: −30% harvest');
  assert.equal(seasonEffectLine('autumn'), 'Autumn: +20% harvest');
  assert.equal(storedFoodUnits('4 food contributed to state ration supply', 4), null);
  assert.equal(storedFoodUnits('2 food contributed to state ration supply · Winter: −30% harvest', 4), 2);
  for (const id of ['harvest', 'korund-food-production', 'aurelle-food-estate']) assert.equal(isFarmingShift(id), true);
  for (const id of ['orchard', 'herding', 'freight', 'korund-quarry-gang', 'aurelle-quarry-charter']) assert.equal(isFarmingShift(id), false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_SEASON_FARMING_ENABLED, undefined, 'not its own text binding');
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_SEASON_FARMING_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_SEASON_FARMING_ENABLED, 'false');
  assert.equal(seasonFarmingEnabled({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_SEASON_FARMING_ENABLED'), false);
  assert.equal(seasonFarmingEnabled({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_SEASON_FARMING_ENABLED: 'false' }), false, 'a direct string wins');
});

test('flag off: farming output is unchanged', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const start = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  const shift = start.data.shifts[0];
  assert.equal(shift.output, '480 food contributed to the savanna harvest');
  assert.equal(shift.rewardQuantity, 4);
  r.setNow(Date.parse(shift.completesAt));
  assert.equal((await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id })).status, 200);
  assert.equal(Number((await r.db.prepare('SELECT quantity FROM shift_settlements WHERE shift_id=?').bind(shift.id).first()).quantity), 4);
});

test('flag on: a winter-start farming shift pays less than an autumn-start one; other jobs do not change', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_SEASON_FARMING_ENABLED', 'true');
  const paid = async user => {
    const start = await r.call('citizen', user, { action: 'commit-work', workOrderId: 'harvest' });
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const shift = start.data.shifts[0];
    r.setNow(Date.parse(shift.completesAt));
    assert.equal((await r.call('citizen', user, { action: 'claim-work', shiftId: shift.id })).status, 200);
    return { output: shift.output, qty: Number((await r.db.prepare('SELECT quantity FROM shift_settlements WHERE shift_id=?').bind(shift.id).first()).quantity), wage: Number((await r.db.prepare('SELECT wage_minor FROM shift_settlements WHERE shift_id=?').bind(shift.id).first()).wage_minor) };
  };
  await setSeason(r, 2);
  const autumn = await paid('alice');
  await setSeason(r, 3);
  const winter = await paid('bob');
  assert.ok(winter.qty < autumn.qty, `${winter.qty} vs ${autumn.qty}`);
  assert.equal(winter.qty, 2); assert.equal(autumn.qty, 4);
  assert.match(winter.output, /Winter: −30% harvest/);
  assert.match(autumn.output, /Autumn: \+20% harvest/);
  assert.equal(winter.wage, autumn.wage, 'the wage is not seasonal');
  const freight = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'freight' });
  assert.equal(freight.status, 200, JSON.stringify(freight.data));
  assert.equal(freight.data.shifts[0].output, '210 materials delivered by the foundry convoy');
  assert.equal(freight.data.shifts[0].rewardQuantity, 2);
});

test('flag on: Korund and Aurelle winter food is below an autumn shift; flag off keeps 4', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const brigade = async (user, nation) => {
    await r.db.prepare('UPDATE citizens SET nation_id=?, capacity=24 WHERE clerk_user_id=?').bind(nation, user).run();
    const id = randomUUID();
    const action = nation === 'korund' ? 'korund-start-work' : 'aurelle-start-work';
    const claim = nation === 'korund' ? 'korund-claim-work' : 'aurelle-claim-work';
    const start = await r.call('citizen', user, { action, requestId: id });
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const output = (await r.db.prepare('SELECT output FROM work_shifts WHERE id=?').bind(id).first()).output;
    r.setNow(r.now + 7200 * 1000);
    const done = await r.call('citizen', user, { action: claim, requestId: randomUUID(), shiftId: id });
    assert.equal(done.status, 200, `${nation} ${JSON.stringify(done.data)}`);
    const table = nation === 'korund' ? 'korund_settlements' : 'aurelle_settlements';
    return { output, food: Number((await r.db.prepare(`SELECT food_output FROM ${table} WHERE shift_id=?`).bind(id).first()).food_output) };
  };
  await setSeason(r, 3);
  const off = await brigade('alice', 'korund');
  assert.equal(off.output, '4 food contributed to state ration supply');
  assert.equal(off.food, 4, 'flag off');
  r.setFixtureEnv('HARIMU_SEASON_FARMING_ENABLED', 'true');
  await setSeason(r, 2);
  const autumn = await brigade('bob', 'korund');
  await setSeason(r, 3);
  const winter = await brigade('alice', 'aurelle');
  assert.equal(autumn.food, 4); assert.match(autumn.output, /Autumn: \+20% harvest/);
  assert.equal(winter.food, 2); assert.match(winter.output, /^2 food/); assert.match(winter.output, /Winter: −30% harvest/);
  assert.ok(winter.food < autumn.food);
});

test('a direct false string wins over a true pack on the harvest route', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await setSeason(r, 3);
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_SEASON_FARMING_ENABLED: 'true' }));
  r.setFixtureEnv('HARIMU_SEASON_FARMING_ENABLED', 'false');
  const start = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' });
  assert.equal(start.data.shifts[0].output, '480 food contributed to the savanna harvest');
  assert.equal(start.data.shifts[0].rewardQuantity, 4);
});

test('seasonAt: a missing clock is null, never epoch 0; exact-second boundaries are unchanged', () => {
  assert.equal(seasonAt(null), null);
  assert.equal(seasonAt(undefined), null);
  assert.equal(seasonAt({}), null);
  assert.equal(seasonAt({ epochSeconds: 0 }), null);
  assert.equal(seasonAt({ nowSeconds: 1_700_000_000 }), null);
  assert.equal(farmingShiftYield('4 food contributed to state ration supply', 4, seasonAt(null)), null);
  const epoch = 1_700_000_000, sec = seasonLengthMs / 1000;
  assert.equal(sec, 7.5 * 86400);
  const pay = (offsetSec) => {
    const season = seasonAt({ epochSeconds: epoch, nowSeconds: epoch + offsetSec });
    assert.equal(season, gameSeasonAt(epoch * 1000, (epoch + offsetSec) * 1000).season);
    return [season, seasonYieldUnits(4, season)];
  };
  assert.deepEqual(pay(3 * sec - 1), ['autumn', 4]);
  assert.deepEqual(pay(3 * sec), ['winter', 2]);
  assert.deepEqual(pay(4 * sec - 1), ['winter', 2]);
  assert.deepEqual(pay(4 * sec), ['spring', 4]);
  assert.equal(gameSeasonAt(epoch * 1000, (epoch + 4 * sec) * 1000).year, 2);
  assert.notEqual(seasonAt(null), seasonAt({ epochSeconds: 0, nowSeconds: epoch }), 'a missing clock is not the season at epoch 0');
});

test('a start retry across a season boundary and a settled shift keep the stamped line', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_SEASON_FARMING_ENABLED', 'true');
  const elapsed = (seconds) => r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind(Math.floor(r.now / 1000) - seconds).run();
  const stamp = `UPDATE work_shifts SET output=? WHERE id=? AND clerk_user_id=? AND claimed_at IS NULL AND output=?`;
  const once = async (user, nation, plain) => {
    await r.db.prepare('UPDATE citizens SET nation_id=?, capacity=24 WHERE clerk_user_id=?').bind(nation, user).run();
    const id = randomUUID();
    const action = nation === 'korund' ? 'korund-start-work' : 'aurelle-start-work';
    await elapsed(3 * SEASON - 1);
    assert.equal((await r.call('citizen', user, { action, requestId: id })).status, 200);
    const first = (await r.db.prepare('SELECT output FROM work_shifts WHERE id=?').bind(id).first()).output;
    assert.match(first, /Autumn: \+20% harvest/);
    await elapsed(3 * SEASON);
    assert.equal((await r.call('citizen', user, { action, requestId: id })).status, 200, 'replay');
    assert.equal((await r.db.prepare('SELECT output FROM work_shifts WHERE id=?').bind(id).first()).output, first, 'a later season does not restamp');
    assert.equal((await r.db.prepare(stamp).bind('rewritten', id, user, plain).run()).meta.changes, 0, 'the unstamped line is already gone');
    r.setNow(r.now + 7200 * 1000);
    const claim = nation === 'korund' ? 'korund-claim-work' : 'aurelle-claim-work';
    assert.equal((await r.call('citizen', user, { action: claim, requestId: randomUUID(), shiftId: id })).status, 200);
    await elapsed(4 * SEASON);
    assert.equal((await r.call('citizen', user, { action, requestId: id })).status, 200, 'replay after claim');
    assert.equal((await r.db.prepare(stamp).bind('rewritten', id, user, plain).run()).meta.changes, 0, 'a settled shift is not rewritten');
    assert.equal((await r.db.prepare('SELECT output FROM work_shifts WHERE id=?').bind(id).first()).output, first);
    const table = nation === 'korund' ? 'korund_settlements' : 'aurelle_settlements';
    assert.equal(Number((await r.db.prepare(`SELECT food_output FROM ${table} WHERE shift_id=?`).bind(id).first()).food_output), 4);
  };
  await once('alice', 'korund', '4 food contributed to state ration supply');
  await once('bob', 'aurelle', '4 food contributed to charter estate supply');
});

test('shift history names the season effect', async () => {
  const src = await readFile(new URL('../app/work-shift-board.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => name === '@/lib/income-tax' ? require('../lib/income-tax.ts') : name === '@/lib/action-reasons' ? require('../lib/action-reasons.ts') : name === './display-preferences' ? { useDisplayTimestamp: () => require('../lib/display-preferences.ts').displayTimestamp } : name === './game-timer' ? { GameTimer: () => null } : name === 'react' ? { useState: () => [Date.parse('2026-10-14T12:00:00.000Z'), () => {}], useEffect() {} } : require(name));
  const all = node => [node, ...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child => typeof child === 'object' ? all(child) : [child])];
  const text = shift => all(exports.WorkShiftBoard({ shifts: [shift], pending: false, error: null, localDemo: false, economy: null, onRefresh() {}, onClaim() {} })).filter(n => typeof n === 'string').join(' ');
  const base = { id: 's', orderName: 'Support the savanna harvest', capacitySpent: 4, wageMinor: 800, rewardItem: 'food', rewardQuantity: 2, startedAt: '2026-10-14T10:00:00.000Z', completesAt: '2026-10-14T12:00:00.000Z', claimedAt: '2026-10-14T12:00:00.000Z' };
  assert.match(text({ ...base, output: '480 food contributed to the savanna harvest · Winter: −30% harvest' }), /8\.00 SPK \+ 2 food · Winter: −30% harvest/);
  assert.doesNotMatch(text({ ...base, rewardQuantity: 4, output: '480 food contributed to the savanna harvest' }), /Winter/);
});
