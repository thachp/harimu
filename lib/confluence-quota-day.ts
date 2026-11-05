/** #1169: Confluence next Quota Day on the government read (docs §7.2). Pure: no database, so no migration.
 *  States no quota, target, or bonus — date only.
 *  [ASSUMPTION] Docs name Quota Day and give no interval. Cadence is once per game year = realDaysPerGameYear
 *  (30 real days) from VARKAND_CHAIR_ANCHOR_MS (#1085), the same family as #1159. Zero offset from that anchor.
 *  A real day is 86_400_000 ms. At a boundary the following day is next. Before the anchor, the next
 *  Quota Day is one cycle after the anchor. The shard world_clock epoch is per shard, so this read does not follow it. */
import { realDaysPerGameYear } from './election-calendars.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from './varkand-directorate.ts';

const DAY_MS = 86_400_000;

/** [ASSUMPTION] Once per game year. Tests pin this to realDaysPerGameYear (30). */
export const CONFLUENCE_QUOTA_DAY_CYCLE_DAYS = realDaysPerGameYear;
export const CONFLUENCE_QUOTA_DAY_CYCLE_MS = CONFLUENCE_QUOTA_DAY_CYCLE_DAYS * DAY_MS;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / CONFLUENCE_QUOTA_DAY_CYCLE_MS) - 1;

/** Next Quota Day, in integer milliseconds. States no quota. */
export function confluenceNextQuotaDayAt(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / CONFLUENCE_QUOTA_DAY_CYCLE_MS), maxStep);
  return VARKAND_CHAIR_ANCHOR_MS + (step + 1) * CONFLUENCE_QUOTA_DAY_CYCLE_MS;
}
