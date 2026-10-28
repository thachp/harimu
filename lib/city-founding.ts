import type { GameDatabase } from './database-contract';
import { mapHeight, mapWidth, onGrid, mvpNations, type Zone } from './map-zones';

/**
 * Found a T1 city on Wildlands (#124, docs 15.1 Founding). PoC: one flag-gated stub action per MVP nation.
 * The centre must be an unowned Wildlands square at least `minCityDistance` squares (Chebyshev) from every
 * existing settlement (seed capitals, border outposts and founded cities). The radius-2 block is claimed
 * atomically: every square gets owner = nation and zone = frontier, and a T1 city record is linked to the centre.
 */
export const minCityDistance = 6;
export const claimRadius = 2;
export const foundingAuthorities = {
  kindle: { action: 'kindle-charter', label: 'Government charter' },
  korund: { action: 'korund-chairman-order', label: 'Chairman order' },
  aurelle: { action: 'aurelle-royal-charter', label: 'Royal charter' },
} as const;
export type FoundingNation = keyof typeof foundingAuthorities;
export type FoundingAction = (typeof foundingAuthorities)[FoundingNation]['action'];

export const worldCitiesSchema = `CREATE TABLE IF NOT EXISTS world_cities (
 id TEXT PRIMARY KEY,
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 40),
 tier INTEGER NOT NULL DEFAULT 1 CHECK(tier BETWEEN 1 AND 4),
 center_x INTEGER NOT NULL, center_y INTEGER NOT NULL,
 authority TEXT NOT NULL CHECK(authority IN ('kindle-charter','korund-chairman-order','aurelle-royal-charter')),
 founded_by TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 founded_at INTEGER NOT NULL,
 above_next_tier_since INTEGER,
 UNIQUE(center_x, center_y)
)`;

export type FoundingCommand = { action: FoundingAction; x: number; y: number; name: string; requestId: string };
export type FoundingResult =
  | { ok: true; city: { id: string; nationId: string; name: string; tier: number; x: number; y: number }; claimed: number; replay?: true }
  | { ok: false; status: 400 | 403 | 409; reason: string; error: string };

const fail = (status: 400 | 403 | 409, reason: string, error: string): FoundingResult => ({ ok: false, status, reason, error });
const zoneReason: Partial<Record<Zone, string>> = {
  commons: 'The Commons cannot be settled; it is claimed only by war, treaty or joint development.',
  heartland: 'Heartland squares already belong to a nation and are never re-founded.',
  frontier: 'Frontier squares cannot host a new city; found on Wildlands.',
};

export function parseFoundingCommand(body: Record<string, unknown>): FoundingCommand | null {
  const { action, x, y, name, requestId } = body;
  if (!Object.values(foundingAuthorities).some(a => a.action === action)) return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (typeof name !== 'string' || !/^[\p{L}][\p{L} '\-]{1,39}$/u.test(name.trim())) return null;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(requestId)) return null;
  return { action: action as FoundingAction, x: x as number, y: y as number, name: name.trim(), requestId };
}

/** Flag gate: HARIMU_CITY_FOUNDING_ENABLED=true turns the stubs on; the action must be the citizen's own nation's authority. */
export function foundingAuthority(nationId: string | null, action: FoundingAction, enabled: boolean): FoundingResult | null {
  if (!enabled) return fail(403, 'disabled', 'City founding is not enabled yet.');
  const authority = nationId && nationId in foundingAuthorities ? foundingAuthorities[nationId as FoundingNation] : null;
  if (!authority) return fail(403, 'no_authority', 'Only Kindle, Korund and Aurelle citizens can found cities in this preview.');
  if (authority.action !== action) return fail(403, 'wrong_authority', `Your nation founds cities by ${authority.label}.`);
  return null;
}

type Square = { x: number; y: number; zone: Zone; owner: string | null; feature: string | null };
export const settlementFeatures = ['capital', 'border outpost', 'city'] as const;
const isSettlement = (f: string | null) => (settlementFeatures as readonly (string | null)[]).includes(f);
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Pure eligibility check against a square list (also used by tests and any future UI preview). */
export function checkFoundingSite(squares: readonly Square[], x: number, y: number): FoundingResult | null {
  if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return fail(400, 'out_of_bounds', 'That square is off the map.');
  const centre = squares.find(s => s.x === x && s.y === y);
  if (!centre) return fail(409, 'map_unavailable', 'The world map is not available right now.');
  if (centre.zone !== 'wildlands') return fail(409, `centre_${centre.zone}`, zoneReason[centre.zone] ?? 'Cities can only be founded on Wildlands.');
  if (centre.owner) return fail(409, 'centre_owned', 'That square is already claimed.');
  const near = squares.find(s => isSettlement(s.feature) && cheb(s, centre) < minCityDistance);
  if (near) return fail(409, 'too_close', `Too close to the ${near.feature} at ${near.x}, ${near.y}: cities must be at least ${minCityDistance} squares apart.`);
  if (x < claimRadius || y < claimRadius || x + claimRadius >= mapWidth || y + claimRadius >= mapHeight) return fail(409, 'block_off_map', `The radius-${claimRadius} claim would run off the map edge.`);
  const block = squares.filter(s => cheb(s, centre) <= claimRadius);
  const bad = block.find(s => s.zone !== 'wildlands' || s.owner);
  if (bad) return fail(409, bad.zone === 'commons' ? 'block_commons' : 'block_claimed', bad.zone === 'commons'
    ? `The radius-${claimRadius} claim would include the Commons at ${bad.x}, ${bad.y}.`
    : `The radius-${claimRadius} claim would include an already claimed or non-Wildlands square at ${bad.x}, ${bad.y}.`);
  return null;
}

const nationOf = (action: FoundingAction) => (Object.entries(foundingAuthorities).find(([, a]) => a.action === action)![0]) as FoundingNation;
const box = `center_x BETWEEN ? AND ? AND center_y BETWEEN ? AND ?`;

export async function foundCity(db: GameDatabase, userId: string, nationId: string | null, command: FoundingCommand, now: number, enabled: boolean): Promise<FoundingResult> {
  const denied = foundingAuthority(nationId, command.action, enabled); if (denied) return denied;
  const nation = nationOf(command.action);
  const prior = await db.prepare('SELECT id,nation_id,name,tier,center_x,center_y,founded_by FROM world_cities WHERE request_id=?').bind(command.requestId)
    .first<{ id: string; nation_id: string; name: string; tier: number; center_x: number; center_y: number; founded_by: string }>();
  if (prior) {
    if (prior.founded_by !== userId || Number(prior.center_x) !== command.x || Number(prior.center_y) !== command.y) return fail(409, 'request_reused', 'That request id was already used for a different founding.');
    return { ok: true, city: { id: prior.id, nationId: prior.nation_id, name: prior.name, tier: Number(prior.tier), x: Number(prior.center_x), y: Number(prior.center_y) }, claimed: (2 * claimRadius + 1) ** 2, replay: true };
  }
  const { results } = await db.prepare('SELECT x,y,zone,owner,feature FROM world_squares').all<Square>();
  const squares = onGrid(results ?? []).map(s => ({ ...s, x: Number(s.x), y: Number(s.y) })); // #486: rows beyond the grid are ignored
  if (squares.length !== mapWidth * mapHeight) return fail(409, 'map_unavailable', 'The world map is not available right now.');
  const site = checkFoundingSite(squares, command.x, command.y); if (site) return site;
  const { x, y } = command, r = claimRadius, d = minCityDistance - 1, size = (2 * r + 1) ** 2;
  const id = `city-${nation}-${x}-${y}`;
  // Guarded writes in one batch (one transaction on D1 and Postgres): the city row is inserted only if the
  // whole block is still unowned Wildlands and no settlement is within range; squares change only if that row exists.
  await db.batch([
    db.prepare(`INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at)
      SELECT ?,?,?,1,?,?,?,?,?,? WHERE
      (SELECT COUNT(*) FROM world_squares WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND zone='wildlands' AND owner IS NULL AND feature IS NULL)=?
      AND NOT EXISTS (SELECT 1 FROM world_squares WHERE feature IN ('capital','border outpost','city') AND x BETWEEN ? AND ? AND y BETWEEN ? AND ?)
      AND NOT EXISTS (SELECT 1 FROM world_cities WHERE ${box})
      ON CONFLICT DO NOTHING`).bind(id, nation, command.name, x, y, command.action, userId, command.requestId, now,
      x - r, x + r, y - r, y + r, size, x - d, x + d, y - d, y + d, x - d, x + d, y - d, y + d),
    db.prepare(`UPDATE world_squares SET owner=?, zone='frontier', feature=CASE WHEN x=? AND y=? THEN 'city' ELSE feature END
      WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM world_cities WHERE id=? AND request_id=?)`)
      .bind(nation, x, y, x - r, x + r, y - r, y + r, id, command.requestId),
  ]);
  const created = await db.prepare('SELECT id FROM world_cities WHERE request_id=?').bind(command.requestId).first<{ id: string }>();
  if (!created) return fail(409, 'site_taken', 'Another founding claimed nearby land first; nothing was claimed.');
  return { ok: true, city: { id, nationId: nation, name: command.name, tier: 1, x, y }, claimed: size };
}

/** Seed settlements must satisfy the same spacing among capitals (border outposts sit inside their own Frontier). */
export const seedCapitalsSpaced = () => mvpNations.every((a, i) => mvpNations.every((b, j) => i === j || cheb(a.capital, b.capital) >= minCityDistance));
