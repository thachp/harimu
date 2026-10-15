/** #281 Aurelle AI palace coup: pure rules (no runtime imports, so tests load them directly).
 *  Canon: docs coups-transitions §10.2 / §10.4 (Aurelle "AI palace coup": AI great lords and the Captain of the Guard plot in
 *  secret; at 50% of the Guard + 3 great lords a public Crisis Window opens; success installs the plot's AI ruler as a new
 *  house, failure purges the plotters) and ai-leadership §8.12. Engine-only for the PoC: no LLM deliberation, no humans take sides.
 *  All numbers are config [ASSUMPTION] values. Outcomes are deterministic functions of a seed. */
export type LordId = 'ashgrove' | 'thornwick' | 'dunmere' | 'stormhaven' | 'redwren' | 'oakhollow';
export type GreatLord = { id: LordId; name: string; house: string; motto: string; color: string };
/** ARC on #281 / Content #288: leader and house names are at most 24 characters. Pinned to COUP_NAME_MAX in lib/palace-coup-copy.ts by a test. */
export const coupNameMax = 24;
export const greatLords: readonly GreatLord[] = [
  { id: 'ashgrove', name: 'Lord Maren Ashgrove', house: 'House Ashgrove', motto: 'Ash outlasts the throne.', color: '#8a8a7a' },
  { id: 'thornwick', name: 'Lady Isolde Thornwick', house: 'House Thornwick', motto: 'The crown has thorns.', color: '#a06f6f' },
  { id: 'dunmere', name: 'Lord Edric Dunmere', house: 'House Dunmere', motto: 'Still waters, firm hand.', color: '#6f8aa0' },
  { id: 'stormhaven', name: 'Lord Cassian Stormhaven', house: 'House Stormhaven', motto: 'Weather the storm, hold the keep.', color: '#6f7fa0' },
  { id: 'redwren', name: 'Lady Brenna Redwren', house: 'House Redwren', motto: 'Small wings, long reach.', color: '#b07a5a' },
  { id: 'oakhollow', name: 'Lord Tobias Oakhollow', house: 'House Oakhollow', motto: 'Deep roots keep the realm.', color: '#7a9a6f' },
];
export const greatLord = (id: string) => greatLords.find(l => l.id === id) ?? null;
/** Server-side name guard: trimmed, non-empty, at most 24 characters, no control characters. Throws otherwise. */
export function boundedName(value: string): string {
  const v = value.trim();
  if (!v || v.length > coupNameMax || /[\u0000-\u001f\u007f]/.test(v)) throw new RangeError(`Leader and house names must be 1–${coupNameMax} characters.`);
  return v;
}
for (const l of greatLords) { boundedName(l.name); boundedName(l.house); }

export const coupConfig = {
  formationUnrest: 55,              // Aurelle Unrest (#69) at or above this ...
  formationSustainSeconds: 24 * 3600, // ... for 24 real hours before a plot can form
  guardThresholdPct: 50,            // committed share of the Guard ...
  greatLordsThreshold: 3,           // ... plus this many great lords opens the Crisis Window
  exposureLimit: 100,               // exposure reaching this before the threshold exposes and purges the plot
  windowSeconds: 36 * 3600,         // public Crisis Window (24–48h band); same length as the Rising window
  cooldownSeconds: 7 * 86400,       // after a plot resolves, no new plot for 7 real days
  defenceBase: 40,                  // the Crown's defence = base + Stability (+ Legitimacy, neutral until #69 grows one)
  jitterMax: 19,                    // seeded luck on the plotters' side, 0..19
} as const;

/** FNV-1a: deterministic 0..2^32-1 from a string. */
export function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export const roll = (seed: string, modulo: number) => hash(seed) % modulo;

/** How long Unrest has stayed at or above the formation level, from scores newest first. */
export function pressureSeconds(scores: { scheduledAt: number; unrest: number }[], now: number): number {
  let start: number | null = null;
  for (const s of scores) { if (s.unrest < coupConfig.formationUnrest) break; start = s.scheduledAt; }
  return start === null ? 0 : Math.max(0, now - start);
}

/** Percent chance per real day that a plot forms. Zero without 24h of sustained Unrest. Rises with Unrest, sustained days and
 *  low Stability; falls with average Royal Favor among Aurelle citizens (0–100). Clamped 0..100. */
export function formationOdds(input: { unrest: number; stability: number; favor: number; sustainedSeconds: number }): number {
  if (input.sustainedSeconds < coupConfig.formationSustainSeconds) return 0;
  const days = Math.floor(input.sustainedSeconds / 86400);
  const odds = (input.unrest - 50) * 2 + (50 - input.stability) + days * 3 - input.favor * 0.4;
  return Math.max(0, Math.min(100, Math.round(odds)));
}
export const plotForms = (seed: string, odds: number) => roll(`form:${seed}`, 100) < odds;

/** A plot's secret recruitment, derived purely from its seed and age in whole days: Guard share, great lords and exposure.
 *  Never sent to a client before the window opens. `readyDay` / `exposedDay` are the first day each condition holds. */
export type PlotState = { ageDays: number; guardPct: number; greatLords: number; exposure: number; ready: boolean; exposed: boolean };
export function plotState(seed: string, ageDays: number): PlotState {
  let guard = 20, lords = 1, exposure = 0;
  const days = Math.max(0, Math.floor(ageDays));
  for (let d = 1; d <= days; d++) {
    guard = Math.min(100, guard + 5 + roll(`guard:${seed}:${d}`, 9));    // +5..13 a day
    if (roll(`lord:${seed}:${d}`, 3) === 0) lords = Math.min(5, lords + 1);
    exposure = Math.min(100, exposure + 8 + roll(`exposure:${seed}:${d}`, 7)); // +8..14 a day
    if (guard >= coupConfig.guardThresholdPct && lords >= coupConfig.greatLordsThreshold) return { ageDays: d, guardPct: guard, greatLords: lords, exposure, ready: true, exposed: false };
    if (exposure >= coupConfig.exposureLimit) return { ageDays: d, guardPct: guard, greatLords: lords, exposure, ready: false, exposed: true };
  }
  return { ageDays: days, guardPct: guard, greatLords: lords, exposure, ready: false, exposed: false };
}

/** Power Weight: committed Guard share plus ten points per great lord. At the opening threshold it is at least 80. */
export const powerWeight = (guardPct: number, greatLordsCount: number) => guardPct + 10 * greatLordsCount;
/** The plotters win when Power Weight plus seeded luck beats the Crown's defence (base + Stability + Legitimacy). */
export function coupSucceeds(input: { guardPct: number; greatLords: number; stability: number; legitimacy?: number; seed: string }): boolean {
  const defence = coupConfig.defenceBase + input.stability + (input.legitimacy ?? 0);
  return powerWeight(input.guardPct, input.greatLords) + roll(`luck:${input.seed}`, coupConfig.jitterMax + 1) > defence;
}
/** The plot's AI ruler: a seeded great lord. */
export const plotRuler = (seed: string): GreatLord => greatLords[roll(`ruler:${seed}`, greatLords.length)];
