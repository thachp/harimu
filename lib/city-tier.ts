/** #952: city tier growth (docs Cities of Harimu). Population is humans whose home city is the city
 *  (`citizen_city_locations.home_city_id` = `world_cities.id`). No AI resident rows are stored (the co-resident
 *  AI list is a display sample), so AI adds nothing. A city promotes one tier after staying at or above the next
 *  tier's floor for 7 real days. Flag off: this module is not called, and readers still report tier 1. */
import type { GameDatabase } from './database-contract';

export const CITY_TIER_HOLD_SECONDS = 7 * 86400;
const floors = [500, 2000, 8000] as const; // population to enter T2, T3, T4
const names = ['Village', 'Town', 'City', 'Metropolis'] as const;
export type CityTier = 1 | 2 | 3 | 4;
export type CityTierName = (typeof names)[number];

/** Tier the population qualifies for. 499 Village, 500 Town, 1999 Town, 2000 City, 7999 City, 8000 Metropolis. */
export function cityTierFor(population: number): CityTier {
  const n = Number.isFinite(population) ? Math.floor(population) : 0;
  if (n >= 8000) return 4;
  if (n >= 2000) return 3;
  if (n >= 500) return 2;
  return 1;
}
export function cityTierName(tier: number): CityTierName {
  const i = Math.min(4, Math.max(1, Math.floor(Number.isFinite(tier) ? tier : 1))) - 1;
  return names[i];
}
/** Population floor of the next tier, or null at T4. */
export function nextTierFloor(tier: number): number | null {
  if (!Number.isInteger(tier) || tier < 1 || tier >= 4) return null;
  return floors[tier - 1];
}

export type CityTierClock = { tier: number; aboveSince: number | null };
/** One check. Below the next floor clears the clock. Holding the floor for 7 real days promotes exactly one tier
 *  and starts a fresh clock only if the population already meets the new floor. Same `now` twice does not promote twice. */
export function cityTierStep(input: CityTierClock & { population: number; now: number }): CityTierClock {
  const floor = nextTierFloor(input.tier);
  if (floor == null || input.population < floor) return { tier: input.tier, aboveSince: null };
  const since = input.aboveSince ?? input.now;
  if (input.now - since < CITY_TIER_HOLD_SECONDS) return { tier: input.tier, aboveSince: since };
  const tier = input.tier + 1;
  const next = nextTierFloor(tier);
  return { tier, aboveSince: next != null && input.population >= next ? input.now : null };
}

type CityRow = { id: string; tier: number; since: number | null; population: number };
const populationSql = `SELECT c.id, c.tier, c.above_next_tier_since AS since,
 (SELECT COUNT(*) FROM citizens p JOIN citizen_city_locations l ON l.user_id=p.clerk_user_id WHERE l.home_city_id=c.id) AS population
 FROM world_cities c`;

/** Daily check. `enabled` must be exactly true (HARIMU_CITY_TIER_GROWTH_ENABLED). Flag off: no read and no write. */
export async function runCityTierGrowth(db: GameDatabase, now: number, enabled: boolean): Promise<{ promoted: string[] }> {
  if (enabled !== true) return { promoted: [] };
  const { results } = await db.prepare(populationSql).all<CityRow>();
  const writes = [];
  const promoted: string[] = [];
  for (const row of results ?? []) {
    const tier = Number(row.tier);
    const since = row.since == null ? null : Number(row.since);
    const next = cityTierStep({ tier, population: Number(row.population), aboveSince: since, now });
    if (next.tier === tier && next.aboveSince === since) continue;
    if (next.tier !== tier) promoted.push(row.id);
    // Null is written as SQL NULL. A bound NULL has no type on Postgres (42P18).
    const setSince = next.aboveSince == null ? 'above_next_tier_since=NULL' : 'above_next_tier_since=?';
    const whereSince = since == null ? 'above_next_tier_since IS NULL' : 'above_next_tier_since=?';
    const binds: unknown[] = [next.tier];
    if (next.aboveSince != null) binds.push(next.aboveSince);
    binds.push(row.id, tier);
    if (since != null) binds.push(since);
    writes.push(db.prepare(`UPDATE world_cities SET tier=?, ${setSince} WHERE id=? AND tier=? AND ${whereSince}`).bind(...binds));
  }
  if (writes.length) await db.batch(writes);
  return { promoted };
}
