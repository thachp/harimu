/** #1340: Kindle congregation donations (docs §14.4) behind HARIMU_CONGREGATION_DONATIONS_ENABLED. Copies #863 party donations:
 *  each congregation_donations row is both legs of one Spark transfer: the citizen debit (citizen_wallet_balances subtracts it) and the
 *  congregation-fund credit (congregationFundBalanceSql sums it). No Spark is created or destroyed; Spark origin is recorded as a sink (#465).
 *  Kindle-capital congregations and current members only. Korund and Aurelle are refused. Nothing spends from the fund and no donor list is public. */
import type { GameDatabase } from './database-contract';
import { memberCongregation } from './congregations';
import { recordSparkSink } from './spark-origin.ts'; // #465
import { flagOn } from './flag-pack.mjs';
export { donationAmountOk, donationRequestIdOk } from './party-donations-rules';

/** In HARIMU_GRAY_PACK (preview "true", production "false"); a direct env string wins. Exactly "true" is on. */
export const congregationDonationsFlagOn = (env: unknown) => flagOn(env, 'HARIMU_CONGREGATION_DONATIONS_ENABLED');
export const congregationDonationsSchemas = [
  `CREATE TABLE IF NOT EXISTS congregation_donations (
 request_id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 congregation_id TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor) = 'integer' AND amount_minor > 0),
 donated_at INTEGER NOT NULL
)`,
  'CREATE INDEX IF NOT EXISTS idx_congregation_donations_congregation ON congregation_donations(congregation_id)',
  'CREATE INDEX IF NOT EXISTS idx_congregation_donations_user ON congregation_donations(clerk_user_id, donated_at)',
];
export const congregationFundBalanceSql = 'SELECT COALESCE(SUM(amount_minor),0) AS balance FROM congregation_donations WHERE congregation_id=?';
type Refusal = { ok: false; status: number; error: string; reason: string };
const refuse = (status: number, reason: string, error: string): Refusal => ({ ok: false, status, reason, error });

/** The member's own donations and their Kindle congregation's fund total; null for a non-member or a non-Kindle congregation. */
export async function readCongregationDonations(db: GameDatabase, userId: string) {
  const cong = await memberCongregation(db, userId);
  if (!cong || cong.nationId !== 'kindle') return null;
  const fund = await db.prepare(congregationFundBalanceSql).bind(cong.id).first<{ balance: number }>();
  const yours = ((await db.prepare('SELECT congregation_id, amount_minor, donated_at FROM congregation_donations WHERE clerk_user_id=? ORDER BY donated_at DESC, request_id DESC LIMIT 50')
    .bind(userId).all<{ congregation_id: string; amount_minor: number; donated_at: number }>()).results ?? [])
    .map(r => ({ congregationId: r.congregation_id, amountMinor: Number(r.amount_minor), donatedAt: Number(r.donated_at) }));
  return { congregationId: cong.id, fundMinor: Number(fund?.balance ?? 0), yours };
}

/** One atomic INSERT (both legs): written only if the wallet covers the amount and the membership row still names this congregation. Replaying a requestId is a no-op. */
export async function donateToCongregation(db: GameDatabase, userId: string, cmd: { amountMinor: number; requestId: string }, now: number): Promise<{ ok: true } | Refusal> {
  const prior = await db.prepare('SELECT clerk_user_id, amount_minor FROM congregation_donations WHERE request_id=?').bind(cmd.requestId).first<{ clerk_user_id: string; amount_minor: number }>();
  if (prior) return prior.clerk_user_id === userId && Number(prior.amount_minor) === cmd.amountMinor ? { ok: true } : refuse(409, 'request_reused', 'That request was already used.');
  const cong = await memberCongregation(db, userId);
  if (!cong) return refuse(403, 'not_member', 'Only members can give to their congregation.');
  if (cong.nationId !== 'kindle') return refuse(403, 'not_kindle', 'Congregation donations are for Kindle congregations only.');
  await db.prepare(`INSERT INTO congregation_donations (request_id, clerk_user_id, congregation_id, amount_minor, donated_at)
    SELECT ?, ?, ?, ?, ? WHERE COALESCE((SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?), 0) >= ?
    AND EXISTS (SELECT 1 FROM congregation_members WHERE user_id=? AND congregation_id=?)
    ON CONFLICT (request_id) DO NOTHING`).bind(cmd.requestId, userId, cong.id, cmd.amountMinor, now, userId, cmd.amountMinor, userId, cong.id).run();
  const written = await db.prepare('SELECT 1 AS x FROM congregation_donations WHERE request_id=? AND clerk_user_id=?').bind(cmd.requestId, userId).first();
  if (written) { await recordSparkSink(db, userId, cmd.amountMinor, `congregation-donation:${cmd.requestId}`, 'congregation-donation', now); return { ok: true }; } // #465, as party donations
  const balance = Number((await db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?').bind(userId).first<{ balance: number }>())?.balance ?? 0);
  return balance < cmd.amountMinor ? refuse(409, 'insufficient_balance', 'Not enough Spark in your wallet for that donation.') : refuse(403, 'not_member', 'Only members can give to their congregation.');
}
