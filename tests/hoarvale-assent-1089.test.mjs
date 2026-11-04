/** #1089: Hoarvale bills carry assent on the bill (pending | assented | withheld) plus the assent date.
 *  Flag HARIMU_HOARVALE_ASSENT_ENABLED, inside HARIMU_UI_PACK. Flag off: no bill read or write. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { ASSENT_SECONDS, HOARVALE_ASSENT_SAMPLE_AT, HOARVALE_BILLS, billAssent, simulateGovernment } from '../lib/government.ts';
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

test('assent is 48 real hours, withheld only if dissolved before that hour, and the date is on the bill', () => {
  const passed = 1_000_000;
  assert.equal(ASSENT_SECONDS, 48 * 3600);
  assert.deepEqual(billAssent(passed, null, passed + ASSENT_SECONDS - 1), { assentStatus: 'pending', assentAt: null });
  assert.deepEqual(billAssent(passed, null, passed + ASSENT_SECONDS), { assentStatus: 'assented', assentAt: passed + ASSENT_SECONDS });
  assert.deepEqual(billAssent(passed, passed + ASSENT_SECONDS - 1, passed + ASSENT_SECONDS), { assentStatus: 'withheld', assentAt: passed + ASSENT_SECONDS - 1 });
  assert.deepEqual(billAssent(passed, passed + ASSENT_SECONDS, passed + ASSENT_SECONDS + 10), { assentStatus: 'assented', assentAt: passed + ASSENT_SECONDS });
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
function check(bills, now) {
  assert.equal(bills.length, 3);
  for (const bill of bills) {
    assert.deepEqual(Object.keys(bill).sort(), keys);
    const [status, at] = expectAt(now)[bill.id];
    assert.equal(bill.assentStatus, status, bill.id); assert.equal(bill.assentAt, at, bill.id);
    if (status === 'pending') assert.equal(bill.assentAt, null); else assert.equal(typeof bill.assentAt, 'number');
  }
}
