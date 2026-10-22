/** #432: daily ledger reconciliation PoC behind HARIMU_LEDGER_RECONCILIATION_ENABLED. Read-only on money, one report per game day, scheduled Worker only, fail-closed admin route. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { firstMismatches, isMinorUnit, reconciliationConfig, reconciliationGameDay } from '../lib/ledger-reconciliation-rules.ts';

const DAY = reconciliationConfig.gameDaySeconds;
const TOKEN = 'unit-test-admin-token-0123456789';

// Backend-neutral way to let a test write rows that the table checks would refuse (simulated corruption).
// SQLite: PRAGMA ignore_check_constraints. Postgres (HARIMU_TEST_STORAGE=postgres): drop the CHECK constraints of the named tables for this test's database.
const onPostgres = process.env.HARIMU_TEST_STORAGE === 'postgres';
async function allowCorruption(r, tables) {
  if (!onPostgres) { await r.db.prepare('PRAGMA ignore_check_constraints = ON').run(); return; }
  for (const table of tables) {
    const { results } = await r.db.prepare("SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid::regclass::text = ?").bind(table).all();
    for (const { conname } of results) r.db.sqlite.exec(`ALTER TABLE ${table} DROP CONSTRAINT "${conname}"`);
  }
  await r.db.prepare('SELECT 1 AS settled').first(); // the queued DDL has run before the next statement
}

test('pure rules: game day, integer minor units, and the report keeps only the first 10 mismatches', () => {
  assert.equal(DAY, 7200);
  assert.equal(reconciliationGameDay(0, 0), 1); assert.equal(reconciliationGameDay(DAY - 1, 0), 1); assert.equal(reconciliationGameDay(DAY, 0), 2); assert.equal(reconciliationGameDay(5, 100), 1);
  for (const ok of [0, 1, -5, 2 ** 52]) assert.equal(isMinorUnit(ok), true, String(ok));
  for (const bad of [0.5, NaN, Infinity, '5', null, undefined, 2 ** 60]) assert.equal(isMinorUnit(bad), false, String(bad));
  const many = Array.from({ length: 25 }, (_, i) => ({ currency: 'SPK', check: 'x', account: `a${i}` }));
  assert.equal(firstMismatches(many).length, 10); assert.equal(firstMismatches(many)[0].account, 'a0'); assert.equal(firstMismatches(many.slice(0, 3)).length, 3);
});

test('static: flag is "true" in preview wrangler, the admin secret is not in the repo, migration only adds a table, every money statement is a SELECT, only the cron writes its own table', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_LEDGER_RECONCILIATION_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['true']);
  assert.doesNotMatch(cfg, /"HARIMU_ADMIN_TOKEN"/, 'the secret is set in the dashboard, never in the repo');
  for (const file of ['../drizzle/0045_reconciliation_reports.sql', '../db/postgres/0045_reconciliation_reports.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i, file); assert.match(sql, /CREATE TABLE IF NOT EXISTS reconciliation_reports/);
  }
  const lib = await readFile(new URL('../lib/ledger-reconciliation.ts', import.meta.url), 'utf8');
  assert.deepEqual([...lib.matchAll(/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER)\b\s+(?:INTO\s+)?(\w+)/g)].map(m => `${m[1]} ${m[2]}`).filter(x => !/^(INSERT|UPDATE) (the|a|own|it)$/i.test(x)), ['INSERT reconciliation_reports'], 'the only write statement in the job is its own report row');
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)]))).flat();
  for (const file of await walk(new URL('../app/', import.meta.url))) if (/\.(ts|tsx)$/.test(file.pathname) && !file.pathname.endsWith('/api/admin/ledger-reconciliation/route.ts')) assert.doesNotMatch(await readFile(file, 'utf8'), /ledger-reconciliation|reconciliation_reports|runLedgerReconciliationCron|reconcileLedger/, file.pathname);
  const route = await readFile(new URL('../app/api/admin/ledger-reconciliation/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)|runLedgerReconciliationCron|reconcileLedger|console\./, 'GET only, reads the stored report, never logs');
  const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8'); assert.match(entry, /runLedgerReconciliationCron\(/);
  const sim = await readFile(new URL('../lib/world-simulation.ts', import.meta.url), 'utf8'); assert.doesNotMatch(sim, /reconcil/i);
  const mod = await import('../lib/ledger-reconciliation-rules.ts'); assert.deepEqual([...mod.reconciliationCurrencies], ['SPK', 'LN', 'CRN', 'TSR']);
});

const iso = ms => new Date(ms).toISOString();
async function setup(t, { flag = true } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  if (flag) r.setFixtureEnv('HARIMU_LEDGER_RECONCILIATION_ENABLED', 'true');
  await r.call('world', null);
  const m = await r.importModule('lib/ledger-reconciliation.ts');
  const routeModule = await r.importModule('app/api/admin/ledger-reconciliation/route.ts');
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  const reports = async () => (await r.db.prepare('SELECT * FROM reconciliation_reports ORDER BY game_day').all()).results.map(x => ({ ...x }));
  const get = (headers = {}) => routeModule.GET(new Request('https://fixture.invalid/api/admin/ledger-reconciliation', { headers }));
  return { r, m, epoch, reports, get };
}
/** A clean ledger in every currency, written directly (the job itself never writes these). */
async function seedClean(r) {
  const at = iso(Date.now() - 86400000), sec = Math.floor(Date.now() / 1000) - 86400;
  for (const [id, nation] of [['korund1', 'korund'], ['aur1', 'aurelle']]) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
  const shift = async (id, user, order) => r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, user, order, 'Fixture shift', 'fixture', 4, at, at, at).run();
  const kindleOrder = (await r.db.prepare('SELECT id FROM work_orders LIMIT 1').first()).id;
  await shift('s-alice', 'alice', kindleOrder); await r.db.prepare('INSERT INTO shift_rewards (shift_id, wage_minor, item, quantity) VALUES (?,?,?,?)').bind('s-alice', 800, 'food', 0).run();
  await r.db.prepare('INSERT INTO shift_settlements (shift_id, clerk_user_id, wage_minor, item, quantity, settled_at) VALUES (?,?,?,?,?,?)').bind('s-alice', 'alice', 800, 'food', 0, at).run();
  await r.db.prepare('INSERT INTO shift_income_tax (shift_id, clerk_user_id, gross_minor, tax_minor, rate_percent, settled_at) VALUES (?,?,?,?,?,?)').bind('s-alice', 'alice', 800, 120, 15, at).run();
  for (const [id, user, delta] of [['e-a', 'alice', 1000], ['e-b', 'bob', 2000]]) await r.db.prepare("INSERT INTO citizen_economy_events(id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','food',-1,?,?)").bind(id, user, delta, sec).run();
  await r.db.prepare("INSERT INTO citizen_tessera_exchanges(request_id,clerk_user_id,nation_id,spark_minor,tessera_minor,occurred_at) VALUES ('x-1','alice','kindle',400,100,?)").bind(sec).run();
  await r.db.prepare("INSERT INTO player_listings (id,seller_id,item,quantity,unit_minor,created_at) VALUES ('l-1','bob','food',2,100,?)").bind(sec).run();
  await r.db.prepare("INSERT INTO player_fills (request_id,listing_id,buyer_id,seller_id,item,quantity,amount_minor,filled_at) VALUES ('f-1','l-1','alice','bob','food',2,200,?)").bind(sec).run();
  await shift('s-k', 'korund1', 'korund-food-production');
  await r.db.prepare('INSERT INTO korund_settlements (shift_id,clerk_user_id,wage_minor,food_output,settled_at) VALUES (?,?,800,4,?)').bind('s-k', 'korund1', sec).run();
  await r.db.prepare("INSERT INTO korund_coupon_redemptions(id,clerk_user_id,game_week,coupon,item,quantity,price_minor,occurred_at) VALUES ('c-1','korund1',1,'goods','soap',1,200,?)").bind(sec).run();
  await shift('s-a', 'aur1', 'aurelle-food-estate');
  await r.db.prepare('INSERT INTO aurelle_settlements VALUES (?,?,?,?,?,?)').bind('s-a', 'aur1', 800, 4, 2, sec).run();
  await r.db.prepare("INSERT INTO aurelle_receipts(id,clerk_user_id,action,quantity,occurred_at) VALUES ('r-1','aur1','aurelle-buy-food',2,?)").bind(sec).run();
  await r.db.prepare('INSERT INTO aurelle_purchases VALUES (?,?,?,?)').bind('r-1', 'aur1', 2, 300).run();
  await r.db.prepare("INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at) VALUES ('g-1','alice',5000,'starter-grant',?)").bind(sec).run();
  await r.db.prepare("INSERT INTO world_square_purchases(request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at) VALUES ('sq-1','alice','kindle',5,5,2500,?)").bind(sec).run();
  await r.db.prepare("INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at) VALUES ('tsr-square-sq-1','alice',-2500,'square-purchase',?)").bind(sec).run();
}
const dump = async r => { const out = {}; for (const table of ['shift_settlements', 'shift_income_tax', 'citizen_economy_events', 'citizen_tessera_exchanges', 'player_fills', 'market_trades', 'korund_settlements', 'korund_coupon_redemptions', 'aurelle_settlements', 'aurelle_purchases', 'citizen_tessera_ledger', 'world_square_purchases', 'economy_funds', 'korund_resources', 'aurelle_resources']) out[table] = JSON.stringify((await r.db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all()).results); out.balances = JSON.stringify((await r.db.prepare('SELECT * FROM citizen_wallet_balances ORDER BY clerk_user_id').all()).results); return out; };

test('flag off: the job does nothing and the admin route is a 404 even with a token configured', async t => {
  const { r, m, epoch, reports, get } = await setup(t, { flag: false });
  r.setFixtureEnv('HARIMU_ADMIN_TOKEN', TOKEN);
  assert.deepEqual(await m.runLedgerReconciliationCron(r.db, epoch + 5, { enabled: false }), { status: 'disabled' });
  assert.deepEqual(await reports(), []);
  const res = await get({ Authorization: `Bearer ${TOKEN}` }); assert.equal(res.status, 404);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
});

test('admin route fails closed: secret unset or short is 404; missing or wrong token is 401; the right token returns the aggregate report and never the token', async t => {
  const { r, m, epoch, get } = await setup(t);
  assert.equal((await get()).status, 404, 'secret unset (the shipping state)');
  assert.equal((await get({ Authorization: `Bearer ${TOKEN}` })).status, 404, 'secret unset, token sent');
  r.setFixtureEnv('HARIMU_ADMIN_TOKEN', 'short'); assert.equal((await get({ Authorization: 'Bearer short' })).status, 404, 'a short secret never authorizes');
  r.setFixtureEnv('HARIMU_ADMIN_TOKEN', TOKEN);
  for (const headers of [{}, { Authorization: '' }, { Authorization: TOKEN }, { Authorization: `Basic ${TOKEN}` }, { Authorization: 'Bearer wrong-token-0123456789abcdef' }, { Authorization: `Bearer ${TOKEN}x` }, { Authorization: `Bearer ${TOKEN.slice(1)}` }]) {
    const res = await get(headers); assert.equal(res.status, 401, JSON.stringify(headers)); assert.doesNotMatch(await res.text(), new RegExp(TOKEN));
  }
  const empty = await get({ Authorization: `Bearer ${TOKEN}` }); assert.equal(empty.status, 200); assert.equal(empty.headers.get('Cache-Control'), 'private, no-store'); assert.deepEqual(await empty.json(), { report: null });
  await m.runLedgerReconciliationCron(r.db, epoch + 5, { enabled: true });
  const text = await (await get({ Authorization: `Bearer ${TOKEN}` })).text(); const body = JSON.parse(text);
  assert.doesNotMatch(text, new RegExp(TOKEN)); assert.equal(body.report.gameDay, 1); assert.equal(body.report.mismatchCount, 0);
  assert.deepEqual(Object.keys(body.report).sort(), ['firstMismatches', 'gameDay', 'mismatchCount', 'reconciledAt', 'totals']);
  assert.doesNotMatch(text, /Private (alice|bob)/, 'no display names');
});

test('a clean seeded ledger reconciles with zero mismatches in all four currencies and the totals add up', async t => {
  const { r, m, epoch, reports } = await setup(t); await seedClean(r);
  const result = await m.reconcileLedger(r.db);
  assert.equal(result.mismatchCount, 0, JSON.stringify(result.mismatches)); assert.deepEqual(result.mismatches, []);
  const t1 = result.totals;
  assert.deepEqual(Object.keys(t1), ['SPK', 'LN', 'CRN', 'TSR']);
  for (const c of Object.keys(t1)) { assert.ok(t1[c].entries > 0, c); assert.equal(t1[c].walletTotalMinor, t1[c].creditsMinor - t1[c].debitsMinor, c); assert.equal(t1[c].mismatches, 0, c); }
  assert.equal(t1.LN.walletTotalMinor, 600); assert.equal(t1.CRN.walletTotalMinor, 500); assert.equal(t1.TSR.walletTotalMinor, 5000 - 2500 + 100);
  assert.equal(t1.SPK.walletTotalMinor, 800 - 120 + 1000 + 2000 - 400 + 0, 'a fill moves Spark between citizens and adds nothing');
  const run = await m.runLedgerReconciliationCron(r.db, epoch + 10, { enabled: true }); assert.equal(run.status, 'reported'); assert.equal(run.report.mismatchCount, 0);
  assert.equal((await reports()).length, 1);
  // Cross-check against the app's own numbers: the Korund and Aurelle wallets the citizen route shows.
  assert.equal((await r.call('citizen', 'korund1')).data.korundPlan.walletMinor, 600);
  assert.equal((await r.call('citizen', 'aur1')).data.aurellePlan.walletMinor, 500);
});

test('a completed gray-market trade (#43): its LN legs are in the LN totals, with zero mismatches, and the balances match the Korund wallet', async t => {
  const { r, m } = await setup(t); await seedClean(r);
  const before = (await m.reconcileLedger(r.db)).totals.LN;
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('korund2','korund','Private korund2',18,0,'Good standing',?,?)").bind(iso(Date.now()), iso(Date.now())).run();
  const sec = Math.floor(Date.now() / 1000) - 3600;
  await r.db.prepare("INSERT INTO gray_offers(id,clerk_user_id,amount_minor,ask_rate,cash_minor,created_at,expires_at) VALUES ('o-1','korund1',400,100,400,?,?)").bind(sec - 60, sec + 7200).run();
  await r.db.prepare("INSERT INTO gray_trades(offer_id,request_id,seller_id,buyer_id,amount_minor,cash_minor,ask_rate,traded_at) VALUES ('o-1','a-1','korund1','korund2',400,400,100,?)").bind(sec).run();
  const result = await m.reconcileLedger(r.db);
  assert.equal(result.mismatchCount, 0, JSON.stringify(result.mismatches)); assert.equal(result.totals.LN.mismatches, 0);
  const after = result.totals.LN;
  assert.equal(after.entries, before.entries + 2, 'the trade adds two LN legs: LN bought and LN sold');
  assert.equal(after.creditsMinor, before.creditsMinor + 400); assert.equal(after.debitsMinor, before.debitsMinor + 400);
  assert.equal(after.walletTotalMinor, before.walletTotalMinor, 'a trade moves LN between citizens and creates none');
  assert.equal(after.accounts, before.accounts + 1, 'the buyer is a new LN account');
  // the balances the reconciliation compares are the Korund wallets the citizen route shows (one shared function)
  assert.equal((await r.call('citizen', 'korund1')).data.korundPlan.walletMinor, 600 - 400);
  assert.equal((await r.call('citizen', 'korund2')).data.korundPlan.walletMinor, 400);
  // and without the trade legs the same wallets would be flagged, so the legs are really read
  await r.db.prepare('DELETE FROM gray_trades').run();
  assert.equal((await m.reconcileLedger(r.db)).totals.LN.walletTotalMinor, before.walletTotalMinor);
  const src = await readFile(new URL('../lib/ledger-reconciliation.ts', import.meta.url), 'utf8');
  assert.match(src, /import \{ laborNoteSql \} from '\.\/korund-wallet'/); assert.match(src, /laborNoteSql\('c\.clerk_user_id'\)/);
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /FROM korund_coupon_redemptions WHERE clerk_user_id = c\.clerk_user_id/, 'no inline copy of the LN formula');
});

test('a deliberately corrupted entry or balance is reported with its account id, nothing is corrected, and the log line appears once', async t => {
  const { r, m, epoch, reports } = await setup(t); await seedClean(r);
  await allowCorruption(r, ['shift_settlements', 'shift_income_tax', 'citizen_economy_events', 'korund_coupon_redemptions', 'aurelle_purchases', 'citizen_tessera_ledger']); // simulate corruption that got past the table checks
  if (!onPostgres) await r.db.prepare("UPDATE shift_settlements SET wage_minor = 812.5 WHERE shift_id = 's-alice'").run();   // non-integer SPK (SQLite only: a Postgres BIGINT column cannot hold it)
  await r.db.prepare("UPDATE shift_income_tax SET tax_minor = 900 WHERE shift_id = 's-alice'").run();                    // tax over gross
  await r.db.prepare("INSERT INTO citizen_economy_events(id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES ('bad-1','bob','buy','food',1,-50000,1)").run(); // bob goes negative
  await r.db.prepare("UPDATE korund_coupon_redemptions SET price_minor = -200 WHERE id = 'c-1'").run();                  // negative LN entry
  await r.db.prepare("UPDATE aurelle_purchases SET spend_minor = 301 WHERE id = 'r-1'").run();                           // CRN purchase not quantity x price
  await r.db.prepare("INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at) VALUES ('orphan-1','bob',-2500,'square-purchase',1)").run(); // TSR debit with no purchase
  const before = await dump(r);
  const spy = []; const original = console.error; console.error = (...args) => spy.push(args.join(' ')); let run;
  try { run = await m.runLedgerReconciliationCron(r.db, epoch + 20, { enabled: true }); } finally { console.error = original; }
  assert.equal(run.status, 'reported'); assert.ok(run.report.mismatchCount >= (onPostgres ? 5 : 6), String(run.report.mismatchCount));
  const hit = (currency, check, account) => run.report.firstMismatches.some(x => x.currency === currency && x.check.startsWith(check) && x.account === account);
  if (!onPostgres) assert.ok(hit('SPK', 'non_integer:shift_settlements.wage_minor', 'alice'), JSON.stringify(run.report.firstMismatches));
  assert.ok(hit('SPK', 'tax_over_gross', 'alice')); assert.ok(hit('SPK', 'negative_wallet', 'bob')); assert.ok(hit('LN', 'negative:korund_coupon_redemptions', 'korund1'));
  assert.ok(hit('CRN', 'purchase_not_quantity_times_price', 'aur1')); assert.ok(hit('TSR', 'square_ledger_debit_without_purchase', 'bob'));
  assert.ok(run.report.totals.SPK.mismatches > 0 && run.report.totals.LN.mismatches > 0 && run.report.totals.CRN.mismatches > 0 && run.report.totals.TSR.mismatches > 0);
  assert.equal(spy.length, 1, 'one error line'); assert.match(spy[0], /^\[ledger-reconciliation\] MISMATCH game_day=1 count=\d+ checks=.*SPK:negative_wallet/); assert.doesNotMatch(spy[0], /\n/); assert.doesNotMatch(spy[0], /\b(alice|bob|korund1|aur1)\b/, 'no account ids in Worker logs');
  assert.deepEqual(await dump(r), before, 'no wallet, fund or ledger row was touched');
  const stored = (await reports())[0]; assert.equal(stored.mismatch_count, run.report.mismatchCount); assert.equal(JSON.parse(stored.first_mismatches_json).length <= 10, true);
});

test('wallet drift is caught: a wallet view that disagrees with its entries names every drifting account', async t => {
  const { r, m } = await setup(t); await seedClean(r);
  r.db.sqlite.exec('DROP VIEW citizen_wallet_balances'); r.db.sqlite.exec('CREATE VIEW citizen_wallet_balances AS SELECT clerk_user_id, 1 AS balance FROM citizens'); // raw DDL on both backends
  await r.db.prepare('SELECT 1 AS settled').first();
  const result = await m.reconcileLedger(r.db);
  const drift = result.mismatches.filter(x => x.check === 'wallet_not_sum_of_entries').map(x => x.account);
  assert.ok(drift.includes('alice') && drift.includes('bob'), JSON.stringify(result.mismatches));
  assert.ok(result.mismatches.some(x => x.check === 'credits_minus_debits_not_wallet_total'));
});

test('the report keeps only the first 10 mismatching ids while the count stays exact', async t => {
  const { r, m } = await setup(t); await seedClean(r);
  const ids = Array.from({ length: 14 }, (_, i) => `neg-${i}`); // 14 citizens whose wallets end up negative: 14 exact mismatches, and the rows are valid on both backends
  for (const id of ids) {
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(id, `Citizen ${id}`, iso(Date.now()), iso(Date.now())).run();
    await r.db.prepare("INSERT INTO citizen_economy_events(id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'buy','food',1,-50000,1)").bind(`neg-${id}`, id).run();
  }
  const result = await m.reconcileLedger(r.db);
  assert.ok(result.mismatchCount >= 14, String(result.mismatchCount)); assert.equal(result.mismatches.length, 10);
});

test('idempotent per game day: repeats and racing runs write one report; the next game day writes the next; one log line only', async t => {
  const { r, m, epoch, reports } = await setup(t); await seedClean(r);
  await allowCorruption(r, ['citizen_economy_events']);
  await r.db.prepare("INSERT INTO citizen_economy_events(id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES ('bad-1','bob','buy','food',1,-50000,1)").run();
  const spy = []; const original = console.error; console.error = (...args) => spy.push(args.join(' '));
  try {
    const results = await Promise.all([m.runLedgerReconciliationCron(r.db, epoch + 100, { enabled: true }), m.runLedgerReconciliationCron(r.db, epoch + 101, { enabled: true }), m.runLedgerReconciliationCron(r.db, epoch + 102, { enabled: true })]);
    assert.equal(results.filter(x => x.status === 'reported').length, 1, JSON.stringify(results.map(x => x.status))); assert.equal(results.filter(x => x.status === 'idle').length, 2);
    assert.deepEqual(await m.runLedgerReconciliationCron(r.db, epoch + DAY - 1, { enabled: true }), { status: 'idle' });
    assert.equal((await reports()).length, 1); assert.equal(spy.length, 1, 'only the run that wrote the report logs');
    assert.equal((await m.runLedgerReconciliationCron(r.db, epoch + DAY + 5, { enabled: true })).status, 'reported');
  } finally { console.error = original; }
  const rows = await reports(); assert.deepEqual(rows.map(x => x.game_day), [1, 2]); assert.deepEqual(rows.map(x => x.id), ['recon-day-1', 'recon-day-2']);
  await assert.rejects(r.db.prepare("INSERT INTO reconciliation_reports(id,game_day,run_id,reconciled_at,mismatch_count,totals_json,first_mismatches_json) VALUES ('dup',1,'x',1,0,'{}','[]')").run(), 'the table refuses a second report for a game day');
});

test('a read never writes: the admin route and the latest-report read leave every table unchanged', async t => {
  const { r, m, epoch, get } = await setup(t); await seedClean(r);
  r.setFixtureEnv('HARIMU_ADMIN_TOKEN', TOKEN);
  await m.runLedgerReconciliationCron(r.db, epoch + 5, { enabled: true });
  const before = await dump(r), reportsBefore = JSON.stringify((await r.db.prepare('SELECT * FROM reconciliation_reports').all()).results);
  for (let i = 0; i < 3; i++) assert.equal((await get({ Authorization: `Bearer ${TOKEN}` })).status, 200);
  await m.readLatestReport(r.db);
  assert.deepEqual(await dump(r), before); assert.equal(JSON.stringify((await r.db.prepare('SELECT * FROM reconciliation_reports').all()).results), reportsBefore);
});
