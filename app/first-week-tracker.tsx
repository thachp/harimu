'use client';
import type { FirstWeekTracker as Tracker } from '@/lib/first-week-progress';
import type { WeekScreen } from '@/lib/first-week';

const screenLabel:Record<WeekScreen,string>={workplace:'Work',market:'Market',household:'Household',square:'City',government:'Government',nation:'Nation',world:'World'};

/** First-week goals (#134). Native <details> so it works with keyboard and screen readers without extra ARIA. */
export function FirstWeekTracker({tracker,onToggle,onNavigate}:{tracker:Tracker;onToggle:(goalId:string,done:boolean)=>void;onNavigate:(screen:WeekScreen)=>void}){
 return <details className="first-week-tracker" open>
  <summary>First week · Day {tracker.day} · {tracker.theme} <span>({tracker.doneCount}/{tracker.goals.length} done)</span></summary>
  <ul>{tracker.goals.map(({goal,done})=><li key={goal.id}>
   <label><input type="checkbox" checked={done} onChange={event=>onToggle(goal.id,event.currentTarget.checked)} /> {goal.text}</label>
   <button type="button" onClick={()=>onNavigate(goal.screen)} aria-label={`Go to ${screenLabel[goal.screen]}: ${goal.text}`}>Go to {screenLabel[goal.screen]}</button>
  </li>)}</ul>
  <p className="first-week-note">Guidance only, with no rewards. You tick goals off yourself, and your progress is saved in this browser only for now.</p>
 </details>;
}
