/** #844 Kindle sales tax on goods-market fills (docs §12.2 Kindle revenue: "Income, sales, land taxes set by Assembly"; §12.12 rates move only within system bands).
 *  ARC ruling on #857: the market where the trade happens decides the tax, not the seller's nationality. On each settled fill whose sell order
 *  is on the legacy venue (city_id = kindleMarketCityId) or a lib/cities.ts city with nationId kindle (#1421: capital, other Kindle cities,
 *  flag-gated Brasswell Port, Emberwell, and the frontier outpost), a citizen seller of any nation remits floor(gross * bps / 10000) Spark cents to `kindle-treasury`
 *  (lib/economy kindleTreasuryBalanceSql adds it; the wallet view and the daily reconciliation subtract it from the seller), so the ledger stays balanced.
 *  The buyer pays the listed price unchanged. [ASSUMPTION] 5% (500 bps), one config value; the Assembly setting the rate is out of scope.
 *  [ASSUMPTION] NPC supplier sellers (citizen_id NULL) and trades that round to 0 write no row; written in the same batch as the fill (POST path).
 *  [ASSUMPTION] Brasswell Port's id is taxed even while HARIMU_KINDLE_BRASSWELL_PORT_ENABLED is off: the flag hides enroll, and the book is still Kindle's.
 *  Flag HARIMU_KINDLE_SALES_TAX_ENABLED: "true" in preview, "false" in production. Off: no tax row is written and no tax INSERT runs on any write path, and the budget route adds no field or tax read.
 *  The wallet view, treasury balance and reconciliation always sum the tax tables, which stay empty, so balances and responses are unchanged. */
import { citiesForNation, gatedResidentCitiesForNation, outpostCityForNation, residentCitiesForNation } from './cities.ts';
/** Kindle's order-book venue id (lib/order-book-rules orderBookCityId; a test pins them equal). A literal keeps this file from importing the order book. */
export const kindleMarketCityId = 'kindle';
export const kindleSalesTaxEnabled = (env: { HARIMU_KINDLE_SALES_TAX_ENABLED?: string } | null | undefined) => env?.HARIMU_KINDLE_SALES_TAX_ENABLED === 'true';
export const kindleSalesTaxBps = 500;
export const kindleSalesTaxMinor = (grossMinor: number, bps = kindleSalesTaxBps): number => Math.floor(grossMinor * bps / 10000);
// The table (market_sales_tax) is defined in lib/market-orders.ts beside market_trade_fees, so that file keeps no runtime import.
const cityIdSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const quoteCityId = (id: string) => {
  if (!cityIdSlug.test(id)) throw new Error(`kindle sales tax: city id ${id} is not a slug`);
  return `'${id}'`;
};
/** #1421: legacy 'kindle' venue, or any cities.ts city whose nationId is kindle. Ids are quoted slugs from the catalog, so the list cannot drift. */
const kindleTaxVenues = (): string => {
  const ids = new Set<string>([kindleMarketCityId]);
  const cities = [...citiesForNation('kindle'), ...residentCitiesForNation('kindle'), ...gatedResidentCitiesForNation('kindle'), outpostCityForNation('kindle')];
  for (const city of cities) if (city?.nationId === 'kindle') ids.add(city.id);
  return [kindleMarketCityId, ...[...ids].filter(id => id !== kindleMarketCityId).sort()].map(quoteCityId).join(', ');
};
/** Bind (tradeId). Inserts nothing when the trade row did not land, the sell order is not on a Kindle venue, the seller is an NPC, or the tax rounds to 0; idempotent per trade. */
export const kindleSalesTaxSql = `INSERT OR IGNORE INTO market_sales_tax (trade_id, seller_id, tax_minor, charged_at)
  SELECT t.id, s.citizen_id, (t.qty * t.unit_minor * ${kindleSalesTaxBps}) / 10000, t.filled_at FROM market_trades t JOIN market_orders s ON s.id = t.sell_order_id
  WHERE t.id = ? AND s.city_id IN (${kindleTaxVenues()}) AND s.citizen_id IS NOT NULL AND (t.qty * t.unit_minor * ${kindleSalesTaxBps}) / 10000 > 0`;

/** #844 follow-up (ARC on #845): fixed-lot listing sales are taxed the same way: seller-paid from the proceeds, same rate and flag.
 *  ARC (option 1 on #857): fixed-lot listings ARE Kindle's market by definition (create-listing and buy-listing admit only Kindle citizens).
 *  player_listings.city_id (#1428) is a Kindle city or the legacy 'kindle' venue, so every fixed-lot sale is taxed, whatever the seller's nation.
 *  If a listing can ever sit in a non-Kindle city, this SQL must key on city_id first (tests/kindle-sales-tax-followup-844 pins that it does not today).
 *  Bind (requestId). Nothing when the fill did not land or the tax rounds to 0; idempotent per fill. Table: player_fill_sales_tax (lib/market-orders.ts). */
export const playerFillSalesTaxSql = `INSERT OR IGNORE INTO player_fill_sales_tax (request_id, seller_id, tax_minor, charged_at)
  SELECT f.request_id, f.seller_id, (f.amount_minor * ${kindleSalesTaxBps}) / 10000, f.filled_at FROM player_fills f
  WHERE f.request_id = ? AND (f.amount_minor * ${kindleSalesTaxBps}) / 10000 > 0`;
/** Bind (since, since): sales tax charged since a unix time, both markets, for the budget card's "Sales tax today" line. */
export const kindleSalesTaxSinceSql = `SELECT COALESCE((SELECT SUM(tax_minor) FROM market_sales_tax WHERE charged_at >= ?), 0)
  + COALESCE((SELECT SUM(tax_minor) FROM player_fill_sales_tax WHERE charged_at >= ?), 0) AS total`;
