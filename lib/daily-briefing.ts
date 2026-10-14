export type DailyPriority = { title: string; reason: string; action: 'work' | 'market' | 'refresh' };
type Step = 'collect' | 'food' | 'meal' | 'underway' | 'shift' | 'rest';
type Copy = Record<Step, (mealFood: number) => { title: string; reason: string }>;

// Copy only (#118): the rules below pick the step and action; a nation only changes the words.
const neutral: Copy = {
  collect: () => ({ title: 'Collect your finished shift', reason: 'Open the work board to collect wages and goods once.' }),
  food: (n) => ({ title: 'Replenish household food', reason: `Keep at least ${n} food for your next meal. Buy food or earn it through harvest work.` }),
  meal: () => ({ title: 'A household meal is available', reason: 'Open the household panel to restore capacity with your food.' }),
  underway: () => ({ title: 'Your shift is underway', reason: 'Time continues while you are away. Return when the shift finishes to collect its reward.' }),
  shift: () => ({ title: 'Choose your next shift', reason: 'Check the work board for capacity costs, duration and agreed rewards.' }),
  rest: () => ({ title: 'Rest and recover capacity', reason: 'Capacity recovers while you are away. Refresh after the recovery time to update your balance.' }),
};

/** Per-nation voice (culture bible; docs/NEWS_STYLE_GUIDE.md). Same facts and figures as `neutral`. */
export const briefingVoices: Record<'kindle' | 'korund' | 'aurelle', Copy> = {
  kindle: {
    collect: () => ({ title: 'Shift done: collect your pay', reason: 'Open the work board and collect your wages and goods. One collection per shift.' }),
    food: (n) => ({ title: 'Food is short: restock the household', reason: `Show your number: keep at least ${n} food for your next meal. Buy it at the market or earn it on a harvest shift.` }),
    meal: () => ({ title: 'A household meal is ready', reason: 'Open the household panel and turn your food into capacity.' }),
    underway: () => ({ title: 'Your shift is underway', reason: 'The clock keeps running while you are away. Come back when the shift ends and collect what you earned.' }),
    shift: () => ({ title: 'Pick your next shift', reason: "The work board posts each shift's capacity cost, duration and agreed pay. Compare, then choose." }),
    rest: () => ({ title: 'Rest and rebuild capacity', reason: 'Capacity recovers while you are away. Refresh after the recovery time to see your new balance.' }),
  },
  korund: {
    collect: () => ({ title: 'Your brigade shift is complete', reason: 'Report to the work board to collect your wages and goods, once.' }),
    food: (n) => ({ title: 'Replenish the household store', reason: `Keep at least ${n} food for your next meal. Obtain it at the market or earn it through harvest work.` }),
    meal: () => ({ title: 'A household meal is ready', reason: 'Open the household panel and restore your capacity with your food. A fed worker serves the plan.' }),
    underway: () => ({ title: 'Your shift is underway', reason: 'The plan keeps time while you are away. Return when the shift finishes to collect its reward.' }),
    shift: () => ({ title: 'Take up your next shift', reason: 'The work board lists the capacity cost, duration and agreed reward of each assignment.' }),
    rest: () => ({ title: 'Rest and restore capacity', reason: 'Capacity recovers while you are away. Refresh after the recovery time to update your balance. Rested hands build tomorrow.' }),
  },
  aurelle: {
    collect: () => ({ title: 'Your service is complete', reason: 'Attend the work board to collect your wages and goods, once and in good order.' }),
    food: (n) => ({ title: 'The household larder runs low', reason: `Keep at least ${n} food in store for your next meal. Purchase it at market or earn it through harvest service.` }),
    meal: () => ({ title: 'A household meal awaits', reason: 'Open the household panel to restore your capacity with your food.' }),
    underway: () => ({ title: 'Your service is underway', reason: 'Time keeps its course while you are away. Return when the shift is done to collect its reward.' }),
    shift: () => ({ title: 'Choose your next shift of service', reason: "The work board sets out each shift's capacity cost, duration and agreed rewards." }),
    rest: () => ({ title: 'Rest and recover capacity', reason: 'Capacity recovers while you are away. Refresh after the recovery time to update your balance.' }),
  },
};

const voiceFor = (nationId?: string): Copy =>
  nationId && Object.hasOwn(briefingVoices, nationId) ? briefingVoices[nationId as keyof typeof briefingVoices] : neutral;

// Guidance only: the authoritative action endpoint checks eligibility again.
export function dailyPriority(input: {
  now: number; capacity: number; food: number; mealFood: number;
  mealReadyAt: string | null; marketAvailable: boolean;
  activeShift: { completesAt: string } | undefined;
  nationId?: string;
}): DailyPriority {
  const copy = voiceFor(input.nationId);
  const say = (step: Step, action: DailyPriority['action']): DailyPriority => ({ ...copy[step](input.mealFood), action });
  if (input.activeShift) {
    const completeAt = Date.parse(input.activeShift.completesAt);
    if (Number.isFinite(completeAt) && input.now >= completeAt) return say('collect', 'work');
  }
  if (input.marketAvailable && input.food < input.mealFood) return say('food', 'market');
  const mealReady = input.mealReadyAt === null || input.now >= Date.parse(input.mealReadyAt);
  if (input.marketAvailable && input.capacity < 24 && mealReady && input.food >= input.mealFood) return say('meal', 'market');
  if (input.activeShift) return say('underway', 'work');
  if (input.capacity > 0) return say('shift', 'work');
  return say('rest', 'refresh');
}
