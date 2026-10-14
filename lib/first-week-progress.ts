/** First-week tracker (#134): which day-2–7 goals to show and the citizen's checked-off progress.
 * Guidance only: no rewards, no game state. Goals marked `needsCode` in lib/first-week.ts stay hidden
 * until the feature they depend on is switched on here (fail closed for unknown ids).
 * Completion comes from real game records the client already has (settled shifts, meals). Goals whose
 * signal is not available client-side show as "tracked soon" (server-side signals: #135).
 * Progress persistence is a STUB (browser localStorage, latches detected completions) until #135. */
import type { WeekDay, WeekGoal } from './first-week';

/** Requires-gating is owned by lib/first-week.ts (#132): callers pass a day whose goals already went through
 * visibleGoals(). This only adds fail-closed for a `needsCode` goal that has no `requires` yet. */
export const goalAvailable=(goal:WeekGoal):boolean=>!(goal.needsCode&&!goal.requires?.length);

import type { WorkShift } from './work-shifts';

/** Real records the page already loads. */
export type FirstWeekSignals={shifts:readonly Pick<WorkShift,'orderName'|'claimedAt'>[];mealReadyAt?:string|null;dayStart:number};
const shiftGoal=/-(shift|quota|service)$/, mealGoal=/-meal$/;
/** True/false when the goal has a client-side signal; null when it is not tracked yet (#135). */
export function goalSignalDone(goal:WeekGoal,sig:FirstWeekSignals):boolean|null{
 const claimed=sig.shifts.filter(s=>s.claimedAt&&Number.isFinite(Date.parse(s.claimedAt)));
 if(shiftGoal.test(goal.id)){
  const today=claimed.filter(s=>Date.parse(s.claimedAt as string)>=sig.dayStart);
  if(/freight or archive/i.test(goal.signal))return today.some(s=>/freight|archive/i.test(s.orderName));
  if(/second/i.test(goal.signal))return claimed.length>=2&&today.length>=1;
  return today.length>=1;
 }
 if(mealGoal.test(goal.id)){const t=Date.parse(sig.mealReadyAt??'');return Number.isFinite(t)&&t>=sig.dayStart;}
 return null;
}

export type FirstWeekTracker={day:WeekDay['day'];theme:string;goals:{goal:WeekGoal;done:boolean;tracked:boolean}[];doneCount:number};
/** `day` comes from firstWeekDay() with goals filtered by visibleGoals() (lib/first-week.ts). */
export function firstWeekTracker(input:{day:WeekDay|null;done:readonly string[];signals?:FirstWeekSignals}):FirstWeekTracker|null{
 const day=input.day; if(!day)return null;
 const done=new Set(input.done);
 const goals=day.goals.filter(goal=>goalAvailable(goal)).map(goal=>{const live=input.signals?goalSignalDone(goal,input.signals):null;return {goal,tracked:live!==null,done:live===true||(live!==null&&done.has(goal.id))};});
 if(!goals.length)return null;
 return {day:day.day,theme:day.theme,goals,doneCount:goals.filter(entry=>entry.done).length}
}
/** Ids newly completed by real signals, to latch in the store. */
export function newlyDone(tracker:FirstWeekTracker|null,stored:readonly string[]):string[]{
 if(!tracker)return [];
 return tracker.goals.filter(e=>e.done&&!stored.includes(e.goal.id)).map(e=>e.goal.id);;
}

export interface FirstWeekProgressStore{load(citizenKey:string):string[];save(citizenKey:string,done:readonly string[]):void}
type KV=Pick<Storage,'getItem'|'setItem'>;
export const firstWeekStubKey=(citizenKey:string)=>`harimu:first-week:stub:${citizenKey}`;
/** STUB until #135: progress lives only in this browser. Replace with a server-backed store. */
export function stubFirstWeekProgressStore(storage:KV|undefined=typeof localStorage==='undefined'?undefined:localStorage):FirstWeekProgressStore{
 return {
  load(key){try{const v=JSON.parse(storage?.getItem(firstWeekStubKey(key))??'[]');return Array.isArray(v)?v.filter((x:unknown):x is string=>typeof x==='string'):[]}catch{return []}},
  save(key,done){try{storage?.setItem(firstWeekStubKey(key),JSON.stringify([...new Set(done)]))}catch{/* storage full or blocked: progress stays in memory */}},
 };
}

/** #135: server-backed store. load() returns the ids the citizen GET already delivered (firstWeek.completed);
 * save() records newly completed ids with POST /api/citizen {action:'first-week-complete'} (idempotent server-side).
 * Network errors are swallowed: the next load re-derives event-backed goals from the ledgers. */
export function serverFirstWeekProgressStore(completed:readonly string[]|null|undefined,post:(body:unknown)=>Promise<unknown>=body=>fetch('/api/citizen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})):FirstWeekProgressStore{
 const known=new Set(completed??[]);
 return {
  load(){return [...known];},
  save(_key,done){for(const goalId of new Set(done)){if(known.has(goalId))continue;known.add(goalId);void post({action:'first-week-complete',goalId,requestId:crypto.randomUUID()}).catch(()=>{});}},
 };
}
