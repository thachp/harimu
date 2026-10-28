/** #981 Korund State Media plan stats (docs §18.2, §8.6). Pure rules, no imports.
 *  The integer percent is this week's food output over the weekly quota (korund_settlements.food_output in the open game week,
 *  target korundWeeklyQuotaFood — the same ledger as the quota bar). The ledger has food, not a separate iron (or other) output, so the line names food.
 *  Words may spin; the only number is that percent. A non-positive target returns null so no line invents one. No table, no migration, no write. */
export const korundPlanWeekSeconds = 50400; // mirrors lib/korund.ts gameWeekSeconds; a test pins them equal
const tickSeconds = 7200;

/** Open game week containing `nowSeconds`, half-open [start, end), week numbers starting at 1. A missing epoch uses the tick-aligned fallback from lib/korund.ts week(). */
export function korundPlanWindow(epochSeconds: number, nowSeconds: number): { week: number; start: number; end: number } {
 const epoch = Number.isFinite(epochSeconds) ? epochSeconds : Math.floor(nowSeconds / tickSeconds) * tickSeconds;
 const index = Math.floor(Math.max(0, nowSeconds - epoch) / korundPlanWeekSeconds);
 const start = epoch + index * korundPlanWeekSeconds;
 return { week: index + 1, start, end: start + korundPlanWeekSeconds };
}

/** Integer percent of `target` (half up, via Math.round). null when `target` is not positive or either value is not a non-negative safe integer. */
export function planFulfilmentPercent(output: number, target: number): number | null {
 if (!Number.isSafeInteger(output) || !Number.isSafeInteger(target) || output < 0 || target <= 0) return null;
 return Math.round(output * 100 / target);
}

/** Deterministic headline. At or over plan the words celebrate; under it they press on. The only number is the percent. */
export function korundPlanStatLine(output: number, target: number, resource = 'Food'): string | null {
 const percent = planFulfilmentPercent(output, target);
 if (percent === null || !resource) return null;
 return percent >= 100 ? `${resource} output ${percent}% of plan!` : `${resource} brigades press on: ${percent}% of plan`;
}
