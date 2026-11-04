/** #1070: foundation truce (docs §15.4 "newly founded cities have a 10-real-day foundation truce"). For FOUNDATION_TRUCE_DAYS real days after
 *  `world_cities.founded_at` (unix seconds), no square of that city's radius-`claimRadius` claim block can be moved by war: a battle transfer drops those
 *  squares and a siege assault on the city is refused. The truce ends on its own at founded_at + 10 days exactly (that second is outside it). Seed capitals
 *  and border outposts have no world_cities row, so they are never covered. No flag of its own: it rides the existing war flags (issue scope). Integer math only. */
import type { GameDatabase } from './database-contract';
import { claimRadius } from './city-founding';
import { isMissingRelation, tolerate } from './db-errors';
import { FOUNDATION_TRUCE_DAYS, foundationTruce } from './war-protections-copy';

export const FOUNDATION_TRUCE_SECONDS = FOUNDATION_TRUCE_DAYS * 86400;
/** True while `now` is before founded_at + 10 real days. */
export const inFoundationTruce = (foundedAt: number, now: number) => Math.floor(now) < Math.floor(foundedAt) + FOUNDATION_TRUCE_SECONDS;
export type TruceCity = { id: string; name: string; x: number; y: number; endsAt: number };
export const truceText = (city: { name: string }) => foundationTruce.notice.text.replace('{city}', city.name);

/** Founded cities still under truce at `now` near `squares` (bounding box widened by the claim radius); `underTruce` decides each square. */
export async function truceCitiesFor(db: GameDatabase, squares: readonly { x: number; y: number }[], now: number): Promise<TruceCity[]> {
  if (!squares.length) return [];
  const xs = squares.map(s => s.x), ys = squares.map(s => s.y), r = claimRadius;
  const rows = (await db.prepare('SELECT id,name,center_x,center_y,founded_at FROM world_cities WHERE center_x BETWEEN ? AND ? AND center_y BETWEEN ? AND ? AND founded_at>?')
    .bind(Math.min(...xs) - r, Math.max(...xs) + r, Math.min(...ys) - r, Math.max(...ys) + r, Math.floor(now) - FOUNDATION_TRUCE_SECONDS)
    .all<{ id: string; name: string; center_x: number; center_y: number; founded_at: number }>().catch(tolerate(isMissingRelation, { results: [] as never[] }))).results;
  return rows.filter(c => inFoundationTruce(Number(c.founded_at), now))
    .map(c => ({ id: c.id, name: c.name, x: Number(c.center_x), y: Number(c.center_y), endsAt: Number(c.founded_at) + FOUNDATION_TRUCE_SECONDS }));
}
/** True when the square sits in the claim block of one of `cities`. */
export const underTruce = (sq: { x: number; y: number }, cities: readonly TruceCity[]) => cities.some(c => Math.max(Math.abs(sq.x - c.x), Math.abs(sq.y - c.y)) <= claimRadius);
