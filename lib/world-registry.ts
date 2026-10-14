import type { GameDatabase } from './database-contract';
import { mapHeight, mapWidth, type Zone } from './map-zones';

/**
 * World Registry square purchase (#122, docs 6.1 / 15.1). PoC: a citizen of an MVP nation buys one unclaimed
 * Wildlands square adjacent (8-neighbour) to land their nation already owns, for a fixed Tessera price. The
 * square's owner becomes the nation, its zone becomes Frontier, and the debit is written to a Tessera ledger.
 *
 * Tessera source: none exists yet in the economy, so when HARIMU_SQUARE_PURCHASE_ENABLED=true each citizen
 * receives a one-time PoC starter grant of `TEMP_STARTER_GRANT` (ledger reason 'starter-grant').
 */
export const squarePriceMinor = 2500; // 25.00 TSR
// TEMPORARY placeholder (#210): there is no real Tessera source yet. Remove this grant once #210 adds one.
export const TEMP_STARTER_GRANT = 5000; // 50.00 TSR: room for two squares in the PoC
export const registryNations = ['kindle', 'korund', 'aurelle'] as const;

export const worldRegistrySchemas = [
  `CREATE TABLE IF NOT EXISTS citizen_tessera_ledger (
 id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 delta_minor INTEGER NOT NULL CHECK(delta_minor <> 0),
 reason TEXT NOT NULL CHECK(reason IN ('starter-grant','square-purchase')),
 occurred_at INTEGER NOT NULL,
 CHECK((reason = 'starter-grant' AND delta_minor > 0) OR (reason = 'square-purchase' AND delta_minor < 0))
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_tessera_starter_once ON citizen_tessera_ledger(clerk_user_id) WHERE reason = 'starter-grant'`,
  `CREATE TABLE IF NOT EXISTS world_square_purchases (
 request_id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 price_minor INTEGER NOT NULL CHECK(price_minor > 0),
 purchased_at INTEGER NOT NULL,
 UNIQUE(x, y)
)`,
];

export type PurchaseCommand = { x: number; y: number; requestId: string };
export type PurchaseResult =
  | { ok: true; square: { x: number; y: number; owner: string; zone: 'frontier' }; priceMinor: number; tesseraMinor: number; replay?: true }
  | { ok: false; status: 400 | 403 | 409; reason: string; error: string };
const fail = (status: 400 | 403 | 409, reason: string, error: string): PurchaseResult => ({ ok: false, status, reason, error });

export function parsePurchaseCommand(body: Record<string, unknown>): PurchaseCommand | null {
  if (body.action !== 'buy-square') return null;
  const { x, y, requestId } = body;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(requestId)) return null;
  return { x: x as number, y: y as number, requestId };
}

type Square = { x: number; y: number; zone: Zone; owner: string | null };
const zoneReason: Record<Exclude<Zone, 'wildlands'>, string> = {
  heartland: 'Heartland squares are never sold by the World Registry.',
  commons: 'The Commons cannot be bought; it is claimed only by war, treaty or joint development.',
  frontier: 'Only Wildlands squares are sold by the World Registry.',
};

/** Pure eligibility check (no debit): bounds, zone, ownership and adjacency to the nation's land. */
export function checkPurchaseSite(squares: readonly Square[], nationId: string, x: number, y: number): PurchaseResult | null {
  if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return fail(400, 'out_of_bounds', 'That square is off the map.');
  const square = squares.find(s => s.x === x && s.y === y);
  if (!square) return fail(409, 'map_unavailable', 'The world map is not available right now.');
  if (square.zone === 'heartland' || square.zone === 'commons') return fail(409, square.zone, zoneReason[square.zone]);
  if (square.owner) return fail(409, 'owned', `That square already belongs to ${square.owner}.`);
  if (square.zone !== 'wildlands') return fail(409, square.zone, zoneReason[square.zone]);
  const adjacent = squares.some(s => s.owner === nationId && Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) === 1);
  if (!adjacent) return fail(409, 'not_adjacent', 'The World Registry only sells squares next to land your nation already owns.');
  return null;
}

export async function readTessera(db: GameDatabase, userId: string): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(SUM(delta_minor),0) AS balance FROM citizen_tessera_ledger WHERE clerk_user_id=?').bind(userId).first<{ balance: number }>();
  return Number(row?.balance ?? 0);
}

export async function buySquare(db: GameDatabase, userId: string, command: PurchaseCommand, now: number, enabled: boolean): Promise<PurchaseResult> {
  if (!enabled) return fail(403, 'disabled', 'The World Registry is not open yet.');
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  const nationId = citizen?.nation_id ?? null;
  if (!nationId || !(registryNations as readonly string[]).includes(nationId)) return fail(403, 'no_nation', 'Only Kindle, Korund and Aurelle citizens can buy squares in this preview.');
  await db.prepare(`INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at) VALUES (?,?,?,'starter-grant',?) ON CONFLICT DO NOTHING`)
    .bind(`tsr-grant-${userId}`, userId, TEMP_STARTER_GRANT, now).run();
  const prior = await db.prepare('SELECT clerk_user_id,nation_id,x,y,price_minor FROM world_square_purchases WHERE request_id=?').bind(command.requestId)
    .first<{ clerk_user_id: string; nation_id: string; x: number; y: number; price_minor: number }>();
  if (prior) {
    if (prior.clerk_user_id !== userId || Number(prior.x) !== command.x || Number(prior.y) !== command.y) return fail(409, 'request_reused', 'That request id was already used for a different purchase.');
    return { ok: true, square: { x: command.x, y: command.y, owner: prior.nation_id, zone: 'frontier' }, priceMinor: Number(prior.price_minor), tesseraMinor: await readTessera(db, userId), replay: true };
  }
  const { results } = await db.prepare('SELECT x,y,zone,owner FROM world_squares').all<Square>();
  const squares = (results ?? []).map(s => ({ ...s, x: Number(s.x), y: Number(s.y) }));
  if (squares.length !== mapWidth * mapHeight) return fail(409, 'map_unavailable', 'The world map is not available right now.');
  const site = checkPurchaseSite(squares, nationId, command.x, command.y); if (site) return site;
  const balance = await readTessera(db, userId);
  if (balance < squarePriceMinor) return fail(409, 'insufficient_tessera', `A square costs ${(squarePriceMinor / 100).toFixed(2)} TSR; you hold ${(balance / 100).toFixed(2)} TSR.`);
  const { x, y, requestId } = command;
  // One batch (one transaction): the purchase row is inserted only if the square is still unowned Wildlands next to the
  // nation's land and the balance still covers the price; the debit and the ownership change follow only if that row exists.
  await db.batch([
    db.prepare(`INSERT INTO world_square_purchases(request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM world_squares WHERE x=? AND y=? AND zone='wildlands' AND owner IS NULL)
      AND EXISTS (SELECT 1 FROM world_squares WHERE owner=? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND NOT (x=? AND y=?))
      AND (SELECT COALESCE(SUM(delta_minor),0) FROM citizen_tessera_ledger WHERE clerk_user_id=?) >= ?
      ON CONFLICT DO NOTHING`).bind(requestId, userId, nationId, x, y, squarePriceMinor, now, x, y, nationId, x - 1, x + 1, y - 1, y + 1, x, y, userId, squarePriceMinor),
    db.prepare(`INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at)
      SELECT ?,?,?,'square-purchase',? WHERE EXISTS (SELECT 1 FROM world_square_purchases WHERE request_id=? AND clerk_user_id=?)
      ON CONFLICT DO NOTHING`)
      .bind(`tsr-square-${requestId}`, userId, -squarePriceMinor, now, requestId, userId),
    db.prepare(`UPDATE world_squares SET owner=?, zone='frontier' WHERE x=? AND y=? AND EXISTS (SELECT 1 FROM world_square_purchases WHERE request_id=? AND x=? AND y=?)`)
      .bind(nationId, x, y, requestId, x, y),
  ]);
  const created = await db.prepare('SELECT request_id FROM world_square_purchases WHERE request_id=?').bind(requestId).first();
  if (!created) return fail(409, 'square_taken', 'The square was sold or your balance changed; nothing was charged.');
  return { ok: true, square: { x, y, owner: nationId, zone: 'frontier' }, priceMinor: squarePriceMinor, tesseraMinor: await readTessera(db, userId) };
}
