/** #1028: latest capture for the city panel, read from city_captures (via city_sieges.city_key). Display only. */
import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { outpostNationForCity } from './cities';

export type CityCaptureHistory = { heldBy: string; capturedFrom: string; capturedAt: number };

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
