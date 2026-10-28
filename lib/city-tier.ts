/** #952 / #966: city tier growth and shrink (docs Cities of Harimu). Population and housing are humans whose
 *  home city is the city (`citizen_city_locations.home_city_id` = `world_cities.id`). No AI resident rows are
 *  stored, so AI adds nothing. A city promotes one tier after staying at or above the next tier's floor for
 *  7 real days. It drops one tier after food or housing stays under the current tier's need for 7 real days,
 *  never below T1, and a capital never below its starting tier. Flag HARIMU_CITY_TIER_GROWTH_ENABLED off:
 *  this module is not called, and readers still report tier 1. */
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

/** #979: docs Cities tier table (district slots + unlocks). Read-only lookup; does not gate jobs or markets. T4 uses 8 (doc "8+"). */
export type CityTierUnlocks = { name: CityTierName; districtSlots: number; unlocks: readonly string[] };
const unlockTable: Record<CityTier, CityTierUnlocks> = {
  1: { name: 'Village', districtSlots: 2, unlocks: ['Basic jobs', 'a market stall', 'a small square'] },
  2: { name: 'Town', districtSlots: 4, unlocks: ['Full market', 'festivals', 'a local governor'] },
  3: { name: 'City', districtSlots: 6, unlocks: ['Specialist buildings', 'a port or industry complex'] },
  4: { name: 'Metropolis', districtSlots: 8, unlocks: ['Capital-class landmarks', 'national institutions'] },
};
export function cityTierUnlocks(tier: number): CityTierUnlocks {
  const t = Math.min(4, Math.max(1, Math.floor(Number.isFinite(tier) ? tier : 1))) as CityTier;
  return unlockTable[t];
}
/** Fields the city APIs add when HARIMU_CITY_TIER_UNLOCKS_ENABLED is on. Districts are not built yet, so only M (districtSlots) is returned. */
export function cityTierUnlockFields(tier: number): { tierName: CityTierName; districtSlots: number; unlocks: string[] } {
  const info = cityTierUnlocks(tier);
  return { tierName: info.name, districtSlots: info.districtSlots, unlocks: [...info.unlocks] };
}
/** Population floor of the next tier, or null at T4. */
export function nextTierFloor(tier: number): number | null {
  if (!Number.isInteger(tier) || tier < 1 || tier >= 4) return null;
  return floors[tier - 1];
}
/** [ASSUMPTION] Docs give no food or housing figures. The current tier needs the count it was entered at:
 *  T1 0, T2 500, T3 2000, T4 8000. Food and housing each have to meet that count. */
export function tierStayFloor(tier: number): number {
  if (!Number.isInteger(tier) || tier <= 1) return 0;
  return floors[Math.min(tier, 4) - 2] ?? 0;
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

export type CityShrinkClock = { tier: number; belowSince: number | null };
/** One check. Food and housing both at the current tier's need clears the clock. Short of either for 7 real days
 *  drops exactly one tier, never below `floor` (T1, or a capital's starting tier). Same `now` twice does not drop twice. */
export function cityTierShrinkStep(input: CityShrinkClock & { food: number; housing: number; floor: number; now: number }): CityShrinkClock {
  const floor = Math.min(4, Math.max(1, Number.isInteger(input.floor) ? input.floor : 1));
  const food = Number.isFinite(input.food) ? input.food : 0;
  const housing = Number.isFinite(input.housing) ? input.housing : 0;
  if (food >= tierStayFloor(input.tier) && housing >= tierStayFloor(input.tier)) return { tier: input.tier, belowSince: null };
  if (input.tier <= floor) return { tier: input.tier, belowSince: input.belowSince };
  const since = input.belowSince ?? input.now;
  if (input.now - since < CITY_TIER_HOLD_SECONDS) return { tier: input.tier, belowSince: since };
  const tier = input.tier - 1;
  const still = food < tierStayFloor(tier) || housing < tierStayFloor(tier);
  return { tier, belowSince: tier > floor && still ? input.now : null };
}

type CityRow = { id: string; nation_id: string; name: string; tier: number; floor: number | null; since: number | null; below: number | null; population: number; food: number | null; feature: string | null };
// [ASSUMPTION] Food stock is the sum of resident `citizen_inventory_balances` food (the only city-scoped stock;
// merchant, Korund and Aurelle food are nation pools). Housing is that same resident count: each home-city row
// is one dwelling, and no housing table is stored. A capital is the row whose center square feature is 'capital';
// its starting tier is tier_floor (default 1). Founded cities are not capitals.
const populationSql = `SELECT c.id, c.nation_id, c.name, c.tier, c.tier_floor AS floor, c.above_next_tier_since AS since, c.below_need_since AS below,
 (SELECT COUNT(*) FROM citizens p JOIN citizen_city_locations l ON l.user_id=p.clerk_user_id WHERE l.home_city_id=c.id) AS population,
 (SELECT COALESCE(SUM(b.quantity),0) FROM citizen_inventory_balances b JOIN citizen_city_locations l ON l.user_id=b.clerk_user_id WHERE l.home_city_id=c.id AND b.item='food') AS food,
 (SELECT s.feature FROM world_squares s WHERE s.x=c.center_x AND s.y=c.center_y) AS feature
 FROM world_cities c`;

const num = (value: number | null) => value == null ? null : Number(value);

function cityUpdate(db: GameDatabase, id: string, prev: { tier: number; since: number | null; below: number | null }, next: { tier: number; aboveSince: number | null; belowSince: number | null }) {
  const setAbove = next.aboveSince == null ? 'above_next_tier_since=NULL' : 'above_next_tier_since=?';
  const setBelow = next.belowSince == null ? 'below_need_since=NULL' : 'below_need_since=?';
  const whereAbove = prev.since == null ? 'above_next_tier_since IS NULL' : 'above_next_tier_since=?';
  const whereBelow = prev.below == null ? 'below_need_since IS NULL' : 'below_need_since=?';
  const binds: unknown[] = [next.tier];
  if (next.aboveSince != null) binds.push(next.aboveSince);
  if (next.belowSince != null) binds.push(next.belowSince);
  binds.push(id, prev.tier);
  if (prev.since != null) binds.push(prev.since);
  if (prev.below != null) binds.push(prev.below);
  return db.prepare(`UPDATE world_cities SET tier=?, ${setAbove}, ${setBelow} WHERE id=? AND tier=? AND ${whereAbove} AND ${whereBelow}`).bind(...binds);
}

/** Daily check. `enabled` must be exactly true (HARIMU_CITY_TIER_GROWTH_ENABLED). Flag off: no read and no write.
 *  Shortage blocks promotion. A drop clears the growth clock. One tier per hold; the same `now` does not move twice. */
export async function runCityTierGrowth(db: GameDatabase, now: number, enabled: boolean): Promise<{ promoted: string[]; shrunk: string[] }> {
  if (enabled !== true) return { promoted: [], shrunk: [] };
  const { results } = await db.prepare(populationSql).all<CityRow>();
  const writes = [];
  const promoted: string[] = [];
  const shrunk: string[] = [];
  for (const row of results ?? []) {
    const tier = Number(row.tier);
    const since = num(row.since);
    const below = num(row.below);
    const population = Number(row.population);
    const food = Number(row.food ?? 0);
    const housing = population; // [ASSUMPTION] housing stock is the home-city resident count
    const storedFloor = Number(row.floor);
    const floor = row.feature === 'capital' ? Math.min(4, Math.max(1, Number.isFinite(storedFloor) ? Math.floor(storedFloor) : 1)) : 1;
    const short = food < tierStayFloor(tier) || housing < tierStayFloor(tier);
    let nextTier = tier;
    let aboveSince = since;
    let belowSince = below;
    if (short && tier > floor) {
      const step = cityTierShrinkStep({ tier, food, housing, belowSince: below, floor, now });
      nextTier = step.tier;
      belowSince = step.belowSince;
      if (step.tier !== tier) aboveSince = null;
    } else {
      if (!short) belowSince = null;
      const step = cityTierStep({ tier, population, aboveSince: since, now });
      nextTier = step.tier;
      aboveSince = step.aboveSince;
    }
    if (nextTier === tier && aboveSince === since && belowSince === below) continue;
    if (nextTier > tier) promoted.push(row.id);
    if (nextTier < tier) shrunk.push(row.id);
    writes.push(cityUpdate(db, row.id, { tier, since, below }, { tier: nextTier, aboveSince, belowSince }));
    if (nextTier < tier && (row.nation_id === 'kindle' || row.nation_id === 'korund' || row.nation_id === 'aurelle')) {
      const kind = `city-tier-${row.nation_id}`;
      const why = food < tierStayFloor(tier) && housing < tierStayFloor(tier) ? 'food and housing' : food < tierStayFloor(tier) ? 'food' : 'housing';
      const headline = `${row.name} shrinks to a ${cityTierName(nextTier)}`;
      const detail = `${row.name} was a ${cityTierName(tier)} for 7 real days short of ${why}.`;
      const occurred = new Date(now * 1000).toISOString();
      // The tier update above has to have landed, and this city/window is written once.
      writes.push(db.prepare(`INSERT INTO world_events (kind, headline, detail, location, occurred_at, sort_order)
        SELECT ?,?,?,?,?,? WHERE (SELECT tier FROM world_cities WHERE id=?)=?
        AND NOT EXISTS (SELECT 1 FROM world_events WHERE kind=? AND location=? AND occurred_at=?)`)
        .bind(kind, headline, detail, row.name, occurred, -now, row.id, nextTier, kind, row.name, occurred));
    }
  }
  if (writes.length) await db.batch(writes);
  return { promoted, shrunk };
}
