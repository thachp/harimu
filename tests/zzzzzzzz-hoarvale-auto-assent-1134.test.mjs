/** #1134: a pending Hoarvale bill receives Royal Assent after 48 real hours, on the world tick.
 *  Flag HARIMU_HOARVALE_AUTO_ASSENT_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: those rows stay as stored.
 *  [ASSUMPTION] The assent date is passed_at + 48h (the #1089 date), not the tick clock. A row dissolved before
 *  that hour stays pending; withheld is still the #1089 path. The read adds secondsUntilAssent and does not write.
 *  The zzzzzzzz- name sorts after the zzzzzzz- nation files so --test-shard does not move them. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { flagOn } from '../lib/flag-pack.mjs';
import { ASSENT_SECONDS, HOARVALE_ASSENT_SAMPLE_AT, HOARVALE_BILLS, secondsUntilAssent, withAssentCountdown } from '../lib/government.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = 'HARIMU_HOARVALE_AUTO_ASSENT_ENABLED';
const ASSENT = 'HARIMU_HOARVALE_ASSENT_ENABLED';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const byId = Object.fromEntries(HOARVALE_BILLS.map(bill => [bill.id, bill]));
const band = byId['hoarvale-inflation-band'], frost = byId['hoarvale-frostcore-export'], tenure = byId['hoarvale-tenure-steps'];
const due = bill => bill.passedAt + ASSENT_SECONDS;
const rowsOf = async r => (await r.db.prepare('SELECT bill_id, assent_status, assent_at FROM hoarvale_bills ORDER BY bill_id').all()).results;
const statusOf = rows => Object.fromEntries(rows.map(row => [row.bill_id, [row.assent_status, row.assent_at]]));

test('the wait is 48 real hours, zero at the boundary, and absent once the bill is no longer pending', () => {
  const passed = 1_000_000;
  assert.equal(ASSENT_SECONDS, 48 * 3600);
  assert.equal(secondsUntilAssent(passed, 'pending', passed + ASSENT_SECONDS - 1), 1);
  assert.equal(secondsUntilAssent(passed, 'pending', passed + ASSENT_SECONDS), 0);
  assert.equal(secondsUntilAssent(passed, 'pending', passed + ASSENT_SECONDS + 5), 0);
  assert.equal(secondsUntilAssent(passed, 'assented', passed + ASSENT_SECONDS), null);
  assert.equal(secondsUntilAssent(passed, 'withheld', passed + ASSENT_SECONDS), null);
  for (const now of [Number.NaN, 1.5, -1, Number.POSITIVE_INFINITY]) assert.equal(secondsUntilAssent(passed, 'pending', now), null, String(now));
  assert.equal(secondsUntilAssent(1.5, 'pending', passed), null);
  const pending = { id: 'x', title: 'X', passedAt: passed, assentStatus: 'pending', assentAt: null };
  const counted = withAssentCountdown(pending, passed + 10);
  assert.equal(counted.secondsUntilAssent, ASSENT_SECONDS - 10);
  assert.equal('secondsUntilAssent' in pending, false, 'the stored bill is not mutated');
  assert.equal(withAssentCountdown({ ...pending, assentStatus: 'assented', assentAt: passed + ASSENT_SECONDS }, passed + ASSENT_SECONDS).secondsUntilAssent, undefined);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined, 'not its own text binding');
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, FLAG), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, FLAG), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [FLAG]: 'false' }, FLAG), false, 'a direct string wins');
});

async function seeded(r) {
  const mod = await r.importModule('lib/hoarvale-assent.ts');
  const written = await mod.syncHoarvaleBills(r.db, HOARVALE_ASSENT_SAMPLE_AT - 1);
  assert.equal(written.find(bill => bill.id === band.id).assentStatus, 'pending');
  assert.equal(written.find(bill => bill.id === frost.id).assentStatus, 'pending');
  assert.equal(written.find(bill => bill.id === tenure.id).assentStatus, 'withheld');
  return mod;
}
async function armTick(r) {
  const { tickSeconds } = await r.importModule('lib/world-simulation.ts');
  const epoch = HOARVALE_ASSENT_SAMPLE_AT, tick = 23;
  const scheduledAt = epoch + tick * tickSeconds;
  assert.ok(scheduledAt >= due(band) && scheduledAt < due(frost), 'the tick is after the band and before Frostcore');
  await r.db.prepare("INSERT INTO world_clock (id, epoch_seconds) VALUES ('main', ?)").bind(epoch).run();
  await r.db.prepare('INSERT INTO world_ticks (tick, scheduled_at, processed_at, proposals_json) VALUES (?,?,?,?)').bind(tick - 1, epoch + (tick - 1) * tickSeconds, epoch, '[]').run();
  return { scheduledAt, now: scheduledAt + 10 };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`#1134 ${backend}: flag off leaves pending bills untouched`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await seeded(r);
    const before = statusOf(await rowsOf(r));
    const { now } = await armTick(r);
    const prepare = r.db.prepare.bind(r.db), sql = [];
    r.db.prepare = q => { sql.push(q); return prepare(q); };
    await r.advanceWorld(now);
    r.db.prepare = prepare;
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM world_ticks WHERE tick=23').first()).n), 1, 'the tick ran');
    assert.deepEqual(statusOf(await rowsOf(r)), before);
    assert.ok(!sql.some(q => /passed_at\+/.test(q)), 'flag off: the tick does not auto-assent');
    assert.ok(!sql.some(q => /hoarvale_bills/.test(q)), 'flag off adds no bill statement');
  });

  test(`#1134 ${backend}: the next settle tick assents a pending bill at 48h and leaves a younger one pending`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const mod = await seeded(r);
    assert.deepEqual(mod.hoarvaleAutoAssentWrites(r.db, 1.5), [], 'a clock that is not a safe integer adds nothing');
    await r.db.batch(mod.hoarvaleAutoAssentWrites(r.db, due(band) - 1));
    assert.deepEqual(statusOf(await rowsOf(r))[band.id], ['pending', null], 'one second early stays pending');
    r.setFixtureEnv(FLAG, 'true');
    const { now, scheduledAt } = await armTick(r);
    const batches = [], orig = r.db.batch.bind(r.db);
    r.db.batch = async statements => { batches.push(statements.map(s => s.sql)); return orig(statements); };
    await r.advanceWorld(now);
    r.db.batch = orig;
    const tickBatch = batches.find(sqls => sqls.some(s => /INSERT OR IGNORE INTO world_ticks/i.test(s)));
    assert.ok(tickBatch && tickBatch.some(s => /assent_at=passed_at\+/.test(s)), 'the auto-assent update shares the tick batch');
    const got = statusOf(await rowsOf(r));
    assert.deepEqual(got[band.id], ['assented', due(band)]);
    assert.notEqual(got[band.id][1], scheduledAt, 'the date is passage + 48h, not the tick');
    assert.deepEqual(got[frost.id], ['pending', null], 'Frostcore is still inside 48 hours');
    assert.equal(got[tenure.id][0], 'withheld');
    await r.db.prepare("UPDATE hoarvale_bills SET assent_status='pending', assent_at=NULL WHERE bill_id=?").bind(tenure.id).run();
    await r.db.batch(mod.hoarvaleAutoAssentWrites(r.db, due(tenure)));
    const held = statusOf(await rowsOf(r));
    assert.deepEqual(held[tenure.id], ['pending', null], 'dissolved before the 48th hour is not assented');
    assert.deepEqual(held[frost.id], ['pending', null]);
    assert.deepEqual(held[band.id], ['assented', due(band)], 'a second pass does not move the assent date');
  });

  test(`#1134 ${backend}: the settle tick at exactly passed_at + 48h assents the bill`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await seeded(r);
    assert.deepEqual(statusOf(await rowsOf(r))[band.id], ['pending', null], 'the band is still pending before the boundary');
    r.setFixtureEnv(FLAG, 'true');
    const { tickSeconds } = await r.importModule('lib/world-simulation.ts');
    const boundary = due(band);
    assert.equal(boundary, band.passedAt + ASSENT_SECONDS);
    const epoch = boundary - tickSeconds;
    await r.db.prepare("INSERT INTO world_clock (id, epoch_seconds) VALUES ('main', ?)").bind(epoch).run();
    await r.advanceWorld(boundary);
    const tick = await r.db.prepare('SELECT tick, scheduled_at FROM world_ticks ORDER BY tick DESC LIMIT 1').first();
    assert.equal(Number(tick.tick), 1);
    assert.equal(Number(tick.scheduled_at), boundary, 'the tick clock is passed_at + 48h, not one second later');
    const got = statusOf(await rowsOf(r));
    assert.deepEqual(got[band.id], ['assented', boundary], 'equal to the boundary assents; a strict < would leave it pending');
    assert.deepEqual(got[frost.id], ['pending', null], 'Frostcore is one hour old at the band boundary');
    assert.equal(got[tenure.id][0], 'withheld');
  });
}

test('flag off omits the countdown; flag on reports seconds until assent and does not write', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const mod = await seeded(r);
  await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
  const readAt = due(band) - 100;
  r.setNow(readAt * 1000);
  r.setFixtureEnv(ASSENT, 'true');
  const off = (await r.call('citizen', 'alice')).data.government.bills.find(bill => bill.id === band.id);
  assert.equal(off.assentStatus, 'pending');
  assert.equal('secondsUntilAssent' in off, false, 'flag off');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [FLAG]: 'true' }));
  const prepare = r.db.prepare.bind(r.db), sql = [];
  r.db.prepare = q => { sql.push(q); return prepare(q); };
  const on = (await r.call('citizen', 'alice')).data.government.bills;
  r.db.prepare = prepare;
  assert.ok(!sql.some(q => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(q) && /hoarvale_bills/.test(q)), 'the read does not write');
  const bandOn = on.find(bill => bill.id === band.id), frostOn = on.find(bill => bill.id === frost.id), tenureOn = on.find(bill => bill.id === tenure.id);
  assert.equal(bandOn.assentStatus, 'pending');
  assert.equal(bandOn.secondsUntilAssent, 100);
  assert.equal(frostOn.secondsUntilAssent, due(frost) - readAt);
  assert.equal('secondsUntilAssent' in tenureOn, false, 'a withheld bill has no countdown');
  r.setFixtureEnv(FLAG, 'false');
  assert.equal('secondsUntilAssent' in (await r.call('citizen', 'alice')).data.government.bills.find(bill => bill.id === band.id), false, 'a direct false wins over the pack');
  const kindleSnap = { nationId: 'kindle' };
  assert.equal(await mod.withHoarvaleBills(r.db, kindleSnap, { [FLAG]: 'true', [ASSENT]: 'true' }, readAt, 'kindle'), kindleSnap);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='bob'").run();
  const korund = (await r.call('citizen', 'bob')).data.government;
  assert.equal(korund == null || !('bills' in korund), true, 'another nation is unchanged');
});
