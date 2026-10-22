/** #737 Korund Plan medals (docs 12.11 step 3: "human over-fulfilment earns medals"). Pure rules, no imports.
 *  A citizen earns one Plan medal for a CLOSED game week when the work unit's food reached the weekly target AND the citizen's own food reached
 *  `korundMedalOwnFood`. [ASSUMPTION] own food >= 8 (two assigned shifts); the docs give no number. One config constant, pinned by a test.
 *  [ASSUMPTION] medals are derived on read from korund_settlements (no table, no migration): idempotent by construction and GETs stay read-only. */
export const korundMedalOwnFood = 8;
export type WeekFood = { week: number; unitFood: number; ownFood: number };
/** Whether a week earns a medal (the caller passes closed weeks only). */
export const earnsMedal = (w: WeekFood, target: number, ownMin: number = korundMedalOwnFood): boolean => w.unitFood >= target && w.ownFood >= ownMin;
/** Medals over closed weeks (each week counts once even if listed twice): total and whether the last closed week (`currentWeek - 1`) earned one. */
export function planMedals(weeks: readonly WeekFood[], currentWeek: number, target: number): { total: number; lastWeek: boolean } {
  const won = new Set(weeks.filter(w => w.week < currentWeek && earnsMedal(w, target)).map(w => w.week));
  return { total: won.size, lastWeek: won.has(currentWeek - 1) };
}
/** Over-fulfilment above the target, as a percent (no clamp); 0 at or below target. */
export const overFulfilledPercent = (food: number, target: number): number => target > 0 && food > target ? Math.round(food * 100 / target) : 0;
