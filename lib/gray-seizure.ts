/** #797 (docs economy §12.9 "checkpoints ... can seize cash bundles", §12.10 "seized cash is destroyed (a sink)"; seizures capped), behind
 *  HARIMU_GRAY_SEIZURE_ENABLED (off in production). After a Korund citizen ACCEPTS a gray-market trade, a checkpoint may seize part of the LN cash
 *  bundle they just received. The chance rises with their Suspicion and is capped; at most one seizure per citizen per game day; the amount is capped
 *  and never more than the bundle. Seized LN is destroyed: one row in gray_seizures (the sink leg) that lib/korund-wallet subtracts from the
 *  citizen and that is credited to no wallet. Every number is an [ASSUMPTION]; the docs give none. */
import type { GameDatabase } from './database-contract';
import { isMissingRelation } from './db-errors';
import { laborNoteSql, laborNoteBinds } from './korund-wallet';
import { GAME_DAY_SECONDS, graySeed } from './gray-market-rules';
import { suspicionLevelWithGray } from './underground-rules';

export const graySeizureConfig = {
  baseBps: 200,         // [ASSUMPTION] 2% at Suspicion 0 ...
  perLevelBps: 25,      // ... plus 0.25% per Suspicion point ...
  maxBps: 2500,         // ... capped at 25% (issue: "at most 25%")
  shareBps: 5000,       // [ASSUMPTION] a seizure takes half the bundle ...
  capMinor: 1000,       // ... at most 10.00 LN per seizure
} as const;
export const graySeizureSchemas = [
  `CREATE TABLE IF NOT EXISTS gray_seizures (
 offer_id TEXT PRIMARY KEY REFERENCES gray_trades(offer_id) ON DELETE CASCADE,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 game_day INTEGER NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
 seized_at INTEGER NOT NULL,
 UNIQUE(clerk_user_id, game_day)
)`,
] as const;

/** Chance in basis points: monotonic in Suspicion, never above maxBps. */
export const seizureChanceBps = (level: number): number => Math.min(graySeizureConfig.maxBps, graySeizureConfig.baseBps + Math.max(0, Math.floor(level)) * graySeizureConfig.perLevelBps);
/** Amount seized from a bundle: half, at most capMinor, never more than the bundle, at least 1 for a non-empty bundle. */
export const seizedAmount = (bundleMinor: number): number => bundleMinor < 1 ? 0 : Math.min(bundleMinor, graySeizureConfig.capMinor, Math.max(1, Math.floor(bundleMinor * graySeizureConfig.shareBps / 10000)));
/** Default roll in [0,1): seeded by the trade, so a replay or test is deterministic. */
export const seizureRoll = (offerId: string): number => graySeed(`seizure:${offerId}`) / 0x100000000;
export const seizureNotice = (amountMinor: number): string => `A checkpoint patrol confiscated ${(amountMinor / 100).toFixed(2)} Labor Notes.`;

async function suspicionNow(db: GameDatabase, userId: string, now: number): Promise<number> {
  let raids: number[] = [];
  try { raids = (await db.prepare('SELECT raided_at FROM korund_raid_hits WHERE user_id=? ORDER BY raided_at').bind(userId).all<{ raided_at: number }>()).results.map(r => Number(r.raided_at)); }
  catch (error) { if (!isMissingRelation(error)) throw error; }
  const trades = (await db.prepare('SELECT traded_at FROM gray_trades WHERE seller_id=? OR buyer_id=?').bind(userId, userId).all<{ traded_at: number }>()).results.map(r => Number(r.traded_at));
  return suspicionLevelWithGray(raids, trades, now);
}

/** Rolls the checkpoint for a trade the buyer just completed. Returns the seized amount (0 = none). Idempotent per trade (offer id is the key). */
export async function rollSeizure(db: GameDatabase, buyerId: string, offerId: string, bundleMinor: number, now: number, rng: (offerId: string) => number = seizureRoll): Promise<number> {
  const amount = seizedAmount(bundleMinor);
  if (amount < 1 || rng(offerId) * 10000 >= seizureChanceBps(await suspicionNow(db, buyerId, now))) return 0;
  // ON CONFLICT covers the trade key and the one-per-game-day key. The LN guard keeps the wallet from going negative.
  await db.prepare(`INSERT INTO gray_seizures(offer_id, clerk_user_id, game_day, amount_minor, seized_at)
    SELECT t.offer_id, t.buyer_id, ?, ?, ? FROM gray_trades t WHERE t.offer_id=? AND t.buyer_id=? AND ?<=t.amount_minor AND ?<=${laborNoteSql('?')}
    ON CONFLICT DO NOTHING`).bind(Math.floor(now / GAME_DAY_SECONDS), amount, now, offerId, buyerId, amount, amount, ...laborNoteBinds(buyerId)).run();
  const row = await db.prepare('SELECT amount_minor FROM gray_seizures WHERE offer_id=? AND clerk_user_id=?').bind(offerId, buyerId).first<{ amount_minor: number }>();
  return Number(row?.amount_minor ?? 0);
}

/** The notice for the latest seizure within the last game day, or null. Read-only. */
export async function latestSeizureNotice(db: GameDatabase, userId: string, now: number): Promise<string | null> {
  const row = await db.prepare('SELECT amount_minor FROM gray_seizures WHERE clerk_user_id=? AND seized_at>? ORDER BY seized_at DESC LIMIT 1').bind(userId, now - GAME_DAY_SECONDS).first<{ amount_minor: number }>();
  return row ? seizureNotice(Number(row.amount_minor)) : null;
}
