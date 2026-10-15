import type { WorkShift } from './work-shifts';
import type { StarterCopy } from './starter-copy';

/** Guidance reads existing records; it never grants rewards or changes enrollment. */
export function firstLoopStep(input: {nationId:string;enrolledAt?:string;now:number;shifts:WorkShift[];food:number;mealReadyAt?:string|null;copy?:StarterCopy|null;/** #365: marketVisible(nationId, flag); false while the market flag is off. Defaults to true. */marketOpen?:boolean}): {step:1|2|3;label:string;welcome?:string}|null {
  const steps = input.copy?.nationId === input.nationId ? input.copy.steps : null;
  const currency = ({kindle:'SPK',korund:'LN',aurelle:'CRN'} as Record<string,string>)[input.nationId];
  const enrolled = Date.parse(input.enrolledAt ?? '');
  if (!currency || !Number.isFinite(input.now) || !Number.isFinite(enrolled) || input.now < enrolled || input.now-enrolled >= 3*86400000 || input.mealReadyAt) return null;
  const own = input.shifts.filter(shift => (shift.currency ?? 'SPK') === currency);
  if (!own.some(shift => shift.claimedAt)) {
    const active = own.find(shift => !shift.claimedAt);
    return {step:1,label:active
      ? Date.parse(active.completesAt) <= input.now ? steps?.collect ?? 'Collect your wages in Work' : steps?.underway ?? 'Your shift is underway · return to Work when ready'
      : steps?.begin ?? 'Begin your first shift in Work', ...(steps ? {welcome:input.copy!.welcome} : {})};
  }
  if (input.food < 2) return {step:2,label:steps?.food ?? (input.nationId==='korund' ? 'Redeem food coupons in Market' : input.nationId==='kindle' && input.marketOpen===false ? 'Buy food from the starter merchant' : 'Get food in Market')};
  return {step:3,label:steps?.meal ?? 'Prepare a meal in Household'};
}
