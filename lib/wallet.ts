// Wallet panel (issue #39). Integer minor units: 100 = 1.00 of a currency.
// PoC placeholder: the Clearing House has no live feed yet, so SPK is quoted
// against the Tessera (TSR) at a fixed, read-only rate. 1 SPK = 0.25 TSR.
export const sparkToTesseraRate = 0.25;
export const tesseraRateSource = 'fixed PoC placeholder rate';

export type WalletTransaction = {
  id: string;
  kind: 'wage' | 'market-buy' | 'market-sell' | 'citizen-buy' | 'citizen-sale' | 'fee';
  amountMinor: number;
  reason: string;
  occurredAt: string;
};

export type WalletSummary = {
  sparkMinor: number;
  tesseraMinor: number;
  quote: { from: 'SPK'; to: 'TSR'; rate: number; source: string };
  transactions: WalletTransaction[];
};

export const walletHistoryLimit = 25;

// Every row that changes citizen_wallet_balances appears here, so the list
// always reconciles with the server balance. Meals move no money (wallet_delta = 0).
// Within the same second a wage sorts as older, since spending follows earning.
export const walletHistorySql = `SELECT id, kind, amount_minor, item, quantity, occurred_at FROM (
  SELECT 'wage:' || s.shift_id AS id, 'wage' AS kind, s.wage_minor AS amount_minor, w.order_name AS item, s.quantity AS quantity,
    CAST(strftime('%s', s.settled_at) AS INTEGER) AS occurred_at
    FROM shift_settlements s JOIN work_shifts w ON w.id = s.shift_id WHERE s.clerk_user_id = ?
  UNION ALL
  SELECT 'market:' || id, CASE kind WHEN 'buy' THEN 'market-buy' ELSE 'market-sell' END, wallet_delta, item, ABS(quantity_delta), occurred_at
    FROM citizen_economy_events WHERE clerk_user_id = ? AND wallet_delta != 0
  UNION ALL
  SELECT 'fill-buy:' || request_id, 'citizen-buy', -amount_minor, item, quantity, filled_at FROM player_fills WHERE buyer_id = ?
  UNION ALL
  SELECT 'fill-sale:' || request_id, 'citizen-sale', amount_minor, item, quantity, filled_at FROM player_fills WHERE seller_id = ?
) ORDER BY occurred_at DESC, CASE kind WHEN 'wage' THEN 1 ELSE 0 END, id DESC LIMIT ${walletHistoryLimit}`;

export type WalletHistoryRow = { id: string; kind: WalletTransaction['kind']; amount_minor: number; item: string | null; quantity: number | null; occurred_at: number | null };

export function describeTransaction(row: WalletHistoryRow): string {
  const goods = `${row.quantity ?? 0} ${row.item ?? 'goods'}`;
  switch (row.kind) {
    case 'wage': return `Wage · ${row.item ?? 'paid shift'}`;
    case 'market-buy': return `Market purchase · ${goods}`;
    case 'market-sell': return `Market sale · ${goods}`;
    case 'citizen-buy': return `Citizen listing purchase · ${goods}`;
    case 'citizen-sale': return `Citizen listing sold · ${goods}`;
    default: return 'Fee';
  }
}

export function toTransactions(rows: WalletHistoryRow[]): WalletTransaction[] {
  return rows.map((row) => ({ id: row.id, kind: row.kind, amountMinor: row.amount_minor, reason: describeTransaction(row),
    occurredAt: new Date((row.occurred_at ?? 0) * 1000).toISOString() }));
}

/** SPK minor units quoted in TSR minor units, rounded down so a quote never overstates value. */
export function quoteTessera(sparkMinor: number, rate = sparkToTesseraRate): number {
  return Math.floor(sparkMinor * rate);
}

export function summarizeWallet(sparkMinor: number, transactions: WalletTransaction[] = [], tesseraMinor = 0): WalletSummary {
  return { sparkMinor, tesseraMinor, quote: { from: 'SPK', to: 'TSR', rate: sparkToTesseraRate, source: tesseraRateSource }, transactions };
}

export function formatMinor(minor: number, signed = false): string {
  const text = (Math.abs(minor) / 100).toFixed(2);
  return minor < 0 ? `−${text}` : signed && minor > 0 ? `+${text}` : text;
}
