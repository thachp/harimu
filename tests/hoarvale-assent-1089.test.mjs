/** #1089: Hoarvale bills carry assent on the bill (pending | assented | withheld) plus the assent date.
 *  Flag HARIMU_HOARVALE_ASSENT_ENABLED, inside HARIMU_UI_PACK. Flag off: no bill read or write. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { ASSENT_SECONDS, HOARVALE_ASSENT_SAMPLE_AT, HOARVALE_BILLS, billAssent, hoarvaleBills, simulateGovernment } from '../lib/government.ts';
import { expandFlagPacks, FLAG_PACKS, flagOn, varsForProcessEnv } from '../lib/flag-pack.mjs';
const HOARVALE_ASSENT_FLAG = 'HARIMU_HOARVALE_ASSENT_ENABLED';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const byId = Object.fromEntries(HOARVALE_BILLS.map(bill => [bill.id, bill]));
const band = byId['hoarvale-inflation-band'], frost = byId['hoarvale-frostcore-export'], tenure = byId['hoarvale-tenure-steps'];
const due = bill => bill.passedAt + ASSENT_SECONDS;
/** Spec literals. A 24h wait, a missing date, or a withheld bill that later assents fails these. */
const expectAt = now => ({
  [frost.id]: now < due(frost) ? ['pending', null] : ['assented', due(frost)],
  [band.id]: now < due(band) ? ['pending', null] : ['assented', due(band)],
  [tenure.id]: ['withheld', tenure.dissolvedAt],
});
const keys = ['assentAt', 'assentStatus', 'id', 'passedAt', 'title'];

test('a read before dissolvedAt is pending, not withheld', () => {
  const passed = 1_000_000;
  assert.deepEqual(billAssent(passed, passed + 10, passed + 5), { assentStatus: 'pending', assentAt: null });
  assert.equal(billAssent(passed, passed + 10, passed + 10).assentStatus, 'withheld');
  assert.equal(billAssent(passed, passed + 10, passed + 10).assentAt, passed + 10);
});

test('assent is 48 real hours, withheld only if dissolved before that hour, and the date is on the bill', () => {
  const passed = 1_000_000;
  assert.equal(ASSENT_SECONDS, 48 * 3600);
  assert.deepEqual(billAssent(passed, null, passed + ASSENT_SECONDS - 1), { assentStatus: 'pending', assentAt: null });
  assert.deepEqual(billAssent(passed, null, passed + ASSENT_SECONDS), { assentStatus: 'assented', assentAt: passed + ASSENT_SECONDS });
  assert.deepEqual(billAssent(passed, passed + ASSENT_SECONDS - 1, passed + ASSENT_SECONDS), { assentStatus: 'withheld', assentAt: passed + ASSENT_SECONDS - 1 });
  assert.deepEqual(billAssent(passed, passed + ASSENT_SECONDS, passed + ASSENT_SECONDS + 10), { assentStatus: 'assented', assentAt: passed + ASSENT_SECONDS });
  // ARC: assented is dated 48h after passage; withheld is dated at the dissolve. A read before the dissolve is not withheld.
  assert.deepEqual(billAssent(passed, passed + 10, passed + 5), { assentStatus: 'pending', assentAt: null });
  assert.equal(billAssent(passed, null, passed + ASSENT_SECONDS).assentAt, passed + 48 * 3600);
  assert.equal(billAssent(passed, passed + 10, passed + 10).assentAt, passed + 10);
  assert.equal(simulateGovernment({ nationId: 'hoarvale', availableBudgetMinor: 1, foodSecurity: 80, petitionCounts: {} }), null);
  const snap = simulateGovernment({ nationId: 'hoarvale', availableBudgetMinor: 1, foodSecurity: 80, petitionCounts: {}, hoarvaleAssent: true, now: HOARVALE_ASSENT_SAMPLE_AT });
  assert.equal(snap.bills.length, 3);
  for (const bill of snap.bills) {
    assert.deepEqual(Object.keys(bill).sort(), keys);
    const [status, at] = expectAt(HOARVALE_ASSENT_SAMPLE_AT)[bill.id];
    assert.equal(bill.assentStatus, status); assert.equal(bill.assentAt, at); assert.equal(bill.passedAt, byId[bill.id].passedAt);
  }
  assert.equal(simulateGovernment({ nationId: 'kindle', availableBudgetMinor: 1, foodSecurity: 80, petitionCounts: {}, hoarvaleAssent: true, now: HOARVALE_ASSENT_SAMPLE_AT }).bills, undefined);
});

test('flag is packed, preview on, production off, not its own binding, and browser files do not read it', async () => {
  const preview = strip(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const prod = strip(await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8'));
  assert.equal(preview.vars[HOARVALE_ASSENT_FLAG], undefined); assert.equal(prod.vars[HOARVALE_ASSENT_FLAG], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[HOARVALE_ASSENT_FLAG], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[HOARVALE_ASSENT_FLAG], 'false');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(HOARVALE_ASSENT_FLAG));
  assert.equal(expandFlagPacks(preview.vars)[HOARVALE_ASSENT_FLAG], 'true'); assert.equal(expandFlagPacks(prod.vars)[HOARVALE_ASSENT_FLAG], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[HOARVALE_ASSENT_FLAG], undefined, 'the client bundle does not inline this flag');
  assert.equal(flagOn({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK }, HOARVALE_ASSENT_FLAG), true);
  assert.equal(flagOn({ HARIMU_UI_PACK: prod.vars.HARIMU_UI_PACK }, HOARVALE_ASSENT_FLAG), false);
  assert.equal(flagOn({ HARIMU_UI_PACK: { [HOARVALE_ASSENT_FLAG]: 'true' }, [HOARVALE_ASSENT_FLAG]: 'false' }, HOARVALE_ASSENT_FLAG), false);
  assert.equal(flagOn({ HARIMU_UI_PACK: '{' }, HOARVALE_ASSENT_FLAG), false);
  for (const file of ['lib/government.ts', 'app/page.tsx', 'app/government-panel.tsx', 'lib/hoarvale-assent.ts']) {
    assert.doesNotMatch(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), /process\.env/);
  }
  for (const file of ['drizzle/0119_hoarvale_bills.sql', 'db/postgres/0119_hoarvale_bills.sql']) {
    const sql = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS hoarvale_bills/); assert.match(sql, /assent_status/); assert.match(sql, /assent_at/);
    assert.doesNotMatch(sql, /hoarvale_assent\b/);
  }
});

for (const backend of ['sqlite', 'postgres']) {
  test(`#1089 ${backend}: stored assent status and date, flag off writes nothing`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const mod = await r.importModule('lib/hoarvale-assent.ts');
    await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
    r.setNow(HOARVALE_ASSENT_SAMPLE_AT * 1000);
    const prepare = r.db.prepare.bind(r.db); const sql = [];
    r.db.prepare = q => { sql.push(q); return prepare(q); };
    const off = await r.call('citizen', 'alice');
    r.db.prepare = prepare;
    assert.equal(off.data.government, null);
    assert.ok(!sql.some(q => /hoarvale_bills/.test(q)), 'flag off opens no bill table');
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM hoarvale_bills').first()).n), 0);
    r.setFixtureEnv(HOARVALE_ASSENT_FLAG, 'true');
    const projected = await r.call('citizen', 'alice');
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM hoarvale_bills').first()).n), 0, 'a read does not insert');
    check(projected.data.government.bills, HOARVALE_ASSENT_SAMPLE_AT);
    const early = HOARVALE_ASSENT_SAMPLE_AT - 1;
    check(await mod.syncHoarvaleBills(r.db, early), early);
    const rows = (await r.db.prepare('SELECT bill_id, assent_status, assent_at, dissolved_at FROM hoarvale_bills ORDER BY bill_id').all()).results;
    assert.equal(rows.length, 3);
    for (const row of rows) {
      const [status, at] = expectAt(early)[row.bill_id];
      assert.equal(row.assent_status, status, row.bill_id); assert.equal(row.assent_at, at, row.bill_id);
    }
    assert.equal(rows.find(row => row.bill_id === tenure.id).dissolved_at, tenure.dissolvedAt);
    check(await mod.syncHoarvaleBills(r.db, HOARVALE_ASSENT_SAMPLE_AT), HOARVALE_ASSENT_SAMPLE_AT);
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM hoarvale_bills').first()).n), 3, 'a second sync does not add a row');
    r.setNow(HOARVALE_ASSENT_SAMPLE_AT * 1000);
    const on = await r.call('citizen', 'alice');
    check(on.data.government.bills, HOARVALE_ASSENT_SAMPLE_AT);
    const stored = Object.fromEntries((await r.db.prepare('SELECT bill_id, assent_status, assent_at FROM hoarvale_bills').all()).results.map(row => [row.bill_id, row]));
    for (const bill of on.data.government.bills) {
      assert.equal(bill.assentStatus, stored[bill.id].assent_status); assert.equal(bill.assentAt, stored[bill.id].assent_at);
    }
    const later = HOARVALE_ASSENT_SAMPLE_AT + 10 * ASSENT_SECONDS;
    const held = await mod.syncHoarvaleBills(r.db, later);
    const withheld = held.find(bill => bill.id === tenure.id);
    assert.equal(withheld.assentStatus, 'withheld'); assert.equal(withheld.assentAt, tenure.dissolvedAt);
    assert.notEqual(withheld.assentStatus, 'assented');
    await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
    const kindleSql = []; r.db.prepare = q => { kindleSql.push(q); return prepare(q); };
    const kindle = await r.call('citizen', 'alice');
    r.db.prepare = prepare;
    assert.equal('bills' in kindle.data.government, false);
    assert.ok(!kindleSql.some(q => /hoarvale_bills/.test(q)));
    const cols = (await r.db.prepare('PRAGMA table_info(hoarvale_bills)').all()).results.map(col => col.name);
    assert.ok(cols.includes('assent_status') && cols.includes('assent_at'));
  });
}
const rowsOf = async r => (await r.db.prepare('SELECT bill_id, assent_status, assent_at FROM hoarvale_bills ORDER BY bill_id').all()).results;
async function tickReady(r, tickSeconds) {
  const epoch = HOARVALE_ASSENT_SAMPLE_AT, tick = 23;
  const scheduledAt = epoch + tick * tickSeconds, frostDue = frost.passedAt + ASSENT_SECONDS, now = frostDue + 10;
  assert.ok(scheduledAt < frostDue && now < epoch + (tick + 1) * tickSeconds && Math.floor((now - epoch) / tickSeconds) === tick);
  await r.db.prepare("INSERT INTO world_clock (id, epoch_seconds) VALUES ('main', ?)").bind(epoch).run();
  await r.db.prepare('INSERT INTO world_ticks (tick, scheduled_at, processed_at, proposals_json) VALUES (?,?,?,?)').bind(tick - 1, epoch + (tick - 1) * tickSeconds, epoch, '[]').run();
  return { now, scheduledAt };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`#1089 ${backend}: advanceWorld flag off writes no hoarvale_bills`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const { tickSeconds } = await r.importModule('lib/world-simulation.ts');
    const { now } = await tickReady(r, tickSeconds);
    const prepare = r.db.prepare.bind(r.db), sql = [];
    r.db.prepare = q => { sql.push(q); return prepare(q); };
    await r.advanceWorld(now);
    r.db.prepare = prepare;
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM world_ticks WHERE tick=23').first()).n), 1, 'the tick ran');
    assert.ok(!sql.some(q => /hoarvale_bills/.test(q)), 'flag off: the tick does not touch hoarvale_bills');
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM hoarvale_bills').first()).n), 0);
  });

  test(`#1089 ${backend}: advanceWorld flag on stores assent at scheduledAt in the tick batch`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    r.setFixtureEnv(HOARVALE_ASSENT_FLAG, 'true');
    const { tickSeconds } = await r.importModule('lib/world-simulation.ts');
    const { now, scheduledAt } = await tickReady(r, tickSeconds);
    const batches = [], orig = r.db.batch.bind(r.db);
    r.db.batch = async statements => { batches.push(statements.map(s => s.sql)); return orig(statements); };
    await r.advanceWorld(now);
    r.db.batch = orig;
    const tickBatch = batches.find(sqls => sqls.some(s => /INSERT OR IGNORE INTO world_ticks/i.test(s)));
    assert.ok(tickBatch && tickBatch.some(s => /hoarvale_bills/i.test(s)), 'bill writes share the tick batch');
    const storedAt = Number((await r.db.prepare('SELECT scheduled_at FROM world_ticks WHERE tick=23').first()).scheduled_at);
    assert.equal(storedAt, scheduledAt);
    const rows = await rowsOf(r);
    assert.equal(rows.length, 3);
    for (const row of rows) {
      const [status, at] = expectAt(scheduledAt)[row.bill_id];
      assert.equal(row.assent_status, status, row.bill_id); assert.equal(row.assent_at, at, row.bill_id);
    }
    const bandRow = rows.find(row => row.bill_id === band.id), tenureRow = rows.find(row => row.bill_id === tenure.id), frostRow = rows.find(row => row.bill_id === frost.id);
    assert.equal(bandRow.assent_status, 'assented'); assert.equal(bandRow.assent_at, band.passedAt + ASSENT_SECONDS);
    assert.equal(tenureRow.assent_status, 'withheld'); assert.equal(tenureRow.assent_at, tenure.dissolvedAt);
    assert.equal(frostRow.assent_status, 'pending'); assert.equal(frostRow.assent_at, null);
    assert.equal(hoarvaleBills(now).find(bill => bill.id === frost.id).assentStatus, 'assented', 'now would assent Frostcore; the tick must use scheduledAt');
  });

  test(`#1089 ${backend}: stored bills win over the in-memory fallback at a later clock`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const mod = await r.importModule('lib/hoarvale-assent.ts');
    const writtenAt = HOARVALE_ASSENT_SAMPLE_AT - 2 * 3600, readAt = HOARVALE_ASSENT_SAMPLE_AT;
    assert.deepEqual(expectAt(writtenAt)[band.id], ['pending', null]);
    assert.deepEqual(expectAt(readAt)[band.id], ['assented', band.passedAt + ASSENT_SECONDS]);
    await mod.syncHoarvaleBills(r.db, writtenAt);
    await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
    r.setFixtureEnv(HOARVALE_ASSENT_FLAG, 'true');
    r.setNow(readAt * 1000);
    const got = (await r.call('citizen', 'alice')).data.government.bills.find(bill => bill.id === band.id);
    assert.equal(got.assentStatus, 'pending'); assert.equal(got.assentAt, null);
    assert.equal(hoarvaleBills(readAt).find(bill => bill.id === band.id).assentStatus, 'assented');
    const stored = (await rowsOf(r)).find(row => row.bill_id === band.id);
    assert.equal(got.assentStatus, stored.assent_status); assert.equal(got.assentAt, stored.assent_at);
  });

  test(`#1089 ${backend}: withHoarvaleBills flag off keeps the snapshot and does not read bills`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const mod = await r.importModule('lib/hoarvale-assent.ts');
    const snapshot = { nationId: 'hoarvale', bills: [{ id: 'sentinel', title: 'Sentinel', passedAt: 1, assentStatus: 'pending', assentAt: null }] };
    const prepare = r.db.prepare.bind(r.db), sql = [];
    r.db.prepare = q => { sql.push(q); return prepare(q); };
    const out = await mod.withHoarvaleBills(r.db, snapshot, {}, HOARVALE_ASSENT_SAMPLE_AT, 'hoarvale');
    r.db.prepare = prepare;
    assert.equal(out, snapshot); assert.equal(out.bills[0].id, 'sentinel');
    assert.ok(!sql.some(q => /hoarvale_bills/.test(q)));
  });

  test(`#1089 ${backend}: citizen GET reads stored bills and does not write them`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const mod = await r.importModule('lib/hoarvale-assent.ts');
    const writtenAt = HOARVALE_ASSENT_SAMPLE_AT - 2 * 3600, readAt = HOARVALE_ASSENT_SAMPLE_AT;
    const period = Math.floor(readAt / 86400) * 86400 - 86400;
    await mod.syncHoarvaleBills(r.db, writtenAt);
    await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
    await r.db.prepare("INSERT INTO government_petitions (request_id, clerk_user_id, nation_id, topic, period_start, occurred_at) VALUES ('hv-past','alice','hoarvale','food',?,?)").bind(period, period + 10).run();
    await r.db.prepare("INSERT INTO government_petition_eligibility (request_id, clerk_user_id, checked_at) VALUES ('hv-past','alice',?)").bind(period + 10).run();
    r.setFixtureEnv(HOARVALE_ASSENT_FLAG, 'true');
    r.setNow(readAt * 1000);
    const prepare = r.db.prepare.bind(r.db), sql = [];
    r.db.prepare = q => { sql.push(q); return prepare(q); };
    const got = (await r.call('citizen', 'alice')).data.government.bills.find(bill => bill.id === band.id);
    r.db.prepare = prepare;
    const billSql = sql.filter(q => /hoarvale_bills/.test(q));
    const writing = q => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(q);
    assert.ok(billSql.some(q => /^\s*SELECT\b/i.test(q)), 'GET reads the stored bills');
    assert.ok(!billSql.some(writing), 'GET does not write hoarvale_bills');
    assert.ok(!sql.some(q => writing(q) && /government_reviews/.test(q)), 'GET stays readOnly');
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM government_reviews').first()).n), 0);
    assert.equal(got.assentStatus, 'pending'); assert.equal(got.assentAt, null);
    assert.equal(hoarvaleBills(readAt).find(bill => bill.id === band.id).assentStatus, 'assented');
  });
}

function check(bills, now) {
  assert.equal(bills.length, 3);
  for (const bill of bills) {
    assert.deepEqual(Object.keys(bill).sort(), keys);
    const [status, at] = expectAt(now)[bill.id];
    assert.equal(bill.assentStatus, status, bill.id); assert.equal(bill.assentAt, at, bill.id);
    if (status === 'pending') assert.equal(bill.assentAt, null); else assert.equal(typeof bill.assentAt, 'number');
  }
}
