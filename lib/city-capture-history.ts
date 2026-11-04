/** #1028: latest capture for the city panel, read from city_captures (via city_sieges.city_key). Display only.
 *  #1078: a treaty return on that capture (`city_treaty_returns`), read only when HARIMU_WAR_PEACE_REVERT_ENABLED is on. */
import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { outpostNationForCity } from './cities';

export type CityTreatyReturn = { returnedTo: string; returnedAt: number };
export type CityCaptureHistory = { heldBy: string; capturedFrom: string; capturedAt: number; treatyReturn?: CityTreatyReturn };

/** [ASSUMPTION] A founded city is stored as `city:{id}`. #419 keys a frontier outpost `outpost:{its nation}`
 *  (siegeCityKey), not the viewer's nation. The panel city id is the catalog id (Ashby Crossing → outpost:kindle). */
export function captureCityKeys(_viewerNation: string, cityId: string): [string, string] {
  const owner = outpostNationForCity(cityId);
  return [`city:${cityId}`, owner ? `outpost:${owner}` : `city:${cityId}`];
}

/** [ASSUMPTION] UTC calendar day of captured_at (unix seconds). Names are nations.short_name. */
export function captureHistoryLine(history: CityCaptureHistory): string {
  const date = new Date(history.capturedAt * 1000).toISOString().slice(0, 10);
  return `Held by ${history.heldBy} since ${date}, captured from ${history.capturedFrom}.`;
}

/** UTC calendar day of returned_at, same as the capture line. The phrase is the panel's return line. */
export function treatyReturnLine(entry: CityTreatyReturn): string {
  const date = new Date(entry.returnedAt * 1000).toISOString().slice(0, 10);
  return `Returned to ${entry.returnedTo} by treaty on ${date}.`;
}

const latestSql = `SELECT h.short_name AS held_by, f.short_name AS captured_from, c.captured_at AS captured_at
FROM city_sieges s
JOIN city_captures c ON c.siege_id = s.id
JOIN nations h ON h.id = c.attacker_nation
JOIN nations f ON f.id = c.defender_nation
WHERE s.city_key IN (?, ?)
ORDER BY c.captured_at DESC, c.id DESC
LIMIT 1`;

/** One indexed read (idx_city_sieges_city_key). Null when the city has no capture row. A missing table fails closed. */
export async function latestCityCapture(db: GameDatabase, nationId: string, cityId: string): Promise<CityCaptureHistory | null> {
  const row = await db.prepare(latestSql).bind(...captureCityKeys(nationId, cityId)).first<{ held_by: string; captured_from: string; captured_at: number }>().catch(tolerate(isMissingRelation, null));
  if (!row || row.held_by == null || row.captured_from == null) return null;
  const capturedAt = Number(row.captured_at);
  if (!Number.isSafeInteger(capturedAt)) return null;
  return { heldBy: String(row.held_by), capturedFrom: String(row.captured_from), capturedAt };
}

const returnSql = `SELECT n.short_name AS returned_to, tr.returned_at AS returned_at
FROM city_treaty_returns tr JOIN nations n ON n.id = tr.returned_to
WHERE tr.capture_id = (
 SELECT c.id FROM city_sieges s JOIN city_captures c ON c.siege_id = s.id
 WHERE s.city_key IN (?, ?) ORDER BY c.captured_at DESC, c.id DESC LIMIT 1)`;

/** The return on the latest capture only. An older return stays stored and is not shown over a newer capture. Missing table: null. */
export async function cityTreatyReturn(db: GameDatabase, nationId: string, cityId: string): Promise<CityTreatyReturn | null> {
  const row = await db.prepare(returnSql).bind(...captureCityKeys(nationId, cityId)).first<{ returned_to: string; returned_at: number }>().catch(tolerate(isMissingRelation, null));
  if (!row || row.returned_to == null) return null;
  const returnedAt = Number(row.returned_at);
  if (!Number.isSafeInteger(returnedAt)) return null;
  return { returnedTo: String(row.returned_to), returnedAt };
}
