/** #824 (docs §12.8 "Inheritance and dormancy", decided v0.4): the Kindle Dormant Savings Shield. When a verified Kindle citizen returns from
 *  Dormant or Archived, credit once: min(SPK balance, cap) x 1/2 x the Price Index rise during the absence, paid from the Kindle treasury's
 *  welfare line (a transfer, never new money). One row per absence (key: citizen + the last activity before it) in savings_shield_credits,
 *  which is both the treasury debit and the wallet credit (status 'paid'), or a logged skip with its reason. Flag HARIMU_SAVINGS_SHIELD_ENABLED. */
import type { GameDatabase } from './database-contract';
import { kindleTreasuryBalanceSql } from './economy';
import { flagOn } from './flag-pack.mjs';
import { readReserveBoard } from './spark-supply';
import { DORMANCY_DAYS } from './dormancy-rules';
export { savingsShieldCreditsSchema } from './market-orders';
export const savingsShieldEnabled = (env: unknown) => flagOn(env, 'HARIMU_SAVINGS_SHIELD_ENABLED');
/** [ASSUMPTION] the docs' cap is "about 30 game days of the nation's median wage": 30 x 800 minor (one 800-minor Kindle shift per game day) = 240 SPK. */
/** ARC (Oct 23): the cap stays 240 SPK (30 game days of an 800-minor daily wage). */
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
  // ARC (Oct 23): the eligible balance is the balance at return minus every wallet inflow since the absence began, floored at 0,
  // so topping up a dormant account cannot farm the credit.
  const inflow = await db.prepare(`SELECT
      COALESCE((SELECT SUM(wage_minor) FROM shift_settlements WHERE clerk_user_id = ? AND settled_at > ?), 0)
    + COALESCE((SELECT SUM(wallet_delta) FROM citizen_economy_events WHERE clerk_user_id = ? AND wallet_delta > 0 AND occurred_at > ?), 0)
    + COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE seller_id = ? AND filled_at > ?), 0)
    + COALESCE((SELECT SUM(t.qty * t.unit_minor) FROM market_trades t JOIN market_orders o ON o.id = t.sell_order_id WHERE o.citizen_id = ? AND t.filled_at > ?), 0) AS inflow`)
    .bind(userId, new Date(lastActiveAt * 1000).toISOString(), userId, lastActiveAt, userId, lastActiveAt, userId, lastActiveAt).first<{ inflow: number }>();
  const atReturn = Math.trunc(Number(wallet?.balance ?? 0));
  // QA3 nit on #827: one floor at 0, applied before the value is stored (paid and skip rows alike); a negative wallet (open buy orders) stores 0.
  const balance = Math.max(0, Math.min(atReturn, atReturn - Math.max(0, Math.trunc(Number(inflow?.inflow ?? 0)))));
  const [start, end] = await Promise.all([readReserveBoard(db, lastActiveAt), readReserveBoard(db, now)]);
  const credit = shieldCreditMinor(balance, start.priceIndex, end.priceIndex);
  const row = `INSERT INTO savings_shield_credits (absence_key, clerk_user_id, absence_started_at, returned_at, balance_minor, index_start_tenths, index_end_tenths, credit_minor, status, reason)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`;
  const binds = (amount: number, status: string, reason: string) => [key, userId, lastActiveAt, now, balance, Math.round(start.priceIndex * 10), Math.round(end.priceIndex * 10), amount, status, reason];
  // Only the request whose own insert landed is the original; one that lost a concurrent race reads the winner's row as a replay.
  let won: boolean;
  if (credit <= 0) won = Number((await db.prepare(`${row} WHERE 1 = 1 ON CONFLICT (absence_key) DO NOTHING`).bind(...binds(0, 'skipped', balance > 0 ? 'no_index_rise' : 'no_balance')).run()).meta?.changes ?? 0) === 1;
  else won = (await db.batch([
    // ARC on #827 (#823's pattern): the treasury check and the debit are one conditional INSERT ... SELECT ... WHERE, so it never commits negative; a treasury that cannot cover it records a skip instead (the logged reason).
    db.prepare(`${row} WHERE COALESCE((SELECT balance FROM (${kindleTreasuryBalanceSql}) t), 0) >= ? ON CONFLICT (absence_key) DO NOTHING`).bind(...binds(credit, 'paid', 'paid'), credit),
    db.prepare(`${row} WHERE NOT EXISTS (SELECT 1 FROM savings_shield_credits WHERE absence_key = ?) ON CONFLICT (absence_key) DO NOTHING`).bind(...binds(0, 'skipped', 'treasury_short'), key),
  ])).some(r => Number(r.meta?.changes ?? 0) === 1);
  const saved = (await read())!;
  // QA3 nit on #827: only the winning insert logs; a request that lost the race is a replay and stays silent.
  if (won && saved.reason === 'treasury_short') console.warn(`[savings-shield] skipped ${key}: the Kindle treasury cannot cover ${credit}`);
  return { status: saved.status, creditMinor: Number(saved.credit_minor), reason: saved.reason, replayed: !won };
}
