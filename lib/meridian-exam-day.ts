/** #1133: Meridian next Exam Day. Pure: no database, so no migration.
 *  Running the exam ladder and awarding ranks are out of scope.
 *  [ASSUMPTION] Docs §7.3 list Exam Day as "ranks announced" and give no interval.
 *  Congress Week is the only holiday in that row with a stated cadence (every 5 game years).
 *  Exam Day falls once per game year. A game year is realDaysPerGameYear (30 real days),
 *  the world-clock year. A real day is 86_400_000 ms.
 *  [ASSUMPTION] The clock reuses VARKAND_CHAIR_ANCHOR_MS from #1085 (the Unix epoch).
 *  meridianNextExamDayAt takes only nowMs, the same instant the government read already
 *  uses, so the next Exam Day is deterministic from that clock. The shard world_clock
 *  epoch is per shard, so this read does not follow it.
 *  At a boundary the following Exam Day is next. Before the anchor, the next Exam Day
 *  is one cycle after the anchor. */
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** One world-clock game year. Tests pin this to realDaysPerGameYear. */
export const MERIDIAN_EXAM_DAY_CYCLE_DAYS = 30 as const;
export const MERIDIAN_EXAM_DAY_CYCLE_MS = MERIDIAN_EXAM_DAY_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / MERIDIAN_EXAM_DAY_CYCLE_MS) - 1;

/** Next Exam Day, in integer milliseconds. */
export function meridianNextExamDayAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / MERIDIAN_EXAM_DAY_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * MERIDIAN_EXAM_DAY_CYCLE_MS;
}
