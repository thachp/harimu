/** #824 (docs §12.8 "Inheritance and dormancy", decided v0.4): the Kindle Dormant Savings Shield. When a verified Kindle citizen returns from
 *  Dormant or Archived, credit once: min(SPK balance, cap) x 1/2 x the Price Index rise during the absence, paid from the Kindle treasury's
 *  welfare line (a transfer, never new money). One row per absence (key: citizen + the last activity before it) in savings_shield_credits,
 *  which is both the treasury debit and the wallet credit (status 'paid'), or a logged skip with its reason. Flag HARIMU_SAVINGS_SHIELD_ENABLED. */
import type { GameDatabase } from './database-contract';
import { kindleTreasuryBalanceSql } from './economy';
import { readReserveBoard } from './spark-supply';
import { DORMANCY_DAYS } from './dormancy-rules';
export { savingsShieldCreditsSchema } from './market-orders';
export const savingsShieldEnabled = (env: { HARIMU_SAVINGS_SHIELD_ENABLED?: string } | null | undefined) => env?.HARIMU_SAVINGS_SHIELD_ENABLED === 'true';
/** [ASSUMPTION] the docs' cap is "about 30 game days of the nation's median wage": 30 x 800 minor (one 800-minor Kindle shift per game day) = 240 SPK. */
export const SHIELD_CAP_MINOR = 30 * 800;
const DAY = 86_400;
/** Integer minor units. Index values are compared in tenths (the Price Index is published to one decimal). A flat or falling index pays 0. */
export function shieldCreditMinor(balanceMinor: number, indexStart: number, indexEnd: number, capMinor = SHIELD_CAP_MINOR): number {
  const s = Math.round(indexStart * 10), e = Math.round(indexEnd * 10);
  if (!(s > 0) || !(e > s)) return 0;
  const covered = Math.min(Math.max(0, Math.trunc(balanceMinor)), capMinor);
  return Math.floor(covered * (e - s) / (2 * s));
}
export type ShieldResult = { status: 'paid' | 'skipped'; creditMinor: number; reason: string; replayed: boolean };
type Row = { clerk_user_id: string; status: 'paid' | 'skipped'; credit_minor: number; reason: string };
/** Called once on a Welcome back from Dormant or Archived. Writes nothing for non-Kindle citizens, unverified accounts or absences under the Dormant threshold. */
export async function applySavingsShield(db: GameDatabase, userId: string, lastActiveAt: number, now: number, verified: boolean): Promise<ShieldResult | null> {
  if (!verified || now - lastActiveAt < DORMANCY_DAYS.dormant * DAY) return null;
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id = ?').bind(userId).first<{ nation_id: string | null }>();
  if (citizen?.nation_id !== 'kindle') return null;
  const key = `${userId}:${lastActiveAt}`;
  const read = () => db.prepare('SELECT clerk_user_id, status, credit_minor, reason FROM savings_shield_credits WHERE absence_key = ?').bind(key).first<Row>();
  const prior = await read();
  if (prior) return { status: prior.status, creditMinor: Number(prior.credit_minor), reason: prior.reason, replayed: true };
  const wallet = await db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id = ?').bind(userId).first<{ balance: number }>();
  const balance = Math.max(0, Math.trunc(Number(wallet?.balance ?? 0)));
  const [start, end] = await Promise.all([readReserveBoard(db, lastActiveAt), readReserveBoard(db, now)]);
  const credit = shieldCreditMinor(balance, start.priceIndex, end.priceIndex);
  const row = `INSERT INTO savings_shield_credits (absence_key, clerk_user_id, absence_started_at, returned_at, balance_minor, index_start_tenths, index_end_tenths, credit_minor, status, reason)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`;
  const binds = (amount: number, status: string, reason: string) => [key, userId, lastActiveAt, now, balance, Math.round(start.priceIndex * 10), Math.round(end.priceIndex * 10), amount, status, reason];
  if (credit <= 0) await db.prepare(`${row} WHERE 1 = 1 ON CONFLICT (absence_key) DO NOTHING`).bind(...binds(0, 'skipped', balance > 0 ? 'no_index_rise' : 'no_balance')).run();
  else await db.batch([
    // The treasury check and the debit are one guarded insert; a treasury that cannot cover it records a skip instead (the logged reason).
    db.prepare(`${row} WHERE COALESCE((SELECT balance FROM (${kindleTreasuryBalanceSql}) t), 0) >= ? ON CONFLICT (absence_key) DO NOTHING`).bind(...binds(credit, 'paid', 'paid'), credit),
    db.prepare(`${row} WHERE NOT EXISTS (SELECT 1 FROM savings_shield_credits WHERE absence_key = ?) ON CONFLICT (absence_key) DO NOTHING`).bind(...binds(0, 'skipped', 'treasury_short'), key),
  ]);
  const saved = (await read())!;
  if (saved.reason === 'treasury_short') console.warn(`[savings-shield] skipped ${key}: the Kindle treasury cannot cover ${credit}`);
  return { status: saved.status, creditMinor: Number(saved.credit_minor), reason: saved.reason, replayed: false };
}
