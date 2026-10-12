export type DailyPriority = { title: string; reason: string; action: 'work' | 'market' | 'refresh' };

// Guidance only: the authoritative action endpoint checks eligibility again.
export function dailyPriority(input: {
  now: number; capacity: number; food: number; mealFood: number;
  mealReadyAt: string | null; marketAvailable: boolean;
  activeShift: { completesAt: string } | undefined;
}): DailyPriority {
  if (input.activeShift) {
    const completeAt = Date.parse(input.activeShift.completesAt);
    if (Number.isFinite(completeAt) && input.now >= completeAt) return {
      title: 'Collect your finished shift', reason: 'Open the work board to collect wages and goods once.', action: 'work',
    };
  }
  if (input.marketAvailable && input.food < input.mealFood) return {
    title: 'Replenish household food', reason: `Keep at least ${input.mealFood} food for your next meal. Buy food or earn it through harvest work.`, action: 'market',
  };
  const mealReady = input.mealReadyAt === null || input.now >= Date.parse(input.mealReadyAt);
  if (input.marketAvailable && input.capacity < 24 && mealReady && input.food >= input.mealFood) return {
    title: 'A household meal is available', reason: 'Open the household panel to restore capacity with your food.', action: 'market',
  };
  if (input.activeShift) return {
    title: 'Your shift is underway', reason: 'Time continues while you are away. Return when the shift finishes to collect its reward.', action: 'work',
  };
  if (input.capacity > 0) return {
    title: 'Choose your next shift', reason: 'Check the work board for capacity costs, duration and agreed rewards.', action: 'work',
  };
  return {
    title: 'Rest and recover capacity', reason: 'Capacity recovers while you are away. Refresh after the recovery time to update your balance.', action: 'refresh',
  };
}
