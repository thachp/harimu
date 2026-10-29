/** #738 slice 4: army units on the map (docs §15.3 Armies: "AI officers command stacks on the tile map"; movement 1 square per 20–60 real minutes
 *  by terrain). Positions are derived on read from the war table and the deterministic terrain seed: no table, no writes. Behind
 *  HARIMU_ARMY_MAP_ENABLED (needs HARIMU_ARMIES_ENABLED and HARIMU_WAR_ENABLED). */
import type { GameDatabase } from './database-contract';
import { armiesEnabled, armyUnits } from './army-rules';
import { flagOn } from './flag-pack.mjs';
import { mappedNations, seedWorldSquares } from './map-zones';
import { WORLD_GRID } from './globe-mapping';
import { marchTimeFactor, winterMarchTime, type MarchPace } from './winter-march'; // #1038

export const armyMapEnabled = (env: unknown) => armiesEnabled(env) && flagOn(env, 'HARIMU_ARMY_MAP_ENABLED');
/** [ASSUMPTION] Seconds to enter one square, by terrain, inside the docs' 20–60 real minutes. Tuning values; named so they can move. */
export const ARMY_MOVE_SECONDS_FAST = 20 * 60;   // plains, city
export const ARMY_MOVE_SECONDS_MEDIUM = 30 * 60; // river edge
export const ARMY_MOVE_SECONDS_SLOW = 40 * 60;   // forest, wetland and any terrain not listed
export const ARMY_MOVE_SECONDS_ROUGH = 60 * 60;  // hills, old-growth forest, mountains
export const armyMoveSeconds: Readonly<Record<string, number>> = {
  plains: ARMY_MOVE_SECONDS_FAST, city: ARMY_MOVE_SECONDS_FAST, 'river edge': ARMY_MOVE_SECONDS_MEDIUM, forest: ARMY_MOVE_SECONDS_SLOW, wetland: ARMY_MOVE_SECONDS_SLOW,
  hills: ARMY_MOVE_SECONDS_ROUGH, 'old-growth forest': ARMY_MOVE_SECONDS_ROUGH, mountains: ARMY_MOVE_SECONDS_ROUGH,
};
export const moveSeconds = (terrain: string | undefined) => armyMoveSeconds[terrain ?? ''] ?? ARMY_MOVE_SECONDS_SLOW;
/** [ASSUMPTION] A marching unit stops this many squares short of the enemy capital (staging for a siege; battles are a later slice). */
export const ARMY_STAGING_DISTANCE = 1;

/** ARC-approved route rule (#891): a straight Chebyshev line, diagonal steps first, one square per step, no pathfinding or blocked squares. */
export const ARMY_ROUTE_RULE = 'straight-chebyshev-diagonal-first' as const;
export const ARMY_ROUTE_STEP_SQUARES = 1;
type Point = { x: number; y: number };
/** The straight route from `from` toward `to` (diagonal steps first, Chebyshev), stopping `stop` squares short. Excludes `from`. */
export function marchRoute(from: Point, to: Point, stop = ARMY_STAGING_DISTANCE): Point[] {
  const route: Point[] = []; let { x, y } = from;
  while (Math.max(Math.abs(to.x - x), Math.abs(to.y - y)) > stop) { x += ARMY_ROUTE_STEP_SQUARES * Math.sign(to.x - x); y += ARMY_ROUTE_STEP_SQUARES * Math.sign(to.y - y); route.push({ x, y }); }
  return route;
}
/** Where a unit is `elapsed` seconds after it set out on `route`, paying each square's terrain cost on entry.
 *  `factor` is 1, or the winter multiplier locked at march start (#1038). */
export function positionAfter(from: Point, route: readonly Point[], elapsed: number, terrainAt: (p: Point) => string | undefined, factor = 1) {
  let at = from, spent = 0;
  for (const step of route) { spent += moveSeconds(terrainAt(step)) * factor; if (spent > elapsed) return { ...at, arrived: false }; at = step; }
  return { ...at, arrived: true };
}

export type ArmyWar = { id?: string; attacker_nation: string; defender_nation: string; mobilization_ends_at: number; declared_at: number };
export type ArmyPosition = { unitId: string; nationId: string; name: string; x: number; y: number; status: 'home' | 'marching' | 'staged'; towardNationId: string | null; supply?: { cut: boolean; cutDays: number; strengthLossPct: number } };
/** Pure. AI officer orders, derived [ASSUMPTION]: a unit whose nation attacks in an active war marches from its capital toward the defender's capital once
 *  mobilization ends (the earliest-declared such war); every other unit holds at its own capital. When the war ends the unit is home again. */
export const nationCapital = (id: string) => mappedNations.find(n => n.id === id)?.capital ?? null;
/** The march a nation's unit is on at `now` (slice 4 orders), or null while it holds at home. #738 slice 5 reuses it for supply. */
export function unitMarch(nationId: string, wars: readonly ArmyWar[], now: number) {
  const home = nationCapital(nationId), war = [...wars].filter(w => w.attacker_nation === nationId && w.mobilization_ends_at <= now).sort((a, b) => a.declared_at - b.declared_at)[0];
  const target = war ? nationCapital(war.defender_nation) : null;
  return home && war && target ? { home, war, route: marchRoute(home, target) } : null;
}
/** #738 battles: when a march reaches its staging square (the end of the route), paying each square's terrain cost. `factor` is locked at march start. */
export const marchArrivalAt = (march: { war: ArmyWar; route: readonly Point[] }, terrain: ReadonlyMap<string, string> = terrainMap(), factor = 1) =>
  march.war.mobilization_ends_at + march.route.reduce((sum, s) => sum + moveSeconds(terrain.get(`${s.x},${s.y}`)) * factor, 0);
const marchFactor = (pace: MarchPace | null, startAt: number) => pace ? marchTimeFactor(pace.epochSeconds, startAt, true) : 1;
export function armyPositions(wars: readonly ArmyWar[], now: number, terrain: ReadonlyMap<string, string> = terrainMap(), pace: MarchPace | null = null): ArmyPosition[] {
  return armyUnits.flatMap((unit): ArmyPosition[] => {
    const home = nationCapital(unit.nationId); if (!home) return [];
    const march = unitMarch(unit.nationId, wars, now), war = march?.war;
    if (!march || !war) return [{ unitId: unit.id, nationId: unit.nationId, name: unit.name, ...home, status: 'home' as const, towardNationId: null }];
    const p = positionAfter(home, march.route, now - war.mobilization_ends_at, s => terrain.get(`${s.x},${s.y}`), marchFactor(pace, war.mobilization_ends_at));
    return [{ unitId: unit.id, nationId: unit.nationId, name: unit.name, x: p.x, y: p.y, status: p.arrived ? 'staged' as const : 'marching' as const, towardNationId: war.defender_nation }];
  });
}
/** #1038: the card line for a march that started in winter and has not arrived. Null when the flag's pace is off, the season was not winter, or the unit is home or staged. */
export function winterRoadNote(nationId: string, wars: readonly ArmyWar[], now: number, pace: MarchPace | null): { arrivesAt: number; time: string } | null {
  if (!pace) return null;
  const march = unitMarch(nationId, wars, now); if (!march) return null;
  const factor = marchFactor(pace, march.war.mobilization_ends_at); if (factor === 1) return null;
  const arrivesAt = marchArrivalAt(march, terrainMap(), factor);
  return now < arrivesAt ? { arrivesAt, time: winterMarchTime(arrivesAt - now) } : null;
}
/** Epoch for the winter factor. Flag off: no read. No clock row: no slowdown. */
export async function marchPace(db: GameDatabase, enabled: boolean): Promise<MarchPace | null> {
  if (!enabled) return null;
  const clock = await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{ epoch_seconds: number }>();
  return clock && Number.isFinite(Number(clock.epoch_seconds)) ? { epochSeconds: Number(clock.epoch_seconds), enabled: true } : null;
}
let cached: Map<string, string> | null = null;
export const terrainMap = () => cached ??= new Map(seedWorldSquares(mappedNations).map(s => [`${s.x},${s.y}`, s.terrain]));

/** One read: the active wars. GET only; it never writes. */
export async function readActiveWars(db: GameDatabase): Promise<ArmyWar[]> {
  const wars = (await db.prepare('SELECT id, attacker_nation, defender_nation, mobilization_ends_at, declared_at FROM wars WHERE ended_at IS NULL').all<ArmyWar>()).results ?? [];
  return wars.map(w => ({ ...w, mobilization_ends_at: Number(w.mobilization_ends_at), declared_at: Number(w.declared_at) }));
}
export async function readArmyPositions(db: GameDatabase, now: number, wars?: readonly ArmyWar[], pace: MarchPace | null = null) {
  return { width: WORLD_GRID.width, height: WORLD_GRID.height, units: armyPositions(wars ?? await readActiveWars(db), now, terrainMap(), pace) };
}
