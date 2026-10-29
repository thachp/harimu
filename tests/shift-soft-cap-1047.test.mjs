/** #1047: docs §17.3 daily soft cap on productive shifts. Flag HARIMU_SHIFT_SOFT_CAP_ENABLED, packed in HARIMU_GRAY_PACK.
 *  Flag off: the same starts, no shiftDay, and the cap's count query never runs. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { flagOn } from '../lib/flag-pack.mjs';
import { DAILY_SHIFT_SOFT_CAP, readShiftDay, refuseNewShift, SHIFT_DAY_SECONDS, shiftCapRefusal, shiftDayAt, shiftSoftCapEnabled, shiftsTodayLine } from '../lib/shift-soft-cap.ts';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const DAY = SHIFT_DAY_SECONDS;
const setEpoch = (r, epoch) => r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind(epoch).run();
const iso = seconds => new Date(seconds * 1000).toISOString();

test('shift day uses the integer world clock: missing clock is null, never epoch 0; the boundary is the exact second', async t => {
  assert.equal(DAILY_SHIFT_SOFT_CAP, 3);
  assert.equal(SHIFT_DAY_SECONDS, 86400);
  assert.equal(shiftCapRefusal, "You've worked your 3 shifts today. Come back after the daily tick.");
  assert.equal(shiftDayAt(null), null);
  assert.equal(shiftDayAt(undefined), null);
  assert.equal(shiftDayAt({}), null);
  assert.equal(shiftDayAt({ epochSeconds: 0 }), null);
  assert.equal(shiftDayAt({ nowSeconds: 1_700_000_000 }), null);
  assert.equal(shiftDayAt({ epochSeconds: 1.5, nowSeconds: 2 }), null);
  const epoch = 1_700_000_000;
  const atZero = shiftDayAt({ epochSeconds: 0, nowSeconds: epoch });
  assert.notEqual(shiftDayAt(null), atZero, 'a missing clock is not the day at epoch 0');
  assert.equal(atZero.start, Math.floor(epoch / DAY) * DAY);
  assert.equal(atZero.resetsAt, atZero.start + DAY);
  const last = shiftDayAt({ epochSeconds: epoch, nowSeconds: epoch + DAY - 1 });
  assert.deepEqual(last, { start: epoch, resetsAt: epoch + DAY });
  const next = shiftDayAt({ epochSeconds: epoch, nowSeconds: epoch + DAY });
  assert.deepEqual(next, { start: epoch + DAY, resetsAt: epoch + 2 * DAY });
  assert.equal(shiftsTodayLine({ started: 2, cap: 3, resetsAt: iso(epoch + DAY) }), `Shifts today: 2 of 3. Resets after the daily tick (${iso(epoch + DAY)}).`);
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare('DELETE FROM world_clock').run();
  assert.equal(await readShiftDay(r.db, { HARIMU_SHIFT_SOFT_CAP_ENABLED: 'true' }, 'alice', epoch), null);
  assert.equal(await refuseNewShift(r.db, 'alice', epoch), null, 'no clock, no refusal');
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_SHIFT_SOFT_CAP_ENABLED, undefined, 'not its own text binding');
  assert.equal(prod.vars.HARIMU_SHIFT_SOFT_CAP_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_SHIFT_SOFT_CAP_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_SHIFT_SOFT_CAP_ENABLED, 'false');
  assert.equal(shiftSoftCapEnabled({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_SHIFT_SOFT_CAP_ENABLED'), false);
  assert.equal(shiftSoftCapEnabled({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_SHIFT_SOFT_CAP_ENABLED: 'false' }), false, 'a direct string wins');
});

test('flag off: a fourth shift still starts, shiftDay is absent, and the cap count is not queried', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const now = new Date(r.now).toISOString();
  for (let i = 0; i < 3; i++) await r.db.prepare(`INSERT INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at,claimed_at) VALUES (?,?, 'orchard','Pick','fruit',4,?,?,?)`).bind(randomUUID(), 'alice', now, now, now).run();
  const seen = [];
  const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { seen.push(String(sql)); return prepare(sql); };
  const get = await r.call('citizen', 'alice');
  const start = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'orchard' });
  r.db.prepare = prepare;
  assert.equal(get.data.shiftDay, undefined);
  assert.equal(start.status, 200, JSON.stringify(start.data));
  assert.equal(start.data.shiftDay, undefined);
  assert.equal(seen.some(sql => sql.includes('started_at>=')), false);
});

test('flag on and no clock row: GET adds no shiftDay and does not count shifts', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_SHIFT_SOFT_CAP_ENABLED', 'true');
  await r.db.prepare('DELETE FROM world_clock').run();
  const seen = [];
  const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { seen.push(String(sql)); return prepare(sql); };
  const get = await r.call('citizen', 'alice');
  r.db.prepare = prepare;
  assert.equal(get.status, 200);
  assert.equal(get.data.shiftDay, undefined);
  assert.equal(seen.some(sql => sql.includes('started_at>=')), false);
});

test('three shifts succeed, the fourth is refused, and the count resets on the exact next second', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_SHIFT_SOFT_CAP_ENABLED', 'true');
  const t0 = Math.floor(r.now / 1000);
  await setEpoch(r, t0);
  const history = async () => (await r.db.prepare('SELECT id, output, claimed_at FROM work_shifts WHERE clerk_user_id=? ORDER BY started_at, id').bind('alice').all()).results;
  const cycle = async () => {
    const start = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'orchard' });
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const shift = start.data.shifts[0];
    r.setNow(Date.parse(shift.completesAt));
    const claim = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id });
    assert.equal(claim.status, 200, JSON.stringify(claim.data));
    return shift.id;
  };
  const ids = [];
  for (let n = 1; n <= 3; n++) {
    ids.push(await cycle());
    assert.equal((await r.call('citizen', 'alice')).data.shiftDay.started, n);
  }
  const settled = await history();
  const wages = (await r.db.prepare('SELECT shift_id, wage_minor, quantity FROM shift_settlements WHERE clerk_user_id=? ORDER BY shift_id').bind('alice').all()).results;
  const capBefore = Number((await r.db.prepare('SELECT capacity FROM citizens WHERE clerk_user_id=?').bind('alice').first()).capacity);
  const fourth = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'orchard' });
  assert.equal(fourth.status, 409);
  assert.equal(fourth.data.error, shiftCapRefusal);
  assert.deepEqual(fourth.data.shiftDay, { started: 3, cap: 3, resetsAt: iso(t0 + DAY) });
  const retry = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'orchard' });
  assert.equal(retry.status, 409);
  assert.equal(retry.data.error, shiftCapRefusal);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM work_shifts WHERE clerk_user_id=?').bind('alice').first()).n), 3);
  assert.equal(Number((await r.db.prepare('SELECT capacity FROM citizens WHERE clerk_user_id=?').bind('alice').first()).capacity), capBefore);
  assert.deepEqual(await history(), settled, 'a refusal does not rewrite settled shifts');
  r.setNow((t0 + DAY) * 1000);
  const reset = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'orchard' });
  assert.equal(reset.status, 200, JSON.stringify(reset.data));
  assert.equal(reset.data.shiftDay.started, 1);
  assert.equal(reset.data.shiftDay.resetsAt, iso(t0 + 2 * DAY));
  const after = await history();
  assert.deepEqual(after.filter(row => ids.includes(row.id)), settled);
  assert.deepEqual((await r.db.prepare('SELECT shift_id, wage_minor, quantity FROM shift_settlements WHERE clerk_user_id=? ORDER BY shift_id').bind('alice').all()).results, wages);
  const edge = Math.floor(r.now / 1000);
  await setEpoch(r, edge - (DAY - 1));
  const lastSecond = await r.call('citizen', 'bob', { action: 'commit-work', workOrderId: 'orchard' });
  assert.equal(lastSecond.status, 200, JSON.stringify(lastSecond.data));
  assert.equal(lastSecond.data.shiftDay.started, 1);
  assert.equal(lastSecond.data.shiftDay.resetsAt, iso(edge + 1));
  r.setNow((edge + 1) * 1000);
  const rolled = await r.call('citizen', 'bob');
  assert.equal(rolled.data.shiftDay.started, 0, 'a shift started on the previous second is not today');
  assert.equal(rolled.data.shiftDay.resetsAt, iso(edge + 1 + DAY));
});

test('a packed true is on, a direct false wins, and a Korund replay at the cap does not write', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const t0 = Math.floor(r.now / 1000);
  await setEpoch(r, t0);
  const now = iso(t0);
  const seed = user => Promise.all([0, 1, 2].map(i => r.db.prepare(`INSERT INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at,claimed_at) VALUES (?,?, 'orchard','Pick','fruit',4,?,?,?)`).bind(`${user}-${i}`, user, now, now, now).run()));
  await seed('alice');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_SHIFT_SOFT_CAP_ENABLED: 'true' }));
  r.setFixtureEnv('HARIMU_SHIFT_SOFT_CAP_ENABLED', 'false');
  const open = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'freight' });
  assert.equal(open.status, 200, JSON.stringify(open.data));
  assert.equal(open.data.shiftDay, undefined, 'a direct false string wins over the pack');
  r.setFixtureEnv('HARIMU_SHIFT_SOFT_CAP_ENABLED', undefined);
  await seed('bob');
  const closed = await r.call('citizen', 'bob', { action: 'commit-work', workOrderId: 'freight' });
  assert.equal(closed.status, 409);
  assert.equal(closed.data.error, shiftCapRefusal);
  await r.db.prepare("UPDATE citizens SET nation_id='korund', capacity=24 WHERE clerk_user_id='bob'").run();
  await r.db.prepare('DELETE FROM work_shifts WHERE clerk_user_id=?').bind('bob').run();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (const id of ids) {
    assert.equal((await r.call('citizen', 'bob', { action: 'korund-start-work', requestId: id })).status, 200);
    r.setNow(r.now + 7200 * 1000);
    assert.equal((await r.call('citizen', 'bob', { action: 'korund-claim-work', requestId: randomUUID(), shiftId: id })).status, 200);
  }
  const before = (await r.db.prepare('SELECT id, output, claimed_at FROM work_shifts WHERE clerk_user_id=? ORDER BY id').bind('bob').all()).results;
  const fourth = await r.call('citizen', 'bob', { action: 'korund-start-work', requestId: randomUUID() });
  assert.equal(fourth.status, 409);
  assert.equal(fourth.data.error, shiftCapRefusal);
  const replay = await r.call('citizen', 'bob', { action: 'korund-start-work', requestId: ids[2] });
  assert.equal(replay.status, 200, JSON.stringify(replay.data));
  assert.equal(replay.data.replayed, true);
  assert.deepEqual((await r.db.prepare('SELECT id, output, claimed_at FROM work_shifts WHERE clerk_user_id=? ORDER BY id').bind('bob').all()).results, before);
});

test('the job panel shows the count and the reset time only when a day is passed', async () => {
  const src = readFileSync('app/work-shift-board.tsx', 'utf8');
  const page = readFileSync('app/page.tsx', 'utf8');
  assert.match(src, /Shifts today: \{day\.started\} of \{day\.cap\}\. Resets after the daily tick \(\{day\.resetsAt\}\)\./);
  for (const file of ['app/korund-plan-panel.tsx', 'app/aurelle-plan-panel.tsx']) assert.match(readFileSync(file, 'utf8'), /Shifts today: \{shiftDay\.started\} of \{shiftDay\.cap\}\. Resets after the daily tick \(\{shiftDay\.resetsAt\}\)\./);
  assert.match(page, /<WorkShiftBoard [^]*?shiftDay=\{shiftDay\}/);
  assert.match(page, /<KorundPlanPanel [^]*?shiftDay=\{shiftDay\}/);
  assert.match(page, /<AurellePlanPanel [^]*?shiftDay=\{shiftDay\}/);
  assert.equal(shiftsTodayLine({ started: 0, cap: 3, resetsAt: '2026-10-30T00:00:00.000Z' }), 'Shifts today: 0 of 3. Resets after the daily tick (2026-10-30T00:00:00.000Z).');
});
