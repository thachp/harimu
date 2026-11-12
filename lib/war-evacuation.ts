/** #1324 (docs §15.4): on the first successful siege capture, move the defender's enrolled citizens who are there
 *  to the nearest home city that nation still holds. Distance is Chebyshev (`cheb` in lib/travel.ts). Ties go to the
 *  capital, then the lower city id. This is not a voluntary #781 move: no fee, no cooldown, no home_city_moves row.
 *  #1335: a citizen still travelling into the captured city is diverted the same way, measured from their destination square,
 *  so nobody finishes travel inside a city that fell while they were en route.
 *  Runs only when HARIMU_WAR_ENABLED and HARIMU_WAR_EVACUATION_ENABLED are both on. Flag off: no statements. */
import type { DatabaseStatement, GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { flagOn } from './flag-pack.mjs';
import { capitalCityForNation, outpostCityForNation, residentCitiesForNation } from './cities';
import { mapHeight, mapWidth } from './map-zones';
import { claimSquares, type CityKind } from './siege';
import { cheb, citySquares, type Place } from './travel';
import { evacuation, PROTECTIONS_NAME_MAX } from './war-protections-copy';

export const evacuationSchemas = [
  `CREATE TABLE IF NOT EXISTS citizen_evacuations (
 user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 capture_id TEXT NOT NULL REFERENCES city_captures(id) ON DELETE CASCADE,
 from_name TEXT NOT NULL,
 to_name TEXT NOT NULL,
 evacuated_at INTEGER NOT NULL
)`,
];

/** Both flags, via flagOn, so a direct HARIMU_* string still wins over the army pack. */
export const evacuationEnabled = (env: unknown) => flagOn(env, 'HARIMU_WAR_ENABLED') && flagOn(env, 'HARIMU_WAR_EVACUATION_ENABLED');

const clip = (name: string) => name.slice(0, PROTECTIONS_NAME_MAX);
/** The #421 evacuation line and the personal-items line, with {city} and {safeCity} filled. */
export function evacuationLines(city: string, safeCity: string): readonly string[] {
  const fill = (text: string) => text.replaceAll('{city}', clip(city)).replaceAll('{safeCity}', clip(safeCity));
  return [fill(evacuation.notice[1].text), evacuation.belongings.text];
}

type Here = { id: string; x: number | null; y: number | null; until: number | null; home: string | null; current: string | null };
export const nearest = (from: { x: number; y: number }, candidates: readonly Place[], capitalId: string | null): Place | null =>
  candidates.length ? [...candidates].sort((a, b) => cheb(from, a) - cheb(from, b) || Number(b.cityId === capitalId) - Number(a.cityId === capitalId) || (a.cityId ?? '').localeCompare(b.cityId ?? ''))[0] : null;

/** Statements for the capture batch. Empty unless both flags are on. Each write is a no-op unless this capture row landed. */
export async function evacuationStatements(db: GameDatabase, input: { env: unknown; kind: CityKind; centre: { x: number; y: number }; siege: { city_key: string; defender_nation: string }; captureId: string; now: number }): Promise<DatabaseStatement[]> {
  if (!evacuationEnabled(input.env)) return [];
  const defender = input.siege.defender_nation, outpost = outpostCityForNation(defender);
  const capturedId = input.kind === 'outpost' ? outpost?.id ?? '' : input.siege.city_key.slice('city:'.length);
  if (!capturedId) return [];
  const residentIds = new Set(residentCitiesForNation(defender).map(c => c.id)), capitalId = capitalCityForNation(defender)?.id ?? null;
  const places = await citySquares(db, defender);
  const capturedName = places.find(p => p.cityId === capturedId)?.label ?? (input.kind === 'outpost' ? outpost?.name : null) ?? capturedId;
  const squares = claimSquares(input.kind, input.centre, { width: mapWidth, height: mapHeight });
  const candidates = places.filter(p => p.cityId && p.cityId !== capturedId && p.cityId !== outpost?.id);
  const rows = (await db.prepare(`SELECT c.clerk_user_id AS id, t.to_x AS x, t.to_y AS y, t.traveling_until AS until, l.home_city_id AS home, l.current_city_id AS current
    FROM citizens c LEFT JOIN citizen_travel t ON t.user_id=c.clerk_user_id AND t.nation_id=c.nation_id
    LEFT JOIN citizen_city_locations l ON l.user_id=c.clerk_user_id AND l.nation_id=c.nation_id WHERE c.nation_id=?`).bind(defender).all<Here>()).results;
  const statements: DatabaseStatement[] = [], landed = 'EXISTS (SELECT 1 FROM city_captures WHERE id=?)', cap = input.captureId, now = input.now;
  for (const row of rows) {
    const arrived = row.until != null && Number(row.until) <= now && row.x != null && row.y != null;
    const x = arrived ? Number(row.x) : null, y = arrived ? Number(row.y) : null;
    const onCity = x != null && y != null && squares.some(s => s.x === x && s.y === y);
    // #1335: still travelling into the captured city. Divert to where evacuation would send them from that square, in this batch.
    const to = !arrived && row.until != null && row.x != null && row.y != null ? { x: Number(row.x), y: Number(row.y) } : null;
    const inbound = !!to && squares.some(s => s.x === to.x && s.y === to.y);
    const home = row.home, current = row.current;
    if (!onCity && !inbound && home !== capturedId && current !== capturedId) continue;
    const homePlace = home && home !== capturedId ? places.find(p => p.cityId === home) : undefined;
    const homeSafe = home !== capturedId && !!home && (residentIds.has(home) || !!homePlace);
    const dest = homeSafe && homePlace ? homePlace : nearest(onCity ? { x: x!, y: y! } : inbound ? to! : input.centre, candidates, capitalId);
    if (!dest?.cityId) continue;
    statements.push(db.prepare(`INSERT INTO citizen_travel(user_id,nation_id,from_x,from_y,to_x,to_y,departed_at,traveling_until,request_id)
      SELECT ?,?,?,?,?,?,?,?,? WHERE ${landed} ON CONFLICT(user_id) DO UPDATE SET nation_id=excluded.nation_id,from_x=excluded.from_x,from_y=excluded.from_y,to_x=excluded.to_x,to_y=excluded.to_y,departed_at=excluded.departed_at,traveling_until=excluded.traveling_until,request_id=excluded.request_id WHERE ${landed}`)
      .bind(row.id, defender, dest.x, dest.y, dest.x, dest.y, now, now, `evac-${cap}-${row.id}`, cap, cap));
    if (home === capturedId) statements.push(db.prepare(`INSERT INTO citizen_city_locations(user_id,nation_id,home_city_id,current_city_id,updated_at)
      SELECT ?,?,?,?,? WHERE ${landed} ON CONFLICT(user_id) DO UPDATE SET nation_id=excluded.nation_id,home_city_id=excluded.home_city_id,current_city_id=excluded.current_city_id,updated_at=excluded.updated_at WHERE ${landed}`)
      .bind(row.id, defender, dest.cityId, dest.cityId, now, cap, cap));
    else if (current === capturedId) statements.push(db.prepare(`UPDATE citizen_city_locations SET current_city_id=?,updated_at=? WHERE user_id=? AND current_city_id=? AND ${landed}`).bind(dest.cityId, now, row.id, capturedId, cap));
    statements.push(db.prepare(`INSERT INTO citizen_evacuations(user_id,capture_id,from_name,to_name,evacuated_at) SELECT ?,?,?,?,? WHERE ${landed}
      ON CONFLICT(user_id) DO UPDATE SET capture_id=excluded.capture_id,from_name=excluded.from_name,to_name=excluded.to_name,evacuated_at=excluded.evacuated_at WHERE ${landed}`)
      .bind(row.id, cap, clip(capturedName), clip(dest.label), now, cap, cap));
  }
  return statements;
}

export async function readEvacuationNotice(db: GameDatabase, userId: string): Promise<readonly string[] | null> {
  const row = await db.prepare('SELECT from_name,to_name FROM citizen_evacuations WHERE user_id=?').bind(userId).first<{ from_name: string; to_name: string }>().catch(tolerate(isMissingRelation, null));
  return row ? evacuationLines(row.from_name, row.to_name) : null;
}
