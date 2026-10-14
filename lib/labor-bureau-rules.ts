// Korund Labor Bureau (#235). docs citizens-daily-loops 11.5: "Citizens list 3 job preferences; the AI Bureau assigns
// (utility model weighing skills, Standing and quota gaps). Reassignment request every 30 real days."
// Bounded, explainable PoC rule: pure and deterministic, no randomness, no model call. No imports (tests load it directly).
export type BureauJob = { id: string; name: string; minShifts: number; goodStandingOnly: boolean; seats: number };
/** The plan's posts. 'korund-food-production' is the existing brigade and the fallback post. Seats are the plan's quota. [ASSUMPTION] */
export const bureauJobs: readonly BureauJob[] = [
  { id: 'korund-food-production', name: 'State food-production brigade', minShifts: 0, goodStandingOnly: false, seats: 6 },
  { id: 'korund-quarry-gang', name: 'Stonehearth quarry gang', minShifts: 1, goodStandingOnly: false, seats: 5 },
  { id: 'korund-foundry-hand', name: 'Foundry hand', minShifts: 3, goodStandingOnly: false, seats: 4 },
  { id: 'korund-rail-crew', name: 'Rail maintenance crew', minShifts: 5, goodStandingOnly: false, seats: 4 },
  { id: 'korund-plan-clerk', name: 'Plan archive clerk', minShifts: 8, goodStandingOnly: true, seats: 2 },
] as const;
export const fallbackJobId = 'korund-food-production';
export const reassignmentSeconds = 30 * 86400; // 30 real days
export const preferenceCount = 3;
export const goodStanding = 'Good standing';
/** Utility weights. Each term is a small integer so the result is easy to audit. */
export const weights = { preference: [60, 40, 20], standingGood: 10, perOpenSeat: 6, maxOpenSeats: 5, skillBase: 5, skillCap: 20 } as const;

export type BureauOutcome = 'first-choice' | 'lower-choice' | 'quota-posting';
export type BureauReason = 'listed-first' | 'listed-lower' | 'not-listed' | 'skills-meet' | 'standing-good' | 'open-seats' | 'fallback';
export type BureauAssignment = { jobId: string; outcome: BureauOutcome; reasons: BureauReason[]; utility: number };
export type BureauInput = {
  preferences: readonly string[]; shifts: number; standing: string | null;
  /** Citizens currently assigned to each job, excluding the requester. */
  filled: Readonly<Record<string, number>>;
};

export const jobById = (id: string) => bureauJobs.find(j => j.id === id);

/** Exactly three distinct known job ids, else null. */
export function validPreferences(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== preferenceCount) return null;
  const ids = value.map(v => (typeof v === 'string' ? v : ''));
  if (ids.some(id => !jobById(id)) || new Set(ids).size !== preferenceCount) return null;
  return ids;
}

export function quotaGap(job: BureauJob, filled: Readonly<Record<string, number>>): number {
  return Math.max(0, job.seats - Number(filled[job.id] ?? 0));
}

/** Eligible = skills met, Standing met and a seat is open. Utility = preference rank + skill fit + Standing + quota gap. */
export function assignJob(input: BureauInput): BureauAssignment {
  const good = input.standing === goodStanding;
  let best: { job: BureauJob; utility: number; rank: number } | null = null;
  for (const job of bureauJobs) {
    if (input.shifts < job.minShifts || (job.goodStandingOnly && !good) || quotaGap(job, input.filled) <= 0) continue;
    const rank = input.preferences.indexOf(job.id);
    const utility = (rank >= 0 ? weights.preference[rank] : 0)
      + Math.min(weights.skillCap, weights.skillBase + (input.shifts - job.minShifts))
      + (good ? weights.standingGood : 0)
      + Math.min(weights.maxOpenSeats, quotaGap(job, input.filled)) * weights.perOpenSeat;
    if (!best || utility > best.utility) best = { job, utility, rank };
  }
  if (!best) return { jobId: fallbackJobId, outcome: input.preferences[0] === fallbackJobId ? 'first-choice' : input.preferences.includes(fallbackJobId) ? 'lower-choice' : 'quota-posting', reasons: ['fallback'], utility: 0 };
  const reasons: BureauReason[] = [best.rank === 0 ? 'listed-first' : best.rank > 0 ? 'listed-lower' : 'not-listed'];
  if (best.job.minShifts > 0 && input.shifts >= best.job.minShifts) reasons.push('skills-meet');
  if (good) reasons.push('standing-good');
  reasons.push('open-seats');
  return { jobId: best.job.id, outcome: best.rank === 0 ? 'first-choice' : best.rank > 0 ? 'lower-choice' : 'quota-posting', reasons, utility: best.utility };
}

/** Real-seconds timestamp when the next request opens, or null when one is allowed now. */
export function nextRequestAt(lastAssignedAt: number | null, now: number): number | null {
  if (lastAssignedAt === null) return null;
  const at = lastAssignedAt + reassignmentSeconds;
  return at > now ? at : null;
}
