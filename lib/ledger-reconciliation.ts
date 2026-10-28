import { kindleTreasuryBalanceSql } from './economy';
import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { tesseraBalanceSql } from './tessera-exchange';
import { laborNoteSql } from './korund-wallet';
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
    UNION ALL SELECT seller_id, -fee_minor FROM market_trade_fees
    UNION ALL SELECT seller_id, -tax_minor FROM market_sales_tax
    UNION ALL SELECT seller_id, -tax_minor FROM player_fill_sales_tax
    UNION ALL SELECT clerk_user_id, -fee_minor FROM home_city_moves WHERE currency = 'SPK'
    UNION ALL SELECT clerk_user_id, credit_minor FROM savings_shield_credits WHERE status = 'paid'
    UNION ALL SELECT clerk_user_id, -amount_minor FROM party_donations
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
    ...integerAndSign('SPK', 'market_trade_fees', 'trade_id', 'fee_minor', true), // #777 sink leg
    ...integerAndSign('SPK', 'market_sales_tax', 'trade_id', 'tax_minor', true), // #844 sales-tax leg (credited to kindle-treasury)
    { currency: 'SPK', check: 'sales_tax_not_seller_or_over_gross', sql: 'SELECT x.trade_id AS acct FROM market_sales_tax x LEFT JOIN market_trades t ON t.id = x.trade_id LEFT JOIN market_orders s ON s.id = t.sell_order_id WHERE t.id IS NULL OR s.citizen_id IS NULL OR s.citizen_id <> x.seller_id OR x.tax_minor > t.qty * t.unit_minor' },
    ...integerAndSign('SPK', 'player_fill_sales_tax', 'request_id', 'tax_minor', true), // #844 follow-up: fixed-lot sales tax
    { currency: 'SPK', check: 'fill_tax_not_seller_or_over_gross', sql: 'SELECT x.request_id AS acct FROM player_fill_sales_tax x LEFT JOIN player_fills f ON f.request_id = x.request_id WHERE f.request_id IS NULL OR f.seller_id <> x.seller_id OR x.tax_minor > f.amount_minor' },
    ...integerAndSign('SPK', 'home_city_moves', 'request_id', 'fee_minor', true), // #781 move-fee sink leg
    ...integerAndSign('SPK', 'savings_shield_credits', 'absence_key', 'credit_minor', true), // #824 welfare-line credit
    ...integerAndSign('SPK', 'party_donations', 'request_id', 'amount_minor', true), // #863 donation: citizen debit, party-account credit
    { currency: 'SPK', check: 'fund_negative:kindle-treasury', sql: `SELECT 'kindle-treasury' AS acct FROM (${kindleTreasuryBalanceSql}) t WHERE t.balance < 0` },
    { currency: 'SPK', check: 'fee_not_seller_or_over_gross', sql: 'SELECT f.trade_id AS acct FROM market_trade_fees f LEFT JOIN market_trades t ON t.id = f.trade_id LEFT JOIN market_orders s ON s.id = t.sell_order_id WHERE t.id IS NULL OR s.citizen_id IS NULL OR s.citizen_id <> f.seller_id OR f.fee_minor > t.qty * t.unit_minor' },
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

// The CRN balance formula below is written out the way the app computes it (lib/aurelle.ts privateWallet = wages - purchases), because the app keeps it inline rather than in a shared view.
// The LN balance is NOT restated here: it is the shared function lib/korund-wallet `laborNoteSql` (wages - coupon redemptions + gray-market LN bought - LN sold, #43), the same
// expression the Korund wallet and the coupon guard use, so a gray trade's LN legs are in the totals. tests/ledger-reconciliation.test.mjs checks the balances agree with the citizen route.
const LN: CurrencySpec = {
  currency: 'LN',
  legs: `SELECT clerk_user_id AS acct, wage_minor AS delta FROM korund_settlements
    UNION ALL SELECT clerk_user_id, wage_minor FROM korund_post_settlements
    UNION ALL SELECT clerk_user_id, -price_minor FROM korund_coupon_redemptions
    UNION ALL SELECT buyer_id, amount_minor FROM gray_trades
    UNION ALL SELECT seller_id, -amount_minor FROM gray_trades
    UNION ALL SELECT clerk_user_id, -amount_minor FROM gray_seizures
    UNION ALL SELECT clerk_user_id, -fee_minor FROM home_city_moves WHERE currency = 'LN'`, // #781 move-fee sink leg; // #797 sink leg: destroyed, credited to no account
  appBalances: `SELECT c.clerk_user_id AS acct, ${laborNoteSql('c.clerk_user_id')} AS balance FROM citizens c`,
  probes: [
    ...integerAndSign('LN', 'korund_settlements', 'clerk_user_id', 'wage_minor', true),
    ...integerAndSign('LN', 'korund_post_settlements', 'clerk_user_id', 'wage_minor', true), // #886 (b)
    { currency: 'LN', check: 'post_wage_without_issuance', sql: 'SELECT p.shift_id AS acct FROM korund_post_settlements p LEFT JOIN labor_note_issuances i ON i.shift_id = p.shift_id WHERE i.shift_id IS NULL OR i.amount_minor <> p.wage_minor' },
    { currency: 'LN', check: 'brigade_wage_without_issuance', sql: 'SELECT p.shift_id AS acct FROM korund_settlements p LEFT JOIN labor_note_issuances i ON i.shift_id = p.shift_id WHERE i.shift_id IS NULL OR i.amount_minor <> p.wage_minor' },
    ...integerAndSign('LN', 'korund_coupon_redemptions', 'clerk_user_id', 'price_minor', true),
    ...integerAndSign('LN', 'gray_trades', 'buyer_id', 'amount_minor', true),
    ...integerAndSign('LN', 'gray_seizures', 'offer_id', 'amount_minor', true), // #797
    { currency: 'LN', check: 'seizure_not_buyer_or_over_bundle', sql: 'SELECT z.offer_id AS acct FROM gray_seizures z LEFT JOIN gray_trades t ON t.offer_id = z.offer_id WHERE t.offer_id IS NULL OR t.buyer_id <> z.clerk_user_id OR z.amount_minor > t.amount_minor' },
    { currency: 'LN', check: 'fund_negative:korund-state', sql: `SELECT r.id AS acct FROM korund_resources r WHERE r.id = 'state' AND r.initial_minor - COALESCE((SELECT SUM(wage_minor) FROM korund_settlements), 0) - COALESCE((SELECT SUM(wage_minor) FROM korund_post_settlements), 0) < 0` },
  ],
};
const CRN: CurrencySpec = {
  currency: 'CRN',
  legs: `SELECT clerk_user_id AS acct, wage_minor AS delta FROM aurelle_settlements
    UNION ALL SELECT clerk_user_id, wage_minor FROM aurelle_charter_settlements
    UNION ALL SELECT clerk_user_id, -spend_minor FROM aurelle_purchases`,
  appBalances: `SELECT c.clerk_user_id AS acct, COALESCE((SELECT SUM(wage_minor) FROM aurelle_settlements WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(wage_minor) FROM aurelle_charter_settlements WHERE clerk_user_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(spend_minor) FROM aurelle_purchases WHERE clerk_user_id = c.clerk_user_id), 0) AS balance FROM citizens c`,
  probes: [
    ...integerAndSign('CRN', 'aurelle_settlements', 'clerk_user_id', 'wage_minor', true),
    ...integerAndSign('CRN', 'aurelle_charter_settlements', 'clerk_user_id', 'wage_minor', true), // #886 (c)
    { currency: 'CRN', check: 'charter_wage_without_issuance', sql: 'SELECT p.shift_id AS acct FROM aurelle_charter_settlements p LEFT JOIN crown_issuances i ON i.shift_id = p.shift_id WHERE i.shift_id IS NULL OR i.amount_minor <> p.wage_minor' },
    { currency: 'CRN', check: 'food_estate_wage_without_issuance', sql: 'SELECT p.shift_id AS acct FROM aurelle_settlements p LEFT JOIN crown_issuances i ON i.shift_id = p.shift_id WHERE i.shift_id IS NULL OR i.amount_minor <> p.wage_minor' },
    ...integerAndSign('CRN', 'aurelle_purchases', 'clerk_user_id', 'spend_minor', true),
    { currency: 'CRN', check: 'purchase_not_quantity_times_price', sql: 'SELECT clerk_user_id AS acct FROM aurelle_purchases WHERE spend_minor <> quantity * 150' },
    { currency: 'CRN', check: 'fund_negative:aurelle-estate', sql: `SELECT r.id AS acct FROM aurelle_resources r WHERE r.id = 'estate' AND r.initial_minor + COALESCE((SELECT SUM(spend_minor) FROM aurelle_purchases), 0) - COALESCE((SELECT SUM(wage_minor) FROM aurelle_settlements), 0) - COALESCE((SELECT SUM(wage_minor) FROM aurelle_charter_settlements), 0) < 0` },
  ],
};
// The app's own Tessera balance (lib/tessera-exchange.ts tesseraBalanceSql), correlated to each citizen row.
const tesseraPerCitizen = tesseraBalanceSql.split('clerk_user_id=?').join('clerk_user_id=c.clerk_user_id');
if (tesseraPerCitizen === tesseraBalanceSql) throw new Error('tesseraBalanceSql changed shape; update the ledger reconciliation');
const TSR: CurrencySpec = {
  currency: 'TSR',
  legs: `SELECT clerk_user_id AS acct, delta_minor AS delta FROM citizen_tessera_ledger
    UNION ALL SELECT clerk_user_id, tessera_minor FROM citizen_tessera_exchanges
    UNION ALL SELECT clerk_user_id, amount_minor FROM tessera_reward_claims
    UNION ALL SELECT clerk_user_id, amount_minor FROM relocation_support_claims`, // #465: claimed earned rewards are credits against the epoch reward pool
  appBalances: `SELECT c.clerk_user_id AS acct, ${tesseraPerCitizen} AS balance FROM citizens c`,
  probes: [
    ...integerAndSign('TSR', 'citizen_tessera_ledger', 'clerk_user_id', 'delta_minor', false),
    ...integerAndSign('TSR', 'citizen_tessera_exchanges', 'clerk_user_id', 'tessera_minor', true),
    ...integerAndSign('TSR', 'world_square_purchases', 'clerk_user_id', 'price_minor', true),
    // #465 earned rewards: per epoch claimed <= allocated <= pool (allocated is exactly the sum of its entries); no entry without a settled shift of the same citizen; no claim that differs from its entry.
    ...integerAndSign('TSR', 'tessera_reward_claims', 'clerk_user_id', 'amount_minor', true),
    { currency: 'TSR', check: 'reward_epoch_allocated_over_pool', sql: `SELECT CAST(p.epoch_day AS TEXT) AS acct FROM tessera_reward_epochs p WHERE p.allocated_minor > p.pool_minor OR p.allocated_minor <> COALESCE((SELECT SUM(e.amount_minor) FROM tessera_reward_entries e WHERE e.epoch_day = p.epoch_day), 0)` },
    { currency: 'TSR', check: 'reward_epoch_claimed_over_allocated', sql: `SELECT CAST(p.epoch_day AS TEXT) AS acct FROM tessera_reward_epochs p WHERE COALESCE((SELECT SUM(c.amount_minor) FROM tessera_reward_claims c JOIN tessera_reward_entries e ON e.id = c.entry_id WHERE e.epoch_day = p.epoch_day), 0) > p.allocated_minor` },
    { currency: 'TSR', check: 'reward_entry_without_settled_shift', sql: `SELECT e.clerk_user_id AS acct FROM tessera_reward_entries e LEFT JOIN shift_settlements s ON s.shift_id = e.source_shift_id WHERE s.shift_id IS NULL OR s.clerk_user_id <> e.clerk_user_id` },
    { currency: 'TSR', check: 'reward_claim_not_its_entry', sql: `SELECT c.clerk_user_id AS acct FROM tessera_reward_claims c LEFT JOIN tessera_reward_entries e ON e.id = c.entry_id WHERE e.id IS NULL OR e.clerk_user_id <> c.clerk_user_id OR e.amount_minor <> c.amount_minor` },
    // #470 relocation support: claims never exceed their pot, and each claim is exactly its pot's flat amount.
    ...integerAndSign('TSR', 'relocation_support_claims', 'clerk_user_id', 'amount_minor', true),
    { currency: 'TSR', check: 'relocation_claims_over_pot', sql: `SELECT p.capture_id AS acct FROM relocation_support_pots p WHERE COALESCE((SELECT SUM(c.amount_minor) FROM relocation_support_claims c WHERE c.capture_id = p.capture_id), 0) > p.protocol_minor + p.treasury_topup_minor` },
    { currency: 'TSR', check: 'relocation_claim_not_its_pot', sql: `SELECT c.clerk_user_id AS acct FROM relocation_support_claims c LEFT JOIN relocation_support_pots p ON p.capture_id = c.capture_id WHERE p.capture_id IS NULL OR p.per_citizen_minor <> c.amount_minor` },
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
 *  run (and any racing run that loses the unique game_day) does nothing. A mismatch logs one error line to the Worker logs (game day, count and check names only: no account ids); there is no automatic correction. Flag off: nothing happens. */
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
    console.error(`[ledger-reconciliation] MISMATCH game_day=${gameDay} count=${result.mismatchCount} checks=${[...new Set(result.mismatches.map(item => `${item.currency}:${item.check}`))].join(',')} (account ids are in the stored report, not in logs)`);
  }
  return { status: 'reported' as const, report: publicReport(saved) };
}
