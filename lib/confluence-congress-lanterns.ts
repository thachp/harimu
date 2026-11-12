/** #1183 / #1390: Confluence next Congress Lanterns at every Party Congress (docs §7.2, §17.1).
 *  Pure: no database, so no migration. Date only: no lantern count, delegate list, or Party text.
 *  Reuses the #1113 Party Congress clock (150 real days = 5 game years) so the lanterns date is the Congress date.
 *  Existing flag HARIMU_CONFLUENCE_CONGRESS_LANTERNS_ENABLED is unchanged. */
import { CONFLUENCE_CONGRESS_INTERVAL_DAYS, CONFLUENCE_CONGRESS_MS, confluenceNextPartyCongressAt } from './confluence-party.ts';

export const CONFLUENCE_CONGRESS_LANTERNS_CYCLE_DAYS = CONFLUENCE_CONGRESS_INTERVAL_DAYS as 150;
export const CONFLUENCE_CONGRESS_LANTERNS_CYCLE_MS = CONFLUENCE_CONGRESS_MS;

/** Next Congress Lanterns, in integer milliseconds. Same instant as confluenceNextPartyCongressAt. Takes nowMs only. */
export function confluenceNextCongressLanternsAt(nowMs: number): number {
  return confluenceNextPartyCongressAt(nowMs);
}
