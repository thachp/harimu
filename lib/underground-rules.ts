/** #295: pure rules for Korund underground worship and capped inspections (raids). No imports, so tests can load this file directly.
 *  Canon: harimu-docs 14.6 (State atheism: faith is a forbidden private act; underground worship stays low-key and quiet; discovery is
 *  abstract, "an inspection found a shrine"; Correction Duty is capped at 7 real days and only for repeat discoveries; "a congregation can
 *  be raided at most once per 14 real days [ASSUMPTION]"; State Media may not name individual believers) and 27 (MVP scope: Korund state
 *  atheism with low-key underground worship and capped raids). docs 14.6 and the Korund page (checked 2026-10-14) give no discovery chance and no Devotion
 *  figure, so those two are [ASSUMPTION]s that live ONLY in undergroundConfig below (raidChancePerMille, devotionHit) and are pinned by tests/korund-underground.test.mjs.
 *  Every number below is a docs figure or an [ASSUMPTION] marked here. */
export const undergroundConfig = {
  /** Same length as lib/faith.ts gameDaySeconds (12x clock: a game day is 2 real hours). A test keeps the two equal. */
  gameDaySeconds: 7200,
  /** Docs 14.6 [ASSUMPTION]: a city is inspected at most once per 14 real days. The issue says "max N per real week per city"; the docs cap is stricter
   *  (so the issue's weekly cap also holds), and it is one number to change. */
  raidMinGapSeconds: 14 * 86400,
  /** [ASSUMPTION] (no docs number; one config place, pinned by a test) Discovery is a low, deterministic chance per game day for a city that has underground worship: 42 in 1000 (about 1 in 24, so
   *  roughly one inspection every two real days once the 14-day gap allows it). The roll is a hash of the city and game day: no clock jitter, no RNG state. */
  raidChancePerMille: 42,
  /** [ASSUMPTION] Only holders who worshipped underground in the last 7 real days are found by an inspection (a city with no recent practice is not raided). */
  holderLookbackSeconds: 7 * 86400,
  /** [ASSUMPTION] (docs 14.6 says no number; one config place, pinned by a test) "A small Devotion hit": 5 Devotion points (one worship is +3). Devotion is social standing only and never touches wages, production, markets or combat. */
  devotionHit: 5,
  /** How long a raid result and a quiet-week line are shown to the holder, and how long the State Media rumor stays in the news. */
  recentSeconds: 7 * 86400,
  newsWindowSeconds: 14 * 86400,
  newsLimit: 5,
  /** #382 Suspicion (ARC ruling, every number an [ASSUMPTION]; docs 14.6 gives none): a whole number 0..100 per citizen; a discovery adds 10, or 5 when the holder was also found within the
   *  repeat window (the last 30 real days, ARC ruling; longer than the 14-day per-city inspection gap so repeats can happen); it decays 1 per real day, computed on read. Bands (also [ASSUMPTION]) name the level for the holder: it never sees the number. */
  suspicionFirstStep: 10,
  suspicionRepeatStep: 5,
  suspicionMax: 100,
  suspicionDecaySeconds: 86400,
  repeatWindowSeconds: 30 * 86400,
  suspicionBands: { low: 1, raised: 30, high: 60 },
  /** #749 (docs 12.9 "each illicit trade adds Suspicion where it is a crime"; no number given, every figure an [ASSUMPTION]): each completed Korund gray-market trade adds 2 to each party,
   *  at most 4 per real UTC day from trades. Both stay below one discovery (the repeat step, 5), and gray-market Suspicion never starts Correction Duty (duties derive from discoveries only). */
  graySuspicionStep: 2,
  graySuspicionDailyCap: 4,
  /** #382 PR B Correction Duty (ARC ruling; docs 14.6 and 8.18 fix only the 7-real-day cap, everything else is an [ASSUMPTION]): a repeat discovery starts it, 3 real days by default, longer by the Suspicion band after that
   *  discovery (raised 5, high 7), never more than 7 real days from its start. A new discovery during an active duty extends it, up to that cap (no stacking). Effect: Devotion (social standing) only, 1 point per duty day, taken
   *  at the start; no wage, production or market effect. One automatic appeal per duty (docs 8.18: automatic rule, not staff): granted when the holder had no discovery in the 14 real days before the discovery that started the duty. */
  dutyDaysByBand: { none: 3, low: 3, raised: 5, high: 7 },
  dutyMaxSeconds: 7 * 86400,
  dutyDevotionPerDay: 1,
  appealWindowSeconds: 14 * 86400,
} as const;

export const undergroundGameDay = (now: number) => Math.floor(now / undergroundConfig.gameDaySeconds);
export const raidId = (cityId: string, gameDay: number) => `raid:${cityId}:${gameDay}`;

/** FNV-1a over a string, as an unsigned 32-bit integer (deterministic, no state). */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** Roll 0..999 for a city on a game day. */
export const raidRoll = (cityId: string, gameDay: number) => hash32(`korund-raid:${cityId}:${gameDay}`) % 1000;
/** Whether the discovery roll comes up for a city on a game day (the 14-day cap is applied separately, in the insert). */
export const raidDue = (cityId: string, gameDay: number) => raidRoll(cityId, gameDay) < undergroundConfig.raidChancePerMille;
/** Pick one of `count` lines, stably for a seed. */
export const pickIndex = (seed: string, count: number) => count <= 0 ? 0 : hash32(seed) % count;

/** #382: a discovery is a repeat when the holder was also found within the repeat window before it. Counted from stored discovery times (korund_raid_hits), not from when the faith was chosen, so re-choosing a faith resets nothing.
 *  The window is inclusive and, at 30 days, longer than the per-city 14-day inspection gap, so a holder who stays in one city can be repeated by the next inspection (the 14-day gap is unchanged) [ASSUMPTION, ARC ruling]. */
export const isRepeatDiscovery = (previousAt: number | null, at: number) => previousAt !== null && at - previousAt <= undergroundConfig.repeatWindowSeconds;
/** #382: each discovery in time order with whether it was a repeat and the Suspicion right after it (each step decayed to its discovery first). Times are seconds, in any order. */
export function foldDiscoveries(discoveredAt: readonly number[]): { at: number; repeat: boolean; level: number }[] {
  const cfg = undergroundConfig, steps: { at: number; repeat: boolean; level: number }[] = [];
  let level = 0, last: number | null = null;
  for (const at of [...discoveredAt].sort((a, b) => a - b)) {
    if (last !== null) level = Math.max(0, level - Math.floor(Math.max(0, at - last) / cfg.suspicionDecaySeconds));
    const repeat = isRepeatDiscovery(last, at);
    level = Math.min(cfg.suspicionMax, level + (repeat ? cfg.suspicionRepeatStep : cfg.suspicionFirstStep));
    steps.push({ at, repeat, level }); last = at;
  }
  return steps;
}
/** #382: the holder's Suspicion at `now`, folded from their discovery times: the last step decayed to `now`. 0 with no discoveries. */
export function suspicionLevel(discoveredAt: readonly number[], now: number): number {
  const last = foldDiscoveries(discoveredAt).pop();
  return last ? Math.max(0, last.level - Math.floor(Math.max(0, now - last.at) / undergroundConfig.suspicionDecaySeconds)) : 0;
}
export type SuspicionBand = 'none' | 'low' | 'raised' | 'high';
export const suspicionBand = (level: number): SuspicionBand => level >= undergroundConfig.suspicionBands.high ? 'high' : level >= undergroundConfig.suspicionBands.raised ? 'raised' : level >= undergroundConfig.suspicionBands.low ? 'low' : 'none';
/** The {level} word the private indicator shows ([ASSUMPTION] wording: Content's Suspicion copy module defines the line but no level words; Content may replace these). */
export const suspicionWord: Record<Exclude<SuspicionBand, 'none'>, string> = { low: 'Low', raised: 'Raised', high: 'High' };
/** True when a new inspection of a city at `now` is allowed given the time of its previous one (null: none). Exact boundary: the gap itself is allowed. */
export const raidAllowed = (now: number, lastRaidAt: number | null) => lastRaidAt === null || now - lastRaidAt >= undergroundConfig.raidMinGapSeconds;

/** #382 PR B: the holder's Correction Duties, derived from their discovery times. A repeat discovery starts a duty (3 real days by default, by Suspicion band after it, capped at 7 from its start);
 *  a repeat while one is active extends it up to the cap instead of stacking a second. `startAt` is the discovery that started it. Seconds. */
export function deriveDuties(discoveredAt: readonly number[]): { startAt: number; endsAt: number }[] {
  const cfg = undergroundConfig, duties: { startAt: number; endsAt: number }[] = [];
  for (const step of foldDiscoveries(discoveredAt)) {
    if (!step.repeat) continue;
    const length = cfg.dutyDaysByBand[suspicionBand(step.level)] * 86400, current = duties[duties.length - 1];
    if (current && step.at < current.endsAt) current.endsAt = Math.min(current.endsAt + length, current.startAt + cfg.dutyMaxSeconds);
    else duties.push({ startAt: step.at, endsAt: Math.min(step.at + length, step.at + cfg.dutyMaxSeconds) });
  }
  return duties;
}
/** #382 PR B appeal rule (automatic, docs 8.18): granted when no discovery fell in the 14 real days before the one that started the duty; otherwise denied. Strictly inside the window: exactly 14 days earlier is outside it. */
export const appealGranted = (discoveredAt: readonly number[], dutyStartAt: number) => !discoveredAt.some(at => at < dutyStartAt && at > dutyStartAt - undergroundConfig.appealWindowSeconds);
/** Whole real days of a duty, rounded up (the Devotion cost is 1 per day). */
export const dutyDays = (duty: { startAt: number; endsAt: number }) => Math.ceil((duty.endsAt - duty.startAt) / 86400);

/** #749: Suspicion at `now` from discoveries plus gray-market trades (seconds), one fold with the same decay, bands and max. Gray trades add `graySuspicionStep`
 *  each, at most `graySuspicionDailyCap` per real UTC day. With no trades this equals suspicionLevel(discoveredAt, now). */
export function suspicionLevelWithGray(discoveredAt: readonly number[], grayTradedAt: readonly number[], now: number): number {
  const cfg = undergroundConfig, perDay = new Map<number, number>();
  const events: { at: number; step: number }[] = foldDiscoveries(discoveredAt).map(d => ({ at: d.at, step: d.repeat ? cfg.suspicionRepeatStep : cfg.suspicionFirstStep }));
  for (const at of [...grayTradedAt].sort((a, b) => a - b)) {
    const day = Math.floor(at / 86400), used = perDay.get(day) ?? 0, step = Math.min(cfg.graySuspicionStep, cfg.graySuspicionDailyCap - used);
    if (step > 0) { perDay.set(day, used + step); events.push({ at, step }); }
  }
  let level = 0, last: number | null = null;
  for (const e of events.sort((a, b) => a.at - b.at)) {
    if (last !== null) level = Math.max(0, level - Math.floor(Math.max(0, e.at - last) / cfg.suspicionDecaySeconds));
    level = Math.min(cfg.suspicionMax, level + e.step); last = e.at;
  }
  return last === null ? 0 : Math.max(0, level - Math.floor(Math.max(0, now - last) / cfg.suspicionDecaySeconds));
}
