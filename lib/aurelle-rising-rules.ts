/** #71 Aurelle claimants and the popular Rising: pure rules (no runtime imports, so tests load them directly).
 *  Canon: docs ai-leadership §8.12 and coups-transitions §10.3 (Aurelle row). Thresholds are config [ASSUMPTION] values. */
export type ClaimantId = 'vaelcourt' | 'brightvane' | 'larkspire';
export type Claimant = { id: ClaimantId; name: string; house: string; motto: string; grievance: string; programme: string; color: string };
/** Persona data that fills Content #269's {claimant}/{house}/{motto} placeholders (lib/claimant-copy.ts names no house).
 *  House names reuse existing Aurelle family names from lib/citizen-names.ts; proposal data for Content review.
 *  Rule-bound personas: no live AI model is connected. Stay within CLAIMANT_LABEL_MAX / CLAIMANT_BODY_MAX (tested). */
export const claimants: readonly Claimant[] = [
  { id: 'vaelcourt', name: 'Lady Ysolde', house: 'House Vaelcourt', motto: 'Bread before banners.', grievance: 'The royal store feeds the court before the commons.', programme: 'Open the estate granaries to every household.', color: '#9f6f8f' },
  { id: 'brightvane', name: 'Lord Corin', house: 'House Brightvane', motto: 'Every thread its due wage.', grievance: 'Charter wages buy less each season.', programme: 'Restore full-weight Crowns for charter work.', color: '#6f8fa8' },
  { id: 'larkspire', name: 'Lord Aubert', house: 'House Larkspire', motto: 'An open court for an open realm.', grievance: 'Petitions die in the royal council.', programme: 'Hear household petitions in an open court.', color: '#8fa86f' },
];
export const isClaimantId = (value: unknown): value is ClaimantId => claimants.some(c => c.id === value);
export const claimant = (id: string) => claimants.find(c => c.id === id) ?? null;

export const risingConfig = {
  pledgeSharePct: 15,              // Tier-1 pledges behind one claimant, as % of weekly-active Tier-1 Aurelle humans
  unrestThreshold: 60,             // Aurelle Unrest (#69) at or above this ...
  unrestSustainSeconds: 48 * 3600, // ... for 48 real hours
  pledgeChangeSeconds: 7 * 86400,  // a pledge can be changed once per 7 real days
  windowSeconds: 36 * 3600,        // Crisis Window length (24–48h band)
  cooldownSeconds: 7 * 86400,      // after a Rising resolves, no new Rising for 7 real days
  stabilityCeiling: 50,            // a Rising succeeds only while Stability is below this at close
} as const;

/** Smallest pledge count that meets the share: ceil(weekly × 15 / 100). Null when nobody verified was active this week. */
export function pledgeThreshold(weeklyHumans: number): number | null {
  if (!Number.isSafeInteger(weeklyHumans) || weeklyHumans < 1) return null;
  return Math.ceil(weeklyHumans * risingConfig.pledgeSharePct / 100);
}

/** How long Unrest has stayed at or above the threshold, from scores newest first. 0 if the latest is below. */
export function unrestSustainedSeconds(scores: { scheduledAt: number; unrest: number }[], now: number): number {
  let start: number | null = null;
  for (const s of scores) { if (s.unrest < risingConfig.unrestThreshold) break; start = s.scheduledAt; }
  return start === null ? 0 : Math.max(0, now - start);
}

export function risingReady(input: { pledges: number; weeklyHumans: number; sustainedSeconds: number }): boolean {
  const threshold = pledgeThreshold(input.weeklyHumans);
  return threshold !== null && input.pledges >= threshold && input.sustainedSeconds >= risingConfig.unrestSustainSeconds;
}

/** Resolution from committed pledges, Legitimacy and Stability. There is no Legitimacy stat on dev yet, so it is neutral
 *  (0) here and only adds when #69 grows one. Succeeds when pledge share still meets the threshold and Stability is weak. */
export function risingSucceeds(input: { pledges: number; weeklyHumans: number; stability: number; legitimacy?: number }): boolean {
  const threshold = pledgeThreshold(input.weeklyHumans);
  if (threshold === null || input.pledges < threshold) return false;
  return input.stability - (input.legitimacy ?? 0) < risingConfig.stabilityCeiling;
}

export const pledgeRequestId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function validPledgeCommand(body: Record<string, unknown>): body is { action: 'aurelle-pledge'; requestId: string; claimantId: ClaimantId } {
  return body.action === 'aurelle-pledge' && pledgeRequestId(body.requestId) && isClaimantId(body.claimantId) && Object.keys(body).length === 3;
}
