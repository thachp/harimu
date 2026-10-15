/** #431: Kindle Spark money supply and Price Index PoC, pure rules (no runtime imports, so tests load them directly).
 *  Canon: harimu-docs 12.4 (Kindle: the independent AI Reserve Board may issue up to 3% of the money supply per game month; an Assembly 2/3
 *  vote can order a one-off stimulus up to 10%; Charter Limit: no route creates more than 15% of the money supply in a game month or 30% in a
 *  game year; the Price Index drifts toward money supply / real output with a lag of a few game weeks) and 12.6 (Kindle publishes its
 *  money supply and Price Index). The docs mark the caps and the lag [ASSUMPTION]. Every figure NOT in the docs is a PLACEHOLDER below. */
export const sparkConfig = {
  normalCapBp: 300,        // docs 12.4: Reserve Board, up to 3% of money supply per game month (basis points)
  emergencyCapBp: 1000,    // docs 12.4: Assembly 2/3 one-off stimulus up to 10% (a server-side stub here: the vote does not exist yet)
  charterMonthBp: 1500,    // docs 12.4 Charter Limit: at most 15% in a game month
  charterYearBp: 3000,     // docs 12.4 Charter Limit: at most 30% in a game year
  gameMonthSeconds: 216000,  // PLACEHOLDER: 30 game days at 12x time (a game day is 2 real hours); the docs do not define the game month
  gameYearMonths: 12,        // PLACEHOLDER
  gameWeekSeconds: 50400,    // PLACEHOLDER: 7 game days
  priceLagSeconds: 151200,   // PLACEHOLDER: "a few game weeks" = 3 game weeks
  priceBase: 100,            // PLACEHOLDER: the index starts at 100 when the supply is seeded
  priceWindowWeeks: 26,      // PLACEHOLDER: the index is derived from the last 26 game weeks of stored rows
  outputRatioMinPermille: 500, outputRatioMaxPermille: 2000, // PLACEHOLDER: the output ratio is clamped to 0.5-2.0
} as const;

/** The route a Spark issuance takes. `seed` is the one opening row (the Spark already in Kindle wallets plus the treasury). */
export type IssuanceRoute = 'normal' | 'emergency';
export const routeCapBp = (route: string): number | null => route === 'normal' ? sparkConfig.normalCapBp : route === 'emergency' ? sparkConfig.emergencyCapBp : null;
export const sparkRequestIdOk = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value);

/** FNV-1a seeded roll (copied from lib/aurelle-coup-rules so this file has no runtime imports). */
const roll = (seed: string, modulo: number): number => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0) % modulo;
};

/** Game month number (1-based) and game year (1-based) from the world clock epoch. */
export const gameMonth = (now: number, epochSeconds: number): number => Math.floor(Math.max(0, now - epochSeconds) / sparkConfig.gameMonthSeconds) + 1;
export const gameYearOfMonth = (month: number): number => Math.floor((month - 1) / sparkConfig.gameYearMonths) + 1;
export const issuanceBpOk = (route: string, value: unknown): value is number => {
  const cap = routeCapBp(route);
  return cap !== null && Number.isSafeInteger(value) && (value as number) >= (route === 'emergency' ? 1 : 0) && (value as number) <= cap;
};
/** Whole minor units, rounded down so an issuance never rounds up past its cap. */
export const issuanceAmount = (supplyMinor: number, basisPoints: number): number => Math.floor(supplyMinor * basisPoints / 10000);
export const charterMonthCap = (monthStartSupply: number): number => Math.floor(monthStartSupply * sparkConfig.charterMonthBp / 10000);
export const charterYearCap = (yearStartSupply: number): number => Math.floor(yearStartSupply * sparkConfig.charterYearBp / 10000);

/** The AI Reserve Board's fixed monthly rule: a seeded pick between 0 and the normal cap, inclusive. No live AI model; the same month always gives the same answer. */
export const reserveBoardPick = (month: number): number => roll(`reserve-board:${month}`, sparkConfig.normalCapBp + 1);

export type WeekSample = { supply: number; output: number };
/** The Price Index (docs 12.4): it drifts toward 100 x (money supply / seeded supply) / (output ratio), a little each game week, so it lags the target by a few game weeks.
 *  `weeks` is oldest to newest: the money supply at the end of each game week and the output (shifts settled) in it. The output ratio is each week's output over the
 *  window average, clamped, so a steady economy follows the supply and a slump pushes prices up. Rounded to one decimal. Pure and deterministic. */
export function priceIndex(weeks: readonly WeekSample[], seedSupply: number): number {
  const base = sparkConfig.priceBase;
  if (!weeks.length || !(seedSupply > 0)) return base;
  const average = weeks.reduce((sum, week) => sum + Math.max(0, week.output), 0) / weeks.length;
  const k = Math.min(1, sparkConfig.gameWeekSeconds / sparkConfig.priceLagSeconds);
  let index = base;
  for (const week of weeks) {
    const ratio = average > 0 ? Math.min(sparkConfig.outputRatioMaxPermille / 1000, Math.max(sparkConfig.outputRatioMinPermille / 1000, Math.max(0, week.output) / average)) : 1;
    const target = base * (week.supply / seedSupply) / ratio;
    index += (target - index) * k;
  }
  return Math.round(index * 10) / 10;
}
