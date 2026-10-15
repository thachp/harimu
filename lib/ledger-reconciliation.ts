import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { tesseraBalanceSql } from './tessera-exchange';
import { firstMismatches, reconciliationCurrencies, reconciliationGameDay, type CurrencyTotals, type Mismatch, type ReconciliationCurrency } from './ledger-reconciliation-rules';
export * from './ledger-reconciliation-rules';

/** #432: daily ledger reconciliation PoC behind HARIMU_LEDGER_RECONCILIATION_ENABLED (default "false").
 *  READ-ONLY ON MONEY. Every statement `reconcileLedger` runs is a SELECT. The only write anywhere in this file is the job's own immutable `reconciliation_reports` row,
 *  one per game day, written by the scheduled Worker (`runLedgerReconciliationCron`). Nothing here corrects, rolls back or mutates a wallet, fund or ledger row.
 *  Harimu has no double-entry ledger table and stores no wallet balance (see the #432 scope comment): money is single-entry rows in per-nation tables and every balance is
 *  derived on read. So each currency's entry rows are read as double-entry legs: each row is a credit or debit on a citizen account, matched by a named counterpart
 *  (employer fund, Kindle treasury, Kindle merchant, Clearing House, Korund state fund or coupon sink, Aurelle estate fund) that the checks below keep consistent.
 *  Currencies: SPK (Kindle), LN (Korund wages and coupon redemptions), CRN (Aurelle wages and purchases), TSR (World Registry ledger and kiosk exchanges). docs 12.3 and the wallet
 *  panels label those wallets SPK, LN and CRN. Crown decrees move only mint parity, not wallets, so they have no entries to reconcile. */
export const reconciliationSchemas = [
  `CREATE TABLE IF NOT EXISTS reconciliation_reports (
 id TEXT PRIMARY KEY,
 game_day INTEGER NOT NULL UNIQUE CHECK(game_day >= 1),
 run_id TEXT NOT NULL,
 reconciled_at INTEGER NOT NULL,
 mismatch_count INTEGER NOT NULL CHECK(mismatch_count >= 0),
 totals_json TEXT NOT NULL,
 first_mismatches_json TEXT NOT NULL
)`,
];

type Probe = { currency: ReconciliationCurrency; check: string; sql: string };
type CurrencySpec = { currency: ReconciliationCurrency; legs: string; appBalances: string; probes: Probe[] };
const integerAndSign = (currency: ReconciliationCurrency, table: string, acct: string, column: string, nonNegative: boolean): Probe[] => [
  { currency, check: `non_integer:${table}.${column}`, sql: `SELECT ${acct} AS acct FROM ${table} WHERE ${column} <> CAST(${column} AS BIGINT)` },
  ...(nonNegative ? [{ currency, check: `negative:${table}.${column}`, sql: `SELECT ${acct} AS acct FROM ${table} WHERE ${column} < 0` }] : []),
];

const SPK: CurrencySpec = {
  currency: 'SPK',
  legs: `SELECT clerk_user_id AS acct, wage_minor AS delta FROM shift_settlements
    UNION ALL SELECT clerk_user_id, -tax_minor FROM shift_income_tax
    UNION ALL SELECT clerk_user_id, wallet_delta FROM citizen_economy_events
    UNION ALL SELECT clerk_user_id, -spark_minor FROM citizen_tessera_exchanges
    UNION ALL SELECT seller_id, amount_minor FROM player_fills
    UNION ALL SELECT buyer_id, -amount_minor FROM player_fills
    UNION ALL SELECT o.citizen_id, t.qty * t.unit_minor FROM market_trades t JOIN market_orders o ON o.id = t.sell_order_id WHERE o.citizen_id IS NOT NULL
    UNION ALL SELECT o.citizen_id, -(t.qty * t.unit_minor) FROM market_trades t JOIN market_orders o ON o.id = t.buy_order_id WHERE o.citizen_id IS NOT NULL
    UNION ALL SELECT citizen_id, -(remaining * limit_unit_minor) FROM market_open_orders WHERE side = 'buy' AND citizen_id IS NOT NULL`,
  appBalances: 'SELECT clerk_user_id AS acct, balance FROM citizen_wallet_balances',
  probes: [
    ...integerAndSign('SPK', 'shift_settlements', 'clerk_user_id', 'wage_minor', true),
    ...integerAndSign('SPK', 'shift_income_tax', 'clerk_user_id', 'tax_minor', true),
    ...integerAndSign('SPK', 'shift_income_tax', 'clerk_user_id', 'gross_minor', true),
    ...integerAndSign('SPK', 'citizen_economy_events', 'clerk_user_id', 'wallet_delta', false),
    ...integerAndSign('SPK', 'citizen_tessera_exchanges', 'clerk_user_id', 'spark_minor', true),
    ...integerAndSign('SPK', 'player_fills', 'buyer_id', 'amount_minor', true),
    ...integerAndSign('SPK', 'market_trades', 'id', 'unit_minor', true),
    ...integerAndSign('SPK', 'market_trades', 'id', 'qty', true),
    // Transfers: the debit leg and the credit leg must agree with each other and with the counterpart's record.
    { currency: 'SPK', check: 'tax_over_gross', sql: 'SELECT clerk_user_id AS acct FROM shift_income_tax WHERE tax_minor > gross_minor' },
    { currency: 'SPK', check: 'tax_gross_not_wage', sql: 'SELECT t.clerk_user_id AS acct FROM shift_income_tax t LEFT JOIN shift_settlements s ON s.shift_id = t.shift_id WHERE s.shift_id IS NULL OR t.gross_minor <> s.wage_minor' },
    { currency: 'SPK', check: 'wage_not_employer_reward', sql: 'SELECT s.clerk_user_id AS acct FROM shift_settlements s JOIN shift_rewards r ON r.shift_id = s.shift_id WHERE r.wage_minor <> s.wage_minor' },
    { currency: 'SPK', check: 'fill_amount_not_unit_times_quantity', sql: 'SELECT f.buyer_id AS acct FROM player_fills f JOIN player_listings l ON l.id = f.listing_id WHERE f.amount_minor <> l.unit_minor * f.quantity' },
    { currency: 'SPK', check: 'fill_account_missing', sql: 'SELECT f.request_id AS acct FROM player_fills f LEFT JOIN citizens b ON b.clerk_user_id = f.buyer_id LEFT JOIN citizens s ON s.clerk_user_id = f.seller_id WHERE b.clerk_user_id IS NULL OR s.clerk_user_id IS NULL' },
    { currency: 'SPK', check: 'trade_leg_missing', sql: 'SELECT t.id AS acct FROM market_trades t LEFT JOIN market_orders b ON b.id = t.buy_order_id LEFT JOIN market_orders s ON s.id = t.sell_order_id WHERE b.id IS NULL OR s.id IS NULL' },
    { currency: 'SPK', check: 'fund_negative:kindle-employer', sql: `SELECT f.id AS acct FROM economy_funds f WHERE f.id = 'kindle-employer' AND f.initial_minor - COALESCE((SELECT SUM(wage_minor) FROM shift_settlements), 0) - COALESCE((SELECT SUM(spend_minor) FROM government_policy_executions), 0) < 0` },
    { currency: 'SPK', check: 'fund_negative:kindle-merchant', sql: `SELECT f.id AS acct FROM economy_funds f WHERE f.id = 'kindle-merchant' AND f.initial_minor - COALESCE((SELECT SUM(wallet_delta) FROM citizen_economy_events), 0) < 0` },
  ],
};

// The LN and CRN balance formulas below are written out the way the app computes them (lib/korund.ts wallet = wages - coupon redemptions; lib/aurelle.ts privateWallet =
// wages - purchases), because the app keeps those inline rather than in a shared view. tests/ledger-reconciliation.test.mjs checks they agree with what the citizen route returns.
const LN: CurrencySpec = {
  currency: 'LN',
  legs: `SELECT clerk_user_id AS acct, wage_minor AS delta FROM korund_settlements
    UNION ALL SELECT clerk_user_id, -price_minor FROM korund_coupon_redemptions`,
  appBalances: `SELECT c.clerk_user_id AS acct, COALESCE((SELECT SUM(wage_minor) FROM korund_settlements WHERE clerk_user_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(price_minor) FROM korund_coupon_redemptions WHERE clerk_user_id = c.clerk_user_id), 0) AS balance FROM citizens c`,
  probes: [
    ...integerAndSign('LN', 'korund_settlements', 'clerk_user_id', 'wage_minor', true),
    ...integerAndSign('LN', 'korund_coupon_redemptions', 'clerk_user_id', 'price_minor', true),
    { currency: 'LN', check: 'fund_negative:korund-state', sql: `SELECT r.id AS acct FROM korund_resources r WHERE r.id = 'state' AND r.initial_minor - COALESCE((SELECT SUM(wage_minor) FROM korund_settlements), 0) < 0` },
  ],
};
const CRN: CurrencySpec = {
  currency: 'CRN',
  legs: `SELECT clerk_user_id AS acct, wage_minor AS delta FROM aurelle_settlements
    UNION ALL SELECT clerk_user_id, -spend_minor FROM aurelle_purchases`,
  appBalances: `SELECT c.clerk_user_id AS acct, COALESCE((SELECT SUM(wage_minor) FROM aurelle_settlements WHERE clerk_user_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(spend_minor) FROM aurelle_purchases WHERE clerk_user_id = c.clerk_user_id), 0) AS balance FROM citizens c`,
  probes: [
    ...integerAndSign('CRN', 'aurelle_settlements', 'clerk_user_id', 'wage_minor', true),
    ...integerAndSign('CRN', 'aurelle_purchases', 'clerk_user_id', 'spend_minor', true),
    { currency: 'CRN', check: 'purchase_not_quantity_times_price', sql: 'SELECT clerk_user_id AS acct FROM aurelle_purchases WHERE spend_minor <> quantity * 150' },
    { currency: 'CRN', check: 'fund_negative:aurelle-estate', sql: `SELECT r.id AS acct FROM aurelle_resources r WHERE r.id = 'estate' AND r.initial_minor + COALESCE((SELECT SUM(spend_minor) FROM aurelle_purchases), 0) - COALESCE((SELECT SUM(wage_minor) FROM aurelle_settlements), 0) < 0` },
  ],
};
// The app's own Tessera balance (lib/tessera-exchange.ts tesseraBalanceSql), correlated to each citizen row.
const tesseraPerCitizen = tesseraBalanceSql.split('clerk_user_id=?').join('clerk_user_id=c.clerk_user_id');
if (tesseraPerCitizen === tesseraBalanceSql) throw new Error('tesseraBalanceSql changed shape; update the ledger reconciliation');
const TSR: CurrencySpec = {
  currency: 'TSR',
  legs: `SELECT clerk_user_id AS acct, delta_minor AS delta FROM citizen_tessera_ledger
    UNION ALL SELECT clerk_user_id, tessera_minor FROM citizen_tessera_exchanges`,
  appBalances: `SELECT c.clerk_user_id AS acct, ${tesseraPerCitizen} AS balance FROM citizens c`,
  probes: [
    ...integerAndSign('TSR', 'citizen_tessera_ledger', 'clerk_user_id', 'delta_minor', false),
    ...integerAndSign('TSR', 'citizen_tessera_exchanges', 'clerk_user_id', 'tessera_minor', true),
    ...integerAndSign('TSR', 'world_square_purchases', 'clerk_user_id', 'price_minor', true),
    { currency: 'TSR', check: 'square_purchase_not_ledger_debit', sql: `SELECT p.clerk_user_id AS acct FROM world_square_purchases p LEFT JOIN citizen_tessera_ledger l ON l.id = 'tsr-square-' || p.request_id WHERE l.id IS NULL OR l.delta_minor <> -p.price_minor` },
    { currency: 'TSR', check: 'square_ledger_debit_without_purchase', sql: `SELECT l.clerk_user_id AS acct FROM citizen_tessera_ledger l WHERE l.reason = 'square-purchase' AND NOT EXISTS (SELECT 1 FROM world_square_purchases p WHERE 'tsr-square-' || p.request_id = l.id)` },
  ],
};
export const reconciliationSpecs: readonly CurrencySpec[] = [SPK, LN, CRN, TSR];
if (reconciliationSpecs.map(spec => spec.currency).join() !== reconciliationCurrencies.join()) throw new Error('currency list out of sync');

/** Every SQL statement the job runs against money tables, so a test can prove they are all SELECTs. */
export const reconciliationStatementsForAudit = (): string[] => reconciliationSpecs.flatMap(spec => [spec.legs, spec.appBalances, ...spec.probes.map(probe => probe.sql)]);

const num = (value: unknown): number => Number(value ?? 0);
const walletMismatchSql = (spec: CurrencySpec) => `SELECT w.acct AS acct FROM (${spec.appBalances}) w LEFT JOIN (SELECT acct, SUM(delta) AS bal FROM (${spec.legs}) e GROUP BY acct) l ON l.acct = w.acct WHERE COALESCE(l.bal, 0) <> w.balance
  UNION ALL SELECT l.acct FROM (SELECT acct, SUM(delta) AS bal FROM (${spec.legs}) e GROUP BY acct) l LEFT JOIN (${spec.appBalances}) w ON w.acct = l.acct WHERE w.acct IS NULL`;
const negativeWalletSql = (spec: CurrencySpec) => `SELECT acct FROM (${spec.appBalances}) w WHERE balance < 0`;

/** Read-only. Runs every check for every currency and returns the exact mismatch count, the first few mismatches and per-currency totals. */
export async function reconcileLedger(db: GameDatabase) {
  const totals = {} as Record<ReconciliationCurrency, CurrencyTotals>;
  const found: Mismatch[] = [];
  let mismatchCount = 0;
  for (const spec of reconciliationSpecs) {
    const sums = await db.prepare(`SELECT COUNT(*) AS entries, COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS credits, COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS debits,
      COUNT(DISTINCT acct) AS accounts FROM (${spec.legs}) e`).first<{ entries: number; credits: number; debits: number; accounts: number }>();
    const wallets = await db.prepare(`SELECT COALESCE(SUM(balance), 0) AS total FROM (${spec.appBalances}) w`).first<{ total: number }>();
    const credits = num(sums?.credits), debits = num(sums?.debits), walletTotal = num(wallets?.total);
    const probes: Probe[] = [
      { currency: spec.currency, check: 'wallet_not_sum_of_entries', sql: walletMismatchSql(spec) },
      { currency: spec.currency, check: 'negative_wallet', sql: negativeWalletSql(spec) },
      ...spec.probes,
    ];
    let currencyMismatches = 0;
    // Double-entry identity over the whole currency: what citizen wallets hold equals credits minus debits (every credit has its counterpart debit and the reverse).
    if (walletTotal !== credits - debits) { currencyMismatches++; found.push({ currency: spec.currency, check: 'credits_minus_debits_not_wallet_total', account: 'currency-total' }); }
    for (const probe of probes) {
      const count = num((await db.prepare(`SELECT COUNT(*) AS n FROM (${probe.sql}) q`).first<{ n: number }>())?.n);
      if (!count) continue;
      currencyMismatches += count;
      const ids = (await db.prepare(`SELECT acct FROM (${probe.sql}) q ORDER BY acct LIMIT 10`).all<{ acct: string }>()).results;
      for (const row of ids) found.push({ currency: spec.currency, check: probe.check, account: String(row.acct) });
    }
    mismatchCount += currencyMismatches;
    totals[spec.currency] = { entries: num(sums?.entries), creditsMinor: credits, debitsMinor: debits, walletTotalMinor: walletTotal, accounts: num(sums?.accounts), mismatches: currencyMismatches };
  }
  return { totals, mismatchCount, mismatches: firstMismatches(found) };
}

export type ReconciliationReport = { gameDay: number; reconciledAt: number; mismatchCount: number; totals: Record<ReconciliationCurrency, CurrencyTotals>; firstMismatches: Mismatch[] };
type ReportRow = { game_day: number; run_id: string; reconciled_at: number; mismatch_count: number; totals_json: string; first_mismatches_json: string };
const columns = 'id,game_day,run_id,reconciled_at,mismatch_count,totals_json,first_mismatches_json';
const publicReport = (row: ReportRow): ReconciliationReport => ({ gameDay: Number(row.game_day), reconciledAt: Number(row.reconciled_at), mismatchCount: Number(row.mismatch_count),
  totals: JSON.parse(row.totals_json), firstMismatches: JSON.parse(row.first_mismatches_json) });

async function worldEpoch(db: GameDatabase): Promise<number> {
  const clock = await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{ epoch_seconds: number }>().catch(tolerate(isMissingRelation, null));
  return clock ? Number(clock.epoch_seconds) : 0;
}

/** Read-only: the newest report, or null (also null on a database without migration 0045). */
export async function readLatestReport(db: GameDatabase): Promise<ReconciliationReport | null> {
  const row = await db.prepare(`SELECT ${columns} FROM reconciliation_reports ORDER BY game_day DESC LIMIT 1`).first<ReportRow>().catch(tolerate(isMissingRelation, null));
  return row ? publicReport(row) : null;
}

/** The scheduled Worker's daily reconciliation (never a read, never from a route). One immutable report per game day: the first run of a game day reconciles and writes it, every later
 *  run (and any racing run that loses the unique game_day) does nothing. A mismatch logs one error line to the Worker logs; there is no automatic correction. Flag off: nothing happens. */
export async function runLedgerReconciliationCron(db: GameDatabase, now: number, options: { enabled: boolean }) {
  if (!options.enabled) return { status: 'disabled' as const };
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid authoritative world time.');
  const gameDay = reconciliationGameDay(now, await worldEpoch(db));
  if (await db.prepare('SELECT 1 AS found FROM reconciliation_reports WHERE game_day=?').bind(gameDay).first()) return { status: 'idle' as const };
  const result = await reconcileLedger(db);
  const runId = crypto.randomUUID();
  await db.prepare(`INSERT INTO reconciliation_reports (${columns}) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`)
    .bind(`recon-day-${gameDay}`, gameDay, runId, now, result.mismatchCount, JSON.stringify(result.totals), JSON.stringify(result.mismatches)).run();
  const saved = await db.prepare(`SELECT ${columns} FROM reconciliation_reports WHERE game_day=?`).bind(gameDay).first<ReportRow>();
  if (!saved || saved.run_id !== runId) return { status: 'idle' as const }; // another run wrote this game day's report first
  if (result.mismatchCount > 0) {
    console.error(`[ledger-reconciliation] MISMATCH game_day=${gameDay} count=${result.mismatchCount} first=${result.mismatches.map(item => `${item.currency}:${item.check}:${item.account}`).join(',')}`);
  }
  return { status: 'reported' as const, report: publicReport(saved) };
}
