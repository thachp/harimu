import type { GameDatabase } from './database-contract';

/** #466: TSR credits that are NOT earned rewards, listed in the reward kiosk apart from earned rewards with their own provenance label and never counted in the
 * earned totals. Read only. A starter grant is a citizen_tessera_ledger 'starter-grant' row; the preview test faucet writes the same reason with the id prefix below.
 * Kept out of lib/tessera-rewards.ts on purpose: the earned-reward source never reads the ledger (the #465 source test pins that). */
export type NotEarnedCredit = { id: string; provenance: 'starter_grant' | 'faucet'; amountMinor: number; occurredAt: string };
export const faucetIdPrefix = 'tsr-test-faucet-'; // equal to testFaucetIdPrefix in lib/test-faucet.ts (a test pins them); importing it would pull the exchange module in
export const notEarnedListLimit = 100;

export async function readNotEarnedCredits(db: GameDatabase, userId: string): Promise<NotEarnedCredit[]> {
  const rows = (await db.prepare(`SELECT id, delta_minor, occurred_at FROM citizen_tessera_ledger WHERE clerk_user_id=? AND reason='starter-grant' AND delta_minor>0 ORDER BY occurred_at DESC, id LIMIT ${notEarnedListLimit}`)
    .bind(userId).all<{ id: string; delta_minor: number; occurred_at: number }>()).results;
  return rows.map(r => ({ id: r.id, provenance: r.id.startsWith(faucetIdPrefix) ? 'faucet' : 'starter_grant', amountMinor: Number(r.delta_minor), occurredAt: new Date(Number(r.occurred_at) * 1000).toISOString() }));
}
