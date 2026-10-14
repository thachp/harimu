import type { GameDatabase } from './database-contract';
import { mapHeight, mapWidth, mvpNations } from './map-zones';
import { citiesForNation } from './cities';

/**
 * Travel between owned and city squares with a travel timer (#123, docs 6: squares are the unit of movement).
 * PoC: a citizen of an MVP nation has a location square (home: their capital). They may travel to one of their
 * nation's city squares (capital, border outpost, cities founded under #124) or to an owned square adjacent to where
 * they stand. Duration = Chebyshev distance × `travelSecondsPerSquare`, capped at `maximumTravelSeconds`. While
 * travelling, location-bound actions (work, market trade, square posts, city moves) are refused with a reason; arrival
 * is derived from the clock (no write needed) and latched on the next travel. Behind HARIMU_TRAVEL_ENABLED (default "false").
 */
export const travelSecondsPerSquare = 300; // 5 real minutes per square
export const maximumTravelSeconds = 3600; // PoC cap: 1 hour
export const travelSchema = `CREATE TABLE IF NOT EXISTS citizen_travel (
 user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 from_x INTEGER NOT NULL, from_y INTEGER NOT NULL,
 to_x INTEGER NOT NULL, to_y INTEGER NOT NULL,
 departed_at INTEGER NOT NULL,
 traveling_until INTEGER NOT NULL CHECK(traveling_until >= departed_at),
 request_id TEXT NOT NULL UNIQUE
)`;

type Point = { x: number; y: number };
export type Place = Point & { cityId: string | null; label: string };
export type TravelState = { enabled: boolean; supported: boolean; location: Place | null; traveling: null | { from: Place; to: Place; departedAt: number; travelingUntil: number; secondsLeft: number } };
export type TravelResult = { ok: true; state: TravelState; durationSeconds: number; replay?: true } | { ok: false; status: 400 | 403 | 409; reason: string; error: string };
const fail = (status: 400 | 403 | 409, reason: string, error: string): TravelResult => ({ ok: false, status, reason, error });
const cheb = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const travelSeconds = (from: Point, to: Point) => Math.min(maximumTravelSeconds, cheb(from, to) * travelSecondsPerSquare);

/** City squares of a nation: seed capital and border outpost (first two catalog cities) plus founded cities. */
export async function citySquares(db: GameDatabase, nationId: string): Promise<Place[]> {
  const seed = mvpNations.find(n => n.id === nationId); if (!seed) return [];
  const names = citiesForNation(nationId);
  const places: Place[] = [
    { ...seed.capital, cityId: names[0]?.id ?? null, label: names[0]?.name ?? 'Capital' },
    { ...seed.outpost, cityId: names[1]?.id ?? null, label: names[1]?.name ?? 'Border outpost' },
  ];
  try {
    const founded = await db.prepare('SELECT id,name,center_x,center_y FROM world_cities WHERE nation_id=?').bind(nationId).all<{ id: string; name: string; center_x: number; center_y: number }>();
    for (const c of founded.results ?? []) places.push({ x: Number(c.center_x), y: Number(c.center_y), cityId: c.id, label: c.name });
  } catch { /* world_cities not migrated on this backend: seed cities only */ }
  return places;
}
const placeAt = (cities: Place[], p: Point): Place => cities.find(c => c.x === p.x && c.y === p.y) ?? { ...p, cityId: null, label: `Square ${p.x}, ${p.y}` };

type Row = { from_x: number; from_y: number; to_x: number; to_y: number; departed_at: number; traveling_until: number; request_id: string };
/** Pure read: location and travel state at `now`. */
export async function readTravel(db: GameDatabase, userId: string, now: number, enabled: boolean): Promise<TravelState> {
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  const seed = mvpNations.find(n => n.id === citizen?.nation_id);
  if (!seed || !citizen?.nation_id) return { enabled, supported: false, location: null, traveling: null };
  const cities = await citySquares(db, citizen.nation_id);
  const row = await db.prepare('SELECT from_x,from_y,to_x,to_y,departed_at,traveling_until,request_id FROM citizen_travel WHERE user_id=? AND nation_id=?').bind(userId, citizen.nation_id).first<Row>();
  if (!row) return { enabled, supported: true, location: placeAt(cities, seed.capital), traveling: null };
  const until = Number(row.traveling_until);
  const to = placeAt(cities, { x: Number(row.to_x), y: Number(row.to_y) });
  if (now >= until) return { enabled, supported: true, location: to, traveling: null };
  return { enabled, supported: true, location: null, traveling: { from: placeAt(cities, { x: Number(row.from_x), y: Number(row.from_y) }), to, departedAt: Number(row.departed_at), travelingUntil: until, secondsLeft: until - now } };
}

/** Reason a location-bound action is refused right now, or null. Always null while the flag is off. */
export async function travelBlock(db: GameDatabase, userId: string, now: number, enabled: boolean): Promise<string | null> {
  if (!enabled) return null;
  try {
    const row = await db.prepare('SELECT traveling_until FROM citizen_travel WHERE user_id=?').bind(userId).first<{ traveling_until: number }>();
    if (row && now < Number(row.traveling_until)) return `You are travelling; you arrive in ${Math.ceil((Number(row.traveling_until) - now) / 60)} min. Location-bound actions resume on arrival.`;
  } catch { /* travel table not migrated: nothing to block */ }
  return null;
}

export function parseTravelCommand(body: Record<string, unknown>): { x: number; y: number; requestId: string } | null {
  if (body.action !== 'start-travel' || !Number.isInteger(body.x) || !Number.isInteger(body.y)) return null;
  if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(body.requestId)) return null;
  return { x: body.x as number, y: body.y as number, requestId: body.requestId };
}

export async function startTravel(db: GameDatabase, userId: string, command: { x: number; y: number; requestId: string }, now: number, enabled: boolean): Promise<TravelResult> {
  if (!enabled) return fail(403, 'disabled', 'Travel is not enabled yet.');
  const prior = await db.prepare('SELECT user_id,to_x,to_y,departed_at,traveling_until FROM citizen_travel WHERE request_id=?').bind(command.requestId).first<{ user_id: string; to_x: number; to_y: number; departed_at: number; traveling_until: number }>();
  if (prior) {
    if (prior.user_id !== userId || Number(prior.to_x) !== command.x || Number(prior.to_y) !== command.y) return fail(409, 'request_reused', 'That request id was already used for a different journey.');
    return { ok: true, state: await readTravel(db, userId, now, enabled), durationSeconds: Number(prior.traveling_until) - Number(prior.departed_at), replay: true };
  }
  const state = await readTravel(db, userId, now, enabled);
  if (!state.supported) return fail(403, 'unsupported_nation', 'Travel is available to Kindle, Korund and Aurelle citizens in this preview.');
  if (state.traveling) return fail(409, 'already_traveling', `You are already travelling to ${state.traveling.to.label}.`);
  const here = state.location!; const to = { x: command.x, y: command.y };
  if (to.x < 0 || to.y < 0 || to.x >= mapWidth || to.y >= mapHeight) return fail(400, 'out_of_bounds', 'That square is off the map.');
  if (to.x === here.x && to.y === here.y) return fail(409, 'already_here', 'You are already there.');
  const citizen = (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string }>())!;
  const cities = await citySquares(db, citizen.nation_id);
  const isCity = cities.some(c => c.x === to.x && c.y === to.y);
  if (!isCity) {
    const square = await db.prepare('SELECT owner FROM world_squares WHERE x=? AND y=?').bind(to.x, to.y).first<{ owner: string | null }>();
    if (square?.owner !== citizen.nation_id) return fail(409, 'not_owned', 'You can only travel to your nation\'s cities or to squares your nation owns.');
    if (cheb(here, to) !== 1) return fail(409, 'not_adjacent', 'Without a city at the destination you can only travel to an adjacent owned square.');
  }
  const duration = travelSeconds(here, to);
  // Upsert guarded so a concurrent start (or one still en route) cannot overwrite an active journey.
  await db.prepare(`INSERT INTO citizen_travel(user_id,nation_id,from_x,from_y,to_x,to_y,departed_at,traveling_until,request_id)
    SELECT clerk_user_id,nation_id,?,?,?,?,?,?,? FROM citizens WHERE clerk_user_id=? AND nation_id=?
    ON CONFLICT(user_id) DO UPDATE SET nation_id=excluded.nation_id,from_x=excluded.from_x,from_y=excluded.from_y,to_x=excluded.to_x,to_y=excluded.to_y,
      departed_at=excluded.departed_at,traveling_until=excluded.traveling_until,request_id=excluded.request_id
    WHERE citizen_travel.traveling_until <= ?`)
    .bind(here.x, here.y, to.x, to.y, now, now + duration, command.requestId, userId, citizen.nation_id, now).run();
  const saved = await db.prepare('SELECT request_id FROM citizen_travel WHERE request_id=?').bind(command.requestId).first();
  if (!saved) return fail(409, 'already_traveling', 'Another journey started first; nothing changed.');
  return { ok: true, state: await readTravel(db, userId, now, enabled), durationSeconds: duration };
}
