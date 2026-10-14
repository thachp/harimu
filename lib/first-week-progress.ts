/** First-week tracker (#134): which day-2–7 goals to show and the citizen's checked-off progress.
 * Guidance only: no rewards, no game state. Goals marked `needsCode` in lib/first-week.ts stay hidden
 * until the feature they depend on is switched on here (fail closed for unknown ids).
 * Progress persistence is a STUB (browser localStorage) until server-side tracking lands in #135. */
import type { WeekDay, WeekGoal } from './first-week';

export type FirstWeekFeature='petitions'|'civicRank'|'meritBadges'|'notables'|'claimantPledges'|'royalFavor';
/** Feature switches for goals whose screen or signal does not exist yet. All OFF until built. */
export const firstWeekFeatures:Readonly<Record<FirstWeekFeature,boolean>>={petitions:false,civicRank:false,meritBadges:false,notables:false,claimantPledges:false,royalFavor:false};
/** "requires" flag per needsCode goal. */
export const firstWeekGoalRequires:Readonly<Record<string,FirstWeekFeature>>={
 'kindle-5-petition':'petitions','aurelle-5-audience':'petitions','kindle-7-rank':'civicRank','korund-6-medal':'meritBadges',
 'korund-7-chronicle':'notables','aurelle-6-chronicler':'notables','aurelle-6-claimants':'claimantPledges','aurelle-7-favor':'royalFavor',
};

export function goalAvailable(goal:WeekGoal,features:Readonly<Partial<Record<FirstWeekFeature,boolean>>>=firstWeekFeatures):boolean{
 if(!goal.needsCode)return true;
 const req=firstWeekGoalRequires[goal.id];
 return Boolean(req&&features[req]);
}

export type FirstWeekTracker={day:WeekDay['day'];theme:string;goals:{goal:WeekGoal;done:boolean}[];doneCount:number};
/** `day` comes from firstWeekDay() in lib/first-week.ts (null outside days 2–7). */
export function firstWeekTracker(input:{day:WeekDay|null;done:readonly string[];features?:Readonly<Partial<Record<FirstWeekFeature,boolean>>>}):FirstWeekTracker|null{
 const day=input.day; if(!day)return null;
 const done=new Set(input.done);
 const goals=day.goals.filter(goal=>goalAvailable(goal,input.features)).map(goal=>({goal,done:done.has(goal.id)}));
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
