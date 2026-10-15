/** #442: Kindle canvassing PoC (docs §9.4, Ground game row: human volunteers complete canvassing quests that raise a candidate's visibility in districts, "visibility, not votes").
 *  Pure rules, no imports. Visibility is display-only: nothing here, and no module that imports this, may feed a ballot, a count, a tally or an AI share.
 *  [ASSUMPTION] every number below is a PoC placeholder for ARC and Design; the issue gives none of them except "fixed real-time duration", "one quest per real day",
 *  "capped per citizen per day" and "diminishing returns per district". */
/** Work Capacity a quest costs (the shared WC pool is 24, a work shift costs up to 4). */
export const canvassCapacityCost = 2;
/** The fixed real-time duration of one quest. */
export const canvassDurationSeconds = 3600;
/** Visibility points a quest earns in an untouched district. One quest per citizen per day makes this the per-citizen daily cap too. */
export const canvassBasePoints = 10;
/** Half-life style constant of the diminishing return: a district already holding this many points yields half the base. */
export const canvassDecayPoints = 50;
/** Points one completed quest adds to a (candidate, district) that already holds `existing` points: base * decay / (decay + existing), whole points, at least 1. */
export function visibilityGain(existing: number): number {
  if (!Number.isSafeInteger(existing) || existing < 0) throw Error('Visibility must be a non-negative whole number.');
  return Math.max(1, Math.floor((canvassBasePoints * canvassDecayPoints) / (canvassDecayPoints + existing)));
}
/** The real (UTC) day a quest starts on: one quest per citizen per day. */
export const canvassDay = (now: number) => new Date(now * 1000).toISOString().slice(0, 10);
export type QuestStage = 'none' | 'active' | 'ready' | 'completed';
export function questStage(now: number, quest: { completesAt: number; completedAt: number | null } | null): QuestStage {
  if (!quest) return 'none';
  if (quest.completedAt !== null) return 'completed';
  return now >= quest.completesAt ? 'ready' : 'active';
}
