/** #295: pure rules for Korund underground worship and capped inspections (raids). No imports, so tests can load this file directly.
 *  Canon: harimu-docs 14.6 (State atheism: faith is a forbidden private act; underground worship stays low-key and quiet; discovery is
 *  abstract, "an inspection found a shrine"; Correction Duty is capped at 7 real days and only for repeat discoveries; "a congregation can
 *  be raided at most once per 14 real days [ASSUMPTION]"; State Media may not name individual believers) and 27 (MVP scope: Korund state
 *  atheism with low-key underground worship and capped raids). Every number below is a docs figure or an [ASSUMPTION] marked here. */
export const undergroundConfig = {
  /** Same length as lib/faith.ts gameDaySeconds (12x clock: a game day is 2 real hours). A test keeps the two equal. */
  gameDaySeconds: 7200,
  /** Docs 14.6 [ASSUMPTION]: a city is inspected at most once per 14 real days. The issue says "max N per real week per city"; the docs cap is stricter
   *  (so the issue's weekly cap also holds), and it is one number to change. */
  raidMinGapSeconds: 14 * 86400,
  /** [ASSUMPTION] Discovery is a low, deterministic chance per game day for a city that has underground worship: 42 in 1000 (about 1 in 24, so
   *  roughly one inspection every two real days once the 14-day gap allows it). The roll is a hash of the city and game day: no clock jitter, no RNG state. */
  raidChancePerMille: 42,
  /** [ASSUMPTION] Only holders who worshipped underground in the last 7 real days are found by an inspection (a city with no recent practice is not raided). */
  holderLookbackSeconds: 7 * 86400,
  /** [ASSUMPTION] "A small Devotion hit": 5 Devotion points (one worship is +3). Devotion is social standing only and never touches wages, production, markets or combat. */
  devotionHit: 5,
  /** How long a raid result and a quiet-week line are shown to the holder, and how long the State Media rumor stays in the news. */
  recentSeconds: 7 * 86400,
  newsWindowSeconds: 14 * 86400,
  newsLimit: 5,
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

/** True when a new inspection of a city at `now` is allowed given the time of its previous one (null: none). Exact boundary: the gap itself is allowed. */
export const raidAllowed = (now: number, lastRaidAt: number | null) => lastRaidAt === null || now - lastRaidAt >= undergroundConfig.raidMinGapSeconds;
