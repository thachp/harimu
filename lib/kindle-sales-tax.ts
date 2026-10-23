/** #844 Kindle sales tax on goods-market fills (docs §12.2 Kindle revenue: "Income, sales, land taxes set by Assembly"; §12.12 rates move only within system bands).
 *  ARC ruling on #857: the market where the trade happens decides the tax, not the seller's nationality. On each settled fill on Kindle's order book
 *  (the sell order's venue, market_orders.city_id = kindleMarketCityId) with a citizen seller of any nation, the seller remits floor(gross * bps / 10000) Spark cents from the proceeds to `kindle-treasury`
 *  (lib/economy kindleTreasuryBalanceSql adds it; the wallet view and the daily reconciliation subtract it from the seller), so the ledger stays balanced.
 *  The buyer pays the listed price unchanged. [ASSUMPTION] 5% (500 bps), one config value; the Assembly setting the rate is out of scope.
 *  [ASSUMPTION] NPC supplier sellers (citizen_id NULL) and trades that round to 0 write no row; written in the same batch as the fill (POST path).
 *  Flag HARIMU_KINDLE_SALES_TAX_ENABLED: "true" in preview, "false" in production. Off: no row written, no tax query, responses unchanged. */
/** Kindle's order-book venue id (lib/order-book-rules orderBookCityId; a test pins them equal). A literal keeps this file free of runtime imports. */
export const kindleMarketCityId = 'kindle';
export const kindleSalesTaxEnabled = (env: { HARIMU_KINDLE_SALES_TAX_ENABLED?: string } | null | undefined) => env?.HARIMU_KINDLE_SALES_TAX_ENABLED === 'true';
export const kindleSalesTaxBps = 500;
export const kindleSalesTaxMinor = (grossMinor: number, bps = kindleSalesTaxBps): number => Math.floor(grossMinor * bps / 10000);
// The table (market_sales_tax) is defined in lib/market-orders.ts beside market_trade_fees, so that file keeps no runtime import.
/** Bind (tradeId). Inserts nothing when the trade row did not land, the trade was not on Kindle's market, the seller is an NPC, or the tax rounds to 0; idempotent per trade. */
export const kindleSalesTaxSql = `INSERT OR IGNORE INTO market_sales_tax (trade_id, seller_id, tax_minor, charged_at)
  SELECT t.id, s.citizen_id, (t.qty * t.unit_minor * ${kindleSalesTaxBps}) / 10000, t.filled_at FROM market_trades t JOIN market_orders s ON s.id = t.sell_order_id
  WHERE t.id = ? AND s.city_id = '${kindleMarketCityId}' AND s.citizen_id IS NOT NULL AND (t.qty * t.unit_minor * ${kindleSalesTaxBps}) / 10000 > 0`;
