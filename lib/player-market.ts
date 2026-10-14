import type {GameDatabase} from './database-contract';
export type PlayerCommand = {
  action: 'create-listing' | 'buy-listing' | 'cancel-listing'; requestId: string;
  item?: string; quantity?: number; unitMinor?: number; listingId?: string;
};
export type PlayerLot = { id: string; item: string; quantity: number; unitMinor: number;
  mine: boolean; status: 'open' | 'sold' | 'cancelled'; createdAt: string };
export type PlayerMarketState = { available: boolean; listings: PlayerLot[] };
export const listingSchema = `CREATE TABLE IF NOT EXISTS player_listings (
  id TEXT PRIMARY KEY, seller_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
  item TEXT NOT NULL CHECK(item IN ('food','materials','knowledge')),
  quantity INTEGER NOT NULL CHECK(typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 10),
  unit_minor INTEGER NOT NULL CHECK(typeof(unit_minor) = 'integer' AND unit_minor BETWEEN 1 AND 1000),
  created_at INTEGER NOT NULL
)`;
export const fillSchema = `CREATE TABLE IF NOT EXISTS player_fills (
  request_id TEXT PRIMARY KEY, listing_id TEXT NOT NULL UNIQUE REFERENCES player_listings(id),
  buyer_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
  seller_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), item TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 10),
  amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor) = 'integer' AND amount_minor BETWEEN 1 AND 10000),
  filled_at INTEGER NOT NULL, CHECK(buyer_id != seller_id)
)`;
export const cancelSchema = `CREATE TABLE IF NOT EXISTS player_cancellations (
  request_id TEXT PRIMARY KEY, listing_id TEXT NOT NULL UNIQUE REFERENCES player_listings(id),
  seller_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), cancelled_at INTEGER NOT NULL
)`;
export const playerReceiptView = `CREATE VIEW IF NOT EXISTS player_request_receipts AS
  SELECT id AS request_id, seller_id AS user_id, 'create-listing' AS action, id AS listing_id FROM player_listings
  UNION ALL SELECT request_id, buyer_id AS user_id, 'buy-listing' AS action, listing_id FROM player_fills
  UNION ALL SELECT request_id, seller_id AS user_id, 'cancel-listing' AS action, listing_id FROM player_cancellations`;
export const openLotsView = `CREATE VIEW IF NOT EXISTS player_open_lots AS
  SELECT l.* FROM player_listings l WHERE NOT EXISTS (SELECT 1 FROM player_fills WHERE listing_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM player_cancellations WHERE listing_id = l.id)`;
export const createListingSql = `INSERT INTO player_listings (id, seller_id, item, quantity, unit_minor, created_at)
  SELECT ?, c.clerk_user_id, ?, ?, ?, ? FROM citizens c
  WHERE c.clerk_user_id = ? AND c.nation_id = 'kindle'
    AND COALESCE((SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id = c.clerk_user_id AND item = ?), 0) >= ?
    AND (SELECT COUNT(*) FROM player_open_lots WHERE seller_id = c.clerk_user_id) < 5
    AND NOT EXISTS (SELECT 1 FROM player_request_receipts WHERE request_id = ?)`;
// One row records the entire transfer; wallets, goods and listing state derive from it.
export const fillListingSql = `INSERT INTO player_fills (request_id, listing_id, buyer_id, seller_id, item, quantity, amount_minor, filled_at)
  SELECT ?, l.id, b.clerk_user_id, l.seller_id, l.item, l.quantity, l.unit_minor * l.quantity, ? FROM player_open_lots l
  JOIN citizens b ON b.clerk_user_id = ? JOIN citizens s ON s.clerk_user_id = l.seller_id
  WHERE l.id = ? AND b.nation_id = 'kindle' AND s.nation_id = 'kindle' AND l.seller_id != b.clerk_user_id
    AND (SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id = b.clerk_user_id) >= l.unit_minor * l.quantity
    AND NOT EXISTS (SELECT 1 FROM player_request_receipts WHERE request_id = ?)`;
// Owners may reclaim escrow even if they changed nation after creating a listing.
export const cancelListingSql = `INSERT INTO player_cancellations (request_id, listing_id, seller_id, cancelled_at)
  SELECT ?, l.id, l.seller_id, ? FROM player_open_lots l WHERE l.id = ? AND l.seller_id = ?
    AND NOT EXISTS (SELECT 1 FROM player_request_receipts WHERE request_id = ?)`;

export function validPlayerCommand(body: Record<string, unknown>): body is Record<string, unknown> & PlayerCommand {
  const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (!uuid(body.requestId)) return false;
  if (body.action === 'create-listing') return ['food','materials','knowledge'].includes(body.item as string)
    && Number.isSafeInteger(body.quantity) && (body.quantity as number) >= 1 && (body.quantity as number) <= 10
    && Number.isSafeInteger(body.unitMinor) && (body.unitMinor as number) >= 1 && (body.unitMinor as number) <= 1000;
  return (body.action === 'buy-listing' || body.action === 'cancel-listing') && uuid(body.listingId);
}
export function parseSparkPrice(value: string): number | null {
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, cents = ''] = value.split('.');
  const minor = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
  return minor >= 1 && minor <= 1000 ? minor : null;
}
export async function executePlayerCommand(db: GameDatabase, userId: string, command: PlayerCommand, now: number) {
  const find = () => db.prepare(`SELECT r.user_id, r.action, r.listing_id, l.item, l.quantity, l.unit_minor
    FROM player_request_receipts r JOIN player_listings l ON l.id = r.listing_id WHERE r.request_id = ?`)
    .bind(command.requestId).first<{ user_id: string; action: string; listing_id: string; item: string; quantity: number; unit_minor: number }>();
  const matches = (r: Awaited<ReturnType<typeof find>>) => r?.user_id === userId && r.action === command.action
    && (command.action === 'create-listing'
      ? r.item === command.item && r.quantity === command.quantity && r.unit_minor === command.unitMinor
      : r.listing_id === command.listingId);
  const existing = await find();
  if (existing) return matches(existing) ? { status: 200, replayed: true } : { status: 409, error: 'Request identifier already used for another intent.' };
  if (command.action === 'create-listing') {
    await db.prepare(createListingSql).bind(command.requestId, command.item, command.quantity, command.unitMinor, now,
      userId, command.item, command.quantity, command.requestId).run();
  } else if (command.action === 'buy-listing') {
    await db.prepare(fillListingSql).bind(command.requestId, now, userId, command.listingId, command.requestId).run();
  } else {
    await db.prepare(cancelListingSql).bind(command.requestId, now, command.listingId, userId, command.requestId).run();
  }
  return matches(await find()) ? { status: 200 } : { status: 409, error: command.action === 'create-listing'
    ? 'Listing refused: check available goods, quantity, price, Kindle citizenship and the five-listing limit.'
    : 'Listing unavailable, already closed, insufficient funds, or ownership/citizenship does not permit this action.' };
}
export async function readPlayerMarket(db: GameDatabase, userId: string): Promise<PlayerMarketState> {
  const columns = `SELECT l.id, l.item, l.quantity, l.unit_minor, l.created_at,
    CASE WHEN EXISTS (SELECT 1 FROM player_fills WHERE listing_id = l.id) THEN 'sold'
      WHEN EXISTS (SELECT 1 FROM player_cancellations WHERE listing_id = l.id) THEN 'cancelled' ELSE 'open' END AS status
    FROM player_listings l`;
  type Row = { id: string; item: string; quantity: number; unit_minor: number; created_at: number; status: PlayerLot['status'] };
  const [citizen, mine, others] = await Promise.all([
    db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id = ?').bind(userId).first<{ nation_id: string | null }>(),
    db.prepare(`SELECT * FROM (${columns} WHERE l.seller_id = ?) own_lots ORDER BY (status = 'open') DESC, created_at DESC, id DESC LIMIT 20`).bind(userId).all<Row>(),
    db.prepare(`${columns} WHERE l.seller_id != ? AND l.id IN (SELECT id FROM player_open_lots)
      AND EXISTS (SELECT 1 FROM citizens WHERE clerk_user_id = ? AND nation_id = 'kindle')
      AND EXISTS (SELECT 1 FROM citizens WHERE clerk_user_id = l.seller_id AND nation_id = 'kindle')
      ORDER BY l.created_at DESC, l.id DESC LIMIT 40`).bind(userId,userId).all<Row>(),
  ]);
  const serialize = (r: Row, owned: boolean): PlayerLot => ({ id: r.id, item: r.item, quantity: r.quantity,
    unitMinor: r.unit_minor, createdAt: new Date(r.created_at * 1000).toISOString(), status: r.status, mine: owned });
  const available=citizen?.nation_id === 'kindle';
  return { available, listings: [...mine.results.map((r) => serialize(r, true)), ...(available ? others.results.map((r) => serialize(r, false)) : [])] };
}
