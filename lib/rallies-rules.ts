/** #867: pure, import-free Kindle rally rules (docs §9.4 "Rallies and speeches"). Rallies affect visibility only, never ballots (§9.5). */
export const ralliesFlagOn = (env: unknown) => (env as { HARIMU_KINDLE_RALLIES_ENABLED?: string } | null)?.HARIMU_KINDLE_RALLIES_ENABLED === 'true';
export const rallyWeekSeconds = 7 * 24 * 3600;
/** [ASSUMPTION] PoC placeholder: AI citizens added to every rally crowd. */
export const rallyAiCrowd = 40;
/** Candidate i (0-based) rallies once per real week, (i+1) days plus 18 hours after the week starts (UTC, from the epoch). */
export const rallyStartsAt = (week: number, index: number) => week * rallyWeekSeconds + (index + 1) * 86400 + 18 * 3600;
export const rallyWeekOf = (now: number) => Math.floor(now / rallyWeekSeconds);
/** The candidate's one upcoming rally: this week's if it has not started, otherwise next week's. */
export function upcomingRallyWeek(now: number, index: number) { const w = rallyWeekOf(now); return rallyStartsAt(w, index) > now ? w : w + 1; }
/** The candidate's most recent rally that has already started (this week's or last week's). */
export function lastRallyWeek(now: number, index: number) { const w = rallyWeekOf(now); return rallyStartsAt(w, index) <= now ? w : w - 1; }
export const rallyIdFor = (candidateId: string, week: number) => `rally-${candidateId}-${week}`;
export const parseRallyId = (id: unknown): { candidateId: string; week: number } | null => {
  const m = typeof id === 'string' ? /^rally-([a-z-]+)-([0-9]{1,8})$/.exec(id) : null;
  return m ? { candidateId: m[1], week: Number(m[2]) } : null;
};
