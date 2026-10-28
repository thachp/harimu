/** #758 wallet street rate (docs 12.8 wallet Display row, 12.9 rumored street rate), HARIMU_WALLET_STREET_RATE_ENABLED only. Read-only display.
 *  Reuses the #43 published rumor (gray-market-rules rumoredRate over the same last-5 / 7-game-day trade window): no new pricing math.
 *  [ASSUMPTION] "heard of the gray market" = the citizen has been buyer or seller in at least one completed gray-market trade (simplest stored signal).
 *  [ASSUMPTION] Korund's wallet is the Labor Notes row of the Korund plan panel (app/wallet-panel.tsx is Kindle-only in page.tsx); Korund publishes
 *  no official LN exchange rate, so the rumor line sits under the LN balance.
 *  12.10: the street rate is display only. No settlement, conversion or command path may import this module (pinned by a test). */
import type { GameDatabase } from './database-contract';
import { rumoredRate, GRAY_RUMOR_WINDOW_SECONDS, GRAY_RUMOR_TRADES } from './gray-market-rules';

export type WalletStreetRate = { rumoredRate: number | null; /** #968: set only while a #776 ration cut and HARIMU_GRAY_RATION_RISE_ENABLED are both on. */ shortage?: string };
/** #968 (docs §12.11 step 5): gray-market activity rises when rations fall. The docs give no volume, offer count, or rate move.
 *  [ASSUMPTION] the rise is exactly GRAY_RATION_RISE_LINES (one shortage line) on the rumored street rate. Display only: it does not
 *  post offers, change rumoredRate, loosen the #736 cap, or touch #749 Suspicion. §12.10: this line cannot settle anything. */
export const GRAY_RATION_RISE_LINES = 1;
export const streetShortageLine = (): string => 'Street talk: rations are short, so this street is busier.';
/** null = the citizen has not heard of the gray market (no line shown). rumoredRate null = heard, but no trade inside the rumor window. */
export async function readWalletStreetRate(db: GameDatabase, userId: string, now: number): Promise<WalletStreetRate | null> {
  const heard = await db.prepare('SELECT EXISTS(SELECT 1 FROM gray_trades WHERE buyer_id=? OR seller_id=?) AS heard').bind(userId, userId).first<{ heard: number }>();
  if (!Number(heard?.heard)) return null;
  const trades = await db.prepare('SELECT offer_id, ask_rate, traded_at FROM gray_trades WHERE traded_at>=? ORDER BY traded_at DESC, offer_id DESC LIMIT ?')
    .bind(now - GRAY_RUMOR_WINDOW_SECONDS, GRAY_RUMOR_TRADES).all<{ offer_id: string; ask_rate: number; traded_at: number }>();
  return { rumoredRate: rumoredRate((trades.results ?? []).map(t => ({ offerId: t.offer_id, askRate: Number(t.ask_rate), tradedAt: Number(t.traded_at) })), now) };
}
