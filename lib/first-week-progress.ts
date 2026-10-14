/** First-week tracker (#134): which day-2–7 goals to show and the citizen's checked-off progress.
 * Guidance only: no rewards, no game state. Goals marked `needsCode` in lib/first-week.ts stay hidden
 * until the feature they depend on is switched on here (fail closed for unknown ids).
 * Progress persistence is a STUB (browser localStorage) until server-side tracking lands in #135. */
import type { GoalRequirement, WeekDay, WeekGoal } from './first-week';

/** Unbuilt features the tracker may show goals for. EMPTY until each feature ships: goals with
 * `requires` (lib/first-week.ts, #132) stay hidden. A `needsCode` goal without `requires` is hidden too (fail closed). */
export const availableFirstWeekFeatures:readonly GoalRequirement[]=[];

export function goalAvailable(goal:WeekGoal,available:readonly GoalRequirement[]=availableFirstWeekFeatures):boolean{
 if(goal.needsCode&&!goal.requires?.length)return false;
 // Same rule as visibleGoals() in lib/first-week.ts (type-only import keeps this loadable by the node test runner).
 return !goal.requires||goal.requires.every(need=>available.includes(need));
}

export type FirstWeekTracker={day:WeekDay['day'];theme:string;goals:{goal:WeekGoal;done:boolean}[];doneCount:number};
/** `day` comes from firstWeekDay() in lib/first-week.ts (null outside days 2–7). */
export function firstWeekTracker(input:{day:WeekDay|null;done:readonly string[];available?:readonly GoalRequirement[]}):FirstWeekTracker|null{
 const day=input.day; if(!day)return null;
 const done=new Set(input.done);
 const goals=day.goals.filter(goal=>goalAvailable(goal,input.available)).map(goal=>({goal,done:done.has(goal.id)}));
 if(!goals.length)return null;
 return {day:day.day,theme:day.theme,goals,doneCount:goals.filter(entry=>entry.done).length};
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
