/** #777 goods-market trade fee as a money sink (docs 12.4 "market and exchange fees" are sinks; 12.10 one integer ledger), HARIMU_MARKET_FEE_ENABLED only.
 *  On each settled order-book fill the seller pays a fee, floor(gross * bps / 10000) Spark cents, so tiny trades pay 0 (no row).
 *  The fee is a row in market_trade_fees: the seller's debit leg, balanced against the system sink (the row itself; the Spark is destroyed and
 *  credited to nobody). The wallet view and the daily reconciliation (#432) both subtract it, so the ledger stays balanced.
 *  [ASSUMPTION] 0.5% (50 bps), one config value. [ASSUMPTION] only citizen sellers pay; NPC supplier sell orders (citizen_id NULL) pay nothing.
 *  [ASSUMPTION] the fee is written in the same batch as the fill (POST path); a fill made while the flag was off never gets a fee later. */
export const marketFeeBps = 50;
export const marketFeeMinor = (grossMinor: number, bps = marketFeeBps): number => Math.floor(grossMinor * bps / 10000);
// The table (market_trade_fees) is defined in lib/market-orders.ts beside market_trades, so that file keeps no runtime import.
/** Bind (tradeId). Inserts nothing when the trade was not inserted (guarded fill lost), the seller is an NPC, or the fee rounds to 0; idempotent per trade. */
export const marketFeeSql = `INSERT OR IGNORE INTO market_trade_fees (trade_id, seller_id, fee_minor, charged_at)
  SELECT t.id, s.citizen_id, (t.qty * t.unit_minor * ${marketFeeBps}) / 10000, t.filled_at FROM market_trades t JOIN market_orders s ON s.id = t.sell_order_id
  WHERE t.id = ? AND s.citizen_id IS NOT NULL AND (t.qty * t.unit_minor * ${marketFeeBps}) / 10000 > 0`;
export type MarketFeeLine = { tradeId: string; good: string; qty: number; unitMinor: number; feeMinor: number; filledAt: string };
export const marketFeeLabel = (feeMinor: number): string => `Market fee: ${(feeMinor / 100).toFixed(2)} SPK`;
