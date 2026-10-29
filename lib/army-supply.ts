/** #738 slice 5: supply lines and depots (docs §15.3 Logistics: "Units need supply lines from depots; cut supply lines reduce strength each game day").
 *  Derived on read from the slice-4 march (no table, no writes). Behind HARIMU_ARMY_SUPPLY_ENABLED (needs HARIMU_ARMY_MAP_ENABLED and its flags). */
import { armyMapEnabled, moveSeconds, terrainMap, unitMarch, type ArmyPosition, type ArmyWar } from './army-map';
import { flagOn } from './flag-pack.mjs';
import { marchTimeFactor, type MarchPace } from './winter-march'; // #1038: the same locked march clock, not a new supply rule

export const armySupplyEnabled = (env: unknown) => armyMapEnabled(env) && flagOn(env, 'HARIMU_ARMY_SUPPLY_ENABLED');
/** [ASSUMPTION] Tuning values (the docs give none). Each nation's depot is its capital; a supply line reaches this many squares (Chebyshev) from it. */
export const ARMY_SUPPLY_RANGE_SQUARES = 5;
/** [ASSUMPTION] While the line is cut a unit loses this share of its strength per full game day, up to the cap. */
export const ARMY_SUPPLY_LOSS_PCT_PER_DAY = 10;
export const ARMY_SUPPLY_LOSS_CAP_PCT = 50;
export const ARMY_SUPPLY_GAME_DAY_SECONDS = 7200; // 12x clock: a game day is 2 real hours (same as ARMY_GAME_DAY_SECONDS)
export const PERCENT = 100;

type Point = { x: number; y: number };
const cheb = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
/** When the unit entered the first square beyond the depot's range on `route` (it sets out at `startAt`), or null if the route never leaves it. */
export function supplyCutAt(depot: Point, route: readonly Point[], startAt: number, terrainAt: (p: Point) => string | undefined, factor = 1, extra = 0): number | null {
  let spent = 0; const range = ARMY_SUPPLY_RANGE_SQUARES + extra;
  for (const step of route) { spent += moveSeconds(terrainAt(step)) * factor; if (cheb(depot, step) > range) return startAt + spent; }
  return null;
}
export type SupplyState = { cut: boolean; cutDays: number; strengthLossPct: number };
export function supplyState(cutAt: number | null, now: number): SupplyState {
  if (cutAt === null || now < cutAt) return { cut: false, cutDays: 0, strengthLossPct: 0 };
  const cutDays = Math.floor((now - cutAt) / ARMY_SUPPLY_GAME_DAY_SECONDS);
  return { cut: true, cutDays, strengthLossPct: Math.min(ARMY_SUPPLY_LOSS_CAP_PCT, cutDays * ARMY_SUPPLY_LOSS_PCT_PER_DAY) };
}
export const applySupplyLoss = (strength: number, lossPct: number) => Math.max(0, Math.floor(strength * (PERCENT - lossPct) / PERCENT));
/** A nation's unit supply at `now`: home or within range is supplied; when the war ends the unit is home and supplied again. */
export function unitSupply(nationId: string, wars: readonly ArmyWar[], now: number, terrain: ReadonlyMap<string, string> = terrainMap(), pace: MarchPace | null = null, extra = 0): SupplyState {
  const march = unitMarch(nationId, wars, now);
  const factor = march && pace ? marchTimeFactor(pace.epochSeconds, march.war.mobilization_ends_at, true) : 1;
  return supplyState(march ? supplyCutAt(march.home, march.route, march.war.mobilization_ends_at, s => terrain.get(`${s.x},${s.y}`), factor, extra) : null, now);
}
export const withSupply = (units: readonly ArmyPosition[], wars: readonly ArmyWar[], now: number, pace: MarchPace | null = null, extraFor: (nationId: string) => number = () => 0) => units.map(u => ({ ...u, supply: unitSupply(u.nationId, wars, now, undefined, pace, extraFor(u.nationId)) }));
