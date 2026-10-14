import type {GameDatabase} from './database-contract';
// Server-owned timings and output; clients send only a work order identifier.
export const shiftRules: Record<string, { hours: number; output: string }> = {
  harvest: { hours: 2, output: '480 food contributed to the savanna harvest' },
  freight: { hours: 4, output: '210 materials delivered by the foundry convoy' },
  archive: { hours: 3, output: '95 knowledge contributed to the civic archive' },
};

export type WorkShift = {
  id: string;
  /** Work order this shift belongs to; lets the jobs dock label only the active job (#54). */
  workOrderId?: string;
  /** Quality step result (#40): null grade = step skipped or not offered; multiplier in percent. */
  qualityGrade?: 'poor' | 'fair' | 'good' | 'excellent' | null;
  qualityMultiplierPct?: number;
  /** True while a graded shift is still running: grade, multiplier and the graded reward stay hidden until completion. */
  qualityPending?: boolean;
  orderName: string;
  output: string;
  capacitySpent: number;
  currency?: 'SPK' | 'LN' | 'CRN';
  wageMinor?: number;
  rewardItem?: string;
  rewardQuantity?: number;
  startedAt: string;
  completesAt: string;
  claimedAt: string | null;
};

export const shiftSchema = `CREATE TABLE IF NOT EXISTS work_shifts (
  id TEXT PRIMARY KEY NOT NULL,
  clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id),
  order_name TEXT NOT NULL,
  output TEXT NOT NULL,
  capacity_spent INTEGER NOT NULL CHECK(capacity_spent > 0),
  started_at TEXT NOT NULL,
  completes_at TEXT NOT NULL,
  claimed_at TEXT
)`;
export const activeShiftIndex = `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_shift
  ON work_shifts(clerk_user_id) WHERE claimed_at IS NULL`;

export const startShiftSql = `INSERT INTO work_shifts
  (id, clerk_user_id, work_order_id, order_name, output, capacity_spent, started_at, completes_at)
  SELECT ?, clerk_user_id, ?, ?, ?, ?, ?, ? FROM citizens
  WHERE clerk_user_id = ? AND nation_id IS NOT NULL AND capacity >= ?
    AND (? IS NULL OR nation_id = ?)
    AND NOT EXISTS (SELECT 1 FROM work_shifts WHERE clerk_user_id = ? AND claimed_at IS NULL)`;
export const debitShiftSql = `UPDATE citizens SET capacity = capacity - ?, updated_at = ?
  WHERE clerk_user_id = ? AND EXISTS (SELECT 1 FROM work_shifts WHERE id = ? AND clerk_user_id = ?)`;
export const recordShiftSql = `INSERT INTO work_contributions
  (clerk_user_id, work_order_id, capacity_spent, created_at)
  SELECT clerk_user_id, work_order_id, capacity_spent, ? FROM work_shifts
  WHERE id = ? AND clerk_user_id = ? AND claimed_at IS NULL AND completes_at <= ?`;
export const claimShiftSql = `UPDATE work_shifts SET claimed_at = ?
  WHERE id = ? AND clerk_user_id = ? AND claimed_at IS NULL AND completes_at <= ?`;

export async function readShifts(database: GameDatabase, userId: string): Promise<WorkShift[]> {
  const rows = await database.prepare(`SELECT s.id, s.work_order_id, s.order_name, s.output, s.capacity_spent,
    s.started_at, s.completes_at, s.claimed_at, r.wage_minor, r.item, r.quantity, q.grade, q.multiplier_pct FROM work_shifts s
    LEFT JOIN shift_rewards r ON r.shift_id = s.id LEFT JOIN shift_quality q ON q.shift_id = s.id
    WHERE s.clerk_user_id = ? ORDER BY s.started_at DESC, s.id DESC LIMIT 20`).bind(userId).all<{
      id: string; work_order_id: string; order_name: string; output: string; capacity_spent: number;
      started_at: string; completes_at: string; claimed_at: string | null;
      wage_minor: number | null; item: string | null; quantity: number | null; grade: string | null; multiplier_pct: number | null;
    }>();
  return rows.results.map((row) => ({
    id: row.id, workOrderId: row.work_order_id, orderName: row.order_name, output: row.output,
    capacitySpent: row.capacity_spent, startedAt: row.started_at,
    completesAt: row.completes_at, claimedAt: row.claimed_at,
    currency: row.work_order_id==='aurelle-food-estate'?'CRN':row.work_order_id==='korund-food-production'?'LN':'SPK',
    wageMinor: ['aurelle-food-estate','korund-food-production'].includes(row.work_order_id)?800:row.wage_minor ?? undefined, rewardItem: row.item ?? undefined, rewardQuantity: row.quantity ?? undefined,
    ...(row.multiplier_pct == null ? {} : { qualityGrade: (row.grade ?? null) as WorkShift['qualityGrade'], qualityMultiplierPct: Number(row.multiplier_pct) }),
  })).map((shift) => {
    // #40 / QA1: a graded result is revealed only once the shift is complete (the reward also encodes the multiplier).
    if (!shift.qualityGrade || shift.claimedAt || Date.parse(shift.completesAt) <= Date.now()) return shift;
    const hidden: WorkShift = { ...shift, qualityPending: true };
    delete hidden.qualityGrade; delete hidden.qualityMultiplierPct; delete hidden.wageMinor; delete hidden.rewardQuantity;
    return hidden;
  });
}
