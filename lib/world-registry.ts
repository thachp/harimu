import type { GameDatabase } from './database-contract';
import { flagOn } from './flag-pack.mjs';
import { mapHeight, mapWidth, mvpNations, onGrid, type Zone } from './map-zones.ts';
import { tesseraBalanceBinds, tesseraBalanceSql as balanceSql } from './tessera-exchange';
import { borderIncidentsEnabled, borderIncidentStatements, borderIncidentTargets } from './border-incidents'; // #1527

/**
 * World Registry square purchase (#122, docs 6.1 / 15.1). PoC: a citizen of an MVP nation buys one unclaimed
 * Wildlands square adjacent (8-neighbour) to land their nation already owns, for a fixed Tessera price. The
 * square's owner becomes the nation, its zone becomes Frontier, and the debit is written to a Tessera ledger.
 *
 * Tessera source (#210): citizens buy Tessera with Spark at the Clearing House kiosk (lib/tessera-exchange.ts).
 * The temporary 50.00 TSR starter grant is removed; 'starter-grant' rows already written stay in the ledger as history.
 *
 * #1349 / #1482: HARIMU_SQUARE_PRICE_ANTI_SNOWBALL_ENABLED (docs §15.1 [ASSUMPTION]) prices a square at
 * round(squarePriceMinor × (1 + owned/1000) × (1 + d/50)) minor units, where d is Chebyshev distance from the
 * square to the buying nation's capital (`mvpNations`; same metric as lib/map-zones.ts). With the flag on, `owned`
 * is how many world_squares the buyer's nation already owns, counted inside the purchase INSERT; d is a pure
 * function of (x, y, nation) and is bound into that INSERT. Rounding is nearest, half up, and the result is at least 1.
 * At d = 0 the price matches the #1349 owned-only term. Flag off: the price stays squarePriceMinor. This flag does not open the registry.
 */
export const squarePriceMinor = 2500; // 25.00 TSR
/** #1482 [ASSUMPTION]: docs §15.1 give no distance figure; 1/50 per square (a square 10 out costs 20% more). */
export const squareDistanceDivisor = 50;
export const registryNations = ['kindle', 'korund', 'aurelle'] as const;
/** In HARIMU_GRAY_PACK (preview "true", production "false"); a direct env string wins. Exactly "true" is on. */
export const squarePriceAntiSnowballEnabled = (env: unknown) => flagOn(env, 'HARIMU_SQUARE_PRICE_ANTI_SNOWBALL_ENABLED');

/** Capital of a live map nation, or null if that nation has none in mvpNations. */
export function nationCapital(nationId: string): { x: number; y: number } | null {
  return mvpNations.find(n => n.id === nationId)?.capital ?? null;
}

export const noCapitalError = 'The World Registry cannot price a square for a nation without a capital.';
export const noNationError = 'Only Kindle, Korund and Aurelle citizens can buy squares in this preview.';
export const purchaseBadRequestError = 'Send action "buy-square", integer x/y and a requestId.';
export const purchaseOutOfBoundsError = 'That square is off the map.';

/** Chebyshev distance from (x, y) to the nation's capital. No capital: null (callers must fail closed; never fall back to 0). */
export function squareCapitalDistance(nationId: string, x: number, y: number): number | null {
  const capital = nationCapital(nationId);
  if (!capital) return null;
  return Math.max(Math.abs(x - capital.x), Math.abs(y - capital.y));
}

/** Parse GET /api/world/registry x/y the same way a purchase treats coordinates: missing both is "no square"; anything else must be two integers on the map. */
export function parseRegistrySquareQuery(x: string | null, y: string | null):
  | { ok: true; at?: { x: number; y: number } }
  | { ok: false; status: 400; reason: 'bad_request' | 'out_of_bounds'; error: string } {
  if (x === null && y === null) return { ok: true };
  if (x === null || y === null || !/^-?\d+$/.test(x) || !/^-?\d+$/.test(y)) {
    return { ok: false, status: 400, reason: 'bad_request', error: purchaseBadRequestError };
  }
  const xi = Number(x), yi = Number(y);
  if (xi < 0 || yi < 0 || xi >= mapWidth || yi >= mapHeight) return { ok: false, status: 400, reason: 'out_of_bounds', error: purchaseOutOfBoundsError };
  return { ok: true, at: { x: xi, y: yi } };
}

/** Nearest minor unit, half up, at least 1. `owned` and `distance` are clamped to non-negative integers. */
export function squareChargeMinor(owned: number, distance = 0): number {
  const count = Number.isSafeInteger(owned) && owned > 0 ? owned : 0;
  const d = Number.isSafeInteger(distance) && distance > 0 ? distance : 0;
  const price = Math.floor((squarePriceMinor * (1000 + count) * (squareDistanceDivisor + d) + 500 * squareDistanceDivisor) / (1000 * squareDistanceDivisor));
  return price > 0 ? price : 1;
}
/** Same half-up price inside one statement. First `?` is the nation id (counted at insert time); second `?` is d. */
export const squareLivePriceSql = `CAST((${squarePriceMinor}*(1000+(SELECT COUNT(*) FROM world_squares WHERE owner=?))*(${squareDistanceDivisor}+?)+${500 * squareDistanceDivisor})/${1000 * squareDistanceDivisor} AS INTEGER)`;

async function ownedSquareCount(db: GameDatabase, nationId: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM world_squares WHERE owner=?').bind(nationId).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/** Listed price for a signed-in citizen. Flag off returns squarePriceMinor and does not read world_squares.
 *  #1482: when `at` is a square, the price includes Chebyshev distance to the citizen's capital; without it the d = 0 term is listed. */
export async function registryPriceMinor(db: GameDatabase, userId: string, env: unknown, at?: { x: number; y: number }): Promise<number> {
  if (!squarePriceAntiSnowballEnabled(env)) return squarePriceMinor;
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  const nationId = citizen?.nation_id;
  // Without `at`, list the d = 0 term (owned only). registryListingPrice has already refused a missing nation or capital when the flag is on.
  const distance = nationId && at ? squareCapitalDistance(nationId, at.x, at.y) : 0;
  if (distance === null) throw new Error('registryPriceMinor requires a capital when a square is given');
  if (!nationId) return squareChargeMinor(0, distance);
  return squareChargeMinor(await ownedSquareCount(db, nationId), distance);
}

export type RegistryListingResult =
  | { ok: true; priceMinor: number }
  | { ok: false; status: 400 | 403; reason: string; error: string };

/** GET listing price. Non-integer or off-map x/y is the same 400 as a purchase.
 *  Flag on: no nation is 403 no_nation (both bare and per-square), matching purchase; no capital is 403 no_capital, including a bare GET. Flag off does not require a nation or capital. */
export async function registryListingPrice(db: GameDatabase, userId: string, env: unknown, x: string | null, y: string | null): Promise<RegistryListingResult> {
  const parsed = parseRegistrySquareQuery(x, y);
  if (!parsed.ok) return parsed;
  if (squarePriceAntiSnowballEnabled(env)) {
    const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
    const nationId = citizen?.nation_id ?? null;
    if (!nationId || !(registryNations as readonly string[]).includes(nationId)) return { ok: false, status: 403, reason: 'no_nation', error: noNationError };
    if (nationCapital(nationId) === null) return { ok: false, status: 403, reason: 'no_capital', error: noCapitalError };
  }
  return { ok: true, priceMinor: await registryPriceMinor(db, userId, env, parsed.at) };
}

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
  if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return fail(400, 'out_of_bounds', purchaseOutOfBoundsError);
  const square = squares.find(s => s.x === x && s.y === y);
  if (!square) return fail(409, 'map_unavailable', 'The world map is not available right now.');
  if (square.zone === 'heartland' || square.zone === 'commons') return fail(409, square.zone, zoneReason[square.zone]);
  if (square.owner) return fail(409, 'owned', `That square already belongs to ${square.owner}.`);
  if (square.zone !== 'wildlands') return fail(409, square.zone, zoneReason[square.zone]);
  const adjacent = squares.some(s => s.owner === nationId && Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) === 1);
  if (!adjacent) return fail(409, 'not_adjacent', 'The World Registry only sells squares next to land your nation already owns.');
  return null;
}

/** Spendable Tessera: the shared balance (ledger, Clearing House kiosk purchases #210, claimed earned rewards #465), defined once in tessera-exchange.ts. */
export async function readTessera(db: GameDatabase, userId: string): Promise<number> {
  const row = await db.prepare(`SELECT ${balanceSql} AS balance`).bind(...tesseraBalanceBinds(userId)).first<{ balance: number }>();
  return Number(row?.balance ?? 0);
}

export async function buySquare(db: GameDatabase, userId: string, command: PurchaseCommand, now: number, enabled: boolean, env?: unknown): Promise<PurchaseResult> {
  if (!enabled) return fail(403, 'disabled', 'The World Registry is not open yet.');
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  const nationId = citizen?.nation_id ?? null;
  if (!nationId || !(registryNations as readonly string[]).includes(nationId)) return fail(403, 'no_nation', noNationError);
  const prior = await db.prepare('SELECT clerk_user_id,nation_id,x,y,price_minor FROM world_square_purchases WHERE request_id=?').bind(command.requestId)
    .first<{ clerk_user_id: string; nation_id: string; x: number; y: number; price_minor: number }>();
  if (prior) {
    if (prior.clerk_user_id !== userId || Number(prior.x) !== command.x || Number(prior.y) !== command.y) return fail(409, 'request_reused', 'That request id was already used for a different purchase.');
    return { ok: true, square: { x: command.x, y: command.y, owner: prior.nation_id, zone: 'frontier' }, priceMinor: Number(prior.price_minor), tesseraMinor: await readTessera(db, userId), replay: true };
  }
  const { results } = await db.prepare('SELECT x,y,zone,owner FROM world_squares').all<Square>();
  const squares = onGrid(results ?? []).map(s => ({ ...s, x: Number(s.x), y: Number(s.y) })); // #486: rows beyond the grid are ignored
  if (squares.length !== mapWidth * mapHeight) return fail(409, 'map_unavailable', 'The world map is not available right now.');
  const site = checkPurchaseSite(squares, nationId, command.x, command.y); if (site) return site;
  const balance = await readTessera(db, userId);
  const dynamic = squarePriceAntiSnowballEnabled(env);
  // Flag off: today's fixed price, and no owned-square count. Flag on does not pre-read the count; the INSERT counts.
  if (!dynamic && balance < squarePriceMinor) return fail(409, 'insufficient_tessera', `A square costs ${(squarePriceMinor / 100).toFixed(2)} TSR; you hold ${(balance / 100).toFixed(2)} TSR.`);
  const { x, y, requestId } = command;
  // #1527 flag on: one incident per neighbouring nation, written only if this purchase row is. Flag off: no statement, so the batch is unchanged.
  const incidents = borderIncidentsEnabled(env) ? borderIncidentStatements(db, { kind: 'purchase', requestId, actor: nationId, x, y, at: now, radius: 1,
    targets: borderIncidentTargets(squares, nationId, [{ x, y }]), action: { sql: 'SELECT 1 FROM world_square_purchases WHERE request_id=? AND x=? AND y=?', binds: [requestId, x, y] } }) : [];
  // One batch (one transaction): the purchase row is inserted only if the square is still unowned Wildlands next to the
  // nation's land and the balance still covers the price; the debit and the ownership change follow only if that row exists.
  // Flag on: price_minor is the formula on the nation's count inside that INSERT, and the balance guard uses the same figure.
  if (!dynamic) {
    await db.batch([
      db.prepare(`INSERT INTO world_square_purchases(request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM world_squares WHERE x=? AND y=? AND zone='wildlands' AND owner IS NULL)
      AND EXISTS (SELECT 1 FROM world_squares WHERE owner=? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND NOT (x=? AND y=?))
      AND ${balanceSql} >= ?
      ON CONFLICT DO NOTHING`).bind(requestId, userId, nationId, x, y, squarePriceMinor, now, x, y, nationId, x - 1, x + 1, y - 1, y + 1, x, y, ...tesseraBalanceBinds(userId), squarePriceMinor),
      db.prepare(`INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at)
      SELECT ?,?,?,'square-purchase',? WHERE EXISTS (SELECT 1 FROM world_square_purchases WHERE request_id=? AND clerk_user_id=?)
      ON CONFLICT DO NOTHING`)
        .bind(`tsr-square-${requestId}`, userId, -squarePriceMinor, now, requestId, userId),
      db.prepare(`UPDATE world_squares SET owner=?, zone='frontier' WHERE x=? AND y=? AND EXISTS (SELECT 1 FROM world_square_purchases WHERE request_id=? AND x=? AND y=?)`)
        .bind(nationId, x, y, requestId, x, y),
      ...incidents,
    ]);
    const created = await db.prepare('SELECT request_id FROM world_square_purchases WHERE request_id=?').bind(requestId).first();
    if (!created) return fail(409, 'square_taken', 'The square was sold or your balance changed; nothing was charged.');
    return { ok: true, square: { x, y, owner: nationId, zone: 'frontier' }, priceMinor: squarePriceMinor, tesseraMinor: await readTessera(db, userId) };
  }
  // d comes from the stored square row and the buyer's capital at purchase time; never from the client.
  const stored = squares.find(s => s.x === x && s.y === y);
  if (!stored) return fail(409, 'map_unavailable', 'The world map is not available right now.');
  const distance = squareCapitalDistance(nationId, stored.x, stored.y);
  if (distance === null) return fail(403, 'no_capital', noCapitalError);
  await db.batch([
    db.prepare(`INSERT INTO world_square_purchases(request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at)
      SELECT ?,?,?,?,?,${squareLivePriceSql},? WHERE EXISTS (SELECT 1 FROM world_squares WHERE x=? AND y=? AND zone='wildlands' AND owner IS NULL)
      AND EXISTS (SELECT 1 FROM world_squares WHERE owner=? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND NOT (x=? AND y=?))
      AND ${balanceSql} >= ${squareLivePriceSql}
      ON CONFLICT DO NOTHING`).bind(requestId, userId, nationId, x, y, nationId, distance, now, x, y, nationId, x - 1, x + 1, y - 1, y + 1, x, y, ...tesseraBalanceBinds(userId), nationId, distance),
    db.prepare(`INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at)
      SELECT ?,?,-price_minor,'square-purchase',? FROM world_square_purchases WHERE request_id=? AND clerk_user_id=?
      ON CONFLICT DO NOTHING`)
      .bind(`tsr-square-${requestId}`, userId, now, requestId, userId),
    db.prepare(`UPDATE world_squares SET owner=?, zone='frontier' WHERE x=? AND y=? AND EXISTS (SELECT 1 FROM world_square_purchases WHERE request_id=? AND x=? AND y=?)`)
      .bind(nationId, x, y, requestId, x, y),
    ...incidents,
  ]);
  const created = await db.prepare('SELECT price_minor FROM world_square_purchases WHERE request_id=?').bind(requestId).first<{ price_minor: number }>();
  if (!created) {
    const livePrice = squareChargeMinor(await ownedSquareCount(db, nationId), distance);
    const liveBalance = await readTessera(db, userId);
    if (liveBalance < livePrice) return fail(409, 'insufficient_tessera', `A square costs ${(livePrice / 100).toFixed(2)} TSR; you hold ${(liveBalance / 100).toFixed(2)} TSR.`);
    return fail(409, 'square_taken', 'The square was sold or your balance changed; nothing was charged.');
  }
  return { ok: true, square: { x, y, owner: nationId, zone: 'frontier' }, priceMinor: Number(created.price_minor), tesseraMinor: await readTessera(db, userId) };
}
