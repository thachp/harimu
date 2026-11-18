/** #1359: one aggregate read of lifetime earned Royal Favor (SUM(favor) from aurelle_settlements).
 *  Not the spendable or decayed balance in royalFavorSql. No new table, no migration. */
import type { GameDatabase } from './database-contract';
import { aurelleRankAt } from './aurelle-rank-rules';
import { rankFor, type RankKey } from './aurelle-rank-copy';

export type AurelleRank = { rank: string; earned: number; next: string | null; needs: number | null };
/** Lifetime earned Favor only: SUM(favor), not current balance and not spent. */
export const aurelleRankEarnedSql = 'SELECT COALESCE(SUM(favor),0) AS earned FROM aurelle_settlements WHERE clerk_user_id=?';

export async function readAurelleRank(db: GameDatabase, userId: string, nationId: string | null | undefined): Promise<AurelleRank | null> {
  if (nationId !== 'aurelle') return null;
  const row = await db.prepare(aurelleRankEarnedSql).bind(userId).first<{ earned: number }>();
  const step = aurelleRankAt(Number(row?.earned ?? 0));
  const current = rankFor(step.key as RankKey)!;
  const next = step.next ? rankFor(step.next as RankKey) : undefined;
  return { rank: current.label, earned: step.earned, next: next?.label ?? null, needs: step.needs };
}
