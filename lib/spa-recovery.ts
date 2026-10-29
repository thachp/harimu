/** #798: spa-home Work Capacity recovery. Docs name a small bonus and no number. One recovery step already
 *  refills to the maximum, so a +1 WC grant cannot show. ARC option A: a shorter interval, no migration.
 *  [ASSUMPTION] 23/24 of the normal interval — one WC of a 24-WC day, sooner, never under the 60s floor. */
import type { GameDatabase } from './database-contract.ts';
import { cityForNation } from './cities.ts';
import { flagOn } from './flag-pack.mjs';

export const spaWcNote = 'Spa city: you recover a little extra Work Capacity here.';
export const spaWcBonusEnabled = (env: unknown) => flagOn(env, 'HARIMU_SPA_WC_BONUS_ENABLED');

export function spaRecoveryInterval(base: number): number {
  const shorter = Math.floor(base * 23 / 24);
  return shorter >= 60 && shorter < base ? shorter : base;
}

/** Flag off, or a home that is not a spa city: `base`. Visitors and the current city do not count. */
export async function recoveryIntervalForHome(db: GameDatabase, userId: string, base: number, enabled: boolean): Promise<number> {
  if (!enabled) return base;
  const row = await db.prepare(`SELECT c.nation_id AS nation_id, l.home_city_id AS home_city_id FROM citizens c
    LEFT JOIN citizen_city_locations l ON l.user_id=c.clerk_user_id AND l.nation_id=c.nation_id WHERE c.clerk_user_id=?`)
    .bind(userId).first<{ nation_id: string | null; home_city_id: string | null }>();
  if (!row?.nation_id || !row.home_city_id) return base;
  return cityForNation(row.nation_id, row.home_city_id)?.spa ? spaRecoveryInterval(base) : base;
}
