/** #878: the Kindle election cycle start and the Korund and Aurelle transition calendars, as named constants that match the docs
 *  (docs.harimu.com: systems/world-clock-pacing, politics/ai-leadership §8.4, politics/coups-transitions, world/nations/korund).
 *  Everything is anchored on HARIMU_KINDLE_CYCLE_START_AT (epoch seconds, start of world day 0). Unset or malformed: fail closed, every
 *  calendar is held and nothing opens on its own. Pure functions only: no DB, no secrets, no side effects. */
export const daySeconds = 86400;
/** World clock: 1 real day = 12 game days, 1 real month (30 days) = 1 game year. */
export const realDaysPerGameYear = 30;
/** Kindle: a presidential term is 4 game years = 120 real days. The founding election is a day-30 event; the mid-term Assembly opens at day 60 of every cycle (#351). Votes run 72 real hours. */
export const KINDLE_CALENDAR = Object.freeze({ cycleDays: 120, foundingElectionDay: 30, assemblyMidtermDay: 60, voteHours: 72 });
/** Why Korund counts from day 30, not day 0 (QA1 on #916): the docs' Day 30 events have the AI Congress confirm the founding Chairman, and that
 *  confirmation is itself the first Congress. Each later Party Congress closes one Five-Year Plan (150 real days) after the previous one, so the
 *  schedule is day 30 + k * 150. Counting from day 0 would put the first full Congress before any Chairman had been confirmed. */
/** Korund: the AI Congress confirms the Chairman at day 30; a Party Congress (one Five-Year Plan, 5 game years) follows every 150 real days.
 *  Sustained Unrest >= 65 for 7 real days forces an emergency Presidium session [ASSUMPTION in the docs]. */
export const KORUND_CALENDAR = Object.freeze({ confirmationDay: 30, congressCycleDays: 150, emergencyUnrest: 65, emergencyUnrestDays: 7 });
/** Aurelle: hereditary, no elections. The rival AI houses publish their claims at day 30; the monarch's scripted mortality window is game age 70-90.
 *  Succession itself stays operator-triggered (aurelle-succession); this calendar only dates the claims event. */
export const AURELLE_CALENDAR = Object.freeze({ claimsDay: 30, mortalityGameAge: Object.freeze([70, 90] as const) });

export type CalendarBindings = { HARIMU_KINDLE_CYCLE_START_AT?: string };
/** The cycle start, or null (held). Only 1-12 digit epoch seconds are accepted; anything else fails closed. */
export function kindleCycleStartAt(b: CalendarBindings): number | null {
  const raw = b.HARIMU_KINDLE_CYCLE_START_AT;
  if (typeof raw !== 'string' || !/^\d{1,12}$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
/** The first occurrence at or after `now` of `firstDay + k * everyDays` (k >= 0) from `start`. */
function nextOn(start: number, firstDay: number, everyDays: number, now: number) {
  const first = start + firstDay * daySeconds, every = everyDays * daySeconds;
  const k = now <= first ? 0 : Math.ceil((now - first) / every);
  return { index: k, at: first + k * every };
}
export type TransitionCalendar =
  | { status: 'held'; reason: 'cycle_start_unset' }
  | { status: 'scheduled'; startAt: number; worldDay: number;
      kindle: { cycle: number; nextPresidentialAt: number; nextAssemblyAt: number; voteSeconds: number };
      korund: { nextCongressAt: number; congress: number };
      aurelle: { claimsAt: number; claimsPublished: boolean } };
/** Every MVP nation's next transition date, or `held` when the cycle start is unset. Before the start the calendar is scheduled with worldDay < 0. */
export function transitionCalendar(b: CalendarBindings, now: number): TransitionCalendar {
  const start = kindleCycleStartAt(b);
  if (start === null || !Number.isSafeInteger(now)) return { status: 'held', reason: 'cycle_start_unset' };
  const president = nextOn(start, KINDLE_CALENDAR.foundingElectionDay, KINDLE_CALENDAR.cycleDays, now);
  const assembly = nextOn(start, KINDLE_CALENDAR.assemblyMidtermDay, KINDLE_CALENDAR.cycleDays, now);
  const congress = nextOn(start, KORUND_CALENDAR.confirmationDay, KORUND_CALENDAR.congressCycleDays, now);
  const claimsAt = start + AURELLE_CALENDAR.claimsDay * daySeconds;
  return { status: 'scheduled', startAt: start, worldDay: Math.floor((now - start) / daySeconds),
    kindle: { cycle: Math.max(0, Math.floor((now - start) / (KINDLE_CALENDAR.cycleDays * daySeconds))), nextPresidentialAt: president.at, nextAssemblyAt: assembly.at, voteSeconds: KINDLE_CALENDAR.voteHours * 3600 },
    korund: { nextCongressAt: congress.at, congress: congress.index },
    aurelle: { claimsAt, claimsPublished: now >= claimsAt } };
}

/** #918: the Kindle presidential vote window that contains `now`, or null. Votes open on day 30 of the world clock and every 120 days after,
 *  for 72 hours. Held (null) when the cycle start is unset or malformed, before the first open, and between windows: the vote never opens on its own. */
export function presidentialWindow(b: CalendarBindings, now: number): { cycle: number; opensAt: number; closesAt: number } | null {
  const start = kindleCycleStartAt(b);
  if (start === null || !Number.isSafeInteger(now)) return null;
  const first = start + KINDLE_CALENDAR.foundingElectionDay * daySeconds, every = KINDLE_CALENDAR.cycleDays * daySeconds;
  if (now < first) return null;
  const cycle = Math.floor((now - first) / every), opensAt = first + cycle * every, closesAt = opensAt + KINDLE_CALENDAR.voteHours * 3600;
  return now < closesAt ? { cycle, opensAt, closesAt } : null;
}

/** #936: the latest presidential cycle whose window has opened (its vote may since have closed), or null when held or before day 30.
 *  Each cycle has its own election row, so a closed result stays readable until the next window opens. */
export function presidentialCycle(b: CalendarBindings, now: number): number | null {
  const start = kindleCycleStartAt(b);
  if (start === null || !Number.isSafeInteger(now)) return null;
  const first = start + KINDLE_CALENDAR.foundingElectionDay * daySeconds;
  return now < first ? null : Math.floor((now - first) / (KINDLE_CALENDAR.cycleDays * daySeconds));
}
