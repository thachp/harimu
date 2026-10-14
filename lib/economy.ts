import type {GameDatabase} from './database-contract';
import { defaultRecoverySeconds } from './economy-rules';
export { recoveryInterval } from './economy-rules';
import { starterGrantSql } from './market';
import { walletHistorySql, toTransactions, sortHistory, type WalletHistoryRow, type WalletTransaction } from './wallet';
// Prototype tuning. Integer minor units: 100 cents = 1 Spark.
export const employerBudgetMinor = 100000;
export const maximumCapacity = 24;
export const recoverySeconds = defaultRecoverySeconds;
export const rewards: Record<string, { wageMinor: number; item: string; quantity: number }> = {
  harvest: { wageMinor: 800, item: 'food', quantity: 4 },
  freight: { wageMinor: 1200, item: 'materials', quantity: 2 },
  archive: { wageMinor: 600, item: 'knowledge', quantity: 1 },
};
export type Economy = {
  walletMinor: number;
  inventory: { item: string; quantity: number }[];
  nextRecoveryAt: string;
  /** Recent SPK movements, newest first (issue #39 wallet panel). */
  transactions?: WalletTransaction[];
  /** Tessera holdings from the World Registry ledger (#122): PoC starter grant minus square purchases. */
  tesseraMinor?: number;
};
export const economySchema = `CREATE TABLE IF NOT EXISTS shift_settlements (
  shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id),
  clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  wage_minor INTEGER NOT NULL CHECK(typeof(wage_minor) = 'integer' AND wage_minor >= 0),
  item TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(typeof(quantity) = 'integer' AND quantity >= 0),
  settled_at TEXT NOT NULL
)`;
export const recoverySchema = `CREATE TABLE IF NOT EXISTS capacity_clocks (
  clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  recovered_at INTEGER NOT NULL
)`;
// Snapshot reward terms on start; later tuning must not change an agreed shift.
export const rewardSchema = `CREATE TABLE IF NOT EXISTS shift_rewards (
  shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id),
  wage_minor INTEGER NOT NULL CHECK(typeof(wage_minor) = 'integer' AND wage_minor >= 0),
  item TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(typeof(quantity) = 'integer' AND quantity >= 0)
)`;
export const fundSchema = `CREATE TABLE IF NOT EXISTS economy_funds (
  id TEXT PRIMARY KEY, initial_minor INTEGER NOT NULL CHECK(typeof(initial_minor) = 'integer' AND initial_minor >= 0)
)`;
export const recoverCapacitySql = `UPDATE citizens SET capacity = MIN(?, capacity +
  MAX(0, CAST((? - (SELECT recovered_at FROM capacity_clocks WHERE clerk_user_id = ?)) / ? AS INTEGER)) * ?)
  WHERE clerk_user_id = ?`;
export const advanceClockSql = `UPDATE capacity_clocks SET recovered_at = recovered_at +
  MAX(0, CAST((? - recovered_at) / ? AS INTEGER)) * ? WHERE clerk_user_id = ?`;
export const settleSql = `INSERT OR IGNORE INTO shift_settlements
  (shift_id, clerk_user_id, wage_minor, item, quantity, settled_at)
  SELECT s.id, s.clerk_user_id, r.wage_minor, r.item, r.quantity, ?
  FROM work_shifts s JOIN shift_rewards r ON r.shift_id = s.id
  WHERE s.id = ? AND s.clerk_user_id = ? AND s.claimed_at IS NULL AND s.completes_at <= ?
    AND r.wage_minor <= (SELECT initial_minor FROM economy_funds WHERE id = 'kindle-employer')
      - COALESCE((SELECT SUM(wage_minor) FROM shift_settlements), 0)
      - COALESCE((SELECT SUM(spend_minor) FROM government_policy_executions), 0)`;
export const settledContributionSql = `INSERT INTO work_contributions
  (clerk_user_id, work_order_id, capacity_spent, created_at)
  SELECT clerk_user_id, work_order_id, capacity_spent, ? FROM work_shifts
  WHERE id = ? AND clerk_user_id = ? AND claimed_at IS NULL AND completes_at <= ?
    AND EXISTS (SELECT 1 FROM shift_settlements WHERE shift_id = work_shifts.id)`;
export const finishSettledShiftSql = `UPDATE work_shifts SET claimed_at = ?
  WHERE id = ? AND clerk_user_id = ? AND claimed_at IS NULL AND completes_at <= ?
    AND EXISTS (SELECT 1 FROM shift_settlements WHERE shift_id = work_shifts.id)`;

export async function recoverCapacity(db: GameDatabase, userId: string, now: string, interval: number) {
  const seconds = Math.floor(Date.parse(now) / 1000);
  await db.batch([
    db.prepare(starterGrantSql).bind(userId),
    db.prepare(`INSERT OR IGNORE INTO capacity_clocks (clerk_user_id, recovered_at)
      SELECT clerk_user_id, ? FROM citizens WHERE clerk_user_id = ?`).bind(seconds, userId),
    db.prepare(recoverCapacitySql).bind(maximumCapacity, seconds, userId, interval, maximumCapacity, userId),
    db.prepare(advanceClockSql).bind(seconds, interval, interval, userId),
  ]);
}
export const economySnapshotSql = `SELECT
  (SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id = ?) AS wallet_minor,
  (SELECT json_group_array(json_object('item', item, 'quantity', quantity)) FROM
    (SELECT item, quantity FROM citizen_inventory_balances WHERE clerk_user_id = ? AND quantity > 0 ORDER BY item)) AS inventory_json,
  (SELECT recovered_at FROM capacity_clocks WHERE clerk_user_id = ?) AS recovered_at`;
// economySnapshotSql stays a plain literal (tests/economy.test.py extracts it). The wallet read appends the
// history as one more column of the same statement, so balance and history share one snapshot (#49 review).
export const economyWalletSnapshotSql = economySnapshotSql + `,
  (SELECT json_group_array(json_object('id', id, 'kind', kind, 'amount_minor', amount_minor, 'item', item, 'quantity', quantity, 'occurred_at', occurred_at))
    FROM (` + walletHistorySql + `)) AS history_json`;

export async function readEconomy(db: GameDatabase, userId: string, interval: number): Promise<Economy> {
  await db.prepare(starterGrantSql).bind(userId).run();
  // One SQLite read snapshot keeps wallet and goods consistent during another tab's claim.
  // Wallet history is read in the same statement so the balance and the listed movements always agree (#49 review).
  const row = await db.prepare(economyWalletSnapshotSql).bind(userId, userId, userId, userId, userId, userId, userId).first<{
    wallet_minor: number; inventory_json: string; recovered_at: number | null; history_json: string | null;
  }>();
  const history = sortHistory(JSON.parse(row?.history_json ?? '[]') as WalletHistoryRow[]);
  // #122: Tessera comes from the World Registry ledger (PoC starter grant minus square purchases).
  const tessera = await db.prepare('SELECT COALESCE(SUM(delta_minor),0) AS balance FROM citizen_tessera_ledger WHERE clerk_user_id=?').bind(userId).first<{ balance: number }>().catch(() => null);
  return { walletMinor: row?.wallet_minor ?? 0, tesseraMinor: Number(tessera?.balance ?? 0), transactions: toTransactions(history),
    inventory: JSON.parse(row?.inventory_json ?? '[]') as Economy['inventory'],
    nextRecoveryAt: new Date(((row?.recovered_at ?? Math.floor(Date.now() / 1000)) + interval) * 1000).toISOString() };
}
