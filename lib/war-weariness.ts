import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { BATTLE_ROUND_SECONDS } from './army-battle.ts';
import { unitById } from './army-rules.ts';
import { WEARINESS_WEEK_SECONDS, warNations, warWearinessUnrest, warWeeksAtWar, wearinessLevel, type WarNationId, type WearinessLevelId } from './war-rules';

/** #423: war weariness behind HARIMU_WAR_ENABLED and HARIMU_WAR_WEARINESS_ENABLED (both default "false"). Docs 15.3. Rules and numbers: lib/war-rules.ts.
 *  Nothing is stored for it: the Unrest a war has added is a pure function of the `wars` table and the time, so reads never write, a replayed tick gives the same
 *  answer, and the amount only steps up at each game-week boundary. The daily score (lib/stability.ts, written by the world tick) records it with the rest of Unrest. */
export type WearinessBindings = { HARIMU_WAR_ENABLED?: string; HARIMU_WAR_WEARINESS_ENABLED?: string; HARIMU_WAR_WEARINESS_LOSSES_ENABLED?: string };
/** Both flags must be on; either off means no scoring term, no state and no UI. */
export const wearinessEnabled = (bindings: WearinessBindings) => bindings.HARIMU_WAR_ENABLED === 'true' && bindings.HARIMU_WAR_WEARINESS_ENABLED === 'true';
/** #495: lost frontier squares feed the weariness add-on only with a third flag, HARIMU_WAR_WEARINESS_LOSSES_ENABLED (default "false"), on top of both above. */
export const wearinessLossesEnabled = (bindings: WearinessBindings) => wearinessEnabled(bindings) && bindings.HARIMU_WAR_WEARINESS_LOSSES_ENABLED === 'true';
export type WearinessOptions = { losses?: boolean };

type Row = { id: string; attacker_nation: WarNationId; defender_nation: WarNationId; mobilization_ends_at: number; ended_at: number | null };
/** Unrest added per nation as of `asOf` (epoch seconds), summed over every war the nation is in that is active at that time.
 *  #495: with `losses` on, the frontier squares a nation lost to city captures in those wars during the rolling week before `asOf` (captured_at in (asOf-WEARINESS_WEEK_SECONDS, asOf], docs 15.3
 *  "that week", ARC ruling on #495) feed the capped add-on, netted against the squares the same nation truly recaptured in those wars in the same window, floored at 0.
 *  A recapture is a square moved to the nation (`city_capture_squares.to_nation`) that an earlier capture had taken from it (`from_nation`); taking an enemy's own square does not net.
 *  Squares a holder privately kept are not lost (`squares_kept_private` is not counted).
 *  #1481: with the same `losses` switch, each `army_wounds` row whose battle belongs to those wars and ended in the same window (`started_at + rounds * BATTLE_ROUND_SECONDS` in (asOf-WEARINESS_WEEK_SECONDS, asOf], mirroring the #664 "that week" ruling) is one casualty, charged to the destroyed unit's nation (the `retreated` side). The winning side is not charged. A database without army_battles or army_wounds reads as zero casualties.
 *  Public copy stays a level word; it never names a casualty count. Read-only SELECTs; a database without the wars or capture table reads as none. */
export async function readWarWeariness(db: GameDatabase, asOf: number, options: WearinessOptions = {}): Promise<Record<WarNationId, number>> {
  const out = Object.fromEntries(warNations.map(nation => [nation, 0])) as Record<WarNationId, number>;
  const rows = await db.prepare('SELECT id,attacker_nation,defender_nation,mobilization_ends_at,ended_at FROM wars WHERE mobilization_ends_at<=? AND (ended_at IS NULL OR ended_at>?)')
    .bind(asOf, asOf).all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }));
  const weeks = Object.fromEntries(warNations.map(nation => [nation, 0])) as Record<WarNationId, number>;
  for (const row of rows.results) {
    const w = warWeeksAtWar({ mobilizationEndsAt: Number(row.mobilization_ends_at), endedAt: row.ended_at === null ? null : Number(row.ended_at) }, asOf);
    if (warNations.includes(row.attacker_nation)) weeks[row.attacker_nation] += w;
    if (warNations.includes(row.defender_nation)) weeks[row.defender_nation] += w;
  }
  const lost = Object.fromEntries(warNations.map(nation => [nation, 0])) as Record<WarNationId, number>;
  const casualties = Object.fromEntries(warNations.map(nation => [nation, 0])) as Record<WarNationId, number>;
  if (options.losses && rows.results.length > 0) {
    const marks = rows.results.map(() => '?').join(',');
    type Sum = { nation: string; squares: number | string | null };
    const none = tolerate(isMissingRelation, { results: [] as Sum[] }), ids = rows.results.map(row => row.id), from = asOf - WEARINESS_WEEK_SECONDS;
    const window = `FROM city_captures WHERE captured_at>? AND captured_at<=? AND war_id IN (${marks})`;
    const losses = await db.prepare(`SELECT defender_nation AS nation,SUM(squares_transferred) AS squares ${window} GROUP BY defender_nation`).bind(from, asOf, ...ids).all<Sum>().catch(none);
    // A true recapture: a square moved to the nation in this window that an earlier capture (any war, at or before it) had taken from that same nation (city_capture_squares.from_nation).
    const gains = await db.prepare(`SELECT s.to_nation AS nation,COUNT(*) AS squares FROM city_capture_squares s JOIN city_captures c ON c.id=s.capture_id WHERE c.captured_at>? AND c.captured_at<=? AND c.war_id IN (${marks})
      AND EXISTS (SELECT 1 FROM city_capture_squares ps JOIN city_captures pc ON pc.id=ps.capture_id WHERE ps.x=s.x AND ps.y=s.y AND ps.from_nation=s.to_nation AND pc.id<>c.id AND pc.captured_at<=c.captured_at) GROUP BY s.to_nation`)
      .bind(from, asOf, ...ids).all<Sum>().catch(none);
    const add = (list: Sum[], sign: number) => { for (const row of list) if ((warNations as readonly string[]).includes(row.nation)) lost[row.nation as WarNationId] += sign * Number(row.squares ?? 0); };
    add(losses.results, 1); add(gains.results, -1);
    for (const nation of warNations) lost[nation] = Math.max(0, lost[nation]);
    type Wound = { retreated: string; attacker_unit: string; defender_unit: string; n: number | string | null };
    const woundNone = tolerate(isMissingRelation, { results: [] as Wound[] });
    const woundRows = await db.prepare(`SELECT b.retreated, b.attacker_unit, b.defender_unit, COUNT(*) AS n FROM army_wounds w JOIN army_battles b ON b.battle_key=w.battle_key
      WHERE b.started_at+b.rounds*? > ? AND b.started_at+b.rounds*? <= ? AND b.war_id IN (${marks}) AND b.retreated IN ('attacker','defender') GROUP BY b.retreated, b.attacker_unit, b.defender_unit`)
      .bind(BATTLE_ROUND_SECONDS, from, BATTLE_ROUND_SECONDS, asOf, ...ids).all<Wound>().catch(woundNone);
    for (const row of woundRows.results) {
      const unitId = row.retreated === 'attacker' ? row.attacker_unit : row.retreated === 'defender' ? row.defender_unit : null;
      const nation = unitId ? unitById(unitId)?.nationId : undefined;
      if (nation && (warNations as readonly string[]).includes(nation)) casualties[nation as WarNationId] += Number(row.n ?? 0);
    }
  }
  for (const nation of warNations) out[nation] = warWearinessUnrest(nation, weeks[nation], { lostSquares: lost[nation], casualties: casualties[nation] });
  return out;
}
/** #427 slice 3: Kindle's weariness points for the Assembly's war and ending votes, read at decision time. Zero unless the weariness flag is on (then the vote is unchanged). */
export type VoteWearinessOptions = { enabled?: boolean; losses?: boolean };
export async function kindleVoteWeariness(db: GameDatabase, now: number, options: VoteWearinessOptions = {}): Promise<number> {
  return options.enabled ? (await readWarWeariness(db, now, { losses: options.losses === true })).kindle : 0;
}
/** What citizens may see: a level name per nation at war with weariness (never the amount, so Korund's true Unrest cannot be read off it). */
export type PublicWeariness = Partial<Record<WarNationId, WearinessLevelId>>;
export async function readPublicWeariness(db: GameDatabase, asOf: number, options: WearinessOptions = {}): Promise<PublicWeariness> {
  const points = await readWarWeariness(db, asOf, options);
  const out: PublicWeariness = {};
  for (const nation of warNations) { const level = wearinessLevel(points[nation]); if (level) out[nation] = level; }
  return out;
}
