import type { WorkShift } from './work-shifts';

/** Guidance reads existing records; it never grants rewards or changes enrollment. */
export function firstLoopStep(input: {nationId:string;enrolledAt?:string;now:number;shifts:WorkShift[];food:number;mealReadyAt?:string|null}) {
  const currency = ({kindle:'SPK',korund:'LN',aurelle:'CRN'} as Record<string,string>)[input.nationId];
  const enrolled = Date.parse(input.enrolledAt ?? '');
  if (!currency || !Number.isFinite(input.now) || !Number.isFinite(enrolled) || input.now < enrolled || input.now-enrolled >= 3*86400000 || input.mealReadyAt) return null;
  const own = input.shifts.filter(shift => (shift.currency ?? 'SPK') === currency);
  if (!own.some(shift => shift.claimedAt)) {
    const active = own.find(shift => !shift.claimedAt);
    return {step:1,label:active
      ? Date.parse(active.completesAt) <= input.now ? 'Collect your wages in Work' : 'Your shift is underway · return to Work when ready'
      : 'Begin your first shift in Work'};
  }
  if (input.food < 2) return {step:2,label:input.nationId==='korund' ? 'Redeem food coupons in Market' : 'Get food in Market'};
  return {step:3,label:'Prepare a meal in Household'};
}
