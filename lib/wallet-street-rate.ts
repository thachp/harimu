/** #758 wallet street rate (docs 12.8 wallet Display row, 12.9 rumored street rate), HARIMU_WALLET_STREET_RATE_ENABLED only. Read-only display.
 *  Reuses the #43 published rumor (gray-market-rules rumoredRate over the same last-5 / 7-game-day trade window): no new pricing math.
 *  [ASSUMPTION] "heard of the gray market" = the citizen has been buyer or seller in at least one completed gray-market trade (simplest stored signal).
 *  [ASSUMPTION] Korund's wallet is the Labor Notes row of the Korund plan panel (app/wallet-panel.tsx is Kindle-only in page.tsx); Korund publishes
 *  no official LN exchange rate, so the rumor line sits under the LN balance.
 *  12.10: the street rate is display only. No settlement, conversion or command path may import this module (pinned by a test). */
import type { GameDatabase } from './database-contract';
import { rumoredRate, GRAY_RUMOR_WINDOW_SECONDS, GRAY_RUMOR_TRADES } from './gray-market-rules';

export type WalletStreetRate = { rumoredRate: number | null };
/** null = the citizen has not heard of the gray market (no line shown). rumoredRate null = heard, but no trade inside the rumor window. */
export async function readWalletStreetRate(db: GameDatabase, userId: string, now: number): Promise<WalletStreetRate | null> {
  const heard = await db.prepare('SELECT EXISTS(SELECT 1 FROM gray_trades WHERE buyer_id=? OR seller_id=?) AS heard').bind(userId, userId).first<{ heard: number }>();
  if (!Number(heard?.heard)) return null;
  const trades = await db.prepare('SELECT offer_id, ask_rate, traded_at FROM gray_trades WHERE traded_at>=? ORDER BY traded_at DESC, offer_id DESC LIMIT ?')
    .bind(now - GRAY_RUMOR_WINDOW_SECONDS, GRAY_RUMOR_TRADES).all<{ offer_id: string; ask_rate: number; traded_at: number }>();
  return { rumoredRate: rumoredRate((trades.results ?? []).map(t => ({ offerId: t.offer_id, askRate: Number(t.ask_rate), tradedAt: Number(t.traded_at) })), now) };
}
