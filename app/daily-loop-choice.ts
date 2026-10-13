/** Guidance only; citizen endpoints validate every action against current state. */
export function nextDailyAction(input: {
  supported: boolean; economyLoaded: boolean; activeShift: boolean; collected: boolean;
  readyToCollect: boolean; food: number; mealFood: number; canBuy: boolean;
  mealReady: boolean; eligibleJob: boolean;
}) {
  if (!input.supported || !input.economyLoaded) return 'refresh';
  if (input.activeShift) return input.readyToCollect ? 'collect' : 'waiting';
  if ((!input.collected || (input.food < input.mealFood && !input.canBuy)) && input.eligibleJob) return 'first-work';
  if (input.food < input.mealFood && input.canBuy) return 'buy';
  if (input.mealReady) return 'meal';
  return input.eligibleJob ? 'work' : 'rest';
}
