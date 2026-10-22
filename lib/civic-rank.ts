/** #741: read a citizen's civic rank with one aggregate query (lib/civic-rank-rules.ts). */
import type { GameDatabase } from './database-contract';
import { civicInputsSql, civicRank, type CivicRank } from './civic-rank-rules';
export async function readCivicRank(db: GameDatabase, userId: string, nationId: string | null | undefined): Promise<CivicRank | null> {
  if (!nationId || nationId !== 'kindle') return null;
  const row = await db.prepare(civicInputsSql).bind(userId, userId, userId, userId, userId, userId).first<{ shifts: number; civic_acts: number; wallet_minor: number }>();
  return civicRank(nationId, { shifts: Number(row?.shifts ?? 0), civicActs: Number(row?.civic_acts ?? 0), walletMinor: Number(row?.wallet_minor ?? 0) });
}
